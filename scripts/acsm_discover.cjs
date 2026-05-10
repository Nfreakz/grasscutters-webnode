#!/usr/bin/env node
/* GrassCutters ACSM Discovery
   Safe read-only scanner for Assetto Corsa Server Manager folders/databases.
*/
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function redact(value) {
  if (!value) return value;
  const text = String(value);
  if (text.length <= 4) return '***';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function shaShort(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function safeJoin(...parts) {
  return path.join(...parts);
}

function isInterestingFile(name) {
  const n = String(name || '').toLowerCase();
  return (
    n === 'config.yml' ||
    n === 'config.yaml' ||
    n === 'server_cfg.ini' ||
    n === 'entry_list.ini' ||
    n.endsWith('.db') ||
    n.endsWith('.sqlite') ||
    n.endsWith('.sqlite3') ||
    n.endsWith('.db3') ||
    n.includes('server-manager') ||
    n.includes('championship') ||
    n.includes('calendar') ||
    n.includes('event') ||
    n.includes('race-weekend') ||
    n.includes('race_weekend')
  );
}

function isInterestingDir(name) {
  const n = String(name || '').toLowerCase();
  return [
    'cfg',
    'config',
    'championship',
    'championships',
    'events',
    'event',
    'race-weekends',
    'race_weekends',
    'race-weekend',
    'race_weekend',
    'results',
    'data',
    'database',
    'db',
    'storage',
    'assetto'
  ].some((needle) => n.includes(needle));
}

function looksLikeSQLite(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8') === 'SQLite format 3\0';
  } catch {
    return false;
  }
}

async function inspectSqlite(filePath) {
  const result = {
    pathHash: shaShort(filePath),
    filename: path.basename(filePath),
    sqlite: looksLikeSQLite(filePath),
    sizeBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
    tables: [],
    interestingTables: []
  };
  if (!result.sqlite) return result;

  try {
    const initSqlJsModule = await import('sql.js');
    const initSqlJs = initSqlJsModule.default;
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(filePath)));
    const tableRows = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC");
    const tableNames = tableRows?.[0]?.values?.map((row) => String(row[0])) || [];
    for (const tableName of tableNames) {
      const safeName = tableName.replace(/"/g, '""');
      const columnsExec = db.exec(`PRAGMA table_info("${safeName}")`);
      const columns = columnsExec?.[0]?.values?.map((row) => ({
        name: String(row[1]),
        type: String(row[2] || ''),
        notNull: Boolean(row[3]),
        pk: Boolean(row[5])
      })) || [];
      let count = null;
      try {
        const countExec = db.exec(`SELECT COUNT(*) AS c FROM "${safeName}"`);
        count = Number(countExec?.[0]?.values?.[0]?.[0] ?? 0);
      } catch {}
      const table = { name: tableName, columns, count };
      result.tables.push(table);
      const low = tableName.toLowerCase();
      const columnText = columns.map((c) => c.name.toLowerCase()).join(' ');
      if (
        low.includes('event') ||
        low.includes('champ') ||
        low.includes('schedule') ||
        low.includes('calendar') ||
        low.includes('race') ||
        low.includes('weekend') ||
        low.includes('server') ||
        columnText.includes('track') ||
        columnText.includes('car') ||
        columnText.includes('start') ||
        columnText.includes('scheduled') ||
        columnText.includes('championship')
      ) {
        result.interestingTables.push(table);
      }
    }
    db.close();
  } catch (error) {
    result.error = error.message || String(error);
  }

  return result;
}

