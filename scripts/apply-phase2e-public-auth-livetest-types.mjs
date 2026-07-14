import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2e-public-auth-livetest-${stamp}`);
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
    console.log(`[GC Phase 2E] Sin cambios: ${relativePath}`);
    return;
  }

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file(relativePath), backupPath);
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
// 1) Último error residual de la home.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `aliases.forEach((alias) => exts.forEach((ext) => candidates.push(\`/images/tracks/\${encodeURIComponent(alias)}.\${ext}\`)));`,
    `aliases.forEach((alias: string) => exts.forEach((ext: string) => candidates.push(\`/images/tracks/\${encodeURIComponent(alias)}.\${ext}\`)));`
  );

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 2) Carreras de comunidad.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/carreras-comunidad.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `const body = document.getElementById('gcCommunityRacesBody');`,
    `const body = document.getElementById('gcCommunityRacesBody') as HTMLTableSectionElement;`
  );

  next = replaceAll(next, `function text(value, fallback = '')`, `function text(value: unknown, fallback = '')`);
  next = replaceAll(next, `function fmt(value)`, `function fmt(value: unknown)`);
  next = replaceAll(
    next,
    `const date = Date.parse(value || '');`,
    `const date = Date.parse(String(value || ''));`
  );
  next = replaceAll(next, `function escapeHtml(value)`, `function escapeHtml(value: unknown)`);
  next = replaceAll(
    next,
    `({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])`,
    `({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' } as Record<string, string>)[char] ?? char`
  );
  next = replaceAll(next, `function normalizeCommunityEventId(event)`, `function normalizeCommunityEventId(event: any)`);
  next = replaceAll(next, `function communityEventHref(event)`, `function communityEventHref(event: any)`);
  next = replaceAll(next, `.map((event) => ({ ...event, ratingEligible: false, sourceState: 'reviewed' }))`, `.map((event: any) => ({ ...event, ratingEligible: false, sourceState: 'reviewed' }))`);
  next = replaceAll(next, `.map((event) => ({ ...event, ratingEligible: false }))`, `.map((event: any) => ({ ...event, ratingEligible: false }))`);
  next = replaceAll(next, `events.map((event) => {`, `events.map((event: any) => {`);

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 3) Histórico ACSM.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/historico.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `const currentName = document.getElementById('gcArchiveCurrentName');
    const currentMeta = document.getElementById('gcArchiveCurrentMeta');
    const archiveList = document.getElementById('gcArchiveList');`,
    `const currentName = document.getElementById('gcArchiveCurrentName') as HTMLElement;
    const currentMeta = document.getElementById('gcArchiveCurrentMeta') as HTMLElement;
    const archiveList = document.getElementById('gcArchiveList') as HTMLElement;`
  );

  next = replaceAll(next, `function text(value, fallback = '')`, `function text(value: unknown, fallback = '')`);
  next = replaceAll(next, `function fmt(value)`, `function fmt(value: unknown)`);
  next = replaceAll(
    next,
    `const date = Date.parse(value || '');`,
    `const date = Date.parse(String(value || ''));`
  );
  next = replaceAll(next, `events.filter((event) =>`, `events.filter((event: any) =>`);

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 4) Login y registro.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/login.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceAll(
    next,
    `const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginMsg = document.getElementById('loginMsg');
    const regMsg = document.getElementById('regMsg');
    const post = async (url, data) => {`,
    `const loginForm = document.getElementById('loginForm') as HTMLFormElement;
    const registerForm = document.getElementById('registerForm') as HTMLFormElement;
    const loginMsg = document.getElementById('loginMsg') as HTMLElement;
    const regMsg = document.getElementById('regMsg') as HTMLElement;
    const post = async (url: string, data: Record<string, FormDataEntryValue>): Promise<any> => {`
  );

  next = replaceAll(
    next,
    `const setMessage = (target, text, ok = false) => {`,
    `const setMessage = (target: HTMLElement, text: string, ok = false) => {`
  );

  next = replaceAll(
    next,
    `const button = loginForm.querySelector('button');`,
    `const button = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]') as HTMLButtonElement;`
  );
  next = replaceAll(
    next,
    `const button = registerForm.querySelector('button');`,
    `const button = registerForm.querySelector<HTMLButtonElement>('button[type="submit"]') as HTMLButtonElement;`
  );

  next = replaceAll(
    next,
    `const payload = Object.fromEntries(new FormData(registerForm));
        payload.name = payload.displayName;`,
    `const payload: Record<string, FormDataEntryValue> = Object.fromEntries(new FormData(registerForm));
        payload.name = payload.displayName;`
  );

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 5) Recuperación de contraseña.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/recuperar-password.astro';
  const original = read(relativePath);
  let next = original;

  next = replaceRequired(
    next,
    `const $ = (id) => document.getElementById(id);`,
    `function $<T extends HTMLElement = HTMLElement>(id: string): T {
        return document.getElementById(id) as T;
      }`,
    'selector DOM de recuperación de contraseña'
  );

  const elementTypes = [
    [`const account = $('recoveryAccount');`, `const account = $<HTMLElement>('recoveryAccount');`],
    [`const message = $('recoveryMessage');`, `const message = $<HTMLElement>('recoveryMessage');`],
    [`const verifyButton = $('verifyToken');`, `const verifyButton = $<HTMLButtonElement>('verifyToken');`],
    [`const requestButton = $('requestRecovery');`, `const requestButton = $<HTMLButtonElement>('requestRecovery');`],
    [`const tokenInput = $('tokenInput');`, `const tokenInput = $<HTMLInputElement>('tokenInput');`],
    [`const emailInput = $('recoveryEmail');`, `const emailInput = $<HTMLInputElement>('recoveryEmail');`],
    [`const passwordPanel = $('passwordPanel');`, `const passwordPanel = $<HTMLElement>('passwordPanel');`],
    [`const button = $('savePassword');`, `const button = $<HTMLButtonElement>('savePassword');`],
    [`const newPassword = $('newPassword');`, `const newPassword = $<HTMLInputElement>('newPassword');`],
    [`const confirmPassword = $('confirmPassword');`, `const confirmPassword = $<HTMLInputElement>('confirmPassword');`]
  ];
  for (const [from, to] of elementTypes) next = replaceAll(next, from, to);

  next = replaceAll(next, `const extractToken = (value) => {`, `const extractToken = (value: unknown): string => {`);
  next = replaceAll(next, `const setMessage = (text, type = '') => {`, `const setMessage = (text: unknown, type = '') => {`);
  next = replaceAll(next, `const setBusy = (busy) => {`, `const setBusy = (busy: boolean) => {`);
  next = replaceAll(
    next,
    `[verifyButton, requestButton, button, tokenInput, emailInput, newPassword, confirmPassword].forEach((el) => {`,
    `([verifyButton, requestButton, button, tokenInput, emailInput, newPassword, confirmPassword] as Array<HTMLButtonElement | HTMLInputElement>).forEach((el) => {`
  );
  next = replaceAll(next, `if (el) el.disabled =`, `el.disabled =`);
  next = replaceAll(next, `const setFormEnabled = (enabled) => {`, `const setFormEnabled = (enabled: boolean) => {`);
  next = replaceAll(next, `const postJson = async (url, payload) => {`, `const postJson = async (url: string, payload: Record<string, unknown>): Promise<any> => {`);
  next = replaceAll(next, `const verify = async (value) => {`, `const verify = async (value: unknown = '') => {`);

  next = replaceAll(
    next,
    `setMessage(error.message || 'El enlace no es válido o ha caducado.', 'bad');`,
    `setMessage(error instanceof Error ? error.message : 'El enlace no es válido o ha caducado.', 'bad');`
  );
  next = replaceAll(
    next,
    `setMessage(error.message || 'No se pudo solicitar recuperación.', 'bad');`,
    `setMessage(error instanceof Error ? error.message : 'No se pudo solicitar recuperación.', 'bad');`
  );
  next = replaceAll(
    next,
    `setMessage(error.message || 'No se pudo actualizar la contraseña.', 'bad');`,
    `setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.', 'bad');`
  );

  next = replaceAll(
    next,
    `[tokenInput, emailInput, newPassword, confirmPassword].forEach((input) => input.addEventListener('keydown', (event) => {`,
    `[tokenInput, emailInput, newPassword, confirmPassword].forEach((input: HTMLInputElement) => input.addEventListener('keydown', (event: KeyboardEvent) => {`
  );

  save(relativePath, original, next);
}

