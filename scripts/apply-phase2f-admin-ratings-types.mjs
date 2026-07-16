import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2f-admin-ratings-types-${stamp}`);
const adminRelative = 'src/pages/admin/ratings.astro';
const analyticsRelative = 'src/server/gc-analytics-routes.ts';
const adminMarker = 'GC_PHASE2F_ADMIN_RATINGS_TYPES_V1';
const analyticsMarker = 'GC_PHASE2F_ANALYTICS_SESSIONS_MAP_V1';
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

function writePreservingEol(relativePath, original, normalized) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const output = eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
  backup(relativePath);
  fs.writeFileSync(target(relativePath), output, 'utf8');
  changed.push(relativePath);
}

for (const relativePath of [adminRelative, analyticsRelative]) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}.`);
  }
}

{
  const original = fs.readFileSync(target(adminRelative), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(adminMarker)) {
    if (!next.includes('<AppLayout title="Admin ratings | GrassCutters">')
      || !next.includes("fetchJson('/api/gc/ratings/championship?refresh=1')")
      || !next.includes("data-process-session")) {
      throw new Error('admin/ratings.astro no coincide con la versión esperada.');
    }

    next = replaceRequired(
      next,
      '  <script>\n',
      `  <!-- ${adminMarker} -->\n  <script>\n`,
      'el script de admin/ratings',
    );

    next = replaceRequired(
      next,
      `    (() => {
      const $ = (id) => document.getElementById(id);`,
      `    (() => {
      type AnyRecord = Record<string, any>;

      type InventoryItem = AnyRecord & {
        kind: string;
        id: string;
        title: any;
        track: any;
        date: any;
        eventId: string;
        href?: string | null;
        sessionId?: any;
        meta?: any[];
        details?: any[];
        reason?: any;
        actionLabel?: string | null;
      };

      type InventoryExtras = {
        meta?: any[];
        details?: any[];
        actionLabel?: string | null;
      };

      type InventoryState = {
        items: InventoryItem[];
        filtered: InventoryItem[];
        query: string;
        filter: string;
        page: number;
        pageSize: number;
        lastAction: AnyRecord | null;
      };

      const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
        document.getElementById(id) as T;`,
      'la cabecera del script de admin/ratings',
    );

    next = replaceRequired(
      next,
      `      const els = {
        gate: $('adminGate'),
        content: $('adminContent'),
        syncMirror: $('syncStrackerSql'),
        viewMirrorDiagnostics: $('viewStrackerSqlDiagnostics'),
        retry: $('retryAdmin'),
        refresh: $('refreshRatings'),
        refreshSql: $('refreshRatingsSql'),
        simulateOfficialRecalc: $('simulateOfficialRecalc'),
        recalculateOfficialRecalc: $('recalculateOfficialRecalc'),
        state: $('ratingsState'),
        storage: $('ratingsStorage'),
        processed: $('ratingsProcessed'),
        pending: $('ratingsPending'),
        reviewed: $('ratingsReviewed'),
        ignored: $('ratingsIgnored'),
        lastCheck: $('ratingsLastCheck'),
        inventorySearch: $('inventorySearch'),
        inventoryFilter: $('inventoryFilter'),
        inventoryPageSize: $('inventoryPageSize'),
        inventoryPrev: $('inventoryPrev'),
        inventoryNext: $('inventoryNext'),
        inventoryPageInfo: $('inventoryPageInfo'),
        inventoryList: $('inventoryList'),
        actionLog: $('actionLog'),
        candidateSourceNotice: $('candidateSourceNotice'),
        detectedList: $('detectedList'),
        reviewedList: $('reviewedList'),
        ignoredList: $('ignoredList'),
        processedList: $('processedList'),
        diagnosticRows: $('diagnosticRows'),
        mirrorStatusRows: $('mirrorStatusRows'),
      };`,
      `      const els = {
        gate: $<HTMLElement>('adminGate'),
        content: $<HTMLElement>('adminContent'),
        syncMirror: $<HTMLButtonElement>('syncStrackerSql'),
        viewMirrorDiagnostics: $<HTMLAnchorElement>('viewStrackerSqlDiagnostics'),
        retry: $<HTMLButtonElement>('retryAdmin'),
        refresh: $<HTMLButtonElement>('refreshRatings'),
        refreshSql: $<HTMLButtonElement>('refreshRatingsSql'),
        simulateOfficialRecalc: $<HTMLButtonElement>('simulateOfficialRecalc'),
        recalculateOfficialRecalc: $<HTMLButtonElement>('recalculateOfficialRecalc'),
        state: $<HTMLElement>('ratingsState'),
        storage: $<HTMLElement>('ratingsStorage'),
        processed: $<HTMLElement>('ratingsProcessed'),
        pending: $<HTMLElement>('ratingsPending'),
        reviewed: $<HTMLElement>('ratingsReviewed'),
        ignored: $<HTMLElement>('ratingsIgnored'),
        lastCheck: $<HTMLElement>('ratingsLastCheck'),
        inventorySearch: $<HTMLInputElement>('inventorySearch'),
        inventoryFilter: $<HTMLSelectElement>('inventoryFilter'),
        inventoryPageSize: $<HTMLSelectElement>('inventoryPageSize'),
        inventoryPrev: $<HTMLButtonElement>('inventoryPrev'),
        inventoryNext: $<HTMLButtonElement>('inventoryNext'),
        inventoryPageInfo: $<HTMLElement>('inventoryPageInfo'),
        inventoryList: $<HTMLElement>('inventoryList'),
        actionLog: $<HTMLElement>('actionLog'),
        candidateSourceNotice: $<HTMLElement>('candidateSourceNotice'),
        detectedList: $<HTMLElement>('detectedList'),
        reviewedList: $<HTMLElement>('reviewedList'),
        ignoredList: $<HTMLElement>('ignoredList'),
        processedList: $<HTMLElement>('processedList'),
        diagnosticRows: $<HTMLElement>('diagnosticRows'),
        mirrorStatusRows: $<HTMLElement>('mirrorStatusRows'),
      };`,
      'el mapa DOM de admin/ratings',
    );

    next = replaceRequired(
      next,
      `      const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));`,
      `      const esc = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        "'":'&#39;',
        '"':'&quot;'
      } as Record<string, string>)[char] ?? char);`,
      'escape HTML de admin/ratings',
    );

    const replacements = [
      [
        `      const intValue = (value, fallback = 0) => {`,
        `      const intValue = (value: unknown, fallback = 0): number => {`,
        'intValue',
      ],
      [
        `      const hasValue = (value) => value !== null && value !== undefined && value !== '';`,
        `      const hasValue = (value: unknown): boolean => value !== null && value !== undefined && value !== '';`,
        'hasValue',
      ],
      [
        `      const formatInt = (value) => numberFmt.format(intValue(value));`,
        `      const formatInt = (value: unknown): string => numberFmt.format(intValue(value));`,
        'formatInt',
      ],
      [
        `      const fmtLap = (value, fallback = '') => {`,
        `      const fmtLap = (value: unknown, fallback = ''): string => {`,
        'fmtLap',
      ],
      [
        `      const fmtDate = (value, timeZone) => {`,
        `      const fmtDate = (value: unknown, timeZone: string): string => {`,
        'fmtDate',
      ],
      [
        `        const date = new Date(value);`,
        `        const date = new Date(value as any);`,
        'conversión de fecha',
      ],
      [
        `      const fmtServerDate = (value) => \`\${fmtDate(value, 'UTC')} UTC\`;`,
        `      const fmtServerDate = (value: unknown): string => \`\${fmtDate(value, 'UTC')} UTC\`;`,
        'fmtServerDate',
      ],
      [
        `      const fmtSpainDate = (value) => fmtDate(value, 'Europe/Madrid');`,
        `      const fmtSpainDate = (value: unknown): string => fmtDate(value, 'Europe/Madrid');`,
        'fmtSpainDate',
      ],
      [
        `      const inventoryState = {`,
        `      const inventoryState: InventoryState = {`,
        'tipo de inventoryState',
      ],
      [
        `      function show(mode) {`,
        `      function show(mode: 'gate' | 'content'): void {`,
        'show',
      ],
      [
        `      async function fetchJson(url, options = {}) {`,
        `      async function fetchJson(url: string, options: RequestInit = {}): Promise<AnyRecord> {`,
        'fetchJson',
      ],
      [
        `      async function isAdmin() {`,
        `      async function isAdmin(): Promise<AnyRecord | null> {`,
        'isAdmin',
      ],
      [
        `      function badge(label, tone = 'muted') {`,
        `      function badge(label: unknown, tone = 'muted'): string {`,
        'badge',
      ],
      [
        `      function badges(items) {`,
        `      function badges(items: any[]): string {`,
        'badges',
      ],
      [
        `      function infoGrid(items) {`,
        `      function infoGrid(items: Array<{ label: unknown; value: unknown }>): string {`,
        'infoGrid',
      ],
      [
        `      function sessionDetails(event) {`,
        `      function sessionDetails(event: AnyRecord): Array<{ label: string; value: string }> {`,
        'sessionDetails',
      ],
      [
        `      function processedTotals(event) {`,
        `      function processedTotals(event: AnyRecord): AnyRecord {`,
        'processedTotals',
      ],
      [
        `      function emptyCard(kicker, title, text) {`,
        `      function emptyCard(kicker: unknown, title: unknown, text: unknown): string {`,
        'emptyCard',
      ],
      [
        `      function inventoryDateValue(item) {`,
        `      function inventoryDateValue(item: AnyRecord): any {`,
        'inventoryDateValue',
      ],
      [
        `      function buildInventory(championship, candidates) {
        const items = [];`,
        `      function buildInventory(championship: AnyRecord, candidates: AnyRecord): InventoryItem[] {
        const items: InventoryItem[] = [];`,
        'buildInventory',
      ],
      [
        `        const pushSessionItem = (kind, event, extras = {}) => {`,
        `        const pushSessionItem = (kind: string, event: AnyRecord, extras: InventoryExtras = {}): void => {`,
        'pushSessionItem',
      ],
      [
        `      function inventoryMatches(item, query) {`,
        `      function inventoryMatches(item: InventoryItem, query: string): boolean {`,
        'inventoryMatches',
      ],
      [
        `      function inventoryFilterMatches(item, filter) {`,
        `      function inventoryFilterMatches(item: InventoryItem, filter: string): boolean {`,
        'inventoryFilterMatches',
      ],
      [
        `      function setActionLog(payload) {`,
        `      function setActionLog(payload: AnyRecord | null): void {`,
        'setActionLog',
      ],
      [
        `      function renderInventory(items) {`,
        `      function renderInventory(items: InventoryItem[]): void {`,
        'renderInventory',
      ],
      [
        `      function renderDetected(candidates) {`,
        `      function renderDetected(candidates: AnyRecord[]): void {`,
        'renderDetected',
      ],
      [
        `      function renderReviewed(events) {`,
        `      function renderReviewed(events: AnyRecord[]): void {`,
        'renderReviewed',
      ],
      [
        `      function renderIgnored(events) {`,
        `      function renderIgnored(events: AnyRecord[]): void {`,
        'renderIgnored',
      ],
      [
        `      function renderProcessed(events) {`,
        `      function renderProcessed(events: AnyRecord[]): void {`,
        'renderProcessed',
      ],
      [
        `      function renderDiagnostics(data) {`,
        `      function renderDiagnostics(data: AnyRecord): void {`,
        'renderDiagnostics',
      ],
      [
        `      function renderMirrorDiagnostics(data) {`,
        `      function renderMirrorDiagnostics(data: AnyRecord): void {`,
        'renderMirrorDiagnostics',
      ],
      [
        `      function renderCandidateSource(data) {`,
        `      function renderCandidateSource(data: AnyRecord): void {`,
        'renderCandidateSource',
      ],
      [
        `      async function load() {`,
        `      async function load(): Promise<void> {`,
        'load',
      ],
      [
        `      async function boot() {`,
        `      async function boot(): Promise<void> {`,
        'boot',
      ],
      [
        `        const ignoreButton = clicked?.closest('[data-ignore-session]');`,
        `        const ignoreButton = clicked?.closest('[data-ignore-session]') as HTMLButtonElement | null;`,
        'ignoreButton',
      ],
      [
        `        const unignoreButton = clicked?.closest('[data-unignore-session]');`,
        `        const unignoreButton = clicked?.closest('[data-unignore-session]') as HTMLButtonElement | null;`,
        'unignoreButton',
      ],
      [
        `        const unreviewButton = clicked?.closest('[data-unreview-session]');`,
        `        const unreviewButton = clicked?.closest('[data-unreview-session]') as HTMLButtonElement | null;`,
        'unreviewButton',
      ],
      [
        `        const removeButton = clicked?.closest('[data-remove-stracker]');`,
        `        const removeButton = clicked?.closest('[data-remove-stracker]') as HTMLButtonElement | null;`,
        'removeButton',
      ],
      [
        `        const button = clicked?.closest('[data-process-session]');`,
        `        const button = clicked?.closest('[data-process-session]') as HTMLButtonElement | null;`,
        'process button',
      ],
    ];

    for (const [from, to, label] of replacements) {
      next = replaceRequired(next, from, to, label);
    }

    writePreservingEol(adminRelative, original, next);
  } else {
    console.log('[GC Phase 2F] Tipos de admin/ratings ya aplicados.');
  }
}

{
  const original = fs.readFileSync(target(analyticsRelative), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(analyticsMarker)) {
    next = replaceRequired(
      next,
      `  const sessions = new Map((sessionRows || []).map((row: any) => [String(row.user_hash), toCount(row.sessions)]));`,
      `  // ${analyticsMarker}
  const sessions = new Map<string, number>(
    (sessionRows || []).map((row: any): [string, number] => [
      String(row.user_hash),
      toCount(row.sessions),
    ]),
  );`,
      'el mapa de sesiones de analítica',
    );

    writePreservingEol(analyticsRelative, original, next);
  } else {
    console.log('[GC Phase 2F] Residual de sesiones analíticas ya corregido.');
  }
}

console.log('');
console.log('[GC Phase 2F] Admin ratings tipado y residual analítico corregido.');
console.log(`[GC Phase 2F] Backup: ${backupDir}`);
console.log(`[GC Phase 2F] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('No se modifican endpoints, acciones, filtros, paginación, ACSM, sTracker ni SR/GSR.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
