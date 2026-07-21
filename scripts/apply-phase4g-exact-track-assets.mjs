import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4G_EXACT_TRACK_ASSET_RESOLVER_V1';
const phase4fMarker = 'GC_PHASE4F_STRICT_EVENT_SOURCE_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4g-exact-track-assets-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4g-exact-track-assets-payload');
const changed = [];

const target = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
};
const readPayload = (name) => {
  const filePath = path.join(payloadDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Falta payload ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8').trimEnd();
};
const backup = (relativePath) => {
  const source = target(relativePath);
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};
const save = (relativePath, original, next) => {
  if (next === original) return;
  backup(relativePath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
};
const replaceRequired = (text, from, to, label) => {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
};
const insertBeforeRequired = (text, anchor, block, label) => {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
};

const markerFiles = [
  'src/server/gc-track-assets-resolver.ts',
  'src/server/gc-track-assets-delivery.ts',
  'src/server/acsm-championship-routes.ts',
  'src/pages/index.astro',
  'src/pages/campeonato.astro',
  'src/pages/campeonato/ronda/[eventId].astro'
];
const alreadyApplied = markerFiles.every((relativePath) =>
  fs.existsSync(target(relativePath)) && fs.readFileSync(target(relativePath), 'utf8').includes(marker)
);
if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4G] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}
if (!read('src/server/gc-ratings/ratingService.ts').includes(phase4fMarker)) {
  throw new Error('Phase 4F no está aplicada. Se requiere source=weekly/gt4 estricto.');
}

const exactHelper = readPayload('resolver-exact-helper.ts.txt');

// 1. Resolver central.
{
  const relativePath = 'src/server/gc-track-assets-resolver.ts';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    let next = replaceRequired(
      original,
      `type AssetRole = 'photo' | 'map' | 'unknown';`,
      `export type AssetRole = 'photo' | 'map' | 'unknown';`,
      'el tipo AssetRole'
    );
    next = replaceRequired(
      next,
      `  matchedPhoto: string;\n  matchedMap: string;\n};`,
      `  matchedPhoto: string;\n  matchedMap: string;\n  matchMode?: 'legacy' | 'exact';\n  strict?: boolean;\n  sourceKey?: string;\n  trackCode?: string;\n  trackConfig?: string;\n  requestedRole?: AssetRole;\n  matchedKey?: string;\n  roleResolved?: boolean;\n};`,
      'la interfaz GcTrackAssetResolution'
    );
    next = insertBeforeRequired(
      next,
      `export function resolveGcTrackAssets(input: unknown, options: { rootDir?: string; force?: boolean } = {}): GcTrackAssetResolution {`,
      exactHelper,
      'resolveGcTrackAssets'
    );

    const oldRoute = `export function registerGcTrackAssetsResolverRoutes(app: express.Express, options: { rootDir?: string } = {}) {\n  app.get('/api/gc/track-assets/resolve', (req, res) => {\n    const values = [\n      req.query.track,\n      req.query.trackRaw,\n      req.query.name,\n      req.query.event,\n      req.query.hint\n    ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);\n\n    const force = String(req.query.refresh || '') === '1';\n    const resolved = resolveGcTrackAssets(values, {\n      rootDir: options.rootDir,\n      force\n    });\n\n    res.setHeader('Cache-Control', 'no-store');`;

    const newRoute = `export function registerGcTrackAssetsResolverRoutes(app: express.Express, options: { rootDir?: string } = {}) {\n  app.get('/api/gc/track-assets/resolve', (req, res) => {\n    const values = [\n      req.query.track,\n      req.query.trackRaw,\n      req.query.name,\n      req.query.event,\n      req.query.hint\n    ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);\n\n    const force = String(req.query.refresh || '') === '1';\n    const strict = String(req.query.strict || '') === '1' || String(req.query.mode || '').toLowerCase() === 'exact';\n    const roleRaw = String(req.query.role || req.query.kind || '').toLowerCase();\n    const requestedRole = roleRaw === 'map' ? 'map' : roleRaw === 'photo' ? 'photo' : 'unknown';\n    const resolved = strict\n      ? resolveGcTrackAssetsExact({\n          sourceKey: req.query.source || req.query.sourceKey || '',\n          trackCode: req.query.trackCode || req.query.trackRaw || req.query.track || '',\n          trackConfig: req.query.trackConfig || req.query.layout || req.query.config || '',\n          names: values,\n          role: requestedRole\n        }, { rootDir: options.rootDir, force })\n      : resolveGcTrackAssets(values, { rootDir: options.rootDir, force });\n\n    res.setHeader('Cache-Control', 'no-store');\n    res.setHeader('X-GC-Track-Asset-Mode', strict ? 'exact-v1' : 'legacy');`;

    next = replaceRequired(next, oldRoute, newRoute, 'la ruta del resolver');
    save(relativePath, original, next);
  }
}

