import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_HOTLAPS_GT4_SOURCE_SCOPED_NAMES_FIX_V3';
const files = {
  server: 'src/server/index.ts',
  admin: 'src/pages/admin/nombres.astro',
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `hotlaps-gt4-source-scoped-names-v3-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function replaceAllRequired(text, from, to, label, expectedMinimum = 1) {
  if (!text.includes(from)) {
    if (text.includes(to)) return text;
    throw new Error(`No se encontró ${label}`);
  }
  const count = text.split(from).length - 1;
  if (count < expectedMinimum) {
    throw new Error(`${label}: se esperaban al menos ${expectedMinimum}, encontrados ${count}`);
  }
  return text.split(from).join(to);
}

function writePreservingEol(relativePath, original, normalized) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const output = eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
  backup(relativePath);
  fs.writeFileSync(target(relativePath), output, 'utf8');
  changed.push(relativePath);
}

for (const relativePath of Object.values(files)) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}.`);
  }
}

// Backend: identidad de alias separada por fuente.
{
  const original = fs.readFileSync(target(files.server), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes("app.post('/api/admin/name-filters/bulk'")
      || !next.includes('function findDisplayNameEntry(')
      || !next.includes('function gcMirrorV2SourceAwareAssetDisplay(')
      || !next.includes('function buildDisplayNameCatalogItem(')) {
      throw new Error('src/server/index.ts no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      `type DisplayNameEntry = {
  id: string;
  kind: DisplayNameKind;
  sourceId: number | null;`,
      `/* ${marker} */
type DisplayNameEntry = {
  id: string;
  kind: DisplayNameKind;
  sourceKey: string;
  sourceId: number | null;`,
      'el tipo DisplayNameEntry',
    );

    next = replaceRequired(
      next,
      `function normalizeDisplayNameKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}`,
      `function normalizeDisplayNameKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeDisplayNameSourceKey(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (['gt4', 'supra', 'supra_gt4', 'supra-gt4'].includes(normalized)) return 'gt4';
  if (['main', 'liga', 'grasscutters', 'weekly'].includes(normalized)) return 'main';
  return normalized || 'main';
}

function displayNameSourceKeyFromId(value: unknown) {
  const match = /^source:([^:]+):/i.exec(String(value ?? '').trim());
  return normalizeDisplayNameSourceKey(match?.[1] || 'main');
}`,
      'los helpers de identidad de fuente',
    );

    next = replaceRequired(
      next,
      `            id: String(entry.id || crypto.randomUUID()),
            kind: sanitizeDisplayNameKind(entry.kind) || 'driver',
            sourceId: Number.isFinite(Number(entry.sourceId)) ? Number(entry.sourceId) : null,`,
      `            id: String(entry.id || crypto.randomUUID()),
            kind: sanitizeDisplayNameKind(entry.kind) || 'driver',
            sourceKey: normalizeDisplayNameSourceKey(entry.sourceKey ?? displayNameSourceKeyFromId(entry.id)),
            sourceId: Number.isFinite(Number(entry.sourceId)) ? Number(entry.sourceId) : null,`,
      'la lectura JSON de sourceKey',
    );

    next = replaceAllRequired(
      next,
      `        id: String(row.id),
        kind: sanitizeDisplayNameKind(row.kind) || 'driver',
        sourceId: Number.isFinite(Number(row.source_id)) ? Number(row.source_id) : null,`,
      `        id: String(row.id),
        kind: sanitizeDisplayNameKind(row.kind) || 'driver',
        sourceKey: displayNameSourceKeyFromId(row.id),
        sourceId: Number.isFinite(Number(row.source_id)) ? Number(row.source_id) : null,`,
      'la lectura DB de sourceKey',
      1,
    );

    // Algunas fases anteriores dejan uno de los dos mapeos DB con una indentación
    // o formato distinto. Aplicamos una segunda pasada flexible y verificamos que
    // no quede ningún mapeo row.id -> sourceId sin sourceKey entre ambos campos.
    next = next.replace(
      /(id:\s*String\(row\.id\),\s*\n\s*kind:\s*sanitizeDisplayNameKind\(row\.kind\)\s*\|\|\s*'driver',\s*\n)(\s*)sourceId:/g,
      `$1$2sourceKey: displayNameSourceKeyFromId(row.id),\n$2sourceId:`,
    );

    const dbReadWithoutSourceKey = /id:\s*String\(row\.id\),\s*\n\s*kind:\s*sanitizeDisplayNameKind\(row\.kind\)\s*\|\|\s*'driver',\s*\n\s*sourceId:/;
    if (dbReadWithoutSourceKey.test(next)) {
      throw new Error('Quedó una lectura DB de alias sin sourceKey.');
    }

    next = replaceRequired(
      next,
      `function findDisplayNameEntry(store: DisplayNameStore, kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown) {
  const numericId = Number(sourceId);
  const hasId = Number.isFinite(numericId);
  const code = normalizeDisplayNameKey(sourceCode);
  const name = normalizeDisplayNameKey(sourceName);

  return store.entries.find((entry) => {
    if (!entry.enabled || entry.kind !== kind) return false;

    const entryHasId = entry.sourceId !== null && entry.sourceId !== undefined && Number.isFinite(Number(entry.sourceId));
    const entryCode = normalizeDisplayNameKey(entry.sourceCode);
    const entryName = normalizeDisplayNameKey(entry.sourceName);

    if (hasId && entryHasId && Number(entry.sourceId) === numericId) return true;
    if (code && entryCode && entryCode === code) return true;

    // Los pilotos pueden compartir nombre visible en stracker. Si la vuelta trae PlayerId
    // o SteamGuid, NO hacemos fallback por nombre para evitar que dos "Neo" reciban el
    // mismo override. Solo usamos sourceName cuando no hay identidad tÃƒÂ©cnica disponible.
    if (kind === 'driver' && (hasId || code)) return false;

    if (name && entryName && entryName === name) return true;
    return false;
  }) ?? null;
}

function applyDisplayName(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown, fallback: string) {
  const entry = findDisplayNameEntry(readDisplayNameStore(), kind, sourceId, sourceCode, sourceName);
  return compactNullableText(entry?.displayName) || fallback;
}

function makeEntryId(kind: DisplayNameKind, sourceId: unknown, sourceCode: unknown, sourceName: unknown) {
  const id = Number(sourceId);
  if (Number.isFinite(id)) return \`\${kind}:\${id}\`;
  const code = normalizeDisplayNameKey(sourceCode);
  if (code) return \`\${kind}:code:\${code}\`;
  return \`\${kind}:name:\${normalizeDisplayNameKey(sourceName) || crypto.randomUUID()}\`;
}`,
      `function findDisplayNameEntry(
  store: DisplayNameStore,
  kind: DisplayNameKind,
  sourceId: unknown,
  sourceCode: unknown,
  sourceName: unknown,
  sourceKey: unknown = 'main',
) {
  const wantedSourceKey = normalizeDisplayNameSourceKey(sourceKey);
  const numericId = Number(sourceId);
  const hasId = Number.isFinite(numericId);
  const code = normalizeDisplayNameKey(sourceCode);
  const name = normalizeDisplayNameKey(sourceName);

  return store.entries.find((entry) => {
    if (!entry.enabled || entry.kind !== kind) return false;
    const entrySourceKey = normalizeDisplayNameSourceKey(entry.sourceKey ?? displayNameSourceKeyFromId(entry.id));
    if (entrySourceKey !== wantedSourceKey) return false;

    const entryHasId = entry.sourceId !== null && entry.sourceId !== undefined && Number.isFinite(Number(entry.sourceId));
    const entryCode = normalizeDisplayNameKey(entry.sourceCode);
    const entryName = normalizeDisplayNameKey(entry.sourceName);

    if (hasId && entryHasId && Number(entry.sourceId) === numericId) return true;
    if (code && entryCode && entryCode === code) return true;

    // Con identidad técnica disponible no hacemos fallback por nombre. Así un nombre
    // repetido o contaminado no puede renombrar todos los coches/circuitos de una fuente.
    if (hasId || code) return false;

    if (name && entryName && entryName === name) return true;
    return false;
  }) ?? null;
}

function applyDisplayName(
  kind: DisplayNameKind,
  sourceId: unknown,
  sourceCode: unknown,
  sourceName: unknown,
  fallback: string,
  sourceKey: unknown = 'main',
) {
  const entry = findDisplayNameEntry(readDisplayNameStore(), kind, sourceId, sourceCode, sourceName, sourceKey);
  return compactNullableText(entry?.displayName) || fallback;
}

function makeEntryId(
  kind: DisplayNameKind,
  sourceId: unknown,
  sourceCode: unknown,
  sourceName: unknown,
  sourceKey: unknown = 'main',
) {
  const scopedSourceKey = normalizeDisplayNameSourceKey(sourceKey);
  const prefix = \`source:\${scopedSourceKey}:\${kind}\`;
  const id = Number(sourceId);
  if (Number.isFinite(id)) return \`\${prefix}:id:\${id}\`;
  const code = normalizeDisplayNameKey(sourceCode);
  if (code) return \`\${prefix}:code:\${code}\`;
  return \`\${prefix}:name:\${normalizeDisplayNameKey(sourceName) || crypto.randomUUID()}\`;
}`,
      'la resolución source-aware de alias',
    );

    next = replaceRequired(
      next,
      `) {
  const entry = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);
  const displayName = compactNullableText(entry?.displayName) || autoName;
  return {
    kind,`,
      `) {
  const sourceKey = normalizeDisplayNameSourceKey(meta.sourceKey);
  const entry = findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName, sourceKey);
  const displayName = compactNullableText(entry?.displayName) || autoName;
  return {
    kind,`,
      'buildDisplayNameCatalogItem source-aware',
    );

    next = replaceRequired(
      next,
      `    sourceKey: compactNullableText(meta.sourceKey) || 'main',
    sourceLabel: compactNullableText(meta.sourceLabel) || (compactNullableText(meta.sourceKey) || 'Liga GrassCutters'),`,
      `    sourceKey,
    sourceLabel: compactNullableText(meta.sourceLabel) || (sourceKey === 'gt4' ? 'Supra GT4' : 'Liga GrassCutters'),`,
      'el sourceKey del catálogo',
    );

    next = replaceRequired(
      next,
      `        const sourceName = compactNullableText(row.source_name) || sourceCode;
        pushCatalogItem('cars', buildDisplayNameCatalogItem(
          'car',
          row.source_id,
          sourceCode,
          sourceName,
          compactNullableText(row.auto_name) || autoTitleFromCode(sourceCode, 'Coche desconocido'),`,
      `        const sourceName = sourceKey === 'main'
          ? compactNullableText(row.source_name) || sourceCode
          : autoTitleFromCode(sourceCode, 'Coche desconocido');
        const autoName = sourceKey === 'main'
          ? compactNullableText(row.auto_name) || autoTitleFromCode(sourceCode, 'Coche desconocido')
          : autoTitleFromCode(sourceCode, 'Coche desconocido');
        pushCatalogItem('cars', buildDisplayNameCatalogItem(
          'car',
          row.source_id,
          sourceCode,
          sourceName,
          autoName,`,
      'el catálogo GT4 de coches',
    );

    next = replaceRequired(
      next,
      `        const sourceName = compactNullableText(row.source_name) || sourceCode;
        pushCatalogItem('tracks', buildDisplayNameCatalogItem(
          'track',
          row.source_id,
          sourceCode,
          sourceName,
          compactNullableText(row.auto_name) || autoTitleFromCode(sourceCode, 'Circuito desconocido'),`,
      `        const sourceName = sourceKey === 'main'
          ? compactNullableText(row.source_name) || sourceCode
          : autoTitleFromCode(sourceCode, 'Circuito desconocido');
        const autoName = sourceKey === 'main'
          ? compactNullableText(row.auto_name) || autoTitleFromCode(sourceCode, 'Circuito desconocido')
          : autoTitleFromCode(sourceCode, 'Circuito desconocido');
        pushCatalogItem('tracks', buildDisplayNameCatalogItem(
          'track',
          row.source_id,
          sourceCode,
          sourceName,
          autoName,`,
      'el catálogo GT4 de circuitos',
    );

    next = replaceRequired(
      next,
      `      if (sourceKey && sourceKey !== 'main') {
        const driverDisplay = applyDisplayName('driver', null, row.SteamGuid, row.DriverName, lap.driverName);
        const carDisplay = applyDisplayName('car', null, row.Car, row.UiCarName, lap.carName);
        const trackDisplay = applyDisplayName('track', null, row.Track, row.UiTrackName, lap.trackName);
        lap.driverName = driverDisplay;`,
      `      if (sourceKey && sourceKey !== 'main') {
        const driverAuto = compactNullableText(row.DriverName) || 'Piloto desconocido';
        const carAuto = autoTitleFromCode(row.Car, 'Coche desconocido');
        const trackAuto = autoTitleFromCode(row.Track, 'Circuito desconocido');
        const driverDisplay = applyDisplayName('driver', null, row.SteamGuid, driverAuto, driverAuto, sourceKey);
        const carDisplay = applyDisplayName('car', null, row.Car, carAuto, carAuto, sourceKey);
        const trackDisplay = applyDisplayName('track', null, row.Track, trackAuto, trackAuto, sourceKey);
        lap.driverName = driverDisplay;`,
      'la lectura segura de nombres GT4 en Mirror V2',
    );

    // Bulk y guardado individual: incluir sourceKey.
    next = replaceAllRequired(
      next,
      `    const notes = compactNullableText(item?.notes);

    if (!kind || !displayName) continue;`,
      `    const notes = compactNullableText(item?.notes);
    const sourceKey = normalizeDisplayNameSourceKey(item?.sourceKey);

    if (!kind || !displayName) continue;`,
      'sourceKey del guardado bulk',
      1,
    );

    next = replaceRequired(
      next,
      `  const notes = compactNullableText(req.body?.notes);

  if (!kind) {`,
      `  const notes = compactNullableText(req.body?.notes);
  const sourceKey = normalizeDisplayNameSourceKey(req.body?.sourceKey);

  if (!kind) {`,
      'sourceKey del guardado individual',
    );

    next = replaceAllRequired(
      next,
      `findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName);`,
      `findDisplayNameEntry(store, kind, sourceId, sourceCode, sourceName, sourceKey);`,
      'las búsquedas de alias al guardar',
      2,
    );

    next = replaceAllRequired(
      next,
      `      existing.sourceName = sourceName || existing.sourceName;
      existing.displayName = displayName;`,
      `      existing.sourceName = sourceName || existing.sourceName;
      existing.sourceKey = sourceKey;
      existing.displayName = displayName;`,
      'la actualización source-aware del alias',
      1,
    );

    // Completa variantes con distinta indentación en bulk/guardado individual.
    next = next.replace(
      /(existing\.sourceName\s*=\s*sourceName\s*\|\|\s*existing\.sourceName;\s*\n)(\s*)(?!existing\.sourceKey\s*=)existing\.displayName\s*=\s*displayName;/g,
      `$1$2existing.sourceKey = sourceKey;\n$2existing.displayName = displayName;`,
    );

    const updateWithoutSourceKey = /existing\.sourceName\s*=\s*sourceName\s*\|\|\s*existing\.sourceName;\s*\n\s*existing\.displayName\s*=\s*displayName;/;
    if (updateWithoutSourceKey.test(next)) {
      throw new Error('Quedó una actualización de alias sin sourceKey.');
    }

    next = replaceAllRequired(
      next,
      `        id: makeEntryId(kind, sourceId, sourceCode, sourceName),
        kind,
        sourceId,`,
      `        id: makeEntryId(kind, sourceId, sourceCode, sourceName, sourceKey),
        kind,
        sourceKey,
        sourceId,`,
      'la creación source-aware del alias',
      1,
    );

    // Completa objetos creados con distinta indentación/formato.
    next = next.replace(
      /(id:\s*makeEntryId\(kind,\s*sourceId,\s*sourceCode,\s*sourceName\),\s*\n\s*kind,\s*\n)(\s*)(?!sourceKey,)sourceId,/g,
      `$1$2sourceKey,\n$2sourceId,`,
    );
    next = next.replace(
      /makeEntryId\(kind,\s*sourceId,\s*sourceCode,\s*sourceName\)/g,
      'makeEntryId(kind, sourceId, sourceCode, sourceName, sourceKey)',
    );

    const createWithoutSourceKey = /id:\s*makeEntryId\(kind,\s*sourceId,\s*sourceCode,\s*sourceName(?:,\s*sourceKey)?\),\s*\n\s*kind,\s*\n\s*sourceId,/;
    if (createWithoutSourceKey.test(next)) {
      throw new Error('Quedó una creación de alias sin sourceKey.');
    }

    next = replaceRequired(
      next,
      `    entry: findDisplayNameEntry(await readDisplayNameStoreAsync(true), kind, sourceId, sourceCode, sourceName),`,
      `    entry: findDisplayNameEntry(await readDisplayNameStoreAsync(true), kind, sourceId, sourceCode, sourceName, sourceKey),`,
      'la respuesta del guardado individual',
    );

    next = replaceRequired(
      next,
      `  const sourceName = compactNullableText(req.body?.sourceName);

  const store = await readDisplayNameStoreAsync(true);`,
      `  const sourceName = compactNullableText(req.body?.sourceName);
  const sourceKey = normalizeDisplayNameSourceKey(req.body?.sourceKey);

  const store = await readDisplayNameStoreAsync(true);`,
      'sourceKey del borrado',
    );

    next = replaceRequired(
      next,
      `    if (kind && findDisplayNameEntry({ ...store, entries: [entry] }, kind, sourceId, sourceCode, sourceName)) return false;`,
      `    if (kind && findDisplayNameEntry({ ...store, entries: [entry] }, kind, sourceId, sourceCode, sourceName, sourceKey)) return false;`,
      'el borrado source-aware',
    );

    next = replaceRequired(
      next,
      `{ kind, entryId, sourceId, sourceCode, sourceName }, { removed: before - store.entries.length }`,
      `{ kind, entryId, sourceKey, sourceId, sourceCode, sourceName }, { removed: before - store.entries.length }`,
      'la auditoría source-aware del borrado',
    );

    writePreservingEol(files.server, original, next);
  } else {
    console.log('[GC GT4 names] Backend ya corregido.');
  }
}

// Admin nombres: enviar sourceKey y hacer funcionar "Usar auto".
{
  const original = fs.readFileSync(target(files.admin), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes('id="manualNameForm"')
      || !next.includes('data-name-action="auto"')
      || !next.includes("fetchJson('/api/admin/name-filters/bulk'")) {
      throw new Error('src/pages/admin/nombres.astro no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      `        <form class="gc-form gc-admin-inline-form" id="manualNameForm">
          <div class="gc-form-grid">
            <label class="gc-field"><span>Tipo</span>`,
      `        <!-- ${marker} -->
        <form class="gc-form gc-admin-inline-form" id="manualNameForm">
          <div class="gc-form-grid">
            <label class="gc-field"><span>Servidor</span><select class="gc-select" name="sourceKey"><option value="main">Liga GrassCutters</option><option value="gt4">Supra GT4</option></select></label>
            <label class="gc-field"><span>Tipo</span>`,
      'el selector de fuente manual',
    );

    next = replaceRequired(
      next,
      `data-kind="\${esc(i.kind)}" data-source-id="\${esc(i.sourceId??'')}"`,
      `data-kind="\${esc(i.kind)}" data-source-key="\${esc(i.sourceKey||'main')}" data-source-id="\${esc(i.sourceId??'')}"`,
      'data-source-key en las filas',
    );

    next = replaceRequired(
      next,
      `return { kind:row.dataset.kind, sourceId:row.dataset.sourceId?Number(row.dataset.sourceId):null, sourceCode:row.dataset.sourceCode||null, sourceName:row.dataset.sourceName||null, displayName:next };`,
      `return { kind:row.dataset.kind, sourceKey:row.dataset.sourceKey||'main', sourceId:row.dataset.sourceId?Number(row.dataset.sourceId):null, sourceCode:row.dataset.sourceCode||null, sourceName:row.dataset.sourceName||null, displayName:next };`,
      'sourceKey en collect',
    );

    next = replaceRequired(
      next,
      `const item={kind:data.kind,sourceCode:String(data.sourceCode||'').trim()||null,sourceName:String(data.sourceName||'').trim()||null,displayName:String(data.displayName||'').trim()};`,
      `const item={kind:data.kind,sourceKey:String(data.sourceKey||'main').trim()||'main',sourceCode:String(data.sourceCode||'').trim()||null,sourceName:String(data.sourceName||'').trim()||null,displayName:String(data.displayName||'').trim()};`,
      'sourceKey del alias manual',
    );

    next = replaceRequired(
      next,
      `      els.table.addEventListener('click',(ev)=>{ const btn=ev.target.closest('button[data-name-action]'); if(!btn)return; const row=btn.closest('tr[data-kind]'); if(!row)return; if(btn.dataset.nameAction==='auto'){ const input=row.querySelector('[data-name-input]'); input.value=''; } save(collect([row])).catch((e)=>els.msg.textContent=e.message||'No se pudo guardar.'); });`,
      `      els.table.addEventListener('click',async(ev)=>{ const btn=ev.target.closest('button[data-name-action]'); if(!btn)return; const row=btn.closest('tr[data-kind]'); if(!row)return; if(btn.dataset.nameAction==='auto'){ const identity={kind:row.dataset.kind,sourceKey:row.dataset.sourceKey||'main',sourceId:row.dataset.sourceId?Number(row.dataset.sourceId):null,sourceCode:row.dataset.sourceCode||null,sourceName:row.dataset.sourceName||null}; try{els.msg.textContent='Restaurando nombre automático...';await fetchJson('/api/admin/name-filters/delete',{method:'POST',body:JSON.stringify(identity)});await load();els.msg.textContent='Override eliminado. Se usa el nombre automático de este servidor.';els.msg.style.color='var(--accent)';}catch(e){els.msg.textContent=e.message||'No se pudo restaurar el nombre automático.';}return;} save(collect([row])).catch((e)=>els.msg.textContent=e.message||'No se pudo guardar.'); });`,
      'la acción real Usar auto',
    );

    writePreservingEol(files.admin, original, next);
  } else {
    console.log('[GC GT4 names] Panel admin ya corregido.');
  }
}

console.log('');
console.log('[GC GT4 names] Alias separados por servidor y Hotlaps GT4 reparado.');
console.log(`[GC GT4 names] Backup: ${backupDir}`);
console.log(`[GC GT4 names] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('Los alias antiguos sin fuente se conservan como Liga GrassCutters.');
console.log('GT4 vuelve a usar código técnico distinto por coche/circuito hasta que se asigne su alias propio.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
