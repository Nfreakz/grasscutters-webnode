#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const markerStart = '/* GC_CALENDAR_STORAGE_ADMIN_GUARD_FIX_START */';
const markerEnd = '/* GC_CALENDAR_STORAGE_ADMIN_GUARD_FIX_END */';

if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const backupPath = `${serverPath}.backup-calendar-storage-admin-guard-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backupPath, source, 'utf8');

function removeOldBlock(text) {
  const start = text.indexOf(markerStart);
  const end = text.indexOf(markerEnd);
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(0, start) + text.slice(end + markerEnd.length).replace(/^\s*\n/, '\n');
  }
  return text;
}

source = removeOldBlock(source);

const patch = String.raw`
${markerStart}
async function gcCalendarStorageAdminGuardFromProfile(req) {
  try {
    const cookie = String(req.headers?.cookie || '');
    if (!cookie) return false;

    const profileUrl = ` + '`' + `http://127.0.0.1:${PORT}/api/profile` + '`' + `;
    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        cookie,
        accept: 'application/json'
      }
    });

    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    const role = String(data?.user?.role || data?.role || data?.profile?.user?.role || '').trim().toLowerCase();
    return data?.authenticated !== false && role === 'admin';
  } catch (error) {
    console.warn('[GC] No se pudo validar admin desde /api/profile para calendar storage:', error);
    return false;
  }
}

app.get('/api/admin/calendar-events/storage', async (req, res) => {
  try {
    const isAdmin = await gcCalendarStorageAdminGuardFromProfile(req);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Acceso admin requerido.' });
    }

    const source = getAppStorageDriverLabel();
    const calendar = {
      source,
      persistent: source === 'mysql' || source === 'sqlite',
      table: source === 'mysql' || source === 'sqlite' ? 'gc_calendar_events' : null,
      fallback: source === 'json' ? 'APP_DATA_DIR/app/calendar-events.json' : null
    };

    return res.json({
      ok: true,
      source,
      calendar,
      appStorage: getAppStorageStatus(),
      checkedAt: new Date().toISOString(),
      note: source === 'mysql'
        ? 'Calendario preparado para MySQL.'
        : source === 'sqlite'
          ? 'Calendario preparado para SQLite.'
          : 'Calendario en JSON. En producción conviene APP_STORAGE_DRIVER=mysql o APP_DATA_DIR persistente.'
    });
  } catch (error) {
    console.error('[GC] Error leyendo storage de calendario:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo leer el storage del calendario.' });
  }
});
${markerEnd}
`;

const existingRouteIndex = source.indexOf('/api/admin/calendar-events/storage');
let insertAt = -1;

if (existingRouteIndex !== -1) {
  insertAt = source.lastIndexOf('\n', existingRouteIndex);
} else {
  const appGetIndex = source.indexOf('app.get(');
  if (appGetIndex !== -1) insertAt = source.lastIndexOf('\n', appGetIndex);
}

if (insertAt === -1) {
  console.error('ERROR: No he encontrado un punto seguro para insertar la ruta. No se ha modificado index.ts.');
  console.error(`Backup creado igualmente: ${backupPath}`);
  process.exit(1);
}

source = source.slice(0, insertAt + 1) + patch + '\n' + source.slice(insertAt + 1);
fs.writeFileSync(serverPath, source, 'utf8');

console.log('OK: añadido guard fix para /api/admin/calendar-events/storage.');
console.log(`Backup: ${backupPath}`);
