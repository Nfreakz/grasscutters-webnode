#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No existe src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');
const backupPath = `${serverPath}.backup-acsm-profile-guard-v4-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backupPath, source, 'utf8');

const startMarker = '// GC ACSM PROFILE GUARD ROUTES V4 START';
const endMarker = '// GC ACSM PROFILE GUARD ROUTES V4 END';

function removeMarkedBlock(text) {
  const start = text.indexOf(startMarker);
  if (start === -1) return text;
  const end = text.indexOf(endMarker, start);
  if (end === -1) return text;
  return text.slice(0, start) + text.slice(end + endMarker.length).replace(/^\s*\n/, '\n');
}

source = removeMarkedBlock(source);

const block = String.raw`

// GC ACSM PROFILE GUARD ROUTES V4 START
// Rutas ACSM prioritarias. Usan /api/profile como fuente de verdad para permisos admin,
// porque es el endpoint que ya valida correctamente la sesión gc_session en producción.
function gcAcsmGetLocalFunctionV4(name: string) {
  try {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
    return eval('typeof ' + name + ' !== "undefined" ? ' + name + ' : null');
  } catch {
    return null;
  }
}

async function gcAcsmProfileGuardFetchV4(req: any) {
  const cookie = String(req.headers?.cookie || '');
  const hosts = [];
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers?.host || '').trim();
  const proto = forwardedProto || (req.secure ? 'https' : 'http');

  if (host) hosts.push(proto + '://' + host + '/api/profile');
  if (typeof PORT !== 'undefined') hosts.push('http://127.0.0.1:' + PORT + '/api/profile');

  let lastError: any = null;
  for (const url of [...new Set(hosts)]) {
    try {
      const response = await fetch(url, {
        headers: {
          cookie,
          'user-agent': 'GrassCutters internal ACSM admin guard v4',
          'accept': 'application/json'
        },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data && (data.ok !== false)) return data;
      lastError = new Error(data?.message || 'Perfil no autorizado');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No se pudo consultar /api/profile.');
}

async function gcAcsmRequireAdminFromProfileV4(req: any, res: any) {
  try {
    const profile = await gcAcsmProfileGuardFetchV4(req);
    const user = profile.currentUser || profile.user || null;
    const role = String(user?.role || profile.role || '').toLowerCase();
    const authorized = profile.authorized === true || role === 'admin';
    if (!profile.authenticated && !user) {
      res.status(401).json({ ok: false, message: 'Login requerido.', source: 'acsm-profile-guard-v4' });
      return null;
    }
    if (!authorized) {
      res.status(403).json({ ok: false, message: 'Acceso admin requerido.', source: 'acsm-profile-guard-v4' });
      return null;
    }
    return user || { role: 'admin' };
  } catch (error: any) {
    res.status(403).json({ ok: false, message: 'Acceso admin requerido.', source: 'acsm-profile-guard-v4', detail: error?.message || String(error) });
    return null;
  }
}

app.get('/api/admin/acsm/status', async (req: any, res: any) => {
  const adminUser = await gcAcsmRequireAdminFromProfileV4(req, res);
  if (!adminUser) return;

  try {
    const safeConfig = gcAcsmGetLocalFunctionV4('gcAcsmSafeConfigV1');
    const readCurrentCombo = gcAcsmGetLocalFunctionV4('gcAcsmReadCurrentComboV1');
    const config = typeof safeConfig === 'function' ? safeConfig() : { configured: false, message: 'Funciones ACSM no encontradas.' };
    let currentCombo = null;

    if (typeof readCurrentCombo === 'function') {
      try {
        const result = await readCurrentCombo();
        currentCombo = result?.event || result || null;
      } catch (error: any) {
        currentCombo = { ok: false, message: error?.message || 'No se pudo leer el combo actual.' };
      }
    }

    res.json({
      ok: true,
      authenticated: true,
      authorized: true,
      source: 'acsm-profile-guard-v4',
      currentUser: adminUser,
      config,
      currentCombo
    });
  } catch (error: any) {
    console.error('[GC] Error comprobando ACSM v4:', error);
    res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: error?.message || 'No se pudo comprobar ACSM.' });
  }
});

app.post('/api/admin/acsm/sync-current-combo', async (req: any, res: any) => {
  const adminUser = await gcAcsmRequireAdminFromProfileV4(req, res);
  if (!adminUser) return;

  try {
    const syncCurrentCombo = gcAcsmGetLocalFunctionV4('gcAcsmSyncCurrentComboV1') || gcAcsmGetLocalFunctionV4('gcAcsmSyncCurrentComboV2');
    if (typeof syncCurrentCombo !== 'function') {
      res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: 'No se encontraron las funciones de sincronización ACSM. Aplica primero el pack ACSM current combo sync.' });
      return;
    }

    const result = await syncCurrentCombo();
    res.json({
      ok: result?.ok !== false,
      authenticated: true,
      authorized: true,
      source: 'acsm-profile-guard-v4',
      currentUser: adminUser,
      ...result
    });
  } catch (error: any) {
    console.error('[GC] Error sincronizando combo ACSM v4:', error);
    res.status(500).json({ ok: false, source: 'acsm-profile-guard-v4', message: error?.message || 'No se pudo sincronizar el combo desde ACSM.' });
  }
});
// GC ACSM PROFILE GUARD ROUTES V4 END
`;

function insertAfterAppCreation(text) {
  const patterns = [
    /(const\s+app\s*=\s*express\s*\(\s*\)\s*;)/,
    /(let\s+app\s*=\s*express\s*\(\s*\)\s*;)/,
    /(var\s+app\s*=\s*express\s*\(\s*\)\s*;)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && typeof match.index === 'number') {
      const insertAt = match.index + match[0].length;
      return text.slice(0, insertAt) + block + text.slice(insertAt);
    }
  }

  throw new Error('No se ha encontrado "const app = express();" para insertar las rutas prioritarias ACSM.');
}

source = insertAfterAppCreation(source);
fs.writeFileSync(serverPath, source, 'utf8');

console.log('OK: rutas ACSM profile guard v4 aplicadas en src/server/index.ts');
console.log('Backup creado:', path.relative(root, backupPath));