// 2. Entrega física exacta.
{
  const relativePath = 'src/server/gc-track-assets-delivery.ts';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    let next = replaceRequired(
      original,
      `import { resolveGcTrackAssets } from './gc-track-assets-resolver';`,
      `import { resolveGcTrackAssets, resolveGcTrackAssetsExact } from './gc-track-assets-resolver';`,
      'el import del resolver de entrega'
    );
    next = replaceRequired(
      next,
      `    const force = String(req.query.refresh || '') === '1';\n    const resolved = resolveGcTrackAssets(values, { rootDir, force });\n    const publicUrl = kind === 'map' ? resolved.map : resolved.photo;`,
      `    const force = String(req.query.refresh || '') === '1';\n    const strict = String(req.query.strict || '') === '1' || String(req.query.mode || '').toLowerCase() === 'exact';\n    const resolved = strict\n      ? resolveGcTrackAssetsExact({\n          sourceKey: req.query.source || req.query.sourceKey || '',\n          trackCode: req.query.trackCode || req.query.trackRaw || req.query.track || '',\n          trackConfig: req.query.trackConfig || req.query.layout || req.query.config || '',\n          names: values,\n          role: kind\n        }, { rootDir, force })\n      : resolveGcTrackAssets(values, { rootDir, force });\n    const publicUrl = kind === 'map' ? resolved.map : resolved.photo;`,
      'la resolución de entrega'
    );
    next = replaceRequired(
      next,
      `    res.setHeader('X-GC-Track-Asset-Resolver', 'online-delivery-v1');`,
      `    // ${marker}\n    res.setHeader('X-GC-Track-Asset-Resolver', strict ? 'exact-delivery-v1' : 'online-delivery-v1');\n    res.setHeader('X-GC-Track-Asset-Mode', strict ? 'exact-v1' : 'legacy');`,
      'la cabecera del resolver de entrega'
    );
    save(relativePath, original, next);
  }
}

// 3. ACSM publica códigos y assets exactos.
{
  const relativePath = 'src/server/acsm-championship-routes.ts';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    let next = replaceRequired(
      original,
      `import { gcTrackMapCandidates, gcTrackPhotoCandidates, resolveGcTrackAssets } from './gc-track-assets-resolver';`,
      `import { gcTrackMapCandidatesExact, gcTrackPhotoCandidatesExact, resolveGcTrackAssetsExact } from './gc-track-assets-resolver';`,
      'el import de assets ACSM'
    );
    next = replaceRequired(
      next,
      `function trackMapCandidates(trackName: unknown, trackRaw?: unknown, eventName?: unknown) {\n  return gcTrackMapCandidates(trackName, trackRaw, eventName);\n}\n\nfunction trackPhotoCandidates(trackName: unknown, trackRaw?: unknown, eventName?: unknown) {\n  return gcTrackPhotoCandidates(trackName, trackRaw, eventName);\n}`,
      `function trackMapCandidates(sourceKey: unknown, trackCode: unknown, trackConfig: unknown, trackName: unknown, eventName?: unknown) {\n  return gcTrackMapCandidatesExact({ sourceKey, trackCode, trackConfig, names: [trackName, eventName] });\n}\n\nfunction trackPhotoCandidates(sourceKey: unknown, trackCode: unknown, trackConfig: unknown, trackName: unknown, eventName?: unknown) {\n  return gcTrackPhotoCandidatesExact({ sourceKey, trackCode, trackConfig, names: [trackName, eventName] });\n}`,
      'los helpers de candidatos ACSM'
    );
    next = replaceRequired(
      next,
      `  const trackRaw = chooseAcsmTrackCandidate(event, raceSetup, source) || 'Circuito por confirmar';\n  const track = displayTrackName(trackRaw, 'Circuito por confirmar');\n  const cars = extractCarsFromRaceSetup(raceSetup);`,
      `  const trackRaw = chooseAcsmTrackCandidate(event, raceSetup, source) || 'Circuito por confirmar';\n  const trackCode = textValue(trackRaw, '');\n  const trackConfig = textValue(pick(raceSetup, ['TrackConfig', 'trackConfig', 'TrackLayout', 'trackLayout', 'Layout', 'layout', 'Config', 'config'], ''));\n  const track = displayTrackName(trackRaw, 'Circuito por confirmar');\n  const cars = extractCarsFromRaceSetup(raceSetup);`,
      'trackCode y trackConfig ACSM'
    );
    next = replaceRequired(
      next,
      `  const trackAssets = resolveGcTrackAssets([track, trackRaw, pick(event, ['Name', 'name', 'Title', 'title'], '')]);`,
      `  const eventName = pick(event, ['Name', 'name', 'Title', 'title'], '');\n  const trackAssets = resolveGcTrackAssetsExact({ sourceKey: source, trackCode, trackConfig, names: [track, eventName] });`,
      'la resolución exacta ACSM'
    );
    next = replaceRequired(
      next,
      `    track,\n    trackRaw: textValue(trackRaw, ''),\n    trackSlug: normalizeTrackSlug(trackRaw),\n    trackAssets,\n    trackMapCandidates: trackMapCandidates(track, trackRaw, pick(event, ['Name', 'name', 'Title', 'title'], '')),\n    trackPhotoCandidates: trackPhotoCandidates(track, trackRaw, pick(event, ['Name', 'name', 'Title', 'title'], '')),`,
      `    // ${marker}\n    track,\n    trackCode,\n    trackRaw: textValue(trackRaw, ''),\n    trackConfig,\n    trackSlug: normalizeTrackSlug(trackRaw),\n    trackAssets,\n    trackMapCandidates: trackMapCandidates(source, trackCode, trackConfig, track, eventName),\n    trackPhotoCandidates: trackPhotoCandidates(source, trackCode, trackConfig, track, eventName),`,
      'los campos exactos del evento ACSM'
    );
    save(relativePath, original, next);
  }
}

