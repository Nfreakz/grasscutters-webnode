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

  function mediaKey(media) {
    return String(media?.url || media?.localUrl || media?.originalUrl || media?.id || '')
      .trim()
      .replace(/\/+$/, '');
  }

  function uniqueMedia(media) {
    const seen = new Set();
    return (Array.isArray(media) ? media : []).filter((entry) => {
      const key = mediaKey(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findMount() {
    return document.querySelector('#archiveMediaGrid');
  }

  function addImageHref(item) {
    const id = item?.id || itemIdFromPath();
    const slug = item?.slug || '';
    if (id) return `/admin/archivo/imagen-url?item=${encodeURIComponent(id)}`;
    if (slug) return `/admin/archivo/imagen-url?slug=${encodeURIComponent(slug)}`;
    return '/admin/archivo/imagen-url';
  }

  async function loadItem() {
    const itemId = itemIdFromPath();
    const data = await json(`${API}/items/${encodeURIComponent(itemId)}`);
    return data.item;
  }

  function managerHtml(item) {
    const media = uniqueMedia(item.media);
    const cover = media.find((entry) => entry.isMain || entry.isPrimary) || media[0] || null;

    return `
      <div class="gc-media-manager-compact" id="gcArchiveMediaManager">
        <div class="gc-media-manager-head">
          <div>
            <strong>Imágenes</strong>
            <p>${media.length} imagen${media.length === 1 ? '' : 'es'} asociada${media.length === 1 ? '' : 's'}${cover ? ' · portada definida' : ' · sin portada'}</p>
          </div>
          <div class="gc-media-manager-actions">
            <a class="gc-btn gc-btn--primary" href="${esc(addImageHref(item))}">Añadir</a>
            <button class="gc-btn" type="button" data-refresh-media>Recargar</button>
          </div>
        </div>

        <div class="gc-media-manager-list">
          ${media.length ? media.map((entry, index) => {
            const isCover = Boolean(entry.isMain || entry.isPrimary);
            return `
              <article class="gc-media-item ${isCover ? 'is-cover' : ''}" data-media-id="${esc(entry.id)}">
                <div class="gc-media-thumb">
                  <img src="${esc(mediaUrl(entry))}" alt="${esc(entry.alt || '')}" loading="lazy" />
                  <span>${isCover ? 'Portada' : `Imagen ${index + 1}`}</span>
                </div>

                <div class="gc-media-item__body">
                  <div class="gc-media-item__top">
                    <strong>${esc(entry.alt || item.title || item.nombre || 'Imagen')}</strong>
                    <span>${entry.local ? 'Local' : 'Externa'}</span>
                  </div>

                  <details class="gc-media-details">
                    <summary>Editar créditos</summary>

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
                  </details>

                  <div class="gc-media-actions">
                    <button class="gc-btn gc-btn--small" type="button" data-media-save>Guardar</button>
                    <button class="gc-btn gc-btn--small" type="button" data-media-primary ${isCover ? 'disabled' : ''}>${isCover ? 'Ya es portada' : 'Hacer portada'}</button>
                    <button class="gc-admin-danger-button" type="button" data-media-delete>Borrar</button>
                  </div>
                </div>
              </article>
            `;
          }).join('') : `
            <div class="gc-admin-empty gc-media-empty">
              <strong>Sin imágenes todavía.</strong>
              <p>Añade una portada o una galería desde el gestor visual.</p>
              <a class="gc-btn gc-btn--primary" href="${esc(addImageHref(item))}">Añadir imagen</a>
            </div>
          `}
        </div>

        <p class="gc-message" id="gcMediaManagerMsg"></p>
      </div>
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
          await renderManager(true);
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

    const mount = findMount();
    if (!mount) return;

    if (mount.dataset.mediaManagerMounted === 'true' && !force) return;

    try {
      const item = await loadItem();
      mount.dataset.mediaManagerMounted = 'true';
      mount.innerHTML = managerHtml(item);
      bindManager(mount);
    } catch (error) {
      mount.innerHTML = `<div class="gc-admin-empty">No se pudo cargar el gestor de imágenes: ${esc(error.message || error)}</div>`;
    }
  }

  function boot() {
    renderManager();

    const observer = new MutationObserver(() => renderManager());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
