#!/usr/bin/env node
/* GC_DATA_CORE_DISPLAY_NAMES_GUARD_V1_APPLY
 * Ensures /api/gc/* primes the admin display-name store before reading stracker data.
 * Adds /api/gc/display-names/status for diagnostics.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const STATUS_START = '/* GC_DATA_CORE_DISPLAY_NAMES_STATUS_V1_START */';
const STATUS_END = '/* GC_DATA_CORE_DISPLAY_NAMES_STATUS_V1_END */';
const PRIME_MARKER = '/* GC_DATA_CORE_DISPLAY_NAMES_GUARD_V1 */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC DISPLAY NAMES GUARD] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('async function readDisplayNameStoreAsync')) {
  console.error('[GC DISPLAY NAMES GUARD] readDisplayNameStoreAsync() not found. Display-name system is not present in this branch.');
  process.exit(1);
}

const statusRoute = `
${STATUS_START}
app.get('/api/gc/display-names/status', async (_req, res) => {
  try {
    const store = await readDisplayNameStoreAsync();
    const enabledEntries = store.entries.filter((entry: DisplayNameEntry) => entry.enabled !== false);
    const byKind = enabledEntries.reduce((acc: Record<string, number>, entry: DisplayNameEntry) => {
      acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      storage: getDisplayNamesDbInfo(),
      cache: {
        path: displayNameCache?.path ?? null,
        mtimeMs: displayNameCache?.mtimeMs ?? null,
        loaded: Boolean(displayNameCache),
        updatedAt: displayNameCache?.store?.updatedAt ?? store.updatedAt
      },
      entries: {
        total: store.entries.length,
        enabled: enabledEntries.length,
        disabled: store.entries.length - enabledEntries.length,
        byKind
      },
      message: 'Display-name overrides cargados para Data Core.'
    });
  } catch (error) {
    console.error('[GC Data Core] Error consultando display-name status:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      storage: getDisplayNamesDbInfo(),
      message: 'No se pudieron leer los display-name overrides.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${STATUS_END}
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC DISPLAY NAMES GUARD] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

const replacedStatus = replaceMarkedBlock(source, STATUS_START, STATUS_END, statusRoute);
if (replacedStatus !== null) {
  source = replacedStatus;
} else {
  const anchor =
    source.includes("app.get('/api/gc/snapshot'")
      ? "app.get('/api/gc/snapshot'"
      : "app.get('/api/health'";
  source = insertBefore(source, anchor, statusRoute, '/api/gc/display-names/status');
}

const routes = [
  '/api/gc/snapshot',
  '/api/gc/active-combo',
  '/api/gc/leaderboard',
  '/api/gc/recent-laps',
  '/api/gc/combos'
];

let patchedRoutes = 0;

for (const route of routes) {
  let searchFrom = 0;

  while (true) {
    const routeIndex = source.indexOf(`app.get('${route}'`, searchFrom);
    if (routeIndex === -1) break;

    const nextRouteIndex = source.indexOf('\napp.', routeIndex + 1);
    const routeEnd = nextRouteIndex === -1 ? source.length : nextRouteIndex;
    const routeBlock = source.slice(routeIndex, routeEnd);

    if (routeBlock.includes(PRIME_MARKER)) {
      searchFrom = routeEnd;
      continue;
    }

    const tryOffset = routeBlock.indexOf('try {');
    if (tryOffset === -1) {
      console.warn(`[GC DISPLAY NAMES GUARD] Route ${route} found but no try block was detected.`);
      searchFrom = routeEnd;
      continue;
    }

    const absoluteTry = routeIndex + tryOffset;
    const insertion = `try {\n    ${PRIME_MARKER}\n    await readDisplayNameStoreAsync();`;

    source = source.slice(0, absoluteTry) + insertion + source.slice(absoluteTry + 'try {'.length);
    patchedRoutes += 1;
    searchFrom = absoluteTry + insertion.length;
  }
}

if (!patchedRoutes && !source.includes(PRIME_MARKER)) {
  console.warn('[GC DISPLAY NAMES GUARD] No /api/gc route was patched. Did you apply Data Core packs first?');
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log(`[GC DISPLAY NAMES GUARD] Done. Patched routes: ${patchedRoutes}.`);
console.log('[GC DISPLAY NAMES GUARD] Added/updated /api/gc/display-names/status.');
console.log('[GC DISPLAY NAMES GUARD] Run: npm run build');
