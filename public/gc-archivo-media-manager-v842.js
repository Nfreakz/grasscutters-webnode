(() => {
  const API = '/api/admin/archive/unified';

  function isEditor() {
    return window.location.pathname.includes('/admin/archivo/editar/');
  }

  function itemIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '');
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[char]));
  }

  async function json(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  }

  function mediaUrl(media) {
    return media?.url || media?.localUrl || '/og/grasscutters-og.svg';
  }

  function findInsertionTarget() {
    return (
      document.querySelector('#archiveMediaGrid')?.closest('.gc-section') ||
      document.querySelector('.gc-archive-media-grid')?.closest('.gc-section') ||
      document.querySelector('#archiveEditorContent') ||
      document.querySelector('.gc-archive-editor')
    );
  }

  async function loadItem() {
    const itemId = itemIdFromPath();
    const data = await json(`${API}/items/${encodeURIComponent(itemId)}`);
    return data.item;
  }

  function managerHtml(item) {
    const media = Array.isArray(item.media) ? item.media : [];

    return `
      <section class="gc-section gc-archive-media-manager" id="gcArchiveMediaManager">
        <div class="gc-section-head">
          <h2>Imágenes de la ficha</h2>
          <p>Edita créditos, marca portada o elimina imágenes asociadas.</p>
        </div>

        <div class="gc-media-manager-actions">
          <a class="gc-btn gc-btn--primary" href="/admin/archivo/imagen-url">Añadir imagen</a>
          <button class="gc-btn" type="button" data-refresh-media>Recargar imágenes</button>
        </div>

        <div class="gc-media-manager-list">
          ${media.length ? media.map((entry, index) => `
            <article class="gc-media-item" data-media-id="${esc(entry.id)}">
              <img src="${esc(mediaUrl(entry))}" alt="${esc(entry.alt || '')}" loading="lazy" />
              <div class="gc-media-item__body">
                <div class="gc-media-item__top">
                  <strong>${entry.isMain || entry.isPrimary ? 'Portada' : `Imagen ${index + 1}`}</strong>
                  <span>${entry.local ? 'Local' : 'Externa'}</span>
                </div>

                <label>
                  <small>Alt</small>
                  <input data-media-field="alt" value="${esc(entry.alt || '')}" />
                </label>

                <div class="gc-media-mini-grid">
                  <label>
                    <small>Fuente</small>
                    <input data-media-field="source" value="${esc(entry.source || '')}" />
                  </label>
                  <label>
                    <small>Autor</small>
                    <input data-media-field="author" value="${esc(entry.author || '')}" />
                  </label>
                  <label>
                    <small>Licencia</small>
                    <input data-media-field="license" value="${esc(entry.license || '')}" />
                  </label>
                  <label>
                    <small>URL fuente</small>
                    <input data-media-field="sourceUrl" value="${esc(entry.sourceUrl || '')}" />
                  </label>
                </div>

                <div class="gc-media-actions">
                  <button class="gc-btn" type="button" data-media-save>Guardar imagen</button>
                  <button class="gc-btn" type="button" data-media-primary>Marcar portada</button>
                  <button class="gc-admin-danger-button" type="button" data-media-delete>Borrar imagen</button>
                </div>
              </div>
            </article>
          `).join('') : '<div class="gc-admin-empty">Esta ficha todavía no tiene imágenes. Usa “Añadir imagen”.</div>'}
        </div>

        <p class="gc-message" id="gcMediaManagerMsg"></p>
      </section>
    `;
  }

  function collectMediaPayload(card) {
    const payload = {};
    card.querySelectorAll('[data-media-field]').forEach((input) => {
      payload[input.dataset.mediaField] = input.value;
    });
    return payload;
  }

  function bindManager(root) {
    root.querySelector('[data-refresh-media]')?.addEventListener('click', () => renderManager(true));

    root.querySelectorAll('[data-media-save]').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('[data-media-id]');
        const mediaId = card?.dataset.mediaId;
        const msg = document.getElementById('gcMediaManagerMsg');
        try {
          button.disabled = true;
          msg.textContent = 'Guardando imagen...';
          await json(`${API}/items/${encodeURIComponent(itemIdFromPath())}/media/${encodeURIComponent(mediaId)}`, {
            method: 'PATCH',
            body: JSON.stringify(collectMediaPayload(card)),
          });
          msg.textContent = 'Imagen guardada.';
        } catch (error) {
          msg.textContent = error.message || 'No se pudo guardar.';
        } finally {
          button.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-media-primary]').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('[data-media-id]');
        const mediaId = card?.dataset.mediaId;
        const msg = document.getElementById('gcMediaManagerMsg');
        try {
          button.disabled = true;
          msg.textContent = 'Marcando portada...';
          await json(`${API}/items/${encodeURIComponent(itemIdFromPath())}/media/${encodeURIComponent(mediaId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ ...collectMediaPayload(card), makePrimary: true }),
          });
          msg.textContent = 'Portada actualizada.';
          await renderManager(true);
        } catch (error) {
          msg.textContent = error.message || 'No se pudo marcar portada.';
        } finally {
          button.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-media-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = button.closest('[data-media-id]');
        const mediaId = card?.dataset.mediaId;
        const msg = document.getElementById('gcMediaManagerMsg');

        if (!confirm('¿Borrar esta imagen de la ficha?')) return;
        if (!confirm('Última confirmación. Si es local, también se intentará borrar el archivo.')) return;

        try {
          button.disabled = true;
          msg.textContent = 'Borrando imagen...';
          await json(`${API}/items/${encodeURIComponent(itemIdFromPath())}/media/${encodeURIComponent(mediaId)}`, {
            method: 'DELETE',
          });
          msg.textContent = 'Imagen borrada.';
          await renderManager(true);
        } catch (error) {
          msg.textContent = error.message || 'No se pudo borrar.';
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function renderManager(force = false) {
    if (!isEditor()) return;

    const existing = document.getElementById('gcArchiveMediaManager');
    if (existing && !force) return;

    const target = findInsertionTarget();
    if (!target) return;

    try {
      const item = await loadItem();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = managerHtml(item);
      const manager = wrapper.firstElementChild;

      if (existing) existing.replaceWith(manager);
      else target.parentElement?.insertBefore(manager, target);

      bindManager(manager);
    } catch (error) {
      console.warn('[GC Archivo] No se pudo cargar gestor de imágenes:', error);
    }
  }

  function boot() {
    renderManager();

    const observer = new MutationObserver(() => renderManager());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
