(() => {
  async function postJson(url, payload = {}) {
    const response = await fetch(url, {
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
    const response = await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    return data;
  }

  async function readFile(file) {
    return { name: file.name, content: await file.text() };
  }

  function itemIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  function patchImportButton() {
    const btn = document.getElementById('archivoImportBtn');
    const fileInput = document.getElementById('archivoCsvFiles');
    const msg = document.getElementById('archivoImportMsg');
    const resultSection = document.getElementById('archivoImportResultSection');
    const resultBox = document.getElementById('archivoImportResult');
    const dryRun = document.getElementById('archivoDryRun');
    const publish = document.getElementById('archivoPublish');
    const force = document.getElementById('archivoForce');

    if (!btn || btn.dataset.gcImportV823 === 'true') return;
    btn.dataset.gcImportV823 = 'true';

    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const files = Array.from(fileInput?.files || []);
      if (!files.length) {
        if (msg) msg.textContent = 'Selecciona al menos un CSV.';
        return;
      }

      btn.disabled = true;
      if (msg) msg.textContent = 'Leyendo CSV...';
      if (resultSection) resultSection.hidden = true;

      try {
        const payload = {
          files: await Promise.all(files.map(readFile)),
          dryRun: Boolean(dryRun?.checked),
          publish: Boolean(publish?.checked),
          force: Boolean(force?.checked),
        };

        const data = await postJson('/api/admin/archive/import-csv-web-v823', payload);

        if (msg) {
          msg.textContent = data.dryRun
            ? `Prueba completada. Crear: ${data.created}, actualizar: ${data.updated}, omitidas: ${data.skipped}, estado=${data.forcedStatus}.`
            : `Importación completada. Creadas: ${data.created}, actualizadas: ${data.updated}, omitidas: ${data.skipped}, estado=${data.forcedStatus}.`;
        }
        if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
        if (resultSection) resultSection.hidden = false;
      } catch (error) {
        if (msg) msg.textContent = error?.message || 'Error importando CSV.';
      } finally {
        btn.disabled = false;
      }
    }, true);
  }

  function patchDeleteButtons() {
    const candidates = [
      document.getElementById('deleteArchiveItemButton'),
      ...Array.from(document.querySelectorAll('button, a')).filter((el) => (el.textContent || '').toLowerCase().includes('borrar ficha')),
    ].filter(Boolean);

    for (const btn of candidates) {
      if (btn.dataset.gcHardDeleteV823 === 'true') continue;
      btn.dataset.gcHardDeleteV823 = 'true';

      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const id = btn.dataset.itemId || btn.dataset.id || itemIdFromPath();
        if (!id) {
          alert('No se pudo detectar el ID de la ficha.');
          return;
        }

        if (!confirm('¿Seguro que quieres borrar esta ficha de MySQL?')) return;
        if (!confirm('Última confirmación: se eliminará de verdad.')) return;

        try {
          btn.disabled = true;
          const data = await deleteJson(`/api/admin/archive/mysql-hard-delete-v823/${encodeURIComponent(id)}`);
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
    patchImportButton();
    patchDeleteButtons();

    const observer = new MutationObserver(() => {
      patchImportButton();
      patchDeleteButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
