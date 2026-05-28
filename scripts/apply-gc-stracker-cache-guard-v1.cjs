#!/usr/bin/env node
/* GC_STRACKER_CACHE_GUARD_V1_APPLY
 * Adds safe cache diagnostics and admin cache clear endpoint.
 * Patches syncStrackerFromGTX() call sites to invalidate runtime cache after successful sync.
 * Scope: Race Data Core / Stracker only. ACSM is intentionally not touched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_STRACKER_CACHE_GUARD_V1_START */';
const END = '/* GC_STRACKER_CACHE_GUARD_V1_END */';
const INVALIDATE_MARKER = '/* GC_STRACKER_SYNC_CACHE_INVALIDATE_V1 */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC STRACKER CACHE GUARD] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

const required = [
  'gcCacheInfo',
  'invalidateStrackerRuntimeCache',
  'getStrackerConfig',
  'requireAdmin'
];

for (const name of required) {
  if (!source.includes(name)) {
    console.error(`[GC STRACKER CACHE GUARD] Required function not found: ${name}`);
    console.error('[GC STRACKER CACHE GUARD] Apply after performance core and admin auth exist.');
    process.exit(1);
  }
}

const routeBlock = `
${START}
function gcSafeStrackerCacheStatusV1() {
  const stracker = getStrackerConfig();
  const cache = gcCacheInfo();

  return {
    ok: true,
    source: 'gc-race-data-core',
    generatedAt: new Date().toISOString(),
    domain: 'stracker',
    cache,
    stracker: {
      exists: Boolean(stracker.exists),
      validSQLite: Boolean(stracker.validSQLite),
      sizeBytes: Number(stracker.sizeBytes ?? 0),
      sizeMb: Math.round(((Number(stracker.sizeBytes ?? 0) / 1024 / 1024) || 0) * 10) / 10,
      modifiedAt: stracker.modifiedAt ?? null,
      configured: Boolean(stracker.configured),
      source: stracker.source ?? null
    },
    message: 'Estado seguro de caché Race Data Core. No expone rutas internas.'
  };
}

app.get('/api/gc/cache/status', async (_req, res) => {
  try {
    res.json(gcSafeStrackerCacheStatusV1());
  } catch (error) {
    console.error('[GC Race Data Core] cache status error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-race-data-core',
      generatedAt: new Date().toISOString(),
      domain: 'stracker',
      message: 'No se pudo leer el estado de caché Race Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.post('/api/admin/stracker/cache/clear', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    invalidateStrackerRuntimeCache('admin-cache-clear');
    res.json({
      ok: true,
      source: 'gc-race-data-core',
      clearedAt: new Date().toISOString(),
      cache: gcCacheInfo(),
      message: 'Caché Stracker/Race Data Core limpiada.'
    });
  } catch (error) {
    console.error('[GC Race Data Core] cache clear error:', error);
    res.status(500).json({
      ok: false,
      source: 'gc-race-data-core',
      message: 'No se pudo limpiar la caché Race Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${END}
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
    console.error(`[GC STRACKER CACHE GUARD] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

const replaced = replaceMarkedBlock(source, START, END, routeBlock);
if (replaced !== null) {
  source = replaced;
} else {
  const anchor =
    source.includes("app.get('/api/gc/diagnostics'")
      ? "app.get('/api/gc/diagnostics'"
      : source.includes("app.get('/api/gc/snapshot'")
        ? "app.get('/api/gc/snapshot'"
        : "app.get('/api/health'";
  source = insertBefore(source, anchor, routeBlock, 'cache guard routes');
}

function patchSyncInvalidation(text) {
  const needle = 'await syncStrackerFromGTX()';
  let output = text;
  let offset = 0;
  let patched = 0;

  while (true) {
    const index = output.indexOf(needle, offset);
    if (index === -1) break;

    const blockStart = Math.max(0, index - 350);
    const blockEnd = Math.min(output.length, index + 700);
    const context = output.slice(blockStart, blockEnd);

    if (context.includes(INVALIDATE_MARKER) || context.includes("invalidateStrackerRuntimeCache('stracker-sync')") || context.includes('invalidateStrackerRuntimeCache("stracker-sync")')) {
      offset = index + needle.length;
      continue;
    }

    const statementEnd = output.indexOf(';', index);
    if (statementEnd === -1) {
      offset = index + needle.length;
      continue;
    }

    const insertion = `\n      ${INVALIDATE_MARKER}\n      if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');`;
    output = output.slice(0, statementEnd + 1) + insertion + output.slice(statementEnd + 1);
    patched += 1;
    offset = statementEnd + insertion.length;
  }

  return { output, patched };
}

const syncPatch = patchSyncInvalidation(source);
source = syncPatch.output;

// Add cache to diagnostics if that route exists and not already included.
if (source.includes("app.get('/api/gc/diagnostics'") && !source.includes("cache: gcCacheInfo(),")) {
  source = source.replace(
    "displayNames: {",
    "cache: gcCacheInfo(),\n      displayNames: {"
  );
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log(`[GC STRACKER CACHE GUARD] Added/updated cache endpoints. Sync call sites patched: ${syncPatch.patched}.`);
console.log('[GC STRACKER CACHE GUARD] Run: npm run build');
