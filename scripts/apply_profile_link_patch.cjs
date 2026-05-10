#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const profilePath = path.join(root, 'src', 'pages', 'perfil.astro');

function fail(message) {
  console.error('[GC PROFILE LINK PATCH] ' + message);
  process.exit(1);
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${file}.backup-profile-link-${stamp}`;
  fs.copyFileSync(file, backupPath);
  return backupPath;
}

if (!fs.existsSync(profilePath)) fail('No encuentro src/pages/perfil.astro. Ejecuta este script desde la raíz del proyecto.');

let source = fs.readFileSync(profilePath, 'utf8');
if (source.includes('gc-profile-link-card-v1')) {
  console.log('[GC PROFILE LINK PATCH] La página perfil ya tiene el panel de vinculación. No se aplican cambios.');
  process.exit(0);
}

const oldAside = '<aside class="gc-section"><div class="gc-section-head"><h2>Piloto vinculado</h2><p>Cuenta y vínculo stracker</p></div><div class="gc-slab" id="linkedPilot">Cargando...</div><div class="gc-actions"><a class="gc-btn" href="/login">Cambiar cuenta</a><a class="gc-btn" id="publicProfileAction" href="/pilotos" hidden>Perfil público</a><a class="gc-btn gc-btn--primary" href="/hotlaps">Ver hotlaps</a></div></aside>';
const newAside = [
'      <aside class="gc-section gc-profile-link-card-v1">',
'        <div class="gc-section-head">',
'          <h2>Piloto vinculado</h2>',
'          <p>Cuenta y vínculo stracker</p>',
'        </div>',
'        <div class="gc-slab" id="linkedPilot">Cargando...</div>',
'        <div class="gc-actions gc-profile-link-actions">',
'          <button class="gc-btn gc-btn--primary" id="openPilotLink" type="button" hidden>Vincular piloto</button>',
'          <button class="gc-btn" id="unlinkPilotAction" type="button" hidden>Desvincular piloto</button>',
'          <a class="gc-btn" href="/login">Cambiar cuenta</a>',
'          <a class="gc-btn" id="publicProfileAction" href="/pilotos" hidden>Perfil público</a>',
'          <a class="gc-btn gc-btn--primary" href="/hotlaps">Ver hotlaps</a>',
'        </div>',
'        <div class="gc-slab gc-profile-link-panel" id="pilotLinkPanel" hidden>',
'          <h3>Vincular cuenta con piloto</h3>',
'          <p>Busca tu piloto real de stracker y guarda el vínculo. Si ya está vinculado a otra cuenta, la API lo bloqueará.</p>',
'          <label class="gc-field gc-profile-link-search">',
'            <span>Buscar piloto</span>',
'            <input class="gc-input" id="pilotLinkSearch" type="search" placeholder="Nombre, Player ID o Steam GUID" autocomplete="off" />',
'          </label>',
'          <label class="gc-field">',
'            <span>Piloto stracker</span>',
'            <select class="gc-select" id="pilotLinkSelect"><option value="">Cargando pilotos...</option></select>',
'          </label>',
'          <div class="gc-profile-link-preview" id="pilotLinkPreview">Selecciona un piloto para ver el resumen.</div>',
'          <div class="gc-actions">',
'            <button class="gc-btn gc-btn--primary" id="confirmPilotLink" type="button">Guardar vínculo</button>',
'            <button class="gc-btn" id="cancelPilotLink" type="button">Cancelar</button>',
'          </div>',
'          <p class="gc-message" id="pilotLinkMessage"></p>',
'        </div>',
'      </aside>'
].join('\n');

if (!source.includes(oldAside)) fail('No he encontrado el bloque antiguo de Piloto vinculado. El archivo puede haber cambiado.');
source = source.replace(oldAside, newAside);

const styleMarker = '  <script is:inline>\n';
const linkStyles = [
'  <style is:global>',
'    .gc-profile-link-card-v1{display:grid;gap:14px}',
'    .gc-profile-link-panel{margin-top:12px;padding:16px 0}',
'    .gc-profile-link-panel[hidden]{display:none!important}',
'    .gc-profile-link-panel h3{margin:0 0 8px;text-transform:uppercase;letter-spacing:-.035em;font-size:1.05rem}',
'    .gc-profile-link-panel p{margin:0 0 12px;color:var(--soft)}',
'    .gc-profile-link-search{margin-bottom:10px}',
'    .gc-profile-link-preview{min-height:82px;margin-top:12px;padding:12px;border:1px solid var(--line);background:rgba(255,255,255,.018);color:var(--soft)}',
'    .gc-profile-link-preview strong{display:block;color:var(--text);font-size:1.08rem}',
'    .gc-profile-link-preview span{display:block;color:var(--dim);font-size:.82rem;margin-top:4px}',
'    .gc-profile-link-actions{align-items:center}',
'    @media(max-width:720px){.gc-profile-link-actions .gc-btn{width:100%}}',
'  </style>',
'',
].join('\n');
if (!source.includes(styleMarker)) fail('No he encontrado el marcador del script de perfil.');
source = source.replace(styleMarker, linkStyles + styleMarker);

const helperMarker = '      function renderUnauthenticated(data) {';
const helpers = [
'      const linkUi = {',
"        panel: $('pilotLinkPanel'),",
"        open: $('openPilotLink'),",
"        cancel: $('cancelPilotLink'),",
"        confirm: $('confirmPilotLink'),",
"        unlink: $('unlinkPilotAction'),",
"        search: $('pilotLinkSearch'),",
"        select: $('pilotLinkSelect'),",
"        preview: $('pilotLinkPreview'),",
"        message: $('pilotLinkMessage')",
'      };',
'      let pilotCandidates = [];',
'      let currentProfileData = null;',
"      const normalizeSearch = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();",
"      const candidateName = (pilot) => cleanName(pilot.displayName ?? pilot.visibleName ?? pilot.cleanName ?? pilot.name ?? pilot.driverName ?? pilot.playerName, 'Piloto');",
"      const candidateId = (pilot) => pilot.id ?? pilot.playerId ?? pilot.PlayerId ?? pilot.driverId ?? '';",
"      const candidateGuid = (pilot) => String(pilot.steamGuid ?? pilot.SteamGuid ?? '').trim();",
'      const setLinkMessage = (text, tone = "") => { if (!linkUi.message) return; linkUi.message.textContent = text || ""; linkUi.message.style.color = tone === "error" ? "var(--danger)" : tone === "ok" ? "var(--accent)" : "var(--soft)"; };',
'      function setLinkBusy(isBusy) {',
'        [linkUi.open, linkUi.cancel, linkUi.confirm, linkUi.unlink, linkUi.search, linkUi.select].forEach((el) => { if (el) el.disabled = Boolean(isBusy); });',
'      }',
'      function updatePilotLinkControls(data) {',
'        currentProfileData = data || null;',
'        const linked = Boolean(data?.linked);',
'        if (linkUi.open) { linkUi.open.hidden = false; linkUi.open.textContent = linked ? "Cambiar piloto" : "Vincular piloto"; }',
'        if (linkUi.unlink) linkUi.unlink.hidden = !linked;',
'        if (linkUi.panel) linkUi.panel.hidden = true;',
'        setLinkMessage("");',
'      }',
'      function renderPilotCandidates() {',
'        if (!linkUi.select) return;',
'        const query = normalizeSearch(linkUi.search?.value || "");',
'        const filtered = pilotCandidates.filter((pilot) => {',
'          const haystack = normalizeSearch([candidateName(pilot), candidateId(pilot), candidateGuid(pilot)].join(" "));',
'          return !query || haystack.includes(query);',
'        }).slice(0, 150);',
'        if (!filtered.length) {',
'          linkUi.select.innerHTML = "<option value=\"\">Sin pilotos con ese filtro</option>";',
'          renderPilotPreview();',
'          return;',
'        }',
'        linkUi.select.innerHTML = filtered.map((pilot) => {',
'          const id = candidateId(pilot);',
'          const laps = Number(pilot.totalLaps ?? pilot.laps ?? 0);',
'          const label = candidateName(pilot) + " · ID " + id + (laps ? " · " + laps + " vueltas" : "");',
'          return "<option value=\"" + escapeHtml(id) + "\">" + escapeHtml(label) + "</option>";',
'        }).join("");',
'        renderPilotPreview();',
'      }',
'      function selectedPilot() {',
'        const id = String(linkUi.select?.value || "");',
'        return pilotCandidates.find((pilot) => String(candidateId(pilot)) === id) || null;',
'      }',
'      function renderPilotPreview() {',
'        if (!linkUi.preview) return;',
'        const pilot = selectedPilot();',
'        if (!pilot) { linkUi.preview.textContent = "Selecciona un piloto para ver el resumen."; return; }',
'        const guid = candidateGuid(pilot);',
'        const shortGuid = guid ? guid.slice(0, 16) + "..." + guid.slice(-8) : "-";',
'        linkUi.preview.innerHTML =',
'          "<strong>" + escapeHtml(candidateName(pilot)) + "</strong>" +',
'          "<span>Player ID: " + escapeHtml(candidateId(pilot)) + "</span>" +',
'          "<span>Vueltas: " + escapeHtml(pilot.totalLaps ?? pilot.laps ?? 0) + " · Válidas: " + escapeHtml(pilot.validLaps ?? 0) + "</span>" +',
'          "<span>Mejor vuelta: " + escapeHtml(pilot.bestLap || fmtMs(pilot.bestLapMs)) + "</span>" +',
'          "<span title=\"" + escapeHtml(guid) + "\">Steam GUID: " + escapeHtml(shortGuid) + "</span>";',
'      }',
'      async function loadPilotCandidates() {',
'        if (pilotCandidates.length) { renderPilotCandidates(); return; }',
'        if (linkUi.select) linkUi.select.innerHTML = "<option value=\"\">Cargando pilotos...</option>";',
'        setLinkMessage("Cargando pilotos de stracker...");',
'        const response = await fetch("/api/pilots?limit=500", { credentials:"include", cache:"no-store" });',
'        const data = await response.json().catch(() => null);',
'        if (!response.ok || !data?.ok) throw new Error(data?.message || "No se pudieron cargar los pilotos.");',
'        pilotCandidates = Array.isArray(data.items) ? data.items : Array.isArray(data.pilots) ? data.pilots : [];',
'        renderPilotCandidates();',
'        setLinkMessage(pilotCandidates.length ? "Selecciona tu piloto y guarda el vínculo." : "No hay pilotos disponibles en stracker.");',
'      }',
'      async function openPilotPanel() {',
'        if (!linkUi.panel) return;',
'        linkUi.panel.hidden = !linkUi.panel.hidden;',
'        if (!linkUi.panel.hidden) {',
'          try { await loadPilotCandidates(); }',
'          catch (error) { setLinkMessage(error.message || "No se pudieron cargar los pilotos.", "error"); }',
'        }',
'      }',
'      async function savePilotLink() {',
'        const playerId = String(linkUi.select?.value || "").trim();',
'        if (!playerId) { setLinkMessage("Selecciona un piloto antes de guardar.", "error"); return; }',
'        setLinkBusy(true);',
'        setLinkMessage("Guardando vínculo...");',
'        try {',
'          const response = await fetch("/api/auth/link-pilot", {',
'            method:"POST", credentials:"include", cache:"no-store",',
'            headers:{ "Content-Type":"application/json" },',
'            body: JSON.stringify({ playerId })',
'          });',
'          const data = await response.json().catch(() => null);',
'          if (!response.ok || !data?.ok) throw new Error(data?.message || "No se pudo vincular el piloto.");',
'          setLinkMessage("Piloto vinculado correctamente. Recargando perfil...", "ok");',
'          window.setTimeout(() => window.location.reload(), 650);',
'        } catch (error) {',
'          setLinkMessage(error.message || "No se pudo vincular el piloto.", "error");',
'          setLinkBusy(false);',
'        }',
'      }',
'      async function unlinkPilot() {',
'        if (!currentProfileData?.linked) return;',
'        if (!window.confirm("¿Desvincular este piloto de tu cuenta?")) return;',
'        setLinkBusy(true);',
'        setLinkMessage("Desvinculando piloto...");',
'        try {',
'          const response = await fetch("/api/auth/unlink-pilot", { method:"POST", credentials:"include", cache:"no-store" });',
'          const data = await response.json().catch(() => null);',
'          if (!response.ok || !data?.ok) throw new Error(data?.message || "No se pudo desvincular el piloto.");',
'          setLinkMessage("Piloto desvinculado. Recargando perfil...", "ok");',
'          window.setTimeout(() => window.location.reload(), 650);',
'        } catch (error) {',
'          setLinkMessage(error.message || "No se pudo desvincular el piloto.", "error");',
'          setLinkBusy(false);',
'        }',
'      }',
'      linkUi.open?.addEventListener("click", openPilotPanel);',
'      linkUi.cancel?.addEventListener("click", () => { if (linkUi.panel) linkUi.panel.hidden = true; setLinkMessage(""); });',
'      linkUi.confirm?.addEventListener("click", savePilotLink);',
'      linkUi.unlink?.addEventListener("click", unlinkPilot);',
'      linkUi.search?.addEventListener("input", renderPilotCandidates);',
'      linkUi.select?.addEventListener("change", renderPilotPreview);',
''
].join('\n');
if (!source.includes(helperMarker)) fail('No he encontrado el punto de inserción de helpers.');
source = source.replace(helperMarker, helpers + helperMarker);

const renderProfileMarker = '        const summary = data.summary || {}; const user = data.user || {}; const pilot = data.pilot || {};';
const renderProfileReplacement = renderProfileMarker + '\n        updatePilotLinkControls(data);';
if (!source.includes(renderProfileMarker)) fail('No he encontrado el inicio de renderProfile.');
source = source.replace(renderProfileMarker, renderProfileReplacement);

const unauthMarker = "function renderUnauthenticated(data) { $('accountState').textContent='Sin login';";
if (source.includes(unauthMarker)) {
  source = source.replace(unauthMarker, "function renderUnauthenticated(data) { if (linkUi.open) linkUi.open.hidden = true; if (linkUi.unlink) linkUi.unlink.hidden = true; if (linkUi.panel) linkUi.panel.hidden = true; $('accountState').textContent='Sin login';");
}

const backupPath = backup(profilePath);
fs.writeFileSync(profilePath, source, 'utf8');
console.log('[GC PROFILE LINK PATCH] Perfil actualizado correctamente.');
console.log('[GC PROFILE LINK PATCH] Backup: ' + path.relative(root, backupPath));