// 4. Portada usa una única URL exacta del servidor.
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    const oldFunction = `      const trackImageCandidatesFromCombo = (combo: any): string[] => {\n        const image: any = combo?.trackImage || combo?.track?.image || {};\n        const candidates: string[] = [];\n        if (image.primary) candidates.push(image.primary);\n        if (Array.isArray(image.candidates)) candidates.push(...image.candidates);\n        const aliases = Array.isArray(image.aliases) && image.aliases.length\n          ? image.aliases\n          : trackImageAliasVariants([\n              first(combo, ['track.familyKey', 'track.code', 'track.name', 'track.displayName', 'track.rawName'], ''),\n              first(combo, ['track.rawCode'], ''),\n              first(combo, ['track.rawName'], ''),\n              first(combo, ['track.publicName'], '')\n            ]);\n        const exts = ['webp', 'jpg', 'png', 'jpeg', 'avif'];\n        aliases.forEach((alias: string) => exts.forEach((ext: string) => candidates.push(\`/images/tracks/\${encodeURIComponent(alias)}.\${ext}\`)));\n        const key = normalize(first(combo, ['track.familyKey', 'track.code', 'track.name', 'track.displayName'], ''));\n        if (/pascani|motorpark|a1/.test(key)) candidates.push('/images/tracks/pascani.jpg?v=bootstrap2', '/images/tracks/a1.webp?v=bootstrap2');\n        if (/vila|vilareal|vila_real/.test(key)) candidates.push('/images/tracks/vilareal.jpg?v=bootstrap2');\n        return [...new Set(candidates.filter(Boolean))];\n      };`;
    const newFunction = `      // ${marker}\n      const trackImageCandidatesFromCombo = (combo: any): string[] => {\n        const sourceRaw = normalize(first(combo, ['sourceKey', 'source'], 'main'));\n        const source = sourceRaw === 'gt4' ? 'gt4' : 'weekly';\n        const trackCode = String(first(combo, ['track.trackCode', 'track.rawCode', 'track.code', 'trackCode', 'trackRaw'], '') || '').trim();\n        const trackConfig = String(first(combo, ['track.trackConfig', 'track.layout', 'trackConfig', 'layout'], '') || '').trim();\n        const trackNameValue = String(first(combo, ['track.publicName', 'track.displayName', 'track.name', 'trackName'], '') || '').trim();\n        if (!trackCode && !trackNameValue) return [];\n        const params = new URLSearchParams();\n        params.set('kind', 'photo');\n        params.set('strict', '1');\n        params.set('source', source);\n        if (trackCode) params.set('trackCode', trackCode);\n        if (trackConfig) params.set('trackConfig', trackConfig);\n        if (trackNameValue) params.set('name', trackNameValue);\n        return [\`/api/gc/track-assets/file?\${params.toString()}\`];\n      };`;
    let next = replaceRequired(original, oldFunction, newFunction, 'trackImageCandidatesFromCombo');
    next = next.replace(
      `document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-v1';`,
      `document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-v1';\n      document.documentElement.dataset.gcTrackAssetResolver = 'exact-v1';`
    );
    save(relativePath, original, next);
  }
}