function inspectIni(filePath) {
  const output = { filename: path.basename(filePath), pathHash: shaShort(filePath), keys: {} };
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const wanted = ['TRACK', 'CONFIG_TRACK', 'CARS', 'CAR_0', 'NAME', 'PASSWORD', 'REGISTER_TO_LOBBY', 'PICKUP_MODE_ENABLED'];
    for (const key of wanted) {
      const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`, 'mi');
      const match = text.match(re);
      if (match) output.keys[key] = key === 'PASSWORD' ? '[redacted]' : match[1].trim();
    }
  } catch (error) {
    output.error = error.message || String(error);
  }
  return output;
}

async function scanLocalRoot(root) {
  const rootPath = path.resolve(root);
  const report = {
    mode: 'local',
    root: rootPath,
    exists: fs.existsSync(rootPath),
    candidates: [],
    sqliteDatabases: [],
    iniFiles: []
  };
  if (!report.exists) return report;

  const queue = [{ dir: rootPath, depth: 0 }];
  const maxDepth = Number(process.env.ACSM_DISCOVER_DEPTH || 6);
  const maxEntries = Number(process.env.ACSM_DISCOVER_MAX_ENTRIES || 3000);
  const dbCandidates = [];
  let seen = 0;

  while (queue.length && seen < maxEntries) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(rootPath, fullPath);
      if (entry.isDirectory()) {
        if (depth < maxDepth && (depth < 2 || isInterestingDir(entry.name))) {
          queue.push({ dir: fullPath, depth: depth + 1 });
        }
      } else if (entry.isFile() && isInterestingFile(entry.name)) {
        let stat = null;
        try { stat = fs.statSync(fullPath); } catch {}
        const candidate = {
          relativePath: relative,
          filename: entry.name,
          sizeBytes: stat?.size || 0,
          modifiedAt: stat?.mtime?.toISOString?.() || null,
          kind: entry.name.toLowerCase().match(/\.(db|sqlite|sqlite3|db3)$/) ? 'database' : entry.name.toLowerCase().endsWith('.ini') ? 'ini' : 'file'
        };
        report.candidates.push(candidate);
        if (candidate.kind === 'database') dbCandidates.push(fullPath);
        if (candidate.kind === 'ini') report.iniFiles.push(inspectIni(fullPath));
      }
    }
  }

  for (const dbPath of dbCandidates.slice(0, 12)) {
    report.sqliteDatabases.push(await inspectSqlite(dbPath));
  }

  report.scannedEntries = seen;
  return report;
}

async function scanSftpRoot() {
  let Client;
  try {
    Client = require('ssh2-sftp-client');
  } catch (error) {
    return {
      mode: 'sftp',
      error: 'Falta dependencia ssh2-sftp-client. Ejecuta npm install o usa ACSM_LOCAL_ROOT.',
      details: error.message
    };
  }

  const host = process.env.ACSM_SFTP_HOST;
  const port = Number(process.env.ACSM_SFTP_PORT || 22);
  const username = process.env.ACSM_SFTP_USER;
  const password = process.env.ACSM_SFTP_PASSWORD;
  const root = process.env.ACSM_SFTP_ROOT || '/';

  const report = {
    mode: 'sftp',
    host,
    port,
    username: redact(username),
    root,
    candidates: [],
    sqliteDatabases: [],
    iniFiles: []
  };

  if (!host || !username || !password) {
    report.error = 'Faltan ACSM_SFTP_HOST, ACSM_SFTP_USER o ACSM_SFTP_PASSWORD en .env';
    return report;
  }

  const sftp = new Client();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-acsm-'));
  const maxDepth = Number(process.env.ACSM_DISCOVER_DEPTH || 6);
  const maxEntries = Number(process.env.ACSM_DISCOVER_MAX_ENTRIES || 3000);
  let seen = 0;

  try {
    await sftp.connect({ host, port, username, password, readyTimeout: 20000 });
    const queue = [{ dir: root, depth: 0 }];
    const dbCandidates = [];
    const iniCandidates = [];

    while (queue.length && seen < maxEntries) {
      const { dir, depth } = queue.shift();
      let entries = [];
      try {
        entries = await sftp.list(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        seen += 1;
        const fullPath = `${dir.replace(/\/$/, '')}/${entry.name}`;
        if (entry.type === 'd') {
          if (depth < maxDepth && (depth < 2 || isInterestingDir(entry.name))) {
            queue.push({ dir: fullPath, depth: depth + 1 });
          }
        } else if (entry.type === '-' && isInterestingFile(entry.name)) {
          const candidate = {
            remotePath: fullPath,
            filename: entry.name,
            sizeBytes: entry.size || 0,
            modifiedAt: entry.modifyTime ? new Date(entry.modifyTime).toISOString() : null,
            kind: entry.name.toLowerCase().match(/\.(db|sqlite|sqlite3|db3)$/) ? 'database' : entry.name.toLowerCase().endsWith('.ini') ? 'ini' : 'file'
          };
          report.candidates.push(candidate);
          if (candidate.kind === 'database') dbCandidates.push(candidate);
          if (candidate.kind === 'ini') iniCandidates.push(candidate);
        }
      }
    }

    for (const candidate of dbCandidates.slice(0, 8)) {
      try {
        const localPath = path.join(tempDir, candidate.filename.replace(/[^\w.-]/g, '_'));
        await sftp.fastGet(candidate.remotePath, localPath);
        const inspected = await inspectSqlite(localPath);
        inspected.remotePath = candidate.remotePath;
        report.sqliteDatabases.push(inspected);
      } catch (error) {
        report.sqliteDatabases.push({ remotePath: candidate.remotePath, filename: candidate.filename, error: error.message || String(error) });
      }
    }

    for (const candidate of iniCandidates.slice(0, 8)) {
      try {
        const localPath = path.join(tempDir, candidate.filename.replace(/[^\w.-]/g, '_'));
        await sftp.fastGet(candidate.remotePath, localPath);
        const inspected = inspectIni(localPath);
        inspected.remotePath = candidate.remotePath;
        report.iniFiles.push(inspected);
      } catch (error) {
        report.iniFiles.push({ remotePath: candidate.remotePath, filename: candidate.filename, error: error.message || String(error) });
      }
    }
  } catch (error) {
    report.error = error.message || String(error);
  } finally {
    try { await sftp.end(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  report.scannedEntries = seen;
  return report;
}

async function main() {
  loadDotEnv();

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    panelUrl: process.env.ACSM_PANEL_URL || null,
    notes: [
      'No se han guardado contraseñas en este informe.',
      'Si hay tablas interesantes, el siguiente pack puede sincronizar campeonatos/eventos a gc_calendar_events.'
    ],
    discovery: null
  };

  if (process.env.ACSM_LOCAL_ROOT) {
    report.discovery = await scanLocalRoot(process.env.ACSM_LOCAL_ROOT);
  } else {
    report.discovery = await scanSftpRoot();
  }

  const reportsDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'acsm-discovery-report.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[GC ACSM] Informe creado: ${outputPath}`);
  if (report.discovery?.error) {
    console.error(`[GC ACSM] Aviso: ${report.discovery.error}`);
    process.exitCode = 1;
  } else {
    const candidates = report.discovery?.candidates?.length || 0;
    const dbs = report.discovery?.sqliteDatabases?.length || 0;
    console.log(`[GC ACSM] Candidatos: ${candidates}. Bases inspeccionadas: ${dbs}.`);
  }
}

main().catch((error) => {
  console.error('[GC ACSM] Error:', error);
  process.exit(1);
});
