#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const serverPath = path.join(projectRoot, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('ERROR: No encuentro src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const startMarker = '// GC ACSM PRIORITY MYSQL GUARD V6 START';
const endMarker = '// GC ACSM PRIORITY MYSQL GUARD V6 END';

const block = "\n\n// GC ACSM PRIORITY MYSQL GUARD V6 START\nfunction gcAcsmV6ParseCookies(req: any) {\n  const header = String(req?.headers?.cookie || '');\n  const out: Record<string, string> = {};\n  for (const part of header.split(';')) {\n    const index = part.indexOf('=');\n    if (index === -1) continue;\n    const key = part.slice(0, index).trim();\n    const value = part.slice(index + 1).trim();\n    if (!key) continue;\n    try { out[key] = decodeURIComponent(value); }\n    catch { out[key] = value; }\n  }\n  return out;\n}\n\nfunction gcAcsmV6Sha256(value: string) {\n  return crypto.createHash('sha256').update(value).digest('hex');\n}\n\nfunction gcAcsmV6MysqlDate(value: unknown) {\n  if (!value) return null;\n  if (value instanceof Date) return value.toISOString();\n  const parsed = Date.parse(String(value));\n  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);\n}\n\nasync function gcAcsmV6MysqlAdminFromCookie(req: any) {\n  const cookies = gcAcsmV6ParseCookies(req);\n  const token = cookies[sessionCookieName] || cookies.gc_session || '';\n  if (!token) return { authenticated: false, authorized: false, message: 'Login requerido.' };\n\n  const host = process.env.MYSQL_HOST?.trim();\n  const database = process.env.MYSQL_DATABASE?.trim();\n  const user = process.env.MYSQL_USER?.trim();\n  const password = process.env.MYSQL_PASSWORD ?? '';\n  const port = Number(process.env.MYSQL_PORT || 3306);\n  if (!host || !database || !user) {\n    return { authenticated: false, authorized: false, message: 'MySQL no configurado para validar sesión admin.' };\n  }\n\n  const tokenHash = gcAcsmV6Sha256(token);\n  const mysqlModule: any = await import('mysql2/promise');\n  const mysql = mysqlModule.default ?? mysqlModule;\n  const connection = await mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });\n  try {\n    const [rows] = await connection.execute(\n      `SELECT\n          u.id,\n          u.email,\n          u.display_name AS displayName,\n          u.role,\n          u.pilot_player_id AS pilotPlayerId,\n          u.pilot_steam_guid AS pilotSteamGuid,\n          u.pilot_stracker_name AS pilotStrackerName,\n          u.pilot_linked_at AS pilotLinkedAt,\n          u.created_at AS createdAt,\n          u.updated_at AS updatedAt,\n          u.last_login_at AS lastLoginAt,\n          s.expires_at AS sessionExpiresAt\n        FROM gc_sessions s\n        INNER JOIN gc_users u ON u.id = s.user_id\n        WHERE s.token_hash = ?\n        LIMIT 1`,\n      [tokenHash]\n    );\n    const row = Array.isArray(rows) ? rows[0] : null;\n    if (!row) return { authenticated: false, authorized: false, message: 'Sesión no encontrada.' };\n\n    const expiresAt = row.sessionExpiresAt ? new Date(row.sessionExpiresAt) : null;\n    if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {\n      return { authenticated: false, authorized: false, message: 'Sesión caducada.' };\n    }\n\n    const currentUser = {\n      id: String(row.id),\n      email: String(row.email || ''),\n      displayName: String(row.displayName || ''),\n      role: String(row.role || 'pilot'),\n      pilotLink: row.pilotPlayerId ? {\n        playerId: Number(row.pilotPlayerId),\n        steamGuid: row.pilotSteamGuid || null,\n        strackerName: row.pilotStrackerName || '',\n        linkedAt: gcAcsmV6MysqlDate(row.pilotLinkedAt)\n      } : null,\n      createdAt: gcAcsmV6MysqlDate(row.createdAt),\n      updatedAt: gcAcsmV6MysqlDate(row.updatedAt),\n      lastLoginAt: gcAcsmV6MysqlDate(row.lastLoginAt)\n    };\n\n    return {\n      authenticated: true,\n      authorized: currentUser.role === 'admin',\n      currentUser,\n      message: currentUser.role === 'admin' ? 'OK' : 'Acceso admin requerido.'\n    };\n  } finally {\n    await connection.end();\n  }\n}\n\nasync function gcAcsmV6ResolveAdmin(req: any) {\n  if (useMysqlStorage()) {\n    return gcAcsmV6MysqlAdminFromCookie(req);\n  }\n\n  // Fallback local: si existe el guard antiguo y funciona, lo dejamos trabajar.\n  // En producción MySQL no se usa fetch interno, que era lo que fallaba en Hostinger.\n  const host = req?.headers?.host || `127.0.0.1:${PORT}`;\n  const proto = req?.headers?.['x-forwarded-proto'] || (String(host).includes('localhost') || String(host).includes('127.0.0.1') ? 'http' : 'https');\n  const url = `${proto}://${host}/api/profile`;\n  const response = await fetch(url, { headers: { cookie: String(req?.headers?.cookie || '') } });\n  const data: any = await response.json().catch(() => null);\n  return {\n    authenticated: Boolean(data?.authenticated || data?.ok),\n    authorized: data?.user?.role === 'admin' || data?.currentUser?.role === 'admin',\n    currentUser: data?.user || data?.currentUser || null,\n    message: data?.message || 'OK'\n  };\n}\n\napp.get('/api/admin/acsm/status', async (req: any, res: any) => {\n  try {\n    const auth = await gcAcsmV6ResolveAdmin(req);\n    if (!auth.authenticated) return res.status(401).json({ ok: false, authenticated: false, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Login requerido.' });\n    if (!auth.authorized) return res.status(403).json({ ok: false, authenticated: true, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Acceso admin requerido.' });\n\n    const config = typeof gcAcsmSafeConfigV1 === 'function' ? gcAcsmSafeConfigV1() : { available: false };\n    let currentCombo: any = null;\n    let readError: string | null = null;\n    if (config?.hostConfigured && config?.userConfigured && config?.passwordConfigured && typeof gcAcsmReadCurrentComboV1 === 'function') {\n      try {\n        const current = await gcAcsmReadCurrentComboV1();\n        currentCombo = current?.event || null;\n      } catch (error: any) {\n        readError = error?.message || String(error);\n      }\n    }\n\n    res.json({\n      ok: true,\n      authenticated: true,\n      authorized: true,\n      source: 'acsm-priority-mysql-guard-v6',\n      currentUser: auth.currentUser || null,\n      config,\n      currentCombo,\n      readError\n    });\n  } catch (error: any) {\n    console.error('[GC] Error ACSM status v6:', error);\n    res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: error?.message || 'No se pudo comprobar ACSM.' });\n  }\n});\n\napp.post('/api/admin/acsm/sync-current-combo', async (req: any, res: any) => {\n  try {\n    const auth = await gcAcsmV6ResolveAdmin(req);\n    if (!auth.authenticated) return res.status(401).json({ ok: false, authenticated: false, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Login requerido.' });\n    if (!auth.authorized) return res.status(403).json({ ok: false, authenticated: true, authorized: false, source: 'acsm-priority-mysql-guard-v6', message: auth.message || 'Acceso admin requerido.' });\n\n    if (typeof gcAcsmSyncCurrentComboV1 !== 'function') {\n      return res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: 'No se encontraron las funciones de sincronización ACSM. Aplica primero el pack ACSM current combo sync.' });\n    }\n\n    const result = await gcAcsmSyncCurrentComboV1();\n    res.json({\n      ...result,\n      ok: result?.ok !== false,\n      authenticated: true,\n      authorized: true,\n      guardSource: 'acsm-priority-mysql-guard-v6',\n      currentUser: auth.currentUser || null\n    });\n  } catch (error: any) {\n    console.error('[GC] Error sincronizando combo ACSM v6:', error);\n    res.status(500).json({ ok: false, source: 'acsm-priority-mysql-guard-v6', message: error?.message || 'No se pudo sincronizar el combo desde ACSM.' });\n  }\n});\n// GC ACSM PRIORITY MYSQL GUARD V6 END";

const oldBlockRegex = new RegExp(`${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g');
source = source.replace(oldBlockRegex, '');

const appAnchorRegexes = [
  /(const\s+app\s*=\s*express\s*\(\s*\)\s*;)/,
  /(let\s+app\s*=\s*express\s*\(\s*\)\s*;)/,
  /(var\s+app\s*=\s*express\s*\(\s*\)\s*;)/
];

let replaced = false;
for (const regex of appAnchorRegexes) {
  if (regex.test(source)) {
    source = source.replace(regex, `$1${block}`);
    replaced = true;
    break;
  }
}

if (!replaced) {
  console.error('ERROR: No he encontrado "const app = express();". No se ha modificado nada.');
  process.exit(1);
}

const backupPath = `${serverPath}.backup-acsm-priority-mysql-guard-v6-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverPath, backupPath);
fs.writeFileSync(serverPath, source, 'utf8');

console.log('OK: rutas ACSM v6 insertadas justo después de crear Express.');
console.log(`Backup: ${path.relative(projectRoot, backupPath)}`);
