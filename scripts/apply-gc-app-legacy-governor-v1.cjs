#!/usr/bin/env node
/* GC_APP_LEGACY_GOVERNOR_V1_APPLY
 * Legacy Removal Phase 1 for /app.
 * Safe governor: does not delete legacy code yet.
 * It detects legacy endpoint calls and makes Data Core repaint last.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'pages', 'app.astro');

const EARLY_START = '/* GC_APP_LEGACY_GOVERNOR_V1_EARLY_START */';
const EARLY_END = '/* GC_APP_LEGACY_GOVERNOR_V1_EARLY_END */';
const LATE_START = '/* GC_APP_LEGACY_GOVERNOR_V1_LATE_START */';
const LATE_END = '/* GC_APP_LEGACY_GOVERNOR_V1_LATE_END */';

if (!fs.existsSync(appPath)) {
  console.error('[GC APP LEGACY GOVERNOR] Missing src/pages/app.astro');
  process.exit(1);
}

let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes('GC_APP_DATA_CORE_PRIMARY_V1_START')) {
  console.error('[GC APP LEGACY GOVERNOR] /app Data Core primary block not found. Apply GC_App_Data_Core_Primary_v1 first.');
  process.exit(1);
}

const earlyScript = `
  <script is:inline>
    ${EARLY_START}
    (() => {
      if (window.GCAppLegacyGovernor?.version === 'v1') return;

      const legacyPatterns = [
        '/api/hotlaps',
        '/api/laps',
        '/api/combos/stats',
        '/api/stats/overview',
        '/api/drivers',
        '/api/pilots'
      ];

      const state = {
        version: 'v1',
        startedAt: new Date().toISOString(),
        legacyCalls: [],
        repaintsRequested: 0,
        lastCorePaintAt: null,
        lastLegacyCallAt: null,
        lastLegacyUrl: null,
        enabled: true,
        mode: 'soft-governor'
      };

      const originalFetch = window.fetch.bind(window);
      let repaintTimer = null;

      const urlText = (input) => {
        if (typeof input === 'string') return input;
        if (input?.url) return String(input.url);
        return String(input || '');
      };

      const isAppPage = () => location.pathname === '/app' || location.pathname === '/app/';
      const isLegacyUrl = (url) => legacyPatterns.some((pattern) => url.includes(pattern));
      const isPrimary = () => document.documentElement.dataset.gcAppDataCore === 'primary' || document.documentElement.dataset.gcAppDataCore === 'primary-stale';

      function requestCoreRepaint(reason, delay = 360) {
        if (!state.enabled) return;
        window.clearTimeout(repaintTimer);
        repaintTimer = window.setTimeout(() => {
          if (!window.GCAppDataCorePrimaryReload || !isPrimary()) return;

          state.repaintsRequested += 1;
          try {
            window.GCAppDataCorePrimaryReload();
          } catch (error) {
            console.warn('[GC /app Legacy Governor] repaint failed', error);
          }
        }, delay);
      }

      window.fetch = async (...args) => {
        const url = urlText(args[0]);
        const legacy = isAppPage() && isLegacyUrl(url);
        const started = performance.now();

        if (legacy) {
          state.lastLegacyCallAt = new Date().toISOString();
          state.lastLegacyUrl = url;
          document.documentElement.dataset.gcAppLegacy = 'legacy-call-detected';
        }

        try {
          const response = await originalFetch(...args);

          if (legacy) {
            const entry = {
              url,
              status: response.status,
              ok: response.ok,
              ms: Math.round(performance.now() - started),
              at: new Date().toISOString()
            };

            state.legacyCalls.push(entry);
            state.legacyCalls = state.legacyCalls.slice(-40);

            if (isPrimary()) requestCoreRepaint('legacy-fetch:' + url);
          }

          return response;
        } catch (error) {
          if (legacy) {
            state.legacyCalls.push({
              url,
              status: 0,
              ok: false,
              ms: Math.round(performance.now() - started),
              at: new Date().toISOString(),
              error: error?.message || String(error)
            });
            state.legacyCalls = state.legacyCalls.slice(-40);
          }
          throw error;
        }
      };

      window.GCAppLegacyGovernor = {
        version: 'v1',
        state,
        legacyPatterns,
        requestCoreRepaint,
        markCorePaint() {
          state.lastCorePaintAt = new Date().toISOString();
          document.documentElement.dataset.gcAppLegacy = 'governed-v1';
        },
        disable() {
          state.enabled = false;
          document.documentElement.dataset.gcAppLegacy = 'disabled';
        },
        enable() {
          state.enabled = true;
          document.documentElement.dataset.gcAppLegacy = 'governed-v1';
        },
        status() {
          return {
            ...state,
            dataCore: document.documentElement.dataset.gcAppDataCore || null,
            dataCoreVersion: document.documentElement.dataset.gcAppDataCoreVersion || null
          };
        }
      };

      document.documentElement.dataset.gcAppLegacy = 'governor-ready';
      console.info('[GC /app Legacy Governor v1] ready');
    })();
    ${EARLY_END}
  </script>
`;

