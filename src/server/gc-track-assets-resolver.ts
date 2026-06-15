import fs from 'node:fs';
import path from 'node:path';
import type express from 'express';

export type GcTrackAssetResolution = {
  ok: true;
  track: string;
  displayName: string;
  queryTokens: string[];
  photo: string;
  map: string;
  distanceKm: number | null;
  distance: string;
  countryCode: string;
  confidence: number;
  source: string;
  matchedPhoto: string;
  matchedMap: string;
};

type AssetRole = 'photo' | 'map' | 'unknown';

type ScannedAsset = {
  filePath: string;
  url: string;
  filename: string;
  base: string;
  stem: string;
  role: AssetRole;
  tokens: string[];
  score?: number;
};

type TrackAssetMetadata = {
  keys?: string[];
  key?: string;
  slug?: string;
  name?: string;
  track?: string;
  photo?: string;
  image?: string;
  imageUrl?: string;
  map?: string;
  mapUrl?: string;
  countryCode?: string;
  country?: string;
  distanceKm?: number | string;
  distance?: number | string;
};

type CacheEntry = {
  at: number;
  assets: ScannedAsset[];
  metadata: TrackAssetMetadata[];
};

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.avif', '.svg']);
const CACHE_MS = 30_000;
let cache: CacheEntry | null = null;

const ASSET_DIRS = [
  'images/tracks',
  'imagenes/tracks',
  'images/circuits',
  'imagenes/circuits',
  'imagenes/circuitos',
  'images/track-maps',
  'imagenes/track-maps',
  'images/maps',
  'imagenes/maps',
  'ui/maps',
  'ui/home2/maps'
];

const MAP_SUFFIX_RE = /(?:^|[_-])(map|mapa|outline|layout|track|circuit|trazado|plano)$/i;
const MAP_PREFIX_RE = /^(map|mapa|outline|layout|track|circuit|trazado|plano)[_-]/i;
const PHOTO_SUFFIX_RE = /(?:^|[_-])(photo|foto|hero|image|img|cover|background|bg)$/i;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'layout', 'layouts', 'version', 'online', 'server', 'combo', 'race', 'racing',
  'track', 'circuit', 'circuits', 'autodromo', 'autodrome', 'international', 'internazionale', 'speedway',
  'gp', 'gpx', 'full', 'short', 'long', 'club', 'national', 'internacional', 'oficial', 'official',
  'elms', 'gtm', 'rss', 'ac', 'acsm', 'gc', 'simracing', 'portugal', 'spain', 'espana', 'espanya',
  'italy', 'italia', 'france', 'francia', 'germany', 'alemania', 'belgium', 'belgica', 'japan', 'japon',
  'uk', 'gb', 'usa', 'australia', 'evo', 'late', 'plus'
]);

const COUNTRY_BY_TOKEN: Record<string, string> = {
  portimao: 'PT', algarve: 'PT', estoril: 'PT',
  jerez: 'ES', jarama: 'ES', montmelo: 'ES', catalunya: 'ES', barcelona: 'ES', motorland: 'ES', aragon: 'ES',
  magione: 'IT', mugello: 'IT', monza: 'IT', imola: 'IT', vallelunga: 'IT', misano: 'IT',
  spa: 'BE', francorchamps: 'BE', zolder: 'BE',
  fuji: 'JP', suzuka: 'JP', okayama: 'JP', motegi: 'JP',
  hockenheim: 'DE', nurburgring: 'DE', nordschleife: 'DE', oschersleben: 'DE',
  silverstone: 'GB', brands: 'GB', hatch: 'GB', donington: 'GB',
  sebring: 'US', atlanta: 'US', daytona: 'US', laguna: 'US', watkins: 'US',
  bathurst: 'AU', panorama: 'AU', phillip: 'AU', island: 'AU',
  salzburgring: 'AT', salzburg: 'AT', spielberg: 'AT',
  zolder_be: 'BE'
};

function normalizeSlash(value: string) {
  return String(value || '').replace(/\\/g, '/');
}

