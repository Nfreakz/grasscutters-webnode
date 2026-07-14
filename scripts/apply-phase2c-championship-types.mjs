import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2c-championship-types-${stamp}`);
const files = [
  'src/pages/campeonato.astro',
  'src/pages/campeonato-supra-gt4.astro'
];
const changed = [];

function replaceAllLiteral(text, from, to) {
  return text.split(from).join(to);
}

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function patchChampionship(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);

  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes('GC_PHASE2C_CHAMPIONSHIP_TYPES_V1')) {
    console.log(`[GC Phase 2C] Ya aplicado: ${relativePath}`);
    return;
  }

  let next = original;

  next = replaceOnce(
    next,
    `const $ = (id) => document.getElementById(id);`,
    `/* GC_PHASE2C_CHAMPIONSHIP_TYPES_V1 */\n      function $<T extends HTMLElement = HTMLElement>(id: string): T {\n        return document.getElementById(id) as T;\n      }`,
    `el selector DOM principal de ${relativePath}`
  );

  const typedElements = [
    ["official: $('acsrOfficialLink')", "official: $<HTMLAnchorElement>('acsrOfficialLink')"],
    ["officialHero: $('acsrOfficialHero')", "officialHero: $<HTMLAnchorElement>('acsrOfficialHero')"],
    ["signup: $('acsrSignupLink')", "signup: $<HTMLAnchorElement>('acsrSignupLink')"],
    ["signupHero: $('acsrSignupHero')", "signupHero: $<HTMLAnchorElement>('acsrSignupHero')"],
    ["refresh: $('acsrRefresh')", "refresh: $<HTMLButtonElement>('acsrRefresh')"],
    ["trackFigure: $('acsrTrackFigure')", "trackFigure: $<HTMLFigureElement>('acsrTrackFigure')"],
    ["trackImage: $('acsrTrackImage')", "trackImage: $<HTMLImageElement>('acsrTrackImage')"],
    ["lastLink: $('acsrLastLink')", "lastLink: $<HTMLAnchorElement>('acsrLastLink')"]
  ];
  for (const [from, to] of typedElements) next = replaceAllLiteral(next, from, to);

  next = replaceAllLiteral(next, `.forEach((link) => {`, `.forEach((link: HTMLAnchorElement) => {`);

  next = replaceAllLiteral(
    next,
    `const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));`,
    `const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' } as Record<string, string>)[char] ?? char);`
  );

  const replacements = [
    [`const ratingClassKey = (value) =>`, `const ratingClassKey = (value: unknown) =>`],
    [`const ratingBadge = (type, value, score = null, options = {}) =>`, `const ratingBadge = (type: unknown, value: unknown, score: unknown = null, options: { compact?: boolean } = {}) =>`],
    [`const srInfo = (driver) =>`, `const srInfo = (driver: any) =>`],
    [`const srBadge = (driver) =>`, `const srBadge = (driver: any) =>`],
    [`const gsrInfo = (driver) =>`, `const gsrInfo = (driver: any) =>`],
    [`const gsrBadge = (driver) =>`, `const gsrBadge = (driver: any) =>`],
    [`const fmtDate = (value) =>`, `const fmtDate = (value: unknown) =>`],
    [`const slugify = (value) =>`, `const slugify = (value: unknown) =>`],
    [`const normalizeTrackSlug = (value) =>`, `const normalizeTrackSlug = (value: unknown) =>`],
    [`const trackAssetNames = (event) =>`, `const trackAssetNames = (event: any): string[] =>`],
    [`const registeredTrackAsset = (event) =>`, `const registeredTrackAsset = (event: any): { keys: string[]; photo?: string; map?: string } | null =>`],
    [`const localTrackMapCandidates = (event) =>`, `const localTrackMapCandidates = (event: any): string[] =>`],
    [`const localTrackPhotoCandidates = (event) =>`, `const localTrackPhotoCandidates = (event: any): string[] =>`],
    [`const eventImageHtml = (event) =>`, `const eventImageHtml = (event: any): string =>`],
    [`const renderTrackImage = (event) =>`, `const renderTrackImage = (event: any) =>`],
    [`function renderDrivers(rows)`, `function renderDrivers(rows: any[])`],
    [`function renderStandings(rows)`, `function renderStandings(rows: any[])`],
    [`function lastRaceRankBadge(position)`, `function lastRaceRankBadge(position: unknown)`],
    [`function renderLastCompleted(event)`, `function renderLastCompleted(event: any)`],
    [`function renderError(data)`, `function renderError(data: any)`],
    [`const parseDateTimeMs = (value) =>`, `const parseDateTimeMs = (value: unknown) =>`],
    [`const eventSortTime = (event) =>`, `const eventSortTime = (event: any) =>`],
    [`const driverIdentityKey = (row) =>`, `const driverIdentityKey = (row: any): string =>`],
    [`const resultIdentityKeys = (row) =>`, `const resultIdentityKeys = (row: any): string[] =>`],
    [`const latestCompletedEventFrom = (championship) =>`, `const latestCompletedEventFrom = (championship: any) =>`],
    [`const acsmLastResultsByDriver = (championship) =>`, `const acsmLastResultsByDriver = (championship: any) =>`],
    [`const mergeChampionshipSources = (ratingsData, acsmData) =>`, `const mergeChampionshipSources = (ratingsData: any, acsmData: any) =>`],
    [`function render(data)`, `function render(data: any)`],
    [`async function fetchJson(url)`, `async function fetchJson(url: string): Promise<any>`]
  ];
  for (const [from, to] of replacements) next = replaceAllLiteral(next, from, to);

  next = replaceAllLiteral(next, `const statusLabel = {`, `const statusLabel: Record<string, string> = {`);
  next = replaceAllLiteral(
    next,
    `const TRACK_ASSET_REGISTRY = {`,
    `const TRACK_ASSET_REGISTRY: Record<string, { keys: string[]; photo: string; map?: string }> = {`
  );

  next = replaceAllLiteral(next, `const out = [];`, `const out: string[] = [];`);
  next = replaceAllLiteral(next, `const keys = [];`, `const keys: string[] = [];`);
  next = replaceAllLiteral(next, `const map = new Map();`, `const map = new Map<string, any>();`);

  next = replaceAllLiteral(
    next,
    `const exact = registeredTrackAsset(event)?.map ? [registeredTrackAsset(event).map] : [];`,
    `const registered = registeredTrackAsset(event);\n        const exact: string[] = registered?.map ? [registered.map] : [];`
  );
  next = replaceAllLiteral(
    next,
    `const exact = registeredTrackAsset(event)?.photo ? [registeredTrackAsset(event).photo] : [];`,
    `const registered = registeredTrackAsset(event);\n        const exact: string[] = registered?.photo ? [registered.photo] : [];`
  );

  next = replaceAllLiteral(
    next,
    `const setImageWithFallback = (img, figure, candidates) => {`,
    `const setImageWithFallback = (img: HTMLImageElement, figure: HTMLElement, candidates: string[]) => {`
  );
  next = replaceAllLiteral(next, `img.onerror = function () {`, `img.onerror = function (this: HTMLImageElement) {`);

  next = replaceAllLiteral(next, `.map((driver) =>`, `.map((driver: any) =>`);
  next = replaceAllLiteral(next, `.map((event) =>`, `.map((event: any) =>`);
  next = replaceAllLiteral(next, `.filter((event) =>`, `.filter((event: any) =>`);
  next = replaceAllLiteral(next, `.sort((a, b) =>`, `.sort((a: any, b: any) =>`);
  next = replaceAllLiteral(next, `.forEach((event) =>`, `.forEach((event: any) =>`);
  next = replaceAllLiteral(next, `.forEach((result) =>`, `.forEach((result: any) =>`);
  next = replaceAllLiteral(next, `ratingRows.map((row) =>`, `ratingRows.map((row: any) =>`);
  next = replaceAllLiteral(next, `baseRows.map((row, index) =>`, `baseRows.map((row: any, index: number) =>`);
  next = replaceAllLiteral(next, `const rated = ratingByKey.get(key) || {};`, `const rated: any = ratingByKey.get(key) || {};`);

  next = replaceAllLiteral(next, `statusLabel[next.status]`, `statusLabel[String(next.status)]`);
  next = replaceAllLiteral(next, `statusLabel[event.status]`, `statusLabel[String(event.status)]`);

  next = replaceAllLiteral(
    next,
    `const events = Array.isArray(championship.events) ? championship.events : [];`,
    `const events: any[] = Array.isArray(championship.events) ? championship.events : [];`
  );
  next = replaceAllLiteral(
    next,
    `const standings = Array.isArray(championship.standings) ? championship.standings : [];`,
    `const standings: any[] = Array.isArray(championship.standings) ? championship.standings : [];`
  );
  next = replaceAllLiteral(
    next,
    `const drivers = Array.isArray(championship.registeredDrivers) ? championship.registeredDrivers : [];`,
    `const drivers: any[] = Array.isArray(championship.registeredDrivers) ? championship.registeredDrivers : [];`
  );

  if (!next.includes('const settledReasonMessage = (result: PromiseSettledResult<any>)')) {
    next = replaceOnce(
      next,
      `async function load(refresh = false) {`,
      `const settledReasonMessage = (result: PromiseSettledResult<any>): string =>\n        result.status === 'rejected'\n          ? String(result.reason?.message || result.reason || '')\n          : '';\n\n      async function load(refresh = false) {`,
      `la función load de ${relativePath}`
    );
  }

  next = replaceAllLiteral(
    next,
    `ratingsResult.reason?.message || acsmResult.reason?.message || 'No se pudo cargar el campeonato.'`,
    `settledReasonMessage(ratingsResult) || settledReasonMessage(acsmResult) || 'No se pudo cargar el campeonato.'`
  );

  if (next === original) throw new Error(`No se aplicó ningún cambio a ${relativePath}`);

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, next, 'utf8');
  changed.push(relativePath);
}

for (const relativePath of files) patchChampionship(relativePath);

console.log('');
console.log('[GC Phase 2C] Tipado de campeonatos aplicado.');
console.log(`[GC Phase 2C] Backup: ${backupDir}`);
console.log(`[GC Phase 2C] Modificados: ${changed.join(', ') || 'ninguno'}`);
console.log('[GC Phase 2C] Siguiente: npm run deps:baseline && npm run quality');
