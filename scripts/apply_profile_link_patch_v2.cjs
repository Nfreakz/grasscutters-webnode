#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const profilePath = path.join(root, 'src', 'pages', 'perfil.astro');

function die(message) {
  console.error('[GC PERFIL LINK V2] ' + message);
  process.exit(1);
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${file}.backup-profile-link-v2-${stamp}`;
  fs.copyFileSync(file, backupPath);
  return backupPath;
}

if (!fs.existsSync(profilePath)) {
  die('No encuentro src/pages/perfil.astro. Ejecuta este script desde la raíz del proyecto.');
}

let source = fs.readFileSync(profilePath, 'utf8');
const marker = 'gc-profile-link-v2';

if (source.includes(marker)) {
  console.log('[GC PERFIL LINK V2] El bloque visible de vinculación ya existe en perfil.');
  process.exit(0);
}

const block = String.raw`
    <section class="gc-section gc-profile-link-v2" id="profilePilotLinkCard">
      <div class="gc-section-head">
        <h2>Vincular cuenta de piloto</h2>
        <p>Gestiona el vínculo entre tu usuario y tu piloto real de stracker</p>
      </div>

      <div class="gc-profile-link-v2__layout">
        <article class="gc-slab gc-profile-link-v2__status">
          <h3>Estado del vínculo</h3>
          <div class="gc-slab-list" id="pilotLinkV2Status">
            <div><span>Cuenta</span><strong>Cargando</strong></div>
            <div><span>Piloto</span><strong>...</strong></div>
          </div>
          <p class="gc-note" id="pilotLinkV2Help">Desde aquí puedes conectar tu usuario con tu piloto de stracker.</p>
        </article>

        <article class="gc-slab gc-profile-link-v2__form">
          <h3>Seleccionar piloto</h3>
          <p class="gc-note">Busca tu nombre, Player ID o Steam GUID. Si el piloto ya está vinculado a otra cuenta, el servidor bloqueará el guardado.</p>

          <div class="gc-profile-link-v2__fields">
            <label class="gc-field">
              <span>Buscar piloto</span>
              <input class="gc-input" id="pilotLinkV2Search" type="search" placeholder="Nombre, Player ID o Steam GUID" autocomplete="off" />
            </label>
            <label class="gc-field">
              <span>Piloto stracker</span>
              <select class="gc-select" id="pilotLinkV2Select">
                <option value="">Cargando pilotos...</option>
              </select>
            </label>
          </div>

          <div class="gc-profile-link-v2__preview" id="pilotLinkV2Preview">Selecciona un piloto para ver el resumen.</div>

          <div class="gc-actions gc-profile-link-v2__actions">
            <button class="gc-btn gc-btn--primary" id="pilotLinkV2Save" type="button">Guardar vínculo</button>
            <button class="gc-btn" id="pilotLinkV2Reload" type="button">Recargar pilotos</button>
            <button class="gc-btn" id="pilotLinkV2Unlink" type="button" hidden>Desvincular piloto</button>
          </div>
          <p class="gc-message" id="pilotLinkV2Message"></p>
        </article>
      </div>
    </section>
`;

const style = String.raw`
  <style is:global>
    .gc-profile-link-v2{border-top:2px solid var(--accent);padding-top:18px}
    .gc-profile-link-v2__layout{display:grid;grid-template-columns:minmax(260px,.42fr) minmax(0,1fr);gap:22px;align-items:start}
    .gc-profile-link-v2 .gc-slab{padding:18px;background:rgba(255,255,255,.012);border-bottom:1px solid var(--line2)}
    .gc-profile-link-v2 .gc-slab h3{margin:0 0 12px;text-transform:uppercase;letter-spacing:-.035em;font-size:1.08rem}
    .gc-profile-link-v2__fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
    .gc-profile-link-v2__preview{min-height:96px;margin-top:14px;padding:14px;border:1px solid var(--line);background:rgba(255,255,255,.018);color:var(--soft)}
    .gc-profile-link-v2__preview strong{display:block;color:var(--text);font-size:1.18rem;line-height:1.1}
    .gc-profile-link-v2__preview span{display:block;color:var(--dim);font-size:.86rem;margin-top:4px}
    .gc-profile-link-v2__preview .gc-chip{margin-top:8px}
    .gc-profile-link-v2__actions{margin-top:14px}
    .gc-profile-link-v2__actions .gc-btn[hidden]{display:none!important}
    @media(max-width:960px){.gc-profile-link-v2__layout,.gc-profile-link-v2__fields{grid-template-columns:1fr}}
    @media(max-width:620px){.gc-profile-link-v2__actions .gc-btn{width:100%}}
  </style>
`;

const script = String.raw`
  <script is:inline>
    (() => {
      const $ = (id) => document.getElementById(id);
      const els = {
        card: $('profilePilotLinkCard'),
        status: $('pilotLinkV2Status'),
        help: $('pilotLinkV2Help'),
        search: $('pilotLinkV2Search'),
        select: $('pilotLinkV2Select'),
        preview: $('pilotLinkV2Preview'),
        save: $('pilotLinkV2Save'),
        reload: $('pilotLinkV2Reload'),
        unlink: $('pilotLinkV2Unlink'),
        message: $('pilotLinkV2Message')
      };
      if (!els.card) return;

      let profile = null;
      let pilots = [];

      const escapeHtml = (value) => String(value ?? '-').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
      const clean = (value, fallback = '-') => {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'object') return clean(value.displayName ?? value.visibleName ?? value.cleanName ?? value.display_name ?? value.uiName ?? value.name ?? value.Name ?? value.driverName ?? value.playerName ?? value.code, fallback);
        return String(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
      };
      const normalize = (value) => clean(value, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const get = (source, path) => String(path).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
      const first = (source, paths) => {
        for (const path of paths) {
          const value = get(source, path);
          if (value !== undefined && value !== null && value !== '') return value;
        }
        return '';
      };
      const pilotId = (pilot) => first(pilot, ['id','playerId','PlayerId','driverId','driver.id','driver.playerId']);
      const pilotGuid = (pilot) => String(first(pilot, ['steamGuid','SteamGuid','steam_guid','driver.steamGuid']) || '').trim();
      const pilotName = (pilot) => clean(first(pilot, ['displayName','visibleName','cleanName','name','Name','driverName','playerName','strackerName','driver.name','driver.displayName']), 'Piloto');
      const fmtMs = (ms) => {
        const n = Number(ms);
        if (!Number.isFinite(n) || n <= 0) return '--';
        const m = Math.floor(n / 60000);
        const s = Math.floor((n % 60000) / 1000);
        const x = String(Math.floor(n % 1000)).padStart(3, '0');
        return `${m}:${String(s).padStart(2, '0')}.${x}`;
      };
      const bestLap = (pilot) => clean(first(pilot, ['bestLap','bestLapTime','lapTime','bestLapFormatted']), '') || fmtMs(first(pilot, ['bestLapMs','bestLapTimeMs','lapTimeMs']));
      const setMessage = (text, tone = '') => {
        if (!els.message) return;
        els.message.textContent = text || '';
        els.message.style.color = tone === 'error' ? 'var(--danger)' : tone === 'ok' ? 'var(--accent)' : 'var(--soft)';
      };
      const setBusy = (busy) => {
        [els.search, els.select, els.save, els.reload, els.unlink].forEach((el) => { if (el) el.disabled = Boolean(busy); });
      };

      function renderStatus() {
        const user = profile?.user || {};
        const linked = Boolean(profile?.linked || profile?.pilotLink);
        const linkedPilot = profile?.pilot || profile?.pilotLink || {};
        const playerId = linkedPilot.id || profile?.pilotLink?.playerId || profile?.linkedPlayerId || '-';
        const name = linked ? pilotName(linkedPilot) : 'Sin piloto vinculado';
        if (els.status) {
          els.status.innerHTML = [
            `<div><span>Cuenta</span><strong>${escapeHtml(clean(user.displayName || user.email, 'Sesión activa'))}</strong></div>`,
            `<div><span>Estado</span><strong>${linked ? 'Vinculado' : 'Pendiente'}</strong></div>`,
            `<div><span>Piloto</span><strong>${escapeHtml(name)}</strong></div>`,
            `<div><span>Player ID</span><strong>${escapeHtml(playerId)}</strong></div>`
          ].join('');
        }
        if (els.help) els.help.textContent = linked ? 'Puedes cambiar el vínculo o desvincular el piloto actual.' : 'Selecciona tu piloto real y guarda el vínculo.';
        if (els.unlink) els.unlink.hidden = !linked;
      }

      function filteredPilots() {
        const query = normalize(els.search?.value || '');
        return pilots.filter((pilot) => {
          const haystack = normalize([pilotName(pilot), pilotId(pilot), pilotGuid(pilot)].join(' '));
          return !query || haystack.includes(query);
        }).slice(0, 250);
      }

      function renderSelect() {
        if (!els.select) return;
        const rows = filteredPilots();
        if (!rows.length) {
          els.select.innerHTML = '<option value="">Sin pilotos con ese filtro</option>';
          renderPreview();
          return;
        }
        els.select.innerHTML = rows.map((pilot) => {
          const id = pilotId(pilot);
          const laps = Number(first(pilot, ['totalLaps','laps','lapCount']) || 0);
          const valid = Number(first(pilot, ['validLaps','cleanLaps']) || 0);
          const label = `${pilotName(pilot)} · ID ${id}${laps ? ` · ${laps} vueltas` : ''}${valid ? ` · ${valid} válidas` : ''}`;
          return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
        }).join('');
        renderPreview();
      }

      function selectedPilot() {
        const id = String(els.select?.value || '');
        return pilots.find((pilot) => String(pilotId(pilot)) === id) || null;
      }

      function renderPreview() {
        if (!els.preview) return;
        const pilot = selectedPilot();
        if (!pilot) {
          els.preview.textContent = 'Selecciona un piloto para ver el resumen.';
          return;
        }
        const guid = pilotGuid(pilot);
        const shortGuid = guid ? `${guid.slice(0, 16)}...${guid.slice(-8)}` : '-';
        els.preview.innerHTML = [
          `<strong>${escapeHtml(pilotName(pilot))}</strong>`,
          `<span>Player ID: ${escapeHtml(pilotId(pilot))}</span>`,
          `<span>Vueltas: ${escapeHtml(first(pilot, ['totalLaps','laps','lapCount']) || 0)} · Válidas: ${escapeHtml(first(pilot, ['validLaps','cleanLaps']) || 0)}</span>`,
          `<span>Mejor vuelta: ${escapeHtml(bestLap(pilot))}</span>`,
          `<span title="${escapeHtml(guid)}">Steam GUID: ${escapeHtml(shortGuid)}</span>`
        ].join('');
      }

      async function loadProfile() {
        const response = await fetch('/api/profile', { credentials:'include', cache:'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.authenticated === false) {
          if (els.status) els.status.innerHTML = '<div><span>Cuenta</span><strong>Sin login</strong></div><div><span>Acción</span><strong>Entra para vincular</strong></div>';
          if (els.help) els.help.innerHTML = 'Inicia sesión para poder vincular tu cuenta con un piloto.';
          [els.search, els.select, els.save, els.reload, els.unlink].forEach((el) => { if (el) el.disabled = true; });
          setMessage('Necesitas iniciar sesión para vincular piloto.', 'error');
          return;
        }
        profile = data;
        renderStatus();
      }

      async function loadPilots(force = false) {
        if (pilots.length && !force) {
          renderSelect();
          return;
        }
        setBusy(true);
        setMessage('Cargando pilotos de stracker...');
        const response = await fetch('/api/pilots?limit=700', { credentials:'include', cache:'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.ok === false) throw new Error(data?.message || 'No se pudieron cargar los pilotos.');
        pilots = Array.isArray(data?.items) ? data.items : Array.isArray(data?.pilots) ? data.pilots : [];
        renderSelect();
        setMessage(pilots.length ? `${pilots.length} pilotos disponibles.` : 'No hay pilotos disponibles en stracker.', pilots.length ? 'ok' : '');
        setBusy(false);
      }

      async function saveLink() {
        const playerId = String(els.select?.value || '').trim();
        if (!playerId) {
          setMessage('Selecciona un piloto antes de guardar.', 'error');
          return;
        }
        setBusy(true);
        setMessage('Guardando vínculo...');
        try {
          const response = await fetch('/api/auth/link-pilot', {
            method:'POST', credentials:'include', cache:'no-store',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ playerId })
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.ok === false) throw new Error(data?.message || 'No se pudo guardar el vínculo.');
          setMessage('Piloto vinculado correctamente. Recargando perfil...', 'ok');
          window.setTimeout(() => window.location.reload(), 700);
        } catch (error) {
          setMessage(error.message || 'No se pudo guardar el vínculo.', 'error');
          setBusy(false);
        }
      }

      async function unlinkPilot() {
        if (!window.confirm('¿Desvincular este piloto de tu cuenta?')) return;
        setBusy(true);
        setMessage('Desvinculando piloto...');
        try {
          const response = await fetch('/api/auth/unlink-pilot', { method:'POST', credentials:'include', cache:'no-store' });
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.ok === false) throw new Error(data?.message || 'No se pudo desvincular el piloto.');
          setMessage('Piloto desvinculado. Recargando perfil...', 'ok');
          window.setTimeout(() => window.location.reload(), 700);
        } catch (error) {
          setMessage(error.message || 'No se pudo desvincular el piloto.', 'error');
          setBusy(false);
        }
      }

      els.search?.addEventListener('input', renderSelect);
      els.select?.addEventListener('change', renderPreview);
      els.reload?.addEventListener('click', () => loadPilots(true).catch((error) => { setMessage(error.message, 'error'); setBusy(false); }));
      els.save?.addEventListener('click', saveLink);
      els.unlink?.addEventListener('click', unlinkPilot);

      Promise.all([loadProfile(), loadPilots()]).catch((error) => {
        setMessage(error.message || 'No se pudo preparar la vinculación.', 'error');
        setBusy(false);
      });
    })();
  </script>
`;

const insertionMarker = '    <section class="gc-grid-2">\n      <div class="gc-section"><div class="gc-section-head"><h2>Mejores combos</h2>';
let inserted = false;
if (source.includes(insertionMarker)) {
  source = source.replace(insertionMarker, block + '\n' + insertionMarker);
  inserted = true;
}

if (!inserted) {
  const scriptMarker = '  <script is:inline>';
  if (!source.includes(scriptMarker)) die('No encuentro dónde insertar el bloque de vinculación en perfil.');
  source = source.replace(scriptMarker, block + '\n' + scriptMarker);
}

const firstScriptMarker = '  <script is:inline>';
if (!source.includes(firstScriptMarker)) die('No encuentro el marcador de script para insertar estilos.');
source = source.replace(firstScriptMarker, style + '\n' + firstScriptMarker);

if (!source.includes('</AppLayout>')) die('No encuentro cierre </AppLayout>.');
source = source.replace('</AppLayout>', script + '\n</AppLayout>');

const backupPath = backup(profilePath);
fs.writeFileSync(profilePath, source, 'utf8');
console.log('[GC PERFIL LINK V2] Bloque visible de vinculación añadido a /perfil.');
console.log('[GC PERFIL LINK V2] Backup: ' + path.relative(root, backupPath));
console.log('[GC PERFIL LINK V2] Busca en perfil.astro: gc-profile-link-v2');
