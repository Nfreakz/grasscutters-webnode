const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  admin: path.join(root, 'src/pages/admin.astro'),
  calendarAdmin: path.join(root, 'src/pages/admin/calendario.astro'),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function writeBackup(file, content, tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${file}.backup-${tag}-${stamp}`;
  fs.writeFileSync(backup, content, 'utf8');
  return backup;
}

function writeIfChanged(file, before, after, tag) {
  if (before === after) {
    console.log(`OK sin cambios: ${path.relative(root, file)}`);
    return false;
  }
  const backup = writeBackup(file, before, tag);
  fs.writeFileSync(file, after, 'utf8');
  console.log(`PATCH aplicado: ${path.relative(root, file)}`);
  console.log(`Backup: ${path.relative(root, backup)}`);
  return true;
}

function patchCalendarAdmin() {
  const file = files.calendarAdmin;
  let source = read(file);
  const original = source;

  if (!source.includes('GC CALENDAR ADMIN AUTH CLEANUP V1 START')) {
    const checkAdminRegex = /      async function checkAdmin\(\) \{[\s\S]*?      \}\n\n      form\.addEventListener\('submit'/;
    if (!checkAdminRegex.test(source)) {
      throw new Error('No se encontró la función checkAdmin() en src/pages/admin/calendario.astro');
    }

    const replacement = `      // GC CALENDAR ADMIN AUTH CLEANUP V1 START
      async function readCalendarAdminStatus() {
        const status = await fetchJson('/api/admin/status').catch((error) => ({ ok:false, error, message:error?.message || 'No se pudo leer /api/admin/status' }));
        if (status?.authorized === true) return { ...status, setupRequired:false };

        const profile = await fetchJson('/api/profile').catch((error) => ({ ok:false, error, message:error?.message || 'No se pudo leer /api/profile' }));
        const user = profile?.user || profile?.currentUser;
        if (user?.role === 'admin') {
          return {
            ...(status && !status.error ? status : {}),
            ok: true,
            authenticated: true,
            authorized: true,
            setupRequired: false,
            currentUser: user,
            source: 'calendar-admin-profile-fallback'
          };
        }

        if (status?.error) throw status.error;
        throw new Error(status?.message || profile?.message || 'Acceso admin requerido.');
      }

      async function checkAdmin() {
        try {
          const status = await readCalendarAdminStatus();
          if (status.authorized !== true) throw new Error('Sin permisos');
          content.hidden = false;
          noAccess.hidden = true;
          state.textContent = 'OK';
          await loadEvents();
        } catch (error) {
          content.hidden = true;
          noAccess.hidden = false;
          state.textContent = 'Bloqueado';
          setMessage(error.message || 'Acceso admin requerido.');
        }
      }
      // GC CALENDAR ADMIN AUTH CLEANUP V1 END

      form.addEventListener('submit'`;
    source = source.replace(checkAdminRegex, replacement);
  }

  if (!source.includes('id="calendarSyncAcsm"')) {
    source = source.replace(
      '<button class="gc-btn" type="button" id="calendarReset">Limpiar formulario</button>',
      '<button class="gc-btn" type="button" id="calendarReset">Limpiar formulario</button>\n          <button class="gc-btn gc-btn--primary" type="button" id="calendarSyncAcsm">Sincronizar ACSM</button>'
    );
    source = source.replace(
      "const reset = document.getElementById('calendarReset');",
      "const reset = document.getElementById('calendarReset');\n      const syncAcsm = document.getElementById('calendarSyncAcsm');"
    );
    source = source.replace(
      "reset.addEventListener('click', resetForm);",
      `reset.addEventListener('click', resetForm);
      syncAcsm?.addEventListener('click', async () => {
        try {
          setMessage('Sincronizando combo desde ACSM...');
          await fetchJson('/api/admin/acsm/sync-current-combo', { method:'POST' });
          setMessage('Combo ACSM sincronizado.', true);
          await loadEvents();
        } catch (error) {
          setMessage(error.message || 'No se pudo sincronizar ACSM.');
        }
      });`
    );
  }

  writeIfChanged(file, original, source, 'admin-calendar-visibility-fix');
}

function patchAdmin() {
  const file = files.admin;
  let source = read(file);
  const original = source;

  if (!source.includes('GC ADMIN VISIBILITY CLEANUP V1 SETPANELS')) {
    const setPanelsRegex = /    function setPanels\(\{ setup = false, content = false, noAccess = false \}\) \{\n      els\.setupPanel\.hidden = !setup;\n      els\.adminContent\.hidden = !content;\n      els\.noAccessPanel\.hidden = !noAccess;\n    \}/;
    if (!setPanelsRegex.test(source)) {
      throw new Error('No se encontró setPanels() en src/pages/admin.astro');
    }
    source = source.replace(setPanelsRegex, `    // GC ADMIN VISIBILITY CLEANUP V1 SETPANELS START
    window.gcAdminAuthorized = false;
    function setPanels({ setup = false, content = false, noAccess = false }) {
      if (window.gcAdminAuthorized === true) {
        setup = false;
        content = true;
        noAccess = false;
      }
      els.setupPanel.hidden = !setup;
      els.adminContent.hidden = !content;
      els.noAccessPanel.hidden = !noAccess;
    }
    // GC ADMIN VISIBILITY CLEANUP V1 SETPANELS END`);
  }

  if (!source.includes('GC ADMIN VISIBILITY CLEANUP V1 RENDERSTATUS')) {
    source = source.replace(
      '    function renderStatus(data) {\n      const summary = data.summary || {};',
      `    function renderStatus(data) {
      // GC ADMIN VISIBILITY CLEANUP V1 RENDERSTATUS START
      if (data?.authorized === true) {
        window.gcAdminAuthorized = true;
        data.setupRequired = false;
      } else if (data?.setupRequired === true) {
        window.gcAdminAuthorized = false;
      }
      // GC ADMIN VISIBILITY CLEANUP V1 RENDERSTATUS END
      const summary = data.summary || {};`
    );
  }

  if (!source.includes('GC ADMIN VISIBILITY CLEANUP V1 WATCHDOG')) {
    const watchdog = `

    // GC ADMIN VISIBILITY CLEANUP V1 WATCHDOG START
    async function gcAdminVisibilityWatchdog() {
      try {
        const readJson = async (url) => {
          const response = await fetch(url, { credentials:'include', cache:'no-store' });
          return response.json().catch(() => ({}));
        };
        let status = await readJson('/api/admin/status');
        if (status?.authorized !== true) {
          const profile = await readJson('/api/profile');
          const user = profile?.user || profile?.currentUser;
          if (user?.role === 'admin') {
            status = {
              ...(status || {}),
              ok: true,
              authenticated: true,
              authorized: true,
              setupRequired: false,
              currentUser: user,
              source: 'admin-profile-fallback'
            };
          }
        }

        if (status?.authorized === true) {
          window.gcAdminAuthorized = true;
          status.setupRequired = false;
          renderStatus(status);
          setPanels({ content:true });
          const loaders = [
            'loadUsers',
            'loadStorage',
            'loadNameFilters',
            'loadUnlinkedPilots',
            'loadAudit'
          ];
          for (const loaderName of loaders) {
            if (typeof window[loaderName] === 'function') {
              try { await window[loaderName](); } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }
    window.addEventListener('pageshow', () => {
      gcAdminVisibilityWatchdog();
      window.setTimeout(gcAdminVisibilityWatchdog, 700);
      window.setTimeout(gcAdminVisibilityWatchdog, 1800);
    });
    // GC ADMIN VISIBILITY CLEANUP V1 WATCHDOG END
`;
    const marker = '\n  </script>\n</AppLayout>';
    if (!source.includes(marker)) throw new Error('No se encontró cierre de script en src/pages/admin.astro');
    source = source.replace(marker, `${watchdog}${marker}`);
  }

  source = source.replace('<a class="gc-btn" href="/tracker">Ver tracker</a>', '<a class="gc-btn" href="/app">Ver panel</a>');

  writeIfChanged(file, original, source, 'admin-visibility-fix');
}

patchCalendarAdmin();
patchAdmin();
console.log('OK: limpieza de visibilidad admin/calendario aplicada.');
