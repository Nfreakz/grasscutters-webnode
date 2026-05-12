(() => {
  const originalFetch = window.fetch.bind(window);

  function asUrl(input) {
    if (typeof input === 'string') return input;
    if (input?.url) return input.url;
    return String(input || '');
  }

  function methodOf(init = {}) {
    return String(init?.method || 'GET').toUpperCase();
  }

  function rewriteArchiveUrl(url, method) {
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname;

    if (path.includes('/safe-v824/')) return url;
    if (path.includes('/import-csv-web')) return url;
    if (path.includes('/mysql-hard-delete')) return url;

    if (path === '/api/admin/archive/items') {
      return method === 'GET'
        ? `/api/admin/archive/safe-v824/items${parsed.search || ''}`
        : '/api/admin/archive/safe-v824/items';
    }

    const itemMatch = path.match(/^\/api\/admin\/archive\/items\/([^/]+)$/);
    if (itemMatch) {
      const id = encodeURIComponent(decodeURIComponent(itemMatch[1]));
      return `/api/admin/archive/safe-v824/items/${id}${parsed.search || ''}`;
    }

    return url;
  }

  window.fetch = function patchedFetch(input, init = {}) {
    const url = asUrl(input);
    const method = methodOf(init);
    const nextUrl = rewriteArchiveUrl(url, method);

    if (typeof input === 'string') {
      return originalFetch(nextUrl, init);
    }

    if (input instanceof Request && nextUrl !== input.url) {
      const nextRequest = new Request(nextUrl, input);
      return originalFetch(nextRequest, init);
    }

    return originalFetch(input, init);
  };

  async function postJson(url, payload = {}) {
    const response = await originalFetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    return data;
  }

  async function deleteJson(url) {
    const response = await originalFetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    return data;
  }

  function itemIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  function patchDemoButtons() {
    const buttons = [...document.querySelectorAll('button')].filter((el) => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('crear demo') || text.trim() === 'demo';
    });

    for (const button of buttons) {
      if (button.dataset.gcDemoSafeV824 === 'true') continue;
      button.dataset.gcDemoSafeV824 = 'true';

      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        try {
          button.disabled = true;
          const data = await postJson('/api/admin/archive/safe-v824/demo');
          alert(`Demo creada. Creadas: ${data.created}. Omitidas: ${data.skipped}.`);
          window.location.href = '/admin/archivo';
        } catch (error) {
          alert(error?.message || 'No se pudo crear la demo.');
        } finally {
          button.disabled = false;
        }
      }, true);
    }
  }

  function patchDeleteButtons() {
    const candidates = [
      document.getElementById('deleteArchiveItemButton'),
      ...Array.from(document.querySelectorAll('button')).filter((el) => (el.textContent || '').toLowerCase().includes('borrar ficha')),
    ].filter(Boolean);

    for (const btn of candidates) {
      if (btn.dataset.gcDeleteSafeV824 === 'true') continue;
      btn.dataset.gcDeleteSafeV824 = 'true';

      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const id = btn.dataset.itemId || btn.dataset.id || itemIdFromPath();
        if (!id) {
          alert('No se pudo detectar el ID de la ficha.');
          return;
        }

        if (!confirm('¿Seguro que quieres borrar esta ficha?')) return;
        if (!confirm('Última confirmación: se eliminará de MySQL.')) return;

        try {
          btn.disabled = true;
          const data = await deleteJson(`/api/admin/archive/safe-v824/items/${encodeURIComponent(id)}`);
          if (!data.deleted) throw new Error(data.message || 'La API respondió, pero no eliminó la ficha.');
          window.location.href = '/admin/archivo';
        } catch (error) {
          alert(error?.message || 'No se pudo borrar la ficha.');
        } finally {
          btn.disabled = false;
        }
      }, true);
    }
  }

  function boot() {
    patchDemoButtons();
    patchDeleteButtons();

    const observer = new MutationObserver(() => {
      patchDemoButtons();
      patchDeleteButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
