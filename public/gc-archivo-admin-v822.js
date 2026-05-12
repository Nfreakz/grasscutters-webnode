(() => {
  async function postJson(url, payload = {}) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function readFile(file) {
    return { name: file.name, content: await file.text() };
  }

  function patchDemoButtons() {
    const buttons = [...document.querySelectorAll('button, a')].filter((el) => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('crear demo') || text.includes('demo');
    });

    for (const button of buttons) {
      if (button.dataset.gcDemoSafeV822 === 'true') continue;
      button.dataset.gcDemoSafeV822 = 'true';
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          button.disabled = true;
          const data = await postJson('/api/admin/archive/mysql-demo-safe-v822');
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

  function patchImportPage() {
    const btn = document.getElementById('archivoImportBtn');
    const fileInput = document.getElementById('archivoCsvFiles');
    const msg = document.getElementById('archivoImportMsg');
    const resultSection = document.getElementById('archivoImportResultSection');
    const resultBox = document.getElementById('archivoImportResult');
    const dryRun = document.getElementById('archivoDryRun');
    const publish = document.getElementById('archivoPublish');
    const force = document.getElementById('archivoForce');

    if (!btn || btn.dataset.gcImportV822 === 'true') return;
    btn.dataset.gcImportV822 = 'true';

    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

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

        if (msg) msg.textContent = 'Importando...';

        const data = await postJson('/api/admin/archive/import-csv-web-v822', payload);
        if (msg) {
          msg.textContent = data.dryRun
            ? `Prueba completada. Se crearían ${data.created}, status=${data.forcedStatus}.`
            : `Importación completada. Creadas ${data.created}, actualizadas ${data.updated}, status=${data.forcedStatus}.`;
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

  function boot() {
    patchDemoButtons();
    patchImportPage();

    const observer = new MutationObserver(() => {
      patchDemoButtons();
      patchImportPage();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
