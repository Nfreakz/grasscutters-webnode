(() => {
  const PAGE_SIZE = 15;
  const ROOT_SELECTOR = 'main, body';
  const IGNORE_SELECTOR = 'script, style, template, nav, header, footer, form';

  function textOf(el) {
    return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isVisibleCandidate(el) {
    if (!el || el.matches?.(IGNORE_SELECTOR)) return false;
    const rect = el.getBoundingClientRect?.();
    return !rect || rect.width > 0 || rect.height > 0;
  }

  function findCollection() {
    const root = document.querySelector(ROOT_SELECTOR) || document.body;

    const tbodyCandidates = [...root.querySelectorAll('tbody')]
      .map((container) => ({ container, items: [...container.querySelectorAll(':scope > tr')], type: 'table' }))
      .filter((group) => group.items.length > PAGE_SIZE);

    if (tbodyCandidates.length) {
      return tbodyCandidates.sort((a, b) => b.items.length - a.items.length)[0];
    }

    const selector = [
      '[data-admin-list]',
      '.gc-admin-list',
      '.gc-admin-grid',
      '.gc-admin-table-body',
      '.gc-archive-grid',
      '.gc-archive-admin-grid',
      '.gc-admin-results',
      '.gc-admin-cards',
      '.gc-card-grid',
      '.gc-list-grid'
    ].join(',');

    const explicit = [...root.querySelectorAll(selector)]
      .map((container) => ({ container, items: [...container.children].filter(isVisibleCandidate), type: 'cards' }))
      .filter((group) => group.items.length > PAGE_SIZE);

    if (explicit.length) {
      return explicit.sort((a, b) => b.items.length - a.items.length)[0];
    }

    const gridLike = [...root.querySelectorAll('section, div, ul')]
      .filter((container) => {
        const cls = String(container.className || '').toLowerCase();
        return cls.includes('grid') || cls.includes('list') || cls.includes('results') || cls.includes('cards');
      })
      .map((container) => ({ container, items: [...container.children].filter(isVisibleCandidate), type: 'generic' }))
      .filter((group) => group.items.length > PAGE_SIZE);

    if (gridLike.length) {
      return gridLike.sort((a, b) => b.items.length - a.items.length)[0];
    }

    return null;
  }

  function makeControls(total) {
    const wrap = document.createElement('section');
    wrap.className = 'gc-admin-pager';
    wrap.setAttribute('data-admin-pager', 'true');
    wrap.innerHTML = `
      <div class="gc-admin-pager__top">
        <label class="gc-admin-pager__search">
          <span>Filtrar</span>
          <input type="search" placeholder="Buscar por texto..." autocomplete="off" />
        </label>
        <div class="gc-admin-pager__meta">
          <strong data-pager-count>${total}</strong>
          <span>resultados</span>
        </div>
      </div>
      <div class="gc-admin-pager__bottom">
        <button type="button" data-pager-prev>Anterior</button>
        <span data-pager-page>Página 1</span>
        <button type="button" data-pager-next>Siguiente</button>
      </div>
    `;
    return wrap;
  }

  function addStyles() {
    if (document.getElementById('gc-admin-pager-style')) return;
    const style = document.createElement('style');
    style.id = 'gc-admin-pager-style';
    style.textContent = `
      .gc-admin-pager{
        margin: 0 0 18px;
        padding: 14px;
        border: 1px solid var(--line, rgba(255,255,255,.12));
        background: rgba(255,255,255,.022);
        display: grid;
        gap: 12px;
      }
      .gc-admin-pager__top,
      .gc-admin-pager__bottom{
        display:flex;
        gap:12px;
        align-items:center;
        justify-content:space-between;
        flex-wrap:wrap;
      }
      .gc-admin-pager__search{
        flex:1 1 320px;
        display:grid;
        gap:6px;
        color:var(--soft, #b8c4ca);
        font-size:.82rem;
        text-transform:uppercase;
        letter-spacing:.08em;
      }
      .gc-admin-pager__search input{
        width:100%;
        min-height:40px;
        border:1px solid var(--line, rgba(255,255,255,.12));
        background:rgba(0,0,0,.22);
        color:var(--text, #eef4f0);
        padding:8px 11px;
      }
      .gc-admin-pager__meta{
        display:flex;
        gap:6px;
        align-items:baseline;
        color:var(--soft, #b8c4ca);
      }
      .gc-admin-pager__meta strong{color:var(--text, #eef4f0);font-size:1.1rem}
      .gc-admin-pager__bottom button{
        border:1px solid var(--line, rgba(255,255,255,.12));
        background:rgba(122,255,144,.08);
        color:var(--text, #eef4f0);
        min-height:38px;
        padding:7px 13px;
        cursor:pointer;
        font-weight:800;
      }
      .gc-admin-pager__bottom button:disabled{
        opacity:.42;
        cursor:not-allowed;
      }
      [data-admin-pager-hidden="true"]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function initPager() {
    if (document.querySelector('[data-admin-pager-mounted="true"]')) return false;

    const group = findCollection();
    if (!group) return false;

    addStyles();

    const controls = makeControls(group.items.length);
    controls.setAttribute('data-admin-pager-mounted', 'true');

    const insertionPoint = group.type === 'table' ? group.container.closest('table') : group.container;
    insertionPoint.parentElement?.insertBefore(controls, insertionPoint);

    const input = controls.querySelector('input');
    const prev = controls.querySelector('[data-pager-prev]');
    const next = controls.querySelector('[data-pager-next]');
    const pageLabel = controls.querySelector('[data-pager-page]');
    const countLabel = controls.querySelector('[data-pager-count]');

    let page = 1;
    let query = '';

    function filteredItems() {
      if (!query) return group.items;
      return group.items.filter((item) => textOf(item).includes(query));
    }

    function render() {
      const filtered = filteredItems();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      const start = (page - 1) * PAGE_SIZE;
      const visibleSet = new Set(filtered.slice(start, start + PAGE_SIZE));

      for (const item of group.items) {
        item.setAttribute('data-admin-pager-hidden', visibleSet.has(item) ? 'false' : 'true');
      }

      countLabel.textContent = String(filtered.length);
      pageLabel.textContent = `Página ${page} de ${totalPages}`;
      prev.disabled = page <= 1;
      next.disabled = page >= totalPages;
    }

    input.addEventListener('input', () => {
      query = String(input.value || '').trim().toLowerCase();
      page = 1;
      render();
    });

    prev.addEventListener('click', () => {
      page -= 1;
      render();
    });

    next.addEventListener('click', () => {
      page += 1;
      render();
    });

    render();
    return true;
  }

  function boot() {
    if (initPager()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (initPager() || tries > 30) clearInterval(timer);
    }, 300);

    const observer = new MutationObserver(() => {
      initPager();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
