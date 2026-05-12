(() => {
  const API = '/api/admin/archive/unified';

  function isEditor() {
    return window.location.pathname.includes('/admin/archivo/editar/');
  }

  function itemIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  function insertUploadBox() {
    if (!isEditor()) return;
    if (document.getElementById('gcArchiveUploadBox')) return;

    const mediaSection =
      document.querySelector('#archiveMediaGrid')?.closest('.gc-section') ||
      document.querySelector('.gc-archive-media-grid')?.closest('.gc-section') ||
      document.querySelector('#archiveEditorContent') ||
      document.querySelector('.gc-archive-editor');

    if (!mediaSection) return;

    const box = document.createElement('section');
    box.className = 'gc-section gc-archive-upload-box';
    box.id = 'gcArchiveUploadBox';
    box.innerHTML = `
      <div class="gc-section-head">
        <h2>Subir imagen propia</h2>
        <p>Guarda una imagen en el almacenamiento persistente del Archivo y añádela a esta ficha.</p>
      </div>

      <div class="gc-slab gc-archive-upload-panel">
        <label class="gc-field gc-field--full">
          <span>Archivo de imagen</span>
          <input id="gcArchiveUploadFile" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" />
        </label>

        <div class="gc-archive-upload-preview" id="gcArchiveUploadPreview" hidden>
          <img id="gcArchiveUploadPreviewImg" src="" alt="Vista previa" />
          <div>
            <strong id="gcArchiveUploadPreviewName">Imagen seleccionada</strong>
            <p id="gcArchiveUploadPreviewSize"></p>
          </div>
        </div>

        <label class="gc-field gc-field--full">
          <span>Texto alternativo</span>
          <input id="gcArchiveUploadAlt" type="text" placeholder="Ej: Foto de Ayrton Senna en Mónaco" />
        </label>

        <div class="gc-upload-grid">
          <label class="gc-field">
            <span>Fuente</span>
            <input id="gcArchiveUploadSource" type="text" value="GrassCutters Racing" />
          </label>
          <label class="gc-field">
            <span>Autor</span>
            <input id="gcArchiveUploadAuthor" type="text" placeholder="Autor o equipo" />
          </label>
          <label class="gc-field">
            <span>Licencia</span>
            <input id="gcArchiveUploadLicense" type="text" value="Imagen propia / GrassCutters Racing" />
          </label>
          <label class="gc-field">
            <span>URL fuente</span>
            <input id="gcArchiveUploadSourceUrl" type="url" placeholder="Opcional" />
          </label>
        </div>

        <div class="gc-admin-actions">
          <label class="gc-check"><input id="gcArchiveUploadPrimary" type="checkbox" checked /> Marcar como portada</label>
          <label class="gc-check"><input id="gcArchiveUploadLocked" type="checkbox" checked /> Bloquear como imagen buena</label>
        </div>

        <div class="gc-admin-actions">
          <button class="gc-btn gc-btn--primary" id="gcArchiveUploadButton" type="button">Subir imagen</button>
        </div>

        <p class="gc-message" id="gcArchiveUploadMessage"></p>
      </div>
    `;

    mediaSection.parentElement?.insertBefore(box, mediaSection);
    bindUploadBox();
  }

  function bindUploadBox() {
    const fileInput = $('gcArchiveUploadFile');
    const preview = $('gcArchiveUploadPreview');
    const previewImg = $('gcArchiveUploadPreviewImg');
    const previewName = $('gcArchiveUploadPreviewName');
    const previewSize = $('gcArchiveUploadPreviewSize');
    const button = $('gcArchiveUploadButton');
    const msg = $('gcArchiveUploadMessage');

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) {
        preview.hidden = true;
        return;
      }

      preview.hidden = false;
      previewName.textContent = file.name;
      previewSize.textContent = `${file.type || 'imagen'} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;

      if (file.type === 'image/svg+xml') {
        previewImg.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('image/')) {
        previewImg.src = URL.createObjectURL(file);
      }

      const title = $('fieldTitle')?.value || document.querySelector('h1')?.textContent || '';
      if (!$('gcArchiveUploadAlt').value) $('gcArchiveUploadAlt').value = title ? `Imagen de ${title}` : '';
    });

    button?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        msg.textContent = 'Selecciona una imagen primero.';
        return;
      }

      button.disabled = true;
      msg.textContent = 'Leyendo imagen...';

      try {
        const dataUrl = await fileToDataUrl(file);
        const itemId = itemIdFromPath();

        msg.textContent = 'Subiendo imagen...';

        const response = await fetch(`${API}/items/${encodeURIComponent(itemId)}/media/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl,
            fileName: file.name,
            alt: $('gcArchiveUploadAlt')?.value || '',
            source: $('gcArchiveUploadSource')?.value || '',
            sourceUrl: $('gcArchiveUploadSourceUrl')?.value || '',
            author: $('gcArchiveUploadAuthor')?.value || '',
            license: $('gcArchiveUploadLicense')?.value || '',
            makePrimary: Boolean($('gcArchiveUploadPrimary')?.checked),
            locked: Boolean($('gcArchiveUploadLocked')?.checked),
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
        }

        msg.textContent = `Imagen subida: ${data.publicUrl}`;

        if (window.confirm('Imagen subida correctamente. ¿Recargar la ficha para ver la galería actualizada?')) {
          window.location.reload();
        }
      } catch (error) {
        msg.textContent = error?.message || 'No se pudo subir la imagen.';
      } finally {
        button.disabled = false;
      }
    });
  }

  function boot() {
    insertUploadBox();

    const observer = new MutationObserver(() => insertUploadBox());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
