#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const serverPath = path.join(root, 'src/server/index.ts');
if (!fs.existsSync(serverPath)) {
  console.error('No encuentro src/server/index.ts');
  process.exit(1);
}
const text = fs.readFileSync(serverPath, 'utf8');
const marker = 'GC_CALENDAR_EVENTS_PATCH_V7_REPEAT_WEEKLY';
const hasMarker = text.includes(marker);
const hasPublic = text.includes("'/api/calendar-events'") || text.includes('"/api/calendar-events"');
const hasAdmin = text.includes("'/api/admin/calendar-events'") || text.includes('"/api/admin/calendar-events"');
const hasRepeat = text.includes('repeatEnabled') && text.includes('repeatFrequency');
const markerIndex = text.indexOf(marker);
const catchAllIndexes = ["app.get('*'", 'app.get("*"', "app.get('/*'", 'app.get("/*"', 'createRequestHandler', 'app.listen(']
  .map((needle) => text.indexOf(needle))
  .filter((n) => n >= 0);
const catchAllIndex = catchAllIndexes.length ? Math.min(...catchAllIndexes) : -1;
console.log('Calendario patch v7:', hasMarker ? 'OK' : 'NO ENCONTRADO');
console.log('Ruta pública:', hasPublic ? 'OK' : 'NO ENCONTRADA');
console.log('Ruta admin:', hasAdmin ? 'OK' : 'NO ENCONTRADA');
console.log('Repetición semanal:', hasRepeat ? 'OK' : 'NO ENCONTRADA');
if (markerIndex >= 0 && catchAllIndex >= 0) {
  console.log('Orden:', markerIndex < catchAllIndex ? 'OK, antes del catch-all/listen' : 'MAL, después del catch-all/listen');
}
