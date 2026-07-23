import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetRelative = 'src/server/index.ts';
const targetPath = path.join(root, targetRelative);
const marker = 'GC_GT4_DISPLAY_NAMES_SOURCE_ID_NULL_FIX_V4';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `gt4-display-names-source-id-null-fix-v4-${stamp}`);
const backupPath = path.join(backupDir, targetRelative);

if (!fs.existsSync(targetPath)) {
  throw new Error(`No existe ${targetRelative}. Ejecuta este instalador desde la raíz de grasscutters-webnode.`);
}

const current = fs.readFileSync(targetPath, 'utf8');

if (current.includes(marker)) {
  console.log(`[GC nombres GT4 V4] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

if (!current.includes('GC_HOTLAPS_GT4_SOURCE_SCOPED_NAMES_FIX_V3')) {
  throw new Error('Falta el requisito GC_HOTLAPS_GT4_SOURCE_SCOPED_NAMES_FIX_V3. No se ha modificado ningún archivo.');
}

const replacements = [
  {
    label: 'conversión numérica nullable',
    before: `function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}`,
    after: `/* ${marker}
 * Number(null) y Number('') devuelven 0 en JavaScript. En las identidades de
 * coches y circuitos GT4 ese cero hacía que todas las filas compartieran ID.
 */
function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}`
  },
  {
    label: 'lectura SQLite de source_id',
    before: `sourceId: Number.isFinite(Number(row.source_id)) ? Number(row.source_id) : null,`,
    after: `sourceId: numberOrNull(row.source_id),`,
    expected: 2
  },
  {
    label: 'matching de sourceId solicitado',
    before: `  const numericId = Number(sourceId);
  const hasId = Number.isFinite(numericId);`,
    after: `  const numericId = numberOrNull(sourceId);
  const hasId = numericId !== null;`
  },
  {
    label: 'matching de sourceId almacenado',
    before: `    const entryHasId = entry.sourceId !== null && entry.sourceId !== undefined && Number.isFinite(Number(entry.sourceId));`,
    after: `    const entryNumericId = numberOrNull(entry.sourceId);
    const entryHasId = entryNumericId !== null;`
  },
  {
    label: 'comparación de sourceId',
    before: `    if (hasId && entryHasId && Number(entry.sourceId) === numericId) return true;`,
    after: `    if (hasId && entryHasId && entryNumericId === numericId) return true;`
  },
  {
    label: 'ID canónico de override',
    before: `  const id = Number(sourceId);
  if (Number.isFinite(id)) return \`\${prefix}:id:\${id}\`;`,
    after: `  const id = numberOrNull(sourceId);
  if (id !== null) return \`\${prefix}:id:\${id}\`;`
  }
];

let next = current;

for (const replacement of replacements) {
  const occurrences = next.split(replacement.before).length - 1;
  const expected = replacement.expected ?? 1;
  if (occurrences !== expected) {
    throw new Error(
      `No se puede aplicar "${replacement.label}": se esperaban ${expected} coincidencias y se encontraron ${occurrences}. No se ha modificado ningún archivo.`
    );
  }
  next = next.split(replacement.before).join(replacement.after);
}

if (!next.includes(marker)) {
  throw new Error('La validación final del hotfix ha fallado. No se ha modificado ningún archivo.');
}

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, next, 'utf8');

console.log('');
console.log('[GC nombres GT4 V4] Hotfix instalado.');
console.log(`[GC nombres GT4 V4] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC nombres GT4 V4] Modificado: ${targetRelative}`);
console.log('Los NULL ya no se convierten en ID 0 y los alias GT4 vuelven a quedar separados por sourceCode.');
console.log('Siguiente: npm run quality && npm run build');
