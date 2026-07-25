import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(
  projectRoot,
  '_gc_backups',
  `home-pilot-links-v5-1-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME PILOT LINKS V5.1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  fail('No se encontró el sistema base de popover.');
}

if (source.includes('GC_HOME_PILOT_LINKS_CANONICAL_V5_1')) {
  console.log('[GC HOME PILOT LINKS V5.1] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <script>
    /* GC_HOME_PILOT_LINKS_CANONICAL_V5_1 */
    (() => {
      type PilotRow = {
        id?: unknown;
        playerId?: unknown;
        name?: unknown;
        displayName?: unknown;
        publicName?: unknown;
        steamGuid?: unknown;
      };

      const root = document.querySelector<HTMLElement>('[data-gc-home2]');
      if (!root) return;

      const byName = new Map<string, PilotRow>();
      const byGuid = new Map<string, PilotRow>();
      const aliasGuid = new Map<string, string>();

      let loaded = false;
      let loading: Promise<void> | null = null;
      let timer = 0;

      const normalize = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'');

      const cleanGuid = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^steam:/,'');

      const idOf = (row: PilotRow): string =>
        String(row?.playerId ?? row?.id ?? '').trim();

      const nameOf = (row: PilotRow): string =>
        String(row?.displayName || row?.publicName || row?.name || '').trim();

      const numericId = (value: string): number => {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0
          ? parsed
          : Number.MAX_SAFE_INTEGER;
      };

      const preferCanonical = (
        current: PilotRow | undefined,
        candidate: PilotRow
      ): PilotRow => {
        if (!current) return candidate;
        return numericId(idOf(candidate)) < numericId(idOf(current))
          ? candidate
          : current;
      };

      const extractPilots = (payload: any): PilotRow[] => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.pilots)) return payload.pilots;
        if (Array.isArray(payload?.data?.items)) return payload.data.items;
        if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
        return [];
      };

      const extractRatings = (payload: any): any[] => [
        ...(Array.isArray(payload?.leaderboard?.sr) ? payload.leaderboard.sr : []),
        ...(Array.isArray(payload?.leaderboard?.gsr) ? payload.leaderboard.gsr : [])
      ];

      const loadDirectory = async (): Promise<void> => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async (): Promise<void> => {
          const [pilotsResponse, ratingsResponse] = await Promise.all([
            fetch('/api/gc/pilots2?source=all&limit=all', {
              credentials:'same-origin',
              headers:{Accept:'application/json'}
            }),
            fetch('/api/gc/ratings/championship', {
              credentials:'same-origin',
              headers:{Accept:'application/json'}
            })
          ]);

          if (!pilotsResponse.ok) {
            throw new Error(\`Pilots2 HTTP \${pilotsResponse.status}\`);
          }

          const pilotsPayload = await pilotsResponse.json();
          const ratingsPayload = ratingsResponse.ok
            ? await ratingsResponse.json()
            : {};

          for (const row of extractPilots(pilotsPayload)) {
            const nameKey = normalize(nameOf(row));
            const guidKey = cleanGuid(row?.steamGuid);
            const id = idOf(row);

            if (!nameKey || !id) continue;

            byName.set(
              nameKey,
              preferCanonical(byName.get(nameKey), row)
            );

            if (guidKey) {
              byGuid.set(
                guidKey,
                preferCanonical(byGuid.get(guidKey), row)
              );
            }
          }

          for (const row of extractRatings(ratingsPayload)) {
            const alias = normalize(
              row?.driver ||
              row?.displayName ||
              row?.name
            );

            const mergedKey = Array.isArray(row?.mergedDriverKeys)
              ? row.mergedDriverKeys.find((value: unknown) =>
                  String(value || '').toLowerCase().startsWith('steam:')
                )
              : '';

            const guidKey = cleanGuid(
              row?.steamGuid ||
              mergedKey ||
              row?.driverKey
            );

            if (alias && guidKey) {
              aliasGuid.set(alias, guidKey);
            }
          }

          loaded = true;
        })().catch((error: unknown) => {
          console.warn(
            '[GC Home pilot links V5.1] No se pudo cargar el directorio',
            error
          );
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

      const resolvePilot = (visibleName: string): PilotRow | null => {
        const key = normalize(visibleName);
        const guidKey = aliasGuid.get(key);

        if (guidKey && byGuid.has(guidKey)) {
          return byGuid.get(guidKey) || null;
        }

        const direct = byName.get(key);
        if (!direct) return null;

        const directGuid = cleanGuid(direct?.steamGuid);
        return (
          directGuid && byGuid.has(directGuid)
            ? byGuid.get(directGuid)
            : direct
        ) || null;
      };

      const convert = (
        element: HTMLElement,
        visibleName: string,
        pilot: PilotRow
      ): void => {
        const id = idOf(pilot);
        if (!id || !visibleName) return;

        if (element instanceof HTMLAnchorElement) {
          element.classList.add('gc-home-pilot-link');
          element.href = \`/pilotos/\${encodeURIComponent(id)}\`;
          element.dataset.pilotId = id;
          element.dataset.pilotName = visibleName;
          element.setAttribute(
            'aria-label',
            \`Ver ficha de \${visibleName}\`
          );
          return;
        }

        const link = document.createElement('a');
        link.className = 'gc-home-pilot-link';
        link.href = \`/pilotos/\${encodeURIComponent(id)}\`;
        link.dataset.pilotId = id;
        link.dataset.pilotName = visibleName;
        link.textContent = visibleName;
        link.setAttribute('aria-label', \`Ver ficha de \${visibleName}\`);
        element.replaceWith(link);
      };

      const enhanceSelector = (
        rowSelector: string,
        targetSelector: string
      ): void => {
        document.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
          const currentLink = row.querySelector<HTMLAnchorElement>(
            '.gc-home-pilot-link'
          );

          if (currentLink) {
            const visibleName = currentLink.textContent?.trim() || '';
            const pilot = resolvePilot(visibleName);
            if (pilot) convert(currentLink, visibleName, pilot);
            return;
          }

          const target = row.querySelector<HTMLElement>(targetSelector);
          const visibleName = target?.textContent?.trim() || '';
          const pilot = resolvePilot(visibleName);

          if (target && pilot && visibleName && visibleName !== '--') {
            convert(target, visibleName, pilot);
          }
        });
      };

      const enhanceAll = async (): Promise<void> => {
        await loadDirectory();
        if (!loaded) return;

        enhanceSelector(
          '.gc-home2-combo-rank',
          'div > strong'
        );

        enhanceSelector(
          '.gc-home2-table__row:not(.gc-home2-table__head):not(.gc-home2-table__row--head)',
          'span:first-child'
        );

        enhanceSelector(
          '.gc-home2-champ-standing-row',
          '.gc-home2-champ-standing-meta strong, strong'
        );

        enhanceSelector(
          '.gc-home2-rating-driver',
          'a, strong'
        );
      };

      const schedule = (): void => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = 0;
          enhanceAll();
        }, 120);
      };

      new MutationObserver(schedule).observe(root, {
        childList:true,
        subtree:true
      });

      enhanceAll();
      window.setTimeout(enhanceAll, 1000);
      window.setTimeout(enhanceAll, 2500);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME PILOT LINKS V5.1] Aplicado.');
console.log('  - ANGEL vuelve a tener enlace y popup.');
console.log('  - Alias resueltos por Steam GUID.');
console.log('  - El alias visible se conserva.');
console.log('  - Un único observador para enlaces.');
console.log(`  - Backup: ${backupFile}`);