export function gcTrackAssetSlug(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stripKnownNoise(slug: string) {
  return gcTrackAssetSlug(slug)
    .replace(/^(ks|rt|mx|nrms|fn|acu|actk|aa|ai|gc|rss|jgtc|acfsk|pk|vhe|ve)_+/g, '')
    .replace(/_+(19|20)\d{2}(_|$)/g, '_')
    .replace(/_+v\d+(_|$)/g, '_')
    .replace(/_+(layout|layouts|online|server|version|reboot|final|update|extension|ext|season|elms|gp|full|national|international|internazionale|club|short|long)(_|$)/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stripRole(base: string) {
  let out = stripKnownNoise(base);
  out = out
    .replace(MAP_PREFIX_RE, '')
    .replace(MAP_SUFFIX_RE, '')
    .replace(PHOTO_SUFFIX_RE, '')
    .replace(/^_+|_+$/g, '');
  return stripKnownNoise(out);
}

function tokensFrom(value: unknown) {
  const slug = stripKnownNoise(String(value ?? ''));
  return [...new Set(slug.split('_')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !STOPWORDS.has(token))
  )];
}

function tokensForQuery(values: unknown[]) {
  const tokens = values.flatMap((value) => tokensFrom(value));
  const compactValues = values
    .map((value) => stripKnownNoise(String(value ?? '')))
    .filter(Boolean);

  compactValues.forEach((value) => {
    if (value && !/^\d+$/.test(value) && value.length >= 3 && !STOPWORDS.has(value)) tokens.push(value);
  });

  return [...new Set(tokens)];
}

function roleFromBase(base: string): AssetRole {
  if (MAP_PREFIX_RE.test(base) || MAP_SUFFIX_RE.test(base)) return 'map';
  if (PHOTO_SUFFIX_RE.test(base)) return 'photo';
  return 'photo';
}

function getPublicRoots(rootDir: string) {
  // GC_TRACK_ASSETS_RESOLVER_V140_ROOTS
  // Hostinger puede arrancar la app desde la raíz del proyecto o directamente desde dist/.
  // En el segundo caso los assets de public quedan copiados como /images/... dentro del propio rootDir,
  // no en rootDir/public. Por eso el rootDir debe ser una raíz escaneable más.
  const candidates = [
    rootDir,
    path.join(rootDir, 'client'),
    path.join(rootDir, 'public'),
    path.join(rootDir, 'dist'),
    path.join(rootDir, 'dist', 'client'),
    path.join(rootDir, '..'),
    path.join(rootDir, '..', 'public'),
    path.join(rootDir, '..', 'dist'),
    path.join(rootDir, '..', 'dist', 'client')
  ].map((dir) => path.resolve(dir));

  return candidates.filter((dir, index, arr) => dir && arr.indexOf(dir) === index);
}

function walkImages(dir: string, depth = 0): string[] {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkImages(full, depth + 1));
      continue;
    }
    if (!entry.isFile()) continue;
    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }

  return out;
}

function urlForFile(root: string, filePath: string) {
  const rel = normalizeSlash(path.relative(root, filePath));
  if (!rel || rel.startsWith('..')) return '';
  return '/' + rel.replace(/^\/+/, '');
}

function readMetadataFile(filePath: string): TrackAssetMetadata[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object');
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.tracks)) return parsed.tracks.filter((item: unknown) => item && typeof item === 'object');
      return Object.entries(parsed).map(([key, value]) => ({ key, ...(value && typeof value === 'object' ? value as object : {}) }));
    }
  } catch (error) {
    console.warn('[GC TrackAssets] track-assets.json no valido:', filePath, error);
  }
  return [];
}

