import type { RowDataPacket } from 'mysql2/promise';

import { getDatabasePool } from '@/server/database/client';
import { runtimeConfig } from '@/server/env';

interface TableRow extends RowDataPacket {
  tableName: string;
  engine: string | null;
  estimatedRows: number | string | null;
  dataLength: number | string | null;
  indexLength: number | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  tableComment: string;
}

interface ColumnRow extends RowDataPacket {
  tableName: string;
  ordinalPosition: number;
  columnName: string;
  columnType: string;
  nullable: 'YES' | 'NO';
  columnDefault: string | number | null;
  columnKey: string;
  extra: string;
  columnComment: string;
}

interface IndexRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  nonUnique: number;
  sequenceInIndex: number;
  columnName: string | null;
  indexType: string;
}

interface ConstraintRow extends RowDataPacket {
  tableName: string;
  constraintName: string;
  constraintType: string;
}

interface ForeignKeyRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
  constraintName: string;
}

interface TableAudit {
  name: string;
  engine: string | null;
  estimatedRows: number;
  dataBytes: number;
  indexBytes: number;
  createdAt: string | null;
  updatedAt: string | null;
  comment: string;
  categories: string[];
  columns: Array<{
    position: number;
    name: string;
    type: string;
    nullable: boolean;
    default: string | number | null;
    key: string;
    extra: string;
    comment: string;
  }>;
  indexes: Array<{
    name: string;
    unique: boolean;
    type: string;
    columns: string[];
  }>;
  constraints: Array<{
    name: string;
    type: string;
  }>;
  foreignKeys: Array<{
    name: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
}

export interface DatabaseSchemaAudit {
  ok: true;
  databaseName: string;
  readOnly: true;
  generatedAt: string;
  summary: {
    tables: number;
    columns: number;
    indexes: number;
    uniqueIndexes: number;
    primaryKeys: number;
    foreignKeys: number;
    estimatedRows: number;
    totalDataBytes: number;
    totalIndexBytes: number;
  };
  categorySummary: Record<string, string[]>;
  tables: TableAudit[];
}

function numberValue(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoValue(value: Date | string | null): string | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

const categoryMatchers: Array<[string, RegExp]> = [
  ['identity', /(driver|pilot|player|steam|identity|user|profile|alias)/i],
  ['sessions', /(session|event|race|result|booking|entry)/i],
  ['laps', /(lap|hotlap|sector|split|stint)/i],
  ['championships', /(champ|season|round|standing|point|calendar)/i],
  ['ratings', /(rating|safety|sr|gsr|elo|rank)/i],
  ['teams', /(team|squad|constructor|membership)/i],
  ['incidents', /(incident|collision|contact|penalty|damage)/i],
  ['telemetry', /(telemetry|fuel|tyre|tire|position|track)/i],
  ['authentication', /(auth|account|session_token|login|password)/i],
  ['administration', /(admin|audit|log|config|setting|job|sync)/i],
  ['archive', /(archive|history|snapshot|backup|legacy)/i]
];

function inferCategories(tableName: string, columns: ColumnRow[]): string[] {
  const searchable = [
    tableName,
    ...columns.map((column) => column.columnName)
  ].join(' ');

  const categories = categoryMatchers
    .filter(([, matcher]) => matcher.test(searchable))
    .map(([category]) => category);

  return categories.length ? categories : ['uncategorized'];
}

export async function auditDatabaseSchema(): Promise<DatabaseSchemaAudit> {
  if (!runtimeConfig.databaseConfigured) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  const pool = getDatabasePool();
  const schema = runtimeConfig.database.name;

  const [tableRows] = await pool.query<TableRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      ENGINE AS engine,
      TABLE_ROWS AS estimatedRows,
      DATA_LENGTH AS dataLength,
      INDEX_LENGTH AS indexLength,
      CREATE_TIME AS createdAt,
      UPDATE_TIME AS updatedAt,
      TABLE_COMMENT AS tableComment
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `, [schema]);

  const [columnRows] = await pool.query<ColumnRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      ORDINAL_POSITION AS ordinalPosition,
      COLUMN_NAME AS columnName,
      COLUMN_TYPE AS columnType,
      IS_NULLABLE AS nullable,
      COLUMN_DEFAULT AS columnDefault,
      COLUMN_KEY AS columnKey,
      EXTRA AS extra,
      COLUMN_COMMENT AS columnComment
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `, [schema]);

  const [indexRows] = await pool.query<IndexRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      INDEX_NAME AS indexName,
      NON_UNIQUE AS nonUnique,
      SEQ_IN_INDEX AS sequenceInIndex,
      COLUMN_NAME AS columnName,
      INDEX_TYPE AS indexType
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `, [schema]);

  const [constraintRows] = await pool.query<ConstraintRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      CONSTRAINT_NAME AS constraintName,
      CONSTRAINT_TYPE AS constraintType
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, CONSTRAINT_NAME
  `, [schema]);