// ---------------------------------------------------------------------------
// 6) Live test ACSM.
// ---------------------------------------------------------------------------
{
  const relativePath = 'src/pages/live-test.astro';
  const original = read(relativePath);
  let next = original;

  const oldStateStart = `const state = {
      server: 'main',
      eventSource: null,
      normalized: null,
      positions: {},
      dots: new Map(),
    };`;

  const newStateStart = `type LiveTestState = {
      server: string;
      eventSource: EventSource | null;
      normalized: any;
      positions: Record<string, any>;
      dots: Map<string, HTMLElement>;
      coordMode: string | null;
    };

    const state: LiveTestState = {
      server: 'main',
      eventSource: null,
      normalized: null,
      positions: {},
      dots: new Map<string, HTMLElement>(),
      coordMode: null,
    };`;

  next = replaceRequired(next, oldStateStart, newStateStart, 'estado de live-test');

  next = replaceAll(
    next,
    `const $ = (selector) => document.querySelector(selector);
    const mapImg = $('[data-live-map-img]');
    const dotsLayer = $('[data-live-dots]');`,
    `const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
    const mapImg = $<HTMLImageElement>('[data-live-map-img]');
    const dotsLayer = $<HTMLElement>('[data-live-dots]');`
  );

  next = replaceAll(next, `function text(selector, value)`, `function text(selector: string, value: unknown)`);
  next = replaceAll(next, `function escapeHtml(value)`, `function escapeHtml(value: unknown)`);
  next = replaceAll(
    next,
    `({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])`,
    `({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char] ?? char`
  );
  next = replaceAll(next, `function connect(server)`, `function connect(server: string)`);
  next = replaceAll(
    next,
    `state.eventSource = new EventSource(\`/api/gc/live-test/stream?server=\${encodeURIComponent(server)}\`);

      state.eventSource.addEventListener('snapshot', (event) => {`,
    `const eventSource = new EventSource(\`/api/gc/live-test/stream?server=\${encodeURIComponent(server)}\`);
      state.eventSource = eventSource;

      eventSource.addEventListener('snapshot', (event: MessageEvent<string>) => {`
  );
  next = replaceAll(next, `state.eventSource.addEventListener('status', (event) => {`, `eventSource.addEventListener('status', (event: MessageEvent<string>) => {`);
  next = replaceAll(next, `state.eventSource.addEventListener('position', (event) => {`, `eventSource.addEventListener('position', (event: MessageEvent<string>) => {`);
  next = replaceAll(next, `state.eventSource.onerror = () => {`, `eventSource.onerror = () => {`);

  const signatures = [
    [`function applySnapshot(payload)`, `function applySnapshot(payload: any)`],
    [`function renderDebug(payload)`, `function renderDebug(payload: any)`],
    [`function renderDrivers(drivers, carSlots)`, `function renderDrivers(drivers: any[], carSlots: any[])`],
    [`function renderSectors(sectors)`, `function renderSectors(sectors: any[])`],
    [`function renderStored(rows)`, `function renderStored(rows: any[])`],
    [`function projectPosition(position, mode)`, `function projectPosition(position: any, mode: string)`],
    [`function updateDot(position)`, `function updateDot(position: any)`]
  ];
  for (const [from, to] of signatures) next = replaceAll(next, from, to);

  next = replaceAll(
    next,
    `const transforms = {`,
    `const transforms: Record<string, [number, number, string?]> = {`
  );

  next = replaceAll(
    next,
    `const positions = Object.values(state.positions || {}).filter((item) => item?.pos);`,
    `const positions = (Object.values(state.positions || {}) as any[]).filter((item: any) => item?.pos);`
  );

  next = replaceAll(
    next,
    `const modes = ['acsm', 'acsmNoMargin', 'flipZ', 'flipX', 'flipBoth', 'swap', 'swapFlipZ', 'swapFlipX'];`,
    `const modes: string[] = ['acsm', 'acsmNoMargin', 'flipZ', 'flipX', 'flipBoth', 'swap', 'swapFlipZ', 'swapFlipX'];`
  );

  next = replaceAll(
    next,
    `const core = dot.querySelector('.gc-live-dot__core');
      const label = dot.querySelector('.gc-live-dot__label');`,
    `const core = dot.querySelector<HTMLElement>('.gc-live-dot__core');
      const label = dot.querySelector<HTMLElement>('.gc-live-dot__label');`
  );

  next = replaceAll(
    next,
    `document.querySelectorAll('[data-server]').forEach((button) => {`,
    `document.querySelectorAll<HTMLButtonElement>('[data-server]').forEach((button: HTMLButtonElement) => {`
  );
  next = replaceAll(
    next,
    `document.querySelectorAll('[data-server]').forEach((item) => item.classList.remove('is-active'));`,
    `document.querySelectorAll<HTMLButtonElement>('[data-server]').forEach((item: HTMLButtonElement) => item.classList.remove('is-active'));`
  );

  save(relativePath, original, next);
}

console.log('');
console.log('[GC Phase 2E] Páginas públicas, autenticación y live-test tipadas.');
console.log(`[GC Phase 2E] Backup: ${backupDir}`);
console.log(`[GC Phase 2E] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2E] Siguiente: npm run deps:baseline && npm run quality');
