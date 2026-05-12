(() => {
  const USERS_TABLE = '#usersTable tbody';
  const UNLINKED_API = '/api/admin/unlinked-pilots';

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[c]));
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function ensureStyles() {
    if (document.getElementById('gc-user-link-style')) return;
    const style = document.createElement('style');
    style.id = 'gc-user-link-style';
    style.textContent = `
      .gc-link-pilot-modal{
        position:fixed;
        inset:0;
        z-index:9999;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.72);
        padding:20px;
      }
      .gc-link-pilot-panel{
        width:min(920px,100%);
        max-height:min(760px,90vh);
        overflow:auto;
        border:1px solid var(--line, rgba(255,255,255,.14));
        background:var(--panel, #101713);
        color:var(--text, #f1f6f0);
        box-shadow:0 24px 80px rgba(0,0,0,.45);
      }
      .gc-link-pilot-head{
        position:sticky;
        top:0;
        z-index:2;
        display:grid;
        gap:12px;
        padding:16px;
        border-bottom:1px solid var(--line, rgba(255,255,255,.14));
        background:var(--panel, #101713);
      }
      .gc-link-pilot-head-row{
        display:flex;
        gap:12px;
        justify-content:space-between;
        align-items:center;
      }
      .gc-link-pilot-head h3{margin:0}
      .gc-link-pilot-head input{
        width:100%;
        min-height:40px;
        border:1px solid var(--line, rgba(255,255,255,.14));
        background:rgba(0,0,0,.25);
        color:var(--text, #f1f6f0);
        padding:8px 11px;
      }
      .gc-link-pilot-list{
        display:grid;
        gap:8px;
        padding:16px;
      }
      .gc-link-pilot-item{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:center;
        padding:12px;
        border:1px solid var(--line, rgba(255,255,255,.14));
        background:rgba(255,255,255,.025);
      }
      .gc-link-pilot-item strong{display:block}
      .gc-link-pilot-item small{display:block;color:var(--soft, #b9c5bf);margin-top:4px}
      .gc-link-pilot-btn,
      .gc-user-link-btn{
        border:1px solid var(--line, rgba(255,255,255,.14));
        background:rgba(122,255,144,.08);
        color:var(--text, #f1f6f0);
        min-height:34px;
        padding:6px 10px;
        cursor:pointer;
        font-weight:800;
      }
      .gc-user-link-btn--danger{
        background:rgba(255,90,90,.10);
        border-color:rgba(255,90,90,.35);
        color:#ffd7d7;
      }
      .gc-link-pilot-close{
        border:1px solid var(--line, rgba(255,255,255,.14));
        background:rgba(255,255,255,.04);
        color:var(--text, #f1f6f0);
        min-height:34px;
        padding:6px 10px;
        cursor:pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function userIsLinked(row) {
    const text = (row.innerText || '').toLowerCase();
    return !text.includes('sin vincular');
  }

  function getUserId(row) {
    return row?.dataset?.userId || '';
  }

  function getActionsCell(row) {
    return row?.querySelector('.gc-admin-actions') || row?.querySelector('td:last-child');
  }

  function addButtons() {
    const rows = [...document.querySelectorAll(`${USERS_TABLE} tr[data-user-id]`)];
    for (const row of rows) {
      if (row.dataset.profileLinkPatched === 'true') continue;
      const userId = getUserId(row);
      const actions = getActionsCell(row);
      if (!userId || !actions) continue;

      const linked = userIsLinked(row);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gc-user-link-btn ${linked ? 'gc-user-link-btn--danger' : ''}`;
      btn.dataset.action = linked ? 'unlink-pilot' : 'link-pilot';
      btn.dataset.userId = userId;
      btn.textContent = linked ? 'Desvincular piloto' : 'Vincular piloto';

      actions.appendChild(btn);
      row.dataset.profileLinkPatched = 'true';
    }
  }

  async function loadPilots() {
    const data = await fetchJson(UNLINKED_API);
    return data.pilots || data.items || [];
  }

  function openPilotModal(userId, pilots) {
    ensureStyles();

    const modal = document.createElement('div');
    modal.className = 'gc-link-pilot-modal';
    modal.innerHTML = `
      <section class="gc-link-pilot-panel" role="dialog" aria-modal="true" aria-label="Vincular piloto">
        <div class="gc-link-pilot-head">
          <div class="gc-link-pilot-head-row">
            <h3>Vincular piloto</h3>
            <button type="button" class="gc-link-pilot-close">Cerrar</button>
          </div>
          <input type="search" placeholder="Buscar piloto por nombre, ID o Steam GUID..." />
        </div>
        <div class="gc-link-pilot-list"></div>
      </section>
    `;

    const list = modal.querySelector('.gc-link-pilot-list');
    const input = modal.querySelector('input');
    const close = modal.querySelector('.gc-link-pilot-close');

    function render() {
      const query = String(input.value || '').trim().toLowerCase();
      const filtered = pilots.filter((pilot) => {
        const hay = [
          pilot.name,
          pilot.id,
          pilot.playerId,
          pilot.steamGuid,
          pilot.guid,
          pilot.totalLaps,
          pilot.validLaps,
        ].join(' ').toLowerCase();
        return !query || hay.includes(query);
      }).slice(0, 80);

      list.innerHTML = filtered.length ? filtered.map((pilot) => {
        const playerId = pilot.id ?? pilot.playerId;
        const steamGuid = pilot.steamGuid ?? pilot.guid ?? '';
        const name = pilot.name ?? `Piloto ${playerId}`;
        return `
          <article class="gc-link-pilot-item">
            <div>
              <strong>${esc(name)}</strong>
              <small>ID ${esc(playerId)} · Steam ${esc(steamGuid || '-')} · vueltas ${esc(pilot.totalLaps ?? 0)} · válidas ${esc(pilot.validLaps ?? 0)}</small>
            </div>
            <button class="gc-link-pilot-btn" type="button"
              data-player-id="${esc(playerId)}"
              data-steam-guid="${esc(steamGuid)}"
              data-name="${esc(name)}">
              Vincular
            </button>
          </article>
        `;
      }).join('') : '<p style="padding:16px;color:var(--soft)">No hay pilotos para mostrar.</p>';
    }

    close.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
    input.addEventListener('input', render);

    list.addEventListener('click', async (event) => {
      const btn = event.target.closest('.gc-link-pilot-btn');
      if (!btn) return;

      try {
        btn.disabled = true;
        btn.textContent = 'Vinculando...';

        await fetchJson(`/api/admin/users/${encodeURIComponent(userId)}/link-pilot`, {
          method: 'POST',
          body: JSON.stringify({
            playerId: Number(btn.dataset.playerId),
            steamGuid: btn.dataset.steamGuid || null,
            strackerName: btn.dataset.name || '',
          }),
        });

        modal.remove();
        document.getElementById('reloadUsers')?.click();
        setTimeout(addButtons, 700);
      } catch (error) {
        alert(error?.message || 'No se pudo vincular el piloto.');
        btn.disabled = false;
        btn.textContent = 'Vincular';
      }
    });

    document.body.appendChild(modal);
    render();
    input.focus();
  }

  async function handleClick(event) {
    const btn = event.target.closest('.gc-user-link-btn');
    if (!btn) return;

    const userId = btn.dataset.userId;
    if (!userId) return;

    if (btn.dataset.action === 'unlink-pilot') {
      const ok = confirm('¿Desvincular este usuario de su piloto/perfil?');
      if (!ok) return;

      try {
        btn.disabled = true;
        btn.textContent = 'Desvinculando...';

        await fetchJson(`/api/admin/users/${encodeURIComponent(userId)}/link-pilot`, {
          method: 'DELETE',
        });

        document.getElementById('reloadUsers')?.click();
        setTimeout(addButtons, 700);
      } catch (error) {
        alert(error?.message || 'No se pudo desvincular.');
        btn.disabled = false;
        btn.textContent = 'Desvincular piloto';
      }
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Cargando pilotos...';
      const pilots = await loadPilots();
      openPilotModal(userId, pilots);
    } catch (error) {
      alert(error?.message || 'No se pudieron cargar pilotos.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Vincular piloto';
    }
  }

  function boot() {
    ensureStyles();
    addButtons();
    document.addEventListener('click', handleClick);

    const table = document.querySelector(USERS_TABLE);
    if (table) {
      const observer = new MutationObserver(() => addButtons());
      observer.observe(table, { childList: true, subtree: true });
    } else {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        addButtons();
        const found = document.querySelector(USERS_TABLE);
        if (found || tries > 30) clearInterval(timer);
      }, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
