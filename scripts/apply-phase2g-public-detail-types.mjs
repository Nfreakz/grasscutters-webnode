import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2g-public-detail-types-${stamp}`);
const marker = 'GC_PHASE2G_PUBLIC_DETAIL_TYPES_V1';
const changed = [];

const files = {
  combo: 'src/pages/combos/[trackId]/[carId].astro',
  pilot: 'src/pages/pilotos/[id].astro',
  png: 'src/pages/acsm/loading-card.png.ts',
  avatarApi: 'src/pages/api/pilot-avatar/me.ts',
  avatarServer: 'src/server/admin-user-profile-link-routes.ts',
};

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

// Combo detail.
{
  const original = fs.readFileSync(target(files.combo), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes('<AppLayout title="Combo | GrassCutters">')
      || !next.includes('/api/gc/combos/')
      || !next.includes('leaderboardRows')) {
      throw new Error('La ficha de combo no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      `  <script>
    const escapeHtml = (value) => String(value ?? '-').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    const fmtSpeed = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? \`\${Math.round(Number(value))} km/h\` : '--';
    const fmtDate = (value) => {
      if (!value) return '--';
      const date = new Date(value);`,
      `  <!-- ${marker} -->
  <script>
    type AnyRecord = Record<string, any>;

    const escapeHtml = (value: unknown): string => String(value ?? '-').replace(/[&<>'"]/g, (char) => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    } as Record<string, string>)[char] ?? char);
    const fmtSpeed = (value: unknown): string => Number.isFinite(Number(value)) && Number(value) > 0 ? \`\${Math.round(Number(value))} km/h\` : '--';
    const fmtDate = (value: unknown): string => {
      if (!value) return '--';
      const date = new Date(typeof value === 'number' ? value : String(value));`,
      'la cabecera del script de la ficha de combo',
    );

    next = replaceRequired(
      next,
      `    const els = {
      title: document.getElementById('comboTitle'), subtitle: document.getElementById('comboSubtitle'), key: document.getElementById('comboKey'), status: document.getElementById('comboStatus'),
      laps: document.getElementById('comboLaps'), drivers: document.getElementById('comboDrivers'), clean: document.getElementById('comboClean'),
      best: document.getElementById('metricBest'), bestDriver: document.getElementById('metricBestDriver'), speed: document.getElementById('metricSpeed'), top10: document.getElementById('metricTop10'), recent: document.getElementById('metricRecent'),
      leaderboard: document.getElementById('leaderboardRows'), recentRows: document.getElementById('recentRows')
    };`,
      `    const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
      document.getElementById(id) as T;
    const els = {
      title: $('comboTitle'), subtitle: $('comboSubtitle'), key: $('comboKey'), status: $('comboStatus'),
      laps: $('comboLaps'), drivers: $('comboDrivers'), clean: $('comboClean'),
      best: $('metricBest'), bestDriver: $('metricBestDriver'), speed: $('metricSpeed'), top10: $('metricTop10'), recent: $('metricRecent'),
      leaderboard: $<HTMLTableSectionElement>('leaderboardRows'), recentRows: $<HTMLTableSectionElement>('recentRows')
    };`,
      'el mapa DOM de la ficha de combo',
    );

    const comboReplacements = [
      [
        `    function pathIds() {
      const parts = window.location.pathname.split('/').filter(Boolean);
      return { trackId: parts[1], carId: parts[2] };
    }`,
        `    function pathIds(): { trackId: string; carId: string } {
      const parts = window.location.pathname.split('/').filter(Boolean);
      return { trackId: parts[1] || '', carId: parts[2] || '' };
    }`,
        'pathIds',
      ],
      [
        `    function lapStatus(row) {`,
        `    function lapStatus(row: AnyRecord): string {`,
        'lapStatus',
      ],
      [
        `    async function load() {`,
        `    async function load(): Promise<void> {`,
        'load de combo',
      ],
      [
        `        els.leaderboard.innerHTML = (item.leaderboard || []).map((row) => {`,
        `        els.leaderboard.innerHTML = (item.leaderboard || []).map((row: AnyRecord) => {`,
        'callback de leaderboard',
      ],
      [
        `        els.recentRows.innerHTML = (item.recentLaps || []).map((row) => {`,
        `        els.recentRows.innerHTML = (item.recentLaps || []).map((row: AnyRecord) => {`,
        'callback de vueltas recientes',
      ],
    ];

    for (const [from, to, label] of comboReplacements) {
      next = replaceRequired(next, from, to, label);
    }

    writePreservingEol(files.combo, original, next);
  } else {
    console.log('[GC Phase 2G] Ficha de combo ya tipada.');
  }
}