function scan(rootDirRaw?: string, force = false): CacheEntry {
  const rootDir = rootDirRaw ? path.resolve(rootDirRaw) : process.cwd();
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) return cache;

  const assets = new Map<string, ScannedAsset>();
  const metadata: TrackAssetMetadata[] = [];

  for (const root of getPublicRoots(rootDir)) {
    for (const relDir of ASSET_DIRS) {
      const dir = path.join(root, relDir);
      const files = walkImages(dir);
      for (const filePath of files) {
        const url = urlForFile(root, filePath);
        if (!url || assets.has(url)) continue;
        const filename = path.basename(filePath);
        const base = gcTrackAssetSlug(filename.replace(/\.(avif|webp|jpe?g|png|svg)$/i, ''));
        const stem = stripRole(base);
        assets.set(url, {
          filePath,
          url,
          filename,
          base,
          stem,
          role: roleFromBase(base),
          tokens: tokensFrom(stem || base)
        });
      }

      metadata.push(...readMetadataFile(path.join(dir, 'track-assets.json')));
      metadata.push(...readMetadataFile(path.join(dir, 'tracks.json')));
    }
  }

  cache = { at: now, assets: Array.from(assets.values()), metadata };
  return cache;
}

function metadataKeys(item: TrackAssetMetadata) {
  const keys = [item.key, item.slug, item.name, item.track, ...(Array.isArray(item.keys) ? item.keys : [])]
    .filter(Boolean)
    .map((value) => String(value));
  return tokensForQuery(keys);
}

function metadataMatch(item: TrackAssetMetadata, queryTokens: string[]) {
  const keys = metadataKeys(item);
  if (!keys.length || !queryTokens.length) return 0;
  let score = 0;
  for (const token of queryTokens) {
    if (keys.includes(token)) score += 60;
    else if (keys.some((key) => key.includes(token) || token.includes(key))) score += 22;
  }
  return score;
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).replace(',', '.').replace(/[^0-9.]+/g, '');
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num > 1000 ? num / 1000 : num;
}

function formatDistanceKm(value: unknown) {
  const km = numberOrNull(value);
  if (!km) return '';
  return `${km.toFixed(km < 10 ? 3 : 1).replace(/\.?0+$/, '')} km`;
}


const DISPLAY_STOP_AT = new Set([
  'layout', 'layouts', 'elms', 'gtm', 'rss', 'acsm', 'combo', 'server', 'online', 'season',
  'version', 'reboot', 'final', 'update', 'extension', 'ext', 'race', 'racing', 'trackday',
  'gp', 'gpx', 'full', 'national', 'international', 'internazionale', 'club', 'short', 'long',
  'gt3', 'gt4', 'gt2', 'dtm', 'btcc', 'bayer', 'lanz', 'lancer', 'mercer', 'mercedes',
  'porsche', 'protech', 'aero', 'evo', 'late', 'plus', 's15', 'brz', 'impreza'
]);

const DISPLAY_DROP_ANYWHERE = new Set([
  'portugal', 'spain', 'espana', 'espanya', 'italy', 'italia', 'france', 'francia', 'germany',
  'alemania', 'belgium', 'belgica', 'japan', 'japon', 'uk', 'gb', 'usa', 'australia', 'austria'
]);