// 5. Campeonato evita el registro difuso para eventos oficiales.
{
  const relativePath = 'src/pages/campeonato.astro';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    let next = replaceRequired(
      original,
      `      const eventImageHtml = (event: any): string => {\n        const candidates = event?.trackPhotoCandidates?.length ? event.trackPhotoCandidates : localTrackPhotoCandidates(event);`,
      `      // ${marker}\n      const eventImageHtml = (event: any): string => {\n        const exactCandidates = Array.isArray(event?.trackPhotoCandidates) ? event.trackPhotoCandidates.filter(Boolean) : [];\n        const officialSource = Boolean(event?.sourceKey || event?.championshipSource);\n        const candidates = exactCandidates.length ? exactCandidates : (officialSource ? [] : localTrackPhotoCandidates(event));`,
      'eventImageHtml'
    );
    next = replaceRequired(
      next,
      `      const renderTrackImage = (event: any) => {\n        const candidates = event?.trackMapCandidates?.length ? event.trackMapCandidates : localTrackMapCandidates(event);`,
      `      const renderTrackImage = (event: any) => {\n        const exactCandidates = Array.isArray(event?.trackMapCandidates) ? event.trackMapCandidates.filter(Boolean) : [];\n        const officialSource = Boolean(event?.sourceKey || event?.championshipSource);\n        const candidates = exactCandidates.length ? exactCandidates : (officialSource ? [] : localTrackMapCandidates(event));`,
      'renderTrackImage'
    );
    save(relativePath, original, next);
  }
}

// 6. Detalle de ronda consulta el resolver en modo exacto.
{
  const relativePath = 'src/pages/campeonato/ronda/[eventId].astro';
  const original = read(relativePath);
  if (!original.includes(marker)) {
    const oldResolver = `      // GC_ROUND_TRACK_ASSET_RESOLVER_V139\n      const uniqueTrackAssetValuesV139 = (values) => [...new Set(values.flat(Infinity).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];\n\n      const resolveRoundTrackAssetsV139 = async (event) => {\n        const names = uniqueTrackAssetValuesV139([\n          event?.track,\n          event?.trackRaw,\n          event?.trackSlug,\n          event?.name\n        ]);\n        if (!names.length) return null;\n        try {\n          const params = new URLSearchParams();\n          params.set('track', names[0]);\n          if (names.length > 1) params.set('hint', names.slice(1).join(' | '));\n          const response = await fetch(\`/api/gc/track-assets/resolve?\${params.toString()}\`, { cache: 'no-store' });\n          if (!response.ok) return null;\n          return await response.json();\n        } catch (_) {\n          return null;\n        }\n      };`;
    const newResolver = `      // GC_ROUND_TRACK_ASSET_RESOLVER_V139\n      // ${marker}\n      const uniqueTrackAssetValuesV139 = (values) => [...new Set(values.flat(Infinity).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];\n\n      const resolveRoundTrackAssetsV139 = async (event) => {\n        const names = uniqueTrackAssetValuesV139([event?.track, event?.name]);\n        const trackCode = String(event?.trackCode || event?.trackRaw || event?.trackSlug || '').trim();\n        const trackConfig = String(event?.trackConfig || event?.layout || '').trim();\n        const source = String(event?.sourceKey || event?.championshipSource || '').trim();\n        if (!trackCode && !names.length) return null;\n        try {\n          const params = new URLSearchParams();\n          params.set('strict', '1');\n          params.set('mode', 'exact');\n          if (source) params.set('source', source);\n          if (trackCode) params.set('trackCode', trackCode);\n          if (trackConfig) params.set('trackConfig', trackConfig);\n          if (names[0]) params.set('name', names[0]);\n          if (names.length > 1) params.set('event', names.slice(1).join(' | '));\n          const response = await fetch(\`/api/gc/track-assets/resolve?\${params.toString()}\`, { cache: 'no-store' });\n          if (!response.ok) return null;\n          const payload = await response.json();\n          return payload?.matchMode === 'exact' ? payload : null;\n        } catch (_) {\n          return null;\n        }\n      };`;
    let next = replaceRequired(original, oldResolver, newResolver, 'resolveRoundTrackAssetsV139');
    next = next.replace(
      `canonicalizeRoundSourceV1(data.eventSource || sourceRequest.source);`,
      `canonicalizeRoundSourceV1(data.eventSource || sourceRequest.source);\n          document.documentElement.dataset.gcTrackAssetResolver = 'exact-v1';`
    );
    save(relativePath, original, next);
  }
}

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4G] Resolver exacto de imágenes instalado.');
console.log(`[GC Phase 4G] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4G] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('No se modifican imágenes ni se inventan asociaciones.');
console.log('Sin coincidencia exacta se usa el fallback visual genérico.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