  const [foreignKeyRows] = await pool.query<ForeignKeyRow[]>(`
    SELECT
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      REFERENCED_TABLE_NAME AS referencedTableName,
      REFERENCED_COLUMN_NAME AS referencedColumnName,
      CONSTRAINT_NAME AS constraintName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
  `, [schema]);

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const column of columnRows) {
    const items = columnsByTable.get(column.tableName) ?? [];
    items.push(column);
    columnsByTable.set(column.tableName, items);
  }

  const indexGroups = new Map<string, Map<string, IndexRow[]>>();
  for (const index of indexRows) {
    const tableIndexes = indexGroups.get(index.tableName) ?? new Map();
    const items = tableIndexes.get(index.indexName) ?? [];
    items.push(index);
    tableIndexes.set(index.indexName, items);
    indexGroups.set(index.tableName, tableIndexes);
  }

  const constraintsByTable = new Map<string, ConstraintRow[]>();
  for (const constraint of constraintRows) {
    const items = constraintsByTable.get(constraint.tableName) ?? [];
    items.push(constraint);
    constraintsByTable.set(constraint.tableName, items);
  }

  const foreignKeysByTable = new Map<string, ForeignKeyRow[]>();
  for (const foreignKey of foreignKeyRows) {
    const items = foreignKeysByTable.get(foreignKey.tableName) ?? [];
    items.push(foreignKey);
    foreignKeysByTable.set(foreignKey.tableName, items);
  }

  const tables: TableAudit[] = tableRows.map((table) => {
    const columns = columnsByTable.get(table.tableName) ?? [];
    const tableIndexes = indexGroups.get(table.tableName) ?? new Map();

    return {
      name: table.tableName,
      engine: table.engine,
      estimatedRows: numberValue(table.estimatedRows),
      dataBytes: numberValue(table.dataLength),
      indexBytes: numberValue(table.indexLength),
      createdAt: isoValue(table.createdAt),
      updatedAt: isoValue(table.updatedAt),
      comment: table.tableComment ?? '',
      categories: inferCategories(table.tableName, columns),
      columns: columns.map((column) => ({
        position: column.ordinalPosition,
        name: column.columnName,
        type: column.columnType,
        nullable: column.nullable === 'YES',
        default: column.columnDefault,
        key: column.columnKey,
        extra: column.extra,
        comment: column.columnComment
      })),
      indexes: Array.from(tableIndexes.values()).map(
        (items: IndexRow[]) => ({
          name: items[0]?.indexName ?? '',
          unique: items[0]?.nonUnique === 0,
          type: items[0]?.indexType ?? '',
          columns: [...items]
            .sort(
              (a: IndexRow, b: IndexRow) =>
                a.sequenceInIndex - b.sequenceInIndex
            )
            .map((item: IndexRow) => item.columnName)
            .filter(
              (column: string | null): column is string =>
                column !== null
            )
        })
      ),
      constraints: (constraintsByTable.get(table.tableName) ?? []).map(
        (constraint) => ({
          name: constraint.constraintName,
          type: constraint.constraintType
        })
      ),
      foreignKeys: (foreignKeysByTable.get(table.tableName) ?? []).map(
        (foreignKey) => ({
          name: foreignKey.constraintName,
          column: foreignKey.columnName,
          referencedTable: foreignKey.referencedTableName,
          referencedColumn: foreignKey.referencedColumnName
        })
      )
    };
  });

  const categorySummary: Record<string, string[]> = {};
  for (const table of tables) {
    for (const category of table.categories) {
      categorySummary[category] ??= [];
      categorySummary[category].push(table.name);
    }
  }

  return {
    ok: true,
    databaseName: schema,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    summary: {
      tables: tables.length,
      columns: columnRows.length,
      indexes: indexRows.length,
      uniqueIndexes: indexRows.filter(
        (index) => index.nonUnique === 0 && index.sequenceInIndex === 1
      ).length,
      primaryKeys: constraintRows.filter(
        (constraint) => constraint.constraintType === 'PRIMARY KEY'
      ).length,
      foreignKeys: foreignKeyRows.length,
      estimatedRows: tables.reduce(
        (total, table) => total + table.estimatedRows,
        0
      ),
      totalDataBytes: tables.reduce(
        (total, table) => total + table.dataBytes,
        0
      ),
      totalIndexBytes: tables.reduce(
        (total, table) => total + table.indexBytes,
        0
      )
    },
    categorySummary,
    tables
  };
}
