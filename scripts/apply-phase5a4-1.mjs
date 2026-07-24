import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'src/server/index.ts');
const BACKUP_DIR = path.join(ROOT, '_gc_backups', `phase5a4-1-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const BACKUP = path.join(BACKUP_DIR, 'src/server/index.ts');

function fail(message) {
  console.error(`[GC Phase 5A.4.1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail('No existe src/server/index.ts.');
const before = fs.readFileSync(FILE, 'utf8');
let after = before;

function replaceExact(search, replacement, expected, label) {
  const count = after.split(search).length - 1;
  if (count === 0 && after.includes(replacement)) {
    console.log(`[GC Phase 5A.4.1] Ya aplicado: ${label}`);
    return;
  }
  if (count !== expected) fail(`${label}: esperadas ${expected} coincidencias, encontradas ${count}.`);
  after = after.split(search).join(replacement);
  console.log(`[GC Phase 5A.4.1] Preparado: ${label} (${expected})`);
}

replaceExact('lastStrackerSqlMirrorAutoSyncResult = disabledPayload;', 'lastStrackerSqlMirrorAutoSyncResult = disabledPayload as StrackerSqlMirrorAutoSyncResult;', 1, 'resultado mirror desactivado');
replaceExact('lastStrackerSqlMirrorAutoSyncResult = okPayload;', 'lastStrackerSqlMirrorAutoSyncResult = okPayload as StrackerSqlMirrorAutoSyncResult;', 1, 'resultado mirror correcto');
replaceExact('lastStrackerSqlMirrorAutoSyncResult = failedPayload;', 'lastStrackerSqlMirrorAutoSyncResult = failedPayload as StrackerSqlMirrorAutoSyncResult;', 1, 'resultado mirror fallido');
replaceExact("sqlMirror = await syncStrackerSqlMirrorAfterDbSync('auto-sync-post-db-sync-main-legacy');", "sqlMirror = await syncStrackerSqlMirrorAfterDbSync('auto-sync-post-db-sync-main-legacy') as StrackerSqlMirrorAutoSyncResult;", 1, 'resultado mirror en auto-sync');
replaceExact('    multiSync,', '    ...({ multiSync } as any),', 3, 'payload multiSync');
replaceExact('compactLapForCombo({ ...lap, comboId: rawComboId ?? lap.comboId, comboKey: key, comboUid: key })', 'compactLapForCombo({ ...lap, comboId: rawComboId ?? lap.comboId, comboKey: key, comboUid: key } as any)', 2, 'payloads comboKey');
replaceExact('context.user.team.role = normalizeGcTeamRole(teamRole)', 'context.user.team!.role = normalizeGcTeamRole(teamRole)', 1, 'team ya validado');

const oldBlock = `      res.status(200).json({
        ok: false,
        authenticated: true,
        user: publicUser(context.user),
        linked: true,
        pilotLink: context.user.pilotLink,
        profile: null,
        ...gcPublicDataCoreUnavailableV130(readSource, 'Data Core no disponible para generar el perfil.')
      });`;

const newBlock = `      res.status(200).json({
        ...gcPublicDataCoreUnavailableV130(readSource, 'Data Core no disponible para generar el perfil.'),
        ok: false,
        authenticated: true,
        user: publicUser(context.user),
        linked: true,
        pilotLink: context.user.pilotLink,
        profile: null
      });`;

replaceExact(oldBlock, newBlock, 1, 'orden de spread y ok');

if (after === before) process.exit(0);
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, before, 'utf8');
fs.writeFileSync(FILE, after, 'utf8');

console.log('');
console.log('[GC Phase 5A.4.1] Aplicación completada.');
console.log(`[GC Phase 5A.4.1] Backup: ${path.relative(ROOT, BACKUP)}`);
console.log('[GC Phase 5A.4.1] Ejecuta ahora npm run check.');
