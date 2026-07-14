import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2d-home-shared-types-${stamp}`);
const changed = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const target = file(relativePath);
  if (!fs.existsSync(target)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(target, 'utf8');
}

function save(relativePath, original, next) {
  if (original === next) {
    console.log(`[GC Phase 2D] Sin cambios: ${relativePath}`);
    return;
  }

  const backup = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file(relativePath), backup);
  fs.writeFileSync(file(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceAll(text, from, to) {
  return text.split(from).join(to);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

// ---------------------------------------------------------------------------
// Componentes compartidos
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/components/AdminSubnav.astro';
  const original = read(relativePath);
  let next = original;

  if (!next.includes('type AdminSubnavItem =')) {
    next = replaceRequired(
      next,
      `const current = Astro.url.pathname.replace(/\\/$/, '') || '/';

const groups = [`,
      `const current = Astro.url.pathname.replace(/\\/$/, '') || '/';

type AdminSubnavItem = {
  href: string;
  label: string;
  desc: string;
};

type AdminSubnavGroup = {
  label: string;
  items: AdminSubnavItem[];
};

const groups: AdminSubnavGroup[] = [`,
      'tipos de AdminSubnav'
    );
  }

  next = replaceAll(
    next,
    `const isActive = (href) => current === href || (href !== '/admin' && current.startsWith(href));
const groupHasActive = (group) => group.items.some((item) => isActive(item.href));`,
    `const isActive = (href: string) => current === href || (href !== '/admin' && current.startsWith(href));
const groupHasActive = (group: AdminSubnavGroup) => group.items.some((item: AdminSubnavItem) => isActive(item.href));`
  );

  save(relativePath, original, next);
}

{
  const relativePath = 'src/components/public/RatingBadge.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(next, `const SR_LABELS = {`, `const SR_LABELS: Record<string, string> = {`);
  next = replaceAll(next, `const GSR_LABELS = {`, `const GSR_LABELS: Record<string, string> = {`);

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// Layout de plataforma
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/layouts/AppLayout.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `const normalizePath = (path) => {
  if (!path || path === '/') return '/';
  return path.replace(/\\/$/, '');
};`,
    `const normalizePath = (path: unknown): string => {
  const raw = String(path || '');
  if (!raw || raw === '/') return '/';
  return raw.replace(/\\/$/, '');
};`
  );

  next = replaceAll(next, `const pageOgImages = {`, `const pageOgImages: Record<string, string> = {`);

  if (!next.includes('type AppRouteSocialMeta =')) {
    next = replaceRequired(
      next,
      `/* GC_GLOBAL_SOCIAL_META_V15_31 START */
const routeSocialMeta = {`,
      `/* GC_GLOBAL_SOCIAL_META_V15_31 START */
type AppRouteSocialMeta = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
};

const routeSocialMeta: Record<string, AppRouteSocialMeta> = {`,
      'tipo de metadatos sociales de AppLayout'
    );
  }

  const replacements = [
    [`function resolveSeoText(value, fallback = '') {`, `function resolveSeoText(value: unknown, fallback: unknown = '') {`],
    [`function compactSeoText(value, fallback = '') {`, `function compactSeoText(value: unknown, fallback: unknown = '') {`],
    [`function absoluteSeoUrl(value) {`, `function absoluteSeoUrl(value: unknown) {`],
    [`function seoImageMime(value) {`, `function seoImageMime(value: unknown) {`],
    [`function appLayoutIsActive(match) {`, `function appLayoutIsActive(match: string) {`],
    [`function appLayoutGroupActive(items) {`, `function appLayoutGroupActive(items: Array<{ match: string }>) {`],
    [`return items.some((item) => appLayoutIsActive(item.match));`, `return items.some((item: { match: string }) => appLayoutIsActive(item.match));`]
  ];

  for (const [from, to] of replacements) next = replaceAll(next, from, to);

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// Layout público
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/layouts/MarketingLayout.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `function normalizeCanonicalPath(value) {`,
    `function normalizeCanonicalPath(value: unknown) {`
  );
  next = replaceAll(next, `const pageOgImages = {`, `const pageOgImages: Record<string, string> = {`);

  const replacements = [
    [`function compactText(value, fallback = '') {`, `function compactText(value: unknown, fallback: unknown = '') {`],
    [`function imageMime(value) {`, `function imageMime(value: unknown) {`],
    [`function absoluteUrl(value) {`, `function absoluteUrl(value: unknown) {`],
    [`function isActive(match) {`, `function isActive(match: string) {`]
  ];

  for (const [from, to] of replacements) next = replaceAll(next, from, to);

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// Home pública: tipado del bloque de ratings y del bootstrap principal
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(next, `const home2ArchiveSeed = [];`, `const home2ArchiveSeed: unknown[] = [];`);

  next = replaceAll(
    next,
    `const srBody = document.querySelector('[data-home2-sr-ratings]');
      const gsrBody = document.querySelector('[data-home2-gsr-ratings]');`,
    `const srBody = document.querySelector<HTMLElement>('[data-home2-sr-ratings]');
      const gsrBody = document.querySelector<HTMLElement>('[data-home2-gsr-ratings]');`
  );

  const signatures = [
    [`const ago = (row) => {`, `const ago = (row: any): string => {`],
    [`const driverName = (row) =>`, `const driverName = (row: any) =>`],
    [`const cleanPublicName = (value, source = '') => {`, `const cleanPublicName = (value: unknown, source: unknown = ''): string => {`],
    [`const carName = (row) =>`, `const carName = (row: any) =>`],
    [`const trackName = (row) =>`, `const trackName = (row: any) =>`],
    [`const sourceKey = (row, fallback = '') =>`, `const sourceKey = (row: any, fallback: unknown = '') =>`],
    [`const avatarNameCache = new Map();`, `const avatarNameCache = new Map<string, string>();`],
    [`const rememberAvatar = (row, src) => {`, `const rememberAvatar = (row: any, src: any): string => {`],
    [`const avatar = (row) => {`, `const avatar = (row: any): string => {`],
    [`const isValid = (row) => {`, `const isValid = (row: any): boolean => {`],
    [`const bestPerDriver = (rows) => {`, `const bestPerDriver = (rows: any[]): any[] => {`],
    [`const map = new Map();`, `const map = new Map<string, any>();`],
    [`const activeCombo = (sourcePayload) =>`, `const activeCombo = (sourcePayload: any) =>`],
    [`const sourceLeaderboard = (sourcePayload) =>`, `const sourceLeaderboard = (sourcePayload: any): any[] =>`],
    [`const rankBadge = (index) =>`, `const rankBadge = (index: number) =>`],
    [`const pulseCell = (selector, label, value, meta) => {`, `const pulseCell = (selector: string, label: unknown, value: unknown, meta: unknown) => {`],
    [`const compactTrackLabel = (value) =>`, `const compactTrackLabel = (value: unknown) =>`],
    [`const splitCarSummary = (value) =>`, `const splitCarSummary = (value: unknown): string[] =>`],
    [`const comboRankBadgeClass = (index) =>`, `const comboRankBadgeClass = (index: number) =>`],
    [`async function fetchJson(url, timeoutMs = 15000) {`, `async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {`],
    [`const setImageWithFallbacks = (img, candidates, fallback = FALLBACK_TRACK) => {`, `const setImageWithFallbacks = (img: HTMLImageElement | null, candidates: string[], fallback = FALLBACK_TRACK): void => {`],
    [`const trackImageAliasVariants = (values) => {`, `const trackImageAliasVariants = (values: unknown[]): string[] => {`],
    [`const aliases = new Set();`, `const aliases = new Set<string>();`],
    [`const addRaw = (value) => {`, `const addRaw = (value: unknown): void => {`],
    [`const trackImageCandidatesFromCombo = (combo) => {`, `const trackImageCandidatesFromCombo = (combo: any): string[] => {`],
    [`const image = combo?.trackImage || combo?.track?.image || {};`, `const image: any = combo?.trackImage || combo?.track?.image || {};`],
    [`const candidates = [];`, `const candidates: string[] = [];`],
    [`const setHeroBackgroundFromMain = (payload) => {`, `const setHeroBackgroundFromMain = (payload: any) => {`],
    [`const renderRanking = (selector, rows, preserve = true) => {`, `const renderRanking = (selector: string, rows: any[] = [], preserve = true): any[] => {`],
    [`const renderRecent = (rows) => {`, `const renderRecent = (rows: any[] = []): any[] => {`],
    [`const championshipTrackForSource = (source) => {`, `const championshipTrackForSource = (source: string): string => {`],
    [`const championshipCarsForSource = (source) => {`, `const championshipCarsForSource = (source: string): string[] => {`],
    [`const driverStatName = (item) =>`, `const driverStatName = (item: any) =>`],
    [`const driverStatLaps = (item) =>`, `const driverStatLaps = (item: any) =>`],
    [`const sourceDriverStats = (combo) =>`, `const sourceDriverStats = (combo: any): any[] =>`],
    [`const describeSourceCombo = (payload, source = 'main') => {`, `const describeSourceCombo = (payload: any, source = 'main') => {`],
    [`const pulseServerMeta = (item) => {`, `const pulseServerMeta = (item: any): string => {`],
    [`const renderPulse = (payload) => {`, `const renderPulse = (payload: any) => {`],
    [`const champRoot = (payload) =>`, `const champRoot = (payload: any): any =>`],
    [`const arr = (...items) =>`, `const arr = (...items: any[]): any[] =>`],
    [`const champEvents = (payload) => {`, `const champEvents = (payload: any): any[] => {`],
    [`const champRows = (payload) => {`, `const champRows = (payload: any): any[] => {`],
    [`const champName = (row, index) =>`, `const champName = (row: any, index: number) =>`],
    [`const champPts = (row) =>`, `const champPts = (row: any) =>`],
    [`const champDate = (raw) => {`, `const champDate = (raw: unknown): string => {`],
    [`const championshipButton = (href, label, extraClass = '', attr = '') =>`, `const championshipButton = (href: string, label: string, extraClass = '', attr = '') =>`],
    [`const enforceChampionshipButtons = (source) => {`, `const enforceChampionshipButtons = (source: string) => {`],
    [`const setChampionshipTrackImage = async (block, title, event, source) => {`, `const setChampionshipTrackImage = async (block: any, title: unknown, event: any, _source: string) => {`],
    [`const renderChampionshipFromPayload = (source, payload) => {`, `const renderChampionshipFromPayload = (source: string, payload: any) => {`],
    [`const loadChampionship = async (source) => {`, `const loadChampionship = async (source: string) => {`],
    [`const applyBootstrap = (payload) => {`, `const applyBootstrap = (payload: any) => {`]
  ];

  for (const [from, to] of signatures) next = replaceAll(next, from, to);

  // Solo dentro del bootstrap principal: el resolvedor y la API de debug viven
  // deliberadamente como extensiones globales del navegador.
  next = replaceAll(next, `window.GCHomeTrackResolver`, `(window as any).GCHomeTrackResolver`);
  next = replaceAll(next, `window.GCHomeBootstrapV2`, `(window as any).GCHomeBootstrapV2`);
  next = replaceAll(next, `window.__GC_HOME_BOOTSTRAP_INTERVAL__`, `(window as any).__GC_HOME_BOOTSTRAP_INTERVAL__`);

  next = replaceAll(
    next,
    `const img = q('.gc-home2-hero__bg[data-home2-track-image]');
        if (!img) return;`,
    `const img = q('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        if (!img) return;`
  );

  next = replaceAll(
    next,
    `const img = q('[data-home2-champ-track-image]', block);
        if (!img) return;`,
    `const img = q('[data-home2-champ-track-image]', block) as HTMLImageElement | null;
        if (!img) return;`
  );

  next = replaceAll(
    next,
    `if (!current || rowTimeMs(row) < rowTimeMs(current)) map.set(key, row);`,
    `if (!current || (rowTimeMs(row) ?? Number.POSITIVE_INFINITY) < (rowTimeMs(current) ?? Number.POSITIVE_INFINITY)) map.set(key, row);`
  );

  next = replaceAll(
    next,
    `return [...map.values()].sort((a, b) => rowTimeMs(a) - rowTimeMs(b));`,
    `return [...map.values()].sort((a, b) => (rowTimeMs(a) ?? Number.POSITIVE_INFINITY) - (rowTimeMs(b) ?? Number.POSITIVE_INFINITY));`
  );

  next = replaceAll(
    next,
    `const duelRows = main.bestRows.length >= 2 ? main.bestRows : gt4.bestRows;
        const duel = duelRows.length >= 2 && Number.isFinite(rowTimeMs(duelRows[0])) && Number.isFinite(rowTimeMs(duelRows[1]))
          ? \`+\${((rowTimeMs(duelRows[1]) - rowTimeMs(duelRows[0])) / 1000).toFixed(3)}s\`
          : '--';`,
    `const duelRows = main.bestRows.length >= 2 ? main.bestRows : gt4.bestRows;
        const duelP1 = duelRows.length >= 2 ? rowTimeMs(duelRows[0]) : null;
        const duelP2 = duelRows.length >= 2 ? rowTimeMs(duelRows[1]) : null;
        const duel = duelP1 !== null && duelP2 !== null
          ? \`+\${((duelP2 - duelP1) / 1000).toFixed(3)}s\`
          : '--';`
  );

  next = replaceAll(next, `const d = new Date(raw);`, `const d = new Date(String(raw));`);

  next = replaceAll(
    next,
    `return { source, ok: false, reason: String(error?.message || error) };`,
    `return { source, ok: false, reason: error instanceof Error ? error.message : String(error) };`
  );

  // Parámetros de callbacks que siguen quedando expuestos al checker.
  next = replaceAll(next, `.map((row, index) =>`, `.map((row: any, index: number) =>`);
  next = replaceAll(next, `.filter((row) =>`, `.filter((row: any) =>`);
  next = replaceAll(next, `.sort((a, b) =>`, `.sort((a: any, b: any) =>`);
  next = replaceAll(next, `events.find((event) =>`, `events.find((event: any) =>`);
  next = replaceAll(next, `events.filter((event) =>`, `events.filter((event: any) =>`);

  save(relativePath, original, next);
}

console.log('');
console.log('[GC Phase 2D] Home y tipos compartidos aplicados.');
console.log(`[GC Phase 2D] Backup: ${backupDir}`);
console.log(`[GC Phase 2D] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2D] Siguiente: npm run deps:baseline && npm run quality');