function prettyTrackWord(word: string) {
  const raw = String(word || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (['gp', 'usa', 'uk', 'gt', 'dtm', 'btcc'].includes(lower)) return lower.toUpperCase();
  if (lower === 'nurburgring') return 'Nurburgring';
  if (lower === 'nordschleife') return 'Nordschleife';
  if (lower === 'portimao') return 'Portimao';
  if (lower === 'fuji') return 'Fuji';
  if (lower === 'jerez') return 'Jerez';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function displayNameFromAssetUrl(url: string) {
  const filename = path.basename(String(url || '')).replace(/\.(avif|webp|jpe?g|png|svg)$/i, '');
  const stem = stripRole(filename);
  const tokens = tokensFrom(stem);
  if (!tokens.length) return '';
  return tokens.map(prettyTrackWord).filter(Boolean).join(' ');
}

function cleanTrackDisplayName(names: string[], resolvedPhoto = '', resolvedMap = '') {
  const source = names.find(Boolean) || '';
  const rawWords = String(source)
    .replace(/\.(kn5|ini|json|txt)$/ig, ' ')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const kept: string[] = [];
  for (const word of rawWords) {
    const slug = gcTrackAssetSlug(word);
    if (!slug || /^\d+$/.test(slug)) break;
    if (/^(19|20)\d{2}$/.test(slug)) break;
    if (DISPLAY_STOP_AT.has(slug)) break;
    if (DISPLAY_DROP_ANYWHERE.has(slug)) continue;
    kept.push(word);
  }

  const display = kept.map(prettyTrackWord).filter(Boolean).join(' ').trim();
  if (display) return display;

  return displayNameFromAssetUrl(resolvedPhoto) || displayNameFromAssetUrl(resolvedMap) || source;
}

function inferCountry(queryTokens: string[], metadata?: TrackAssetMetadata | null) {
  const direct = String(metadata?.countryCode || metadata?.country || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;
  for (const token of queryTokens) {
    if (COUNTRY_BY_TOKEN[token]) return COUNTRY_BY_TOKEN[token];
  }
  return '';
}

function scoreAsset(asset: ScannedAsset, queryTokens: string[], desiredRole: AssetRole) {
  if (!queryTokens.length) return 0;
  let score = 0;

  if (desiredRole === 'map' && asset.role !== 'map') score -= 90;
  if (desiredRole === 'photo' && asset.role === 'map') score -= 120;
  if (desiredRole === asset.role) score += 80;

  for (const token of queryTokens) {
    if (!token) continue;
    if (asset.stem === token || asset.base === token) score += 320;
    if (asset.tokens.includes(token)) score += 120;
    if (asset.stem.includes(token) || token.includes(asset.stem)) score += Math.min(80, token.length * 6);
    if (asset.base.includes(token) || token.includes(asset.base)) score += Math.min(70, token.length * 5);
    if (asset.tokens.some((part) => part.includes(token) || token.includes(part))) score += 40;
  }

  if (/fallback|pending|placeholder|default/.test(asset.base)) score -= 500;
  if (desiredRole === 'map' && /(?:^|[_-])map(?:a)?(?:[_-]|$)/i.test(asset.base)) score += 160;
  if (desiredRole === 'photo' && asset.role === 'photo' && !MAP_SUFFIX_RE.test(asset.base) && !MAP_PREFIX_RE.test(asset.base)) score += 50;

  return score;
}

function bestAsset(assets: ScannedAsset[], queryTokens: string[], desiredRole: AssetRole) {
  const ranked = assets
    .map((asset) => ({ ...asset, score: scoreAsset(asset, queryTokens, desiredRole) }))
    .filter((asset) => Number(asset.score || 0) > 0)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return ranked[0] || null;
}

function urlsFromMetadata(meta: TrackAssetMetadata | null | undefined) {
  if (!meta) return { photo: '', map: '' };
  return {
    photo: String(meta.photo || meta.image || meta.imageUrl || '').trim(),
    map: String(meta.map || meta.mapUrl || '').trim()
  };
}

export function resolveGcTrackAssets(input: unknown, options: { rootDir?: string; force?: boolean } = {}): GcTrackAssetResolution {
  const names = (Array.isArray(input) ? input : [input])
    .flat(Infinity)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const track = names[0] || '';
  const queryTokens = tokensForQuery(names);
  const inventory = scan(options.rootDir, options.force);

  const meta = inventory.metadata
    .map((item) => ({ item, score: metadataMatch(item, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item || null;

  const metaUrls = urlsFromMetadata(meta);
  const bestPhoto = metaUrls.photo ? null : bestAsset(inventory.assets, queryTokens, 'photo');
  let bestMap = metaUrls.map ? null : bestAsset(inventory.assets, queryTokens, 'map');

  const photoUrl = metaUrls.photo || bestPhoto?.url || '';
  const photoStem = photoUrl ? inventory.assets.find((asset) => asset.url === photoUrl)?.stem || '' : bestPhoto?.stem || '';

  if (!metaUrls.map && photoStem) {
    const siblingMap = inventory.assets
      .filter((asset) => asset.role === 'map' && asset.stem === photoStem)
      .sort((a, b) => Number(scoreAsset(b, queryTokens, 'map')) - Number(scoreAsset(a, queryTokens, 'map')))[0];
    if (siblingMap && (!bestMap || Number(scoreAsset(siblingMap, queryTokens, 'map')) >= Number(bestMap.score || 0) - 40)) {
      bestMap = siblingMap;
    }
  }

  const mapUrl = metaUrls.map || bestMap?.url || '';
  const distanceKm = numberOrNull(meta?.distanceKm ?? meta?.distance ?? null);
  const confidence = Math.max(Number(bestPhoto?.score || 0), Number(bestMap?.score || 0), meta ? 900 : 0);

  return {
    ok: true,
    track,
    displayName: cleanTrackDisplayName(names, photoUrl, mapUrl),
    queryTokens,
    photo: photoUrl,
    map: mapUrl,
    distanceKm,
    distance: formatDistanceKm(distanceKm),
    countryCode: inferCountry(queryTokens, meta),
    confidence,
    source: meta ? 'metadata+filesystem' : 'filesystem',
    matchedPhoto: bestPhoto?.filename || (metaUrls.photo ? 'metadata' : ''),
    matchedMap: bestMap?.filename || (metaUrls.map ? 'metadata' : '')
  };
}

export function gcTrackPhotoCandidates(...names: unknown[]) {
  const resolved = resolveGcTrackAssets(names);
  const fallbackNames = tokensForQuery(names);
  const fallback = fallbackNames.flatMap((name) => [
    `/images/tracks/${name}.webp`,
    `/images/tracks/${name}.jpg`,
    `/images/tracks/${name}.png`,
    `/imagenes/tracks/${name}.webp`,
    `/imagenes/tracks/${name}.jpg`,
    `/imagenes/tracks/${name}.png`
  ]);
  return [...new Set([resolved.photo, ...fallback].filter(Boolean))];
}

export function gcTrackMapCandidates(...names: unknown[]) {
  const resolved = resolveGcTrackAssets(names);
  const fallbackNames = tokensForQuery(names);
  const fallback = fallbackNames.flatMap((name) => [
    `/images/tracks/${name}_map.png`,
    `/images/tracks/${name}_mapa.png`,
    `/images/tracks/${name}_outline.png`,
    `/imagenes/tracks/${name}_map.png`,
    `/imagenes/tracks/${name}_mapa.png`,
    `/imagenes/tracks/${name}_outline.png`
  ]);
  return [...new Set([resolved.map, ...fallback].filter(Boolean))];
}

export function registerGcTrackAssetsResolverRoutes(app: express.Express, options: { rootDir?: string } = {}) {
  app.get('/api/gc/track-assets/resolve', (req, res) => {
    const values = [
      req.query.track,
      req.query.trackRaw,
      req.query.name,
      req.query.event,
      req.query.hint
    ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);

    const force = String(req.query.refresh || '') === '1';
    const resolved = resolveGcTrackAssets(values, {
      rootDir: options.rootDir,
      force
    });

    res.setHeader('Cache-Control', 'no-store');

    if (String(req.query.debug || '') === '1') {
      const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
      const inventory = scan(rootDir, false);
      res.json({
        ...resolved,
        debug: {
          rootDir,
          publicRoots: getPublicRoots(rootDir),
          assetsCount: inventory.assets.length,
          metadataCount: inventory.metadata.length,
          matchedAssets: inventory.assets
            .filter((asset) => resolved.queryTokens.some((token) => asset.base.includes(token) || asset.stem.includes(token) || asset.tokens.includes(token)))
            .slice(0, 30)
            .map((asset) => ({ url: asset.url, filename: asset.filename, role: asset.role, stem: asset.stem, tokens: asset.tokens }))
        }
      });
      return;
    }

    res.json(resolved);
  });
}
