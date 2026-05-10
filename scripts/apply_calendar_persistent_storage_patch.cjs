#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const gitignorePath = path.join(root, '.gitignore');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function backup(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.backup-${label}-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function findFunctionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

if (!fs.existsSync(serverPath)) fail('No encuentro src/server/index.ts. Ejecuta este script desde la raíz del proyecto.');

let server = fs.readFileSync(serverPath, 'utf8');
const originalServer = server;

const helper = `function getCalendarEventsPath() {\n  return getStorageFilePath('APP_CALENDAR_EVENTS_PATH', 'app/calendar-events.json');\n}\n`;

const existingHelper = findFunctionBlock(server, 'getCalendarEventsPath');
if (existingHelper) {
  server = `${server.slice(0, existingHelper.start)}${helper.trimEnd()}${server.slice(existingHelper.end)}`;
} else {
  const insertBefore = 'function getDisplayNamesDbInfo()';
  const insertAt = server.indexOf(insertBefore);
  if (insertAt >= 0) {
    server = `${server.slice(0, insertAt)}${helper}\n${server.slice(insertAt)}`;
  } else {
    const fallbackBefore = 'function getAppStorageStatus()';
    const fallbackAt = server.indexOf(fallbackBefore);
    if (fallbackAt >= 0) {
      server = `${server.slice(0, fallbackAt)}${helper}\n${server.slice(fallbackAt)}`;
    } else {
      fail('No encuentro un punto seguro donde insertar getCalendarEventsPath().');
    }
  }
}

const replacements = [
  [/path\.join\(\s*rootDir\s*,\s*['"]data\/app\/calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()'],
  [/path\.resolve\(\s*rootDir\s*,\s*['"]data\/app\/calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()'],
  [/path\.join\(\s*rootDir\s*,\s*['"]data['"]\s*,\s*['"]app['"]\s*,\s*['"]calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()'],
  [/path\.resolve\(\s*rootDir\s*,\s*['"]data['"]\s*,\s*['"]app['"]\s*,\s*['"]calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()'],
  [/path\.join\(\s*getAppDataRoot\(\)\s*,\s*['"]app['"]\s*,\s*['"]calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()'],
  [/path\.resolve\(\s*getAppDataRoot\(\)\s*,\s*['"]app['"]\s*,\s*['"]calendar-events\.json['"]\s*\)/g, 'getCalendarEventsPath()']
];

let replacementCount = 0;
for (const [pattern, value] of replacements) {
  server = server.replace(pattern, () => {
    replacementCount += 1;
    return value;
  });
}

// If the calendar patch used a generic constant name, normalize the direct assignment too.
server = server.replace(/const\s+calendarEventsPath\s*=\s*getCalendarEventsPath\(\)\s*;\s*\(\);/g, 'const calendarEventsPath = getCalendarEventsPath();');

if (server !== originalServer) {
  const backupPath = backup(serverPath, 'calendar-persistent-storage');
  fs.writeFileSync(serverPath, server, 'utf8');
  console.log(`OK: src/server/index.ts actualizado.`);
  if (backupPath) console.log(`Backup: ${path.relative(root, backupPath)}`);
} else {
  console.log('INFO: src/server/index.ts ya parecía actualizado.');
}

let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
const linesToEnsure = [
  '',
  '# GrassCutters runtime data',
  '/data/app/calendar-events.json',
  '/data/app/calendar-events.*.json',
  '/data/app/users.json',
  '/data/app/display-names.json',
  '/data/app/*.sqlite',
  '/data/app/*.sqlite3',
  '/data/app/*.tmp',
  '*.backup-calendar-*',
  '*.backup-profile-*',
  'src/**/*.backup-*'
];
let gitignoreChanged = false;
for (const line of linesToEnsure) {
  if (!line) continue;
  if (!gitignore.split(/\r?\n/).includes(line)) {
    if (!gitignore.endsWith('\n')) gitignore += '\n';
    gitignore += `${line}\n`;
    gitignoreChanged = true;
  }
}
if (gitignoreChanged) {
  const backupPath = backup(gitignorePath, 'calendar-persistent-storage');
  fs.writeFileSync(gitignorePath, gitignore, 'utf8');
  console.log('OK: .gitignore actualizado para datos runtime.');
  if (backupPath) console.log(`Backup: ${path.relative(root, backupPath)}`);
} else {
  console.log('INFO: .gitignore ya protegía los datos runtime.');
}

const oldPath = path.join(root, 'data', 'app', 'calendar-events.json');
let configuredTarget = null;
if (process.env.APP_CALENDAR_EVENTS_PATH && process.env.APP_CALENDAR_EVENTS_PATH.trim()) {
  configuredTarget = path.isAbsolute(process.env.APP_CALENDAR_EVENTS_PATH.trim())
    ? process.env.APP_CALENDAR_EVENTS_PATH.trim()
    : path.join(root, process.env.APP_CALENDAR_EVENTS_PATH.trim());
} else if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
  configuredTarget = path.join(path.isAbsolute(process.env.APP_DATA_DIR.trim()) ? process.env.APP_DATA_DIR.trim() : path.join(root, process.env.APP_DATA_DIR.trim()), 'app', 'calendar-events.json');
}

if (configuredTarget && path.resolve(configuredTarget) !== path.resolve(oldPath) && fs.existsSync(oldPath) && !fs.existsSync(configuredTarget)) {
  fs.mkdirSync(path.dirname(configuredTarget), { recursive: true });
  fs.copyFileSync(oldPath, configuredTarget);
  console.log(`OK: calendario copiado a storage persistente: ${configuredTarget}`);
}

console.log('\nSiguiente paso recomendado:');
console.log('1) En producción configura APP_DATA_DIR fuera del proyecto, o APP_CALENDAR_EVENTS_PATH con una ruta persistente.');
console.log('2) Ejecuta npm run build.');
console.log('3) Reinicia el servidor.');
