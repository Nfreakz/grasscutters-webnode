const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [
  {
    file: 'src/pages/admin.astro',
    markers: [
      'GC ADMIN VISIBILITY CLEANUP V1 SETPANELS',
      'GC ADMIN VISIBILITY CLEANUP V1 RENDERSTATUS',
      'GC ADMIN VISIBILITY CLEANUP V1 WATCHDOG',
      'admin-profile-fallback'
    ]
  },
  {
    file: 'src/pages/admin/calendario.astro',
    markers: [
      'GC CALENDAR ADMIN AUTH CLEANUP V1 START',
      'calendar-admin-profile-fallback',
      'calendarSyncAcsm',
      '/api/admin/acsm/sync-current-combo'
    ]
  }
];

let ok = true;
for (const check of checks) {
  const filePath = path.join(root, check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: no existe ${check.file}`);
    ok = false;
    continue;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const missing = check.markers.filter((marker) => !source.includes(marker));
  if (missing.length) {
    console.error(`ERROR: faltan marcas en ${check.file}: ${missing.join(', ')}`);
    ok = false;
  } else {
    console.log(`OK: ${check.file}`);
  }
}

if (!ok) process.exit(1);
console.log('OK: fix admin/calendario instalado.');