// Pilot detail frontmatter.
{
  const original = fs.readFileSync(target(files.pilot), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes('GC_PILOT_SOCIAL_V15_30 START')
      || !next.includes('fetchPilotSeoData')
      || !next.includes('nestedPilotSource')) {
      throw new Error('La ficha de piloto no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      `const rawId = Astro.params.id ?? '';

/* GC_PILOT_SOCIAL_V15_30 START */`,
      `const rawId = Astro.params.id ?? '';
type AnyRecord = Record<string, any>;

/* ${marker} */
/* GC_PILOT_SOCIAL_V15_30 START */`,
      'el inicio de la ficha de piloto',
    );

    const pilotReplacements = [
      [
        `function cleanSeoText(value, fallback = '') {`,
        `function cleanSeoText(value: unknown, fallback = ''): string {`,
        'cleanSeoText',
      ],
      [
        `function valueAt(source, dottedPath) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, dottedPath)) return source[dottedPath];
  return String(dottedPath).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
}`,
        `function valueAt(source: AnyRecord | null | undefined, dottedPath: string): any {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as AnyRecord;
  if (Object.prototype.hasOwnProperty.call(record, dottedPath)) return record[dottedPath];
  return String(dottedPath).split('.').reduce<any>((acc, part) => acc == null ? undefined : acc[part], record);
}`,
        'valueAt',
      ],
      [
        `function firstValue(...values) {`,
        `function firstValue(...values: unknown[]): any {`,
        'firstValue',
      ],
      [
        `function firstPath(source, paths) {`,
        `function firstPath(source: AnyRecord | null | undefined, paths: string[]): any {`,
        'firstPath',
      ],
      [
        `function pilotDisplayName(pilot, data) {`,
        `function pilotDisplayName(pilot: AnyRecord, data: AnyRecord): string {`,
        'pilotDisplayName',
      ],
      [
        `function numberText(value) {`,
        `function numberText(value: unknown): string | null {`,
        'numberText',
      ],
      [
        `function lapText(value) {`,
        `function lapText(value: unknown): string | null {`,
        'lapText',
      ],
      [
        `function uniqueSeoUrls(urls) {
  const seen = new Set();`,
        `function uniqueSeoUrls(urls: unknown[]): string[] {
  const seen = new Set<string>();`,
        'uniqueSeoUrls',
      ],
      [
        `function safeOrigin(value) {`,
        `function safeOrigin(value: unknown): string {`,
        'safeOrigin',
      ],
      [
        `function getSeoApiCandidates() {`,
        `function getSeoApiCandidates(): string[] {`,
        'getSeoApiCandidates',
      ],
      [
        `function nestedPilotSource(data) {`,
        `function nestedPilotSource(data: AnyRecord): AnyRecord {`,
        'nestedPilotSource',
      ],
      [
        `function nestedSummarySource(data) {`,
        `function nestedSummarySource(data: AnyRecord): AnyRecord {`,
        'nestedSummarySource',
      ],
      [
        `function nestedBestLapSource(data, summary) {`,
        `function nestedBestLapSource(data: AnyRecord, summary: AnyRecord): AnyRecord | null {`,
        'nestedBestLapSource',
      ],
      [
        `async function fetchPilotSeoData() {`,
        `async function fetchPilotSeoData(): Promise<AnyRecord | null> {`,
        'fetchPilotSeoData',
      ],
      [
        `    } catch (error) {
      lastError = error?.message || String(error);`,
        `    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);`,
        'catch de SEO de piloto',
      ],
    ];

    for (const [from, to, label] of pilotReplacements) {
      next = replaceRequired(next, from, to, label);
    }

    writePreservingEol(files.pilot, original, next);
  } else {
    console.log('[GC Phase 2G] Ficha de piloto ya tipada.');
  }
}

// PNG Response body.
{
  const original = fs.readFileSync(target(files.png), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    next = replaceRequired(
      next,
      `    return new Response(png, {`,
      `    // ${marker}
    return new Response(new Uint8Array(png), {`,
      'el cuerpo PNG de Response',
    );
    writePreservingEol(files.png, original, next);
  } else {
    console.log('[GC Phase 2G] Response PNG ya corregida.');
  }
}

// Avatar API duplicate playerId.
{
  const original = fs.readFileSync(target(files.avatarApi), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    next = replaceRequired(
      next,
      `  return json({
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL,
    ...avatar
  });`,
      `  return json({
    ...avatar,
    // ${marker}
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL
  });`,
      'la respuesta de avatar Astro',
    );
    writePreservingEol(files.avatarApi, original, next);
  } else {
    console.log('[GC Phase 2G] Avatar API Astro ya corregido.');
  }
}

// Avatar Express duplicate playerId.
{
  const original = fs.readFileSync(target(files.avatarServer), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    next = replaceRequired(
      next,
      `  return res.json({
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL,
    ...avatar,
  });`,
      `  return res.json({
    ...avatar,
    // ${marker}
    ok: true,
    authenticated: true,
    linked: Boolean(playerId),
    user: auth.user,
    playerId,
    defaultAvatarUrl: DEFAULT_PILOT_AVATAR_URL,
  });`,
      'la respuesta de avatar Express',
    );
    writePreservingEol(files.avatarServer, original, next);
  } else {
    console.log('[GC Phase 2G] Avatar API Express ya corregido.');
  }
}

console.log('');
console.log('[GC Phase 2G] Tipos de fichas públicas y residuales aplicados.');
console.log(`[GC Phase 2G] Backup: ${backupDir}`);
console.log(`[GC Phase 2G] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('No se modifican endpoints, respuestas funcionales, URLs, datos, SEO, avatares ni diseño.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
