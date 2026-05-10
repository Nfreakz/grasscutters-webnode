#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const gitignorePath = path.join(root, '.gitignore');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(serverPath)) fail('No encuentro src/server/index.ts.');
const server = fs.readFileSync(serverPath, 'utf8');

const required = [
  'GC CALENDAR DB STORAGE START',
  'gc_calendar_events',
  "app.get('/api/calendar-events'",
  "app.get('/api/admin/calendar-events/storage'",
  "app.post('/api/admin/calendar-events'",
  "app.put('/api/admin/calendar-events/:id'",
  "app.delete('/api/admin/calendar-events/:id'"
];

for (const needle of required) {
  if (!server.includes(needle)) fail(`Falta en src/server/index.ts: ${needle}`);
}

if (gitignorePath && fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignore.includes('/data/app/*.json')) {
    console.warn('AVISO: .gitignore no contiene /data/app/*.json. No subas calendar-events.json, users.json ni display-names.json.');
  }
}

console.log('OK: el servidor contiene el storage DB para calendario.');
console.log('Comprueba después de arrancar: /api/calendar-events y /api/admin/calendar-events/storage');