const lateScript = `
  <script is:inline>
    ${LATE_START}
    (() => {
      const ensureBadge = () => {
        let badge = document.getElementById('gcAppLegacyBadge');
        if (!badge) {
          const host = document.querySelector('.gc-live-panel__title') || document.querySelector('.gc-hero') || document.body;
          badge = document.createElement('span');
          badge.id = 'gcAppLegacyBadge';
          badge.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'min-height:24px',
            'padding:4px 8px',
            'border:1px solid rgba(255,207,90,.38)',
            'border-radius:999px',
            'color:#ffcf5a',
            'font-size:.68rem',
            'font-weight:900',
            'letter-spacing:.08em',
            'text-transform:uppercase',
            'background:rgba(255,207,90,.08)',
            'margin-left:8px'
          ].join(';');
          host.appendChild(badge);
        }

        const status = window.GCAppLegacyGovernor?.status?.();
        const calls = status?.legacyCalls?.length || 0;
        badge.textContent = calls ? 'Legacy governed' : 'Legacy quiet';
        badge.dataset.calls = String(calls);
      };

      const settle = () => {
        window.GCAppLegacyGovernor?.requestCoreRepaint?.('settle-after-load', 180);
        window.setTimeout(() => window.GCAppLegacyGovernor?.requestCoreRepaint?.('settle-1200', 180), 1200);
        window.setTimeout(() => window.GCAppLegacyGovernor?.requestCoreRepaint?.('settle-3000', 180), 3000);
        window.setTimeout(ensureBadge, 600);
        window.setInterval(ensureBadge, 5000);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', settle, { once: true });
      } else {
        settle();
      }

      window.addEventListener('load', () => {
        window.GCAppLegacyGovernor?.requestCoreRepaint?.('window-load', 220);
        window.setTimeout(ensureBadge, 800);
      }, { once: true });

      document.documentElement.dataset.gcAppLegacyPhase = 'phase-1-governor';
      console.info('[GC /app Legacy Governor v1] late guard active');
    })();
    ${LATE_END}
  </script>
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const scriptStart = text.lastIndexOf('<script', startIndex);
    const scriptEnd = text.indexOf('</script>', endIndex);

    if (scriptStart !== -1 && scriptEnd !== -1) {
      return text.slice(0, scriptStart) + block.trimEnd() + '\n' + text.slice(scriptEnd + '</script>'.length);
    }

    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

// Early guard: before first script in app.astro.
let next = replaceMarkedBlock(source, EARLY_START, EARLY_END, earlyScript);
if (next === null) {
  const firstScript = source.indexOf('<script');
  if (firstScript === -1) {
    const anchor = '</style>';
    const index = source.lastIndexOf(anchor);
    if (index === -1) {
      console.error('[GC APP LEGACY GOVERNOR] No script/style anchor found.');
      process.exit(1);
    }
    next = source.slice(0, index + anchor.length) + '\n' + earlyScript + source.slice(index + anchor.length);
  } else {
    next = source.slice(0, firstScript) + earlyScript + '\n' + source.slice(firstScript);
  }
}

// Late guard: before </AppLayout>.
source = next;
next = replaceMarkedBlock(source, LATE_START, LATE_END, lateScript);
if (next === null) {
  const anchor = '</AppLayout>';
  const index = source.lastIndexOf(anchor);
  if (index === -1) {
    console.error('[GC APP LEGACY GOVERNOR] Missing </AppLayout> anchor.');
    process.exit(1);
  }
  next = source.slice(0, index) + lateScript + '\n' + source.slice(index);
}

// Patch Data Core primary marker to notify governor after successful paint.
source = next;
if (!source.includes('GCAppLegacyGovernor?.markCorePaint?.()')) {
  source = source.replace(
    "document.documentElement.dataset.gcAppDataCore = 'primary';",
    "document.documentElement.dataset.gcAppDataCore = 'primary';\n        window.GCAppLegacyGovernor?.markCorePaint?.();"
  );
}

fs.writeFileSync(appPath, source, 'utf8');

console.log('[GC APP LEGACY GOVERNOR] Applied /app Legacy Governor v1.');
console.log('[GC APP LEGACY GOVERNOR] No endpoints or images changed.');
console.log('[GC APP LEGACY GOVERNOR] Run: npm run build');
