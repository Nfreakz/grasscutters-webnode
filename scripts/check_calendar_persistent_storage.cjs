#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const gitignorePath = path.join(root, '.gitignore');

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const server = read(serverPath);
const gitignore = read(gitignorePath);
let ok = true;

if (!server.includes('function getCalendarEventsPath()')) {
  console.error('ERROR: falta function getCalendarEventsPath() en src/server/index.ts');
  ok = false;
} else if (!server.includes("getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json')")) {
  console.error('ERROR: getCalendarEventsPath() no usa APP_CALENDAR_EVENTS_PATH / APP_DATA_DIR.');
  ok = false;
} else {
  console.log('OK: calendario usa ruta configurable.');
}

const hardcodedPatterns = [
  "path.join(rootDir, 'data/app/calendar-events.json')",
  'path.join(rootDir, "data/app/calendar-events.json")',
  "path.join(rootDir, 'data', 'app', 'calendar-events.json')",
  'path.join(rootDir, "data", "app", "calendar-events.json")'
];
for (const pattern of hardcodedPatterns) {
  if (server.includes(pattern)) {
    console.error(`ERROR: queda una ruta hardcodeada: ${pattern}`);
    ok = false;
  }
}

if (!gitignore.includes('/data/app/calendar-events.json') && !gitignore.includes('/data/app/*.json')) {
  console.error('ERROR: .gitignore no protege data/app/calendar-events.json');
  ok = false;
} else {
  console.log('OK: .gitignore protege calendar-events.json.');
}

try {
  const tracked = execSync('git ls-files data/app/calendar-events.json', { cwd: root, encoding: 'utf8' }).trim();
  if (tracked) {
    console.error('ERROR: data/app/calendar-events.json está trackeado por Git. Ejecuta: git rm --cached data/app/calendar-events.json');
    ok = false;
  } else {
    console.log('OK: data/app/calendar-events.json no está trackeado por Git.');
  }
} catch (_) {
  console.log('INFO: no se pudo comprobar git ls-files.');
}

console.log('\nStorage de producción:');
if (process.env.APP_CALENDAR_EVENTS_PATH) {
  console.log(`APP_CALENDAR_EVENTS_PATH=${process.env.APP_CALENDAR_EVENTS_PATH}`);
} else if (process.env.APP_DATA_DIR) {
  console.log(`APP_DATA_DIR=${process.env.APP_DATA_DIR}`);
} else {
  console.warn('AVISO: no hay APP_DATA_DIR ni APP_CALENDAR_EVENTS_PATH en esta terminal. En producción debes configurar una ruta persistente fuera del proyecto.');
}

process.exit(ok ? 0 : 1);
