import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2b-runtime-types-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function save(relativePath, original, next) {
  if (next === original) return false;
  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target(relativePath), backupPath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
  return true;
}

function replaceRequired(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`No se encontró el bloque requerido: ${label}`);
  return text.replace(oldValue, newValue);
}

// ---------------------------------------------------------------------------
// 1) strackerService: mantener better-sqlite3 opcional sin importación de tipos.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/stracker/strackerService.ts';
  const original = read(relativePath);
  let next = original;

  const oldTypes = `type BetterSqlite3Module = typeof import('better-sqlite3');

let DatabaseCtor: BetterSqlite3Module | null = null;`;

  const newTypes = `type BetterSqlite3Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type BetterSqlite3Database = {
  prepare(statement: string): BetterSqlite3Statement;
  pragma?(statement: string): unknown;
  close(): void;
};

type BetterSqlite3Constructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => BetterSqlite3Database;

let DatabaseCtor: BetterSqlite3Constructor | null = null;`;

  next = replaceRequired(next, oldTypes, newTypes, 'tipos opcionales de better-sqlite3');
  next = next.replace(
    `DatabaseCtor = require('better-sqlite3') as BetterSqlite3Module;`,
    `DatabaseCtor = require('better-sqlite3') as BetterSqlite3Constructor;`
  );

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 2) index.ts: corregir tres referencias globales inexistentes y tipar runtime.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/server/index.ts';
  const original = read(relativePath);
  let next = original;

  const sessionFormatter = `function gcFormatSessionLapTimeV1(value: unknown) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return \`\${minutes}:\${String(seconds).padStart(2, '0')}.\${String(millis).padStart(3, '0')}\`;
}

`;

  if (!next.includes('function gcFormatSessionLapTimeV1')) {
    const marker = `type PilotProfileLap = ReturnType<typeof mapLapRow>;`;
    if (!next.includes(marker)) throw new Error('No se encontró PilotProfileLap.');
    next = next.replace(marker, sessionFormatter + marker);
  }

  next = next.replace(
    `bestLap: row.BestLapMs ? formatLapTime(Number(row.BestLapMs)) : null`,
    `bestLap: row.BestLapMs ? gcFormatSessionLapTimeV1(row.BestLapMs) : null`
  );

  const slugHelper = `function gcSlugifyTeamNameV1(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'campeonato';
}

`;

  if (!next.includes('function gcSlugifyTeamNameV1')) {
    const marker = `app.post('/api/gc/teams/:teamId/palmares', async (req, res) => {`;
    if (!next.includes(marker)) throw new Error('No se encontró la ruta de palmarés.');
    next = next.replace(marker, slugHelper + marker);
  }

  next = next.replace(
    `const championshipSlug = slugifyTeamName(\`\${season}-\${championshipName}\`);`,
    `const championshipSlug = gcSlugifyTeamNameV1(\`\${season}-\${championshipName}\`);`
  );

  const runtimeEscape = `function gcRuntimeEscapeHtmlV1(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } as Record<string, string>)[char] ?? char);
}

`;

  if (!next.includes('function gcRuntimeEscapeHtmlV1')) {
    const marker = `/* GC_ASTRO_RUNTIME_PATCH_V3`;
    if (!next.includes(marker)) throw new Error('No se encontró GC_ASTRO_RUNTIME_PATCH_V3.');
    next = next.replace(marker, runtimeEscape + marker);
  }

  next = next.replace(
    `+ escapeHtml(req.originalUrl || req.url) +`,
    `+ gcRuntimeEscapeHtmlV1(req.originalUrl || req.url) +`
  );

  const typingReplacements = [
    [`function gcFindExistingDirectory(candidates) {`,
     `function gcFindExistingDirectory(candidates: Array<string | null | undefined>): string | null {`],
    [`function gcFindExistingFile(candidates) {`,
     `function gcFindExistingFile(candidates: Array<string | null | undefined>): string | null {`],
    [`function gcSafeDecodeUrlPath(value) {`,
     `function gcSafeDecodeUrlPath(value: unknown): string {`],
    [`function gcIsApiRequest(requestUrl) {`,
     `function gcIsApiRequest(requestUrl: unknown): boolean {`],
    [`function gcFindStaticHtmlForRequest(clientDir, requestUrl) {`,
     `function gcFindStaticHtmlForRequest(clientDir: string | null, requestUrl: unknown): string | null {`],
    [`function gcRuntimeSnapshot(clientDir, astroEntry) {`,
     `function gcRuntimeSnapshot(clientDir: string | null, astroEntry: string | null) {`],
    [`function dirInfo(label, dirPath) {`,
     `function dirInfo(label: string, dirPath: string | null) {`],
    [`function fileInfo(label, filePath) {`,
     `function fileInfo(label: string, filePath: string | null) {`]
  ];

  for (const [oldValue, newValue] of typingReplacements) {
    if (next.includes(oldValue)) next = next.replace(oldValue, newValue);
  }

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 3) Home: tipar los lectores genéricos que generan cientos de `never`.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  let next = original;

  const oldRatingEscape = `      const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char]));`;

  const newRatingEscape = `      const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      } as Record<string, string>)[char] ?? char);`;

  next = replaceRequired(next, oldRatingEscape, newRatingEscape, 'escapeHtml de ratings');

  const simpleReplacements = [
    [`const toNumber = (value) => {`, `const toNumber = (value: unknown): number | null => {`],
    [`const classKey = (value) => String(value || 'unknown')`, `const classKey = (value: unknown) => String(value || 'unknown')`],
    [`const readRatingValue = (obj, keys = []) => {`, `const readRatingValue = (obj: any, keys: string[] = []): any => {`],
    [`const ratingPilotAvatarUrl = (row) => {`, `const ratingPilotAvatarUrl = (row: any): string => {`],
    [`const formatDriverName = (value) => String(value || 'Piloto').toUpperCase();`, `const formatDriverName = (value: unknown) => String(value || 'Piloto').toUpperCase();`],
    [`const formatDelta = (value, digits = 1) => {`, `const formatDelta = (value: unknown, digits = 1): string => {`],
    [`const deltaClass = (value) => {`, `const deltaClass = (value: unknown): string => {`],
    [`const rankTone = (position) => {`, `const rankTone = (position: unknown): string => {`],
    [`const renderRankBadge = (position) => {`, `const renderRankBadge = (position: unknown): string => {`],
    [`const ratingBadge = (type, label, score) => {`, `const ratingBadge = (type: unknown, label: unknown, score: unknown): string => {`],
    [`const driverLink = (row) => {`, `const driverLink = (row: any): string => {`],
    [`const renderRows = (target, rows, type) => {`, `const renderRows = (target: HTMLElement | null, rows: any[], type: string) => {`],
    [`if (window.__GC_HOME_BOOTSTRAP_FRONTEND_V2__) {`, `if ((window as any).__GC_HOME_BOOTSTRAP_FRONTEND_V2__) {`],
    [`window.__GC_HOME_BOOTSTRAP_FRONTEND_V2__ = true;`, `(window as any).__GC_HOME_BOOTSTRAP_FRONTEND_V2__ = true;`],
    [`const q = (selector, scope = root) => scope?.querySelector?.(selector) || null;`, `const q = (selector: string, scope: any = root): any => scope?.querySelector?.(selector) || null;`],
    [`const qa = (selector, scope = root) => Array.from(scope?.querySelectorAll?.(selector) || []);`, `const qa = (selector: string, scope: any = root): any[] => Array.from(scope?.querySelectorAll?.(selector) || []);`],
    [`const setText = (selector, value, scope = root) => {`, `const setText = (selector: string, value: unknown, scope: any = root) => {`],
    [`const normalize = (value) => String(value || '').toLowerCase()`, `const normalize = (value: unknown) => String(value || '').toLowerCase()`],
    [`const first = (obj, paths = [], fallback = '') => {`, `const first = (obj: any, paths: string[] = [], fallback: any = ''): any => {`],
    [`const getArray = (payload) => {`, `const getArray = (payload: any): any[] => {`],
    [`const parseTimeMs = (value) => {`, `const parseTimeMs = (value: any): number | null => {`],
    [`const rowTimeMs = (row) => parseTimeMs(`, `const rowTimeMs = (row: any): number | null => parseTimeMs(`],
    [`const formatTime = (input) => {`, `const formatTime = (input: any): string => {`],
    [`const timestampMs = (row) => {`, `const timestampMs = (row: any): number => {`],
    [`const championshipEventForSource = (source) => {`, `const championshipEventForSource = (source: string) => {`],
    [`const heroCandidates = (payload) => ([`, `const heroCandidates = (payload: any) => ([`],
    [`const setHero = (sourcePayload, rankingRows, source = 'main') => {`, `const setHero = (sourcePayload: any, rankingRows: any[], source = 'main') => {`],
    [`const comboTrack = (combo, rows = [], source = '') =>`, `const comboTrack = (combo: any, rows: any[] = [], source = '') =>`],
    [`const comboCars = (combo, rows = [], source = '') => {`, `const comboCars = (combo: any, rows: any[] = [], source = '') => {`]
  ];

  for (const [oldValue, newValue] of simpleReplacements) {
    if (next.includes(oldValue)) next = next.replace(oldValue, newValue);
  }

  const oldEsc = `const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));`;
  const newEsc = `const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char] ?? char);`;
  next = replaceRequired(next, oldEsc, newEsc, 'esc del bootstrap home');

  next = next.replace(
    `if (!Number.isFinite(ms)) return typeof input === 'string' && input.trim() ? input : '--';`,
    `if (ms === null || !Number.isFinite(ms)) return typeof input === 'string' && input.trim() ? input : '--';`
  );

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 4) Resolver de imágenes: conservar score al usar el mapa hermano.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/server/gc-track-assets-resolver.ts';
  const original = read(relativePath);
  let next = original;

  const oldAssignment = `      bestMap = siblingMap;`;
  const newAssignment = `      bestMap = {
        ...siblingMap,
        score: Number(scoreAsset(siblingMap, queryTokens, 'map'))
      };`;

  next = replaceRequired(next, oldAssignment, newAssignment, 'score de siblingMap');
  save(relativePath, original, next);
}

console.log('');
console.log('[GC Phase 2B] Aplicado.');
console.log(`[GC Phase 2B] Backup: ${backupDir}`);
console.log(`[GC Phase 2B] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2B] Siguiente: npm run deps:baseline && npm run quality');
