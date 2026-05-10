const fs = require('fs');
const path = require('path');
const serverPath = path.join(process.cwd(), 'src/server/index.ts');
const source = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';
const checks = [
  ['bloque ACSM', source.includes('// GC ACSM SYNC START') && source.includes('// GC ACSM SYNC END')],
  ['endpoint status', source.includes("/api/admin/acsm/status")],
  ['endpoint sync current combo', source.includes("/api/admin/acsm/sync-current-combo")],
  ['usa calendario MySQL', source.includes('gcCalendarWriteEventsDbV8')],
  ['usa SFTP', source.includes("ssh2-sftp-client")]
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'OK' : 'ERROR'}: ${label}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log('OK: patch ACSM preparado. Ejecuta npm run build.');
