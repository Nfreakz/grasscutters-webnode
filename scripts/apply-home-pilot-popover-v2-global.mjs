import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-pilot-popover-v2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME PILOT POPOVER V2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_PILOT_POPOVER_GLOBAL_V2')) {
  console.log('[GC HOME PILOT POPOVER V2] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_PILOT_POPOVER_GLOBAL_V2 */
    .gc-home2 .gc-home2-combo-rank .gc-home-pilot-link,
    .gc-home2 .gc-home2-table__row .gc-home-pilot-link{
      font-size:12px !important;
      line-height:1.05 !important;
      font-weight:900 !important;
    }

    .gc-home2 .gc-home2-rating-driver .gc-home-pilot-link,
    .gc-home2 .gc-home2-champ-standing-meta .gc-home-pilot-link{
      font-size:inherit !important;
      line-height:inherit !important;
      font-weight:950 !important;
    }

    .gc-home2 .gc-home-pilot-link,
    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible{
      text-decoration:none !important;
    }

    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible{
      color:var(--green,#96ff2f) !important;
    }
  </style>

  <script>
    /* GC_HOME_PILOT_POPOVER_GLOBAL_V2 */
    (() => {
      type PilotData = {
        id: string;
        name: string;
        avatarUrl: string;
        team: string;
        sessionsCount: number | null;
        totalLaps: number | null;
        totalHours: number | null;
        active30dLaps: number | null;
        cleanRate: number | null;
        favoriteCar: string;
        favoriteTrack: string;
        srClass: string;
        srScore: number | null;
        gsrClass: string;
        gsrScore: number | null;
      };

      const root = document.querySelector<HTMLElement>('[data-gc-home2]');
      const popover = document.querySelector<HTMLElement>('[data-home-pilot-popover]');
      if (!root || !popover) return;

      const byName = new Map<string, PilotData>();
      const byId = new Map<string, PilotData>();
      let loaded = false;
      let loading: Promise<void> | null = null;
      let timer = 0;

      const normalize = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'');

      const clean = (value: unknown, fallback = ''): string => {
        const out = String(value ?? '').trim();
        return out || fallback;
      };

      const num = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const emptyPilot = (id: string, name: string): PilotData => ({
        id,
        name,
        avatarUrl:id ? \`/api/pilot-avatar/\${encodeURIComponent(id)}\` : '/images/pilot-avatar-default.png',
        team:'',
        sessionsCount:null,
        totalLaps:null,
        totalHours:null,
        active30dLaps:null,
        cleanRate:null,
        favoriteCar:'',
        favoriteTrack:'',
        srClass:'',
        srScore:null,
        gsrClass:'',
        gsrScore:null
      });

      const mergePilot = (base: PilotData, patch: Partial<PilotData>): PilotData => ({
        ...base,
        ...Object.fromEntries(
          Object.entries(patch).filter(([,value]) =>
            value !== undefined &&
            value !== null &&
            value !== ''
          )
        )
      });

      const register = (pilot: PilotData, priority = 10): void => {
        if (!pilot.id || !pilot.name) return;

        const key = normalize(pilot.name);
        const existing = byName.get(key);

        if (!existing || priority >= Number((existing as any).__priority || 0)) {
          (pilot as any).__priority = priority;
          byName.set(key,pilot);
        }

        const byIdExisting = byId.get(pilot.id);
        byId.set(pilot.id,byIdExisting ? mergePilot(byIdExisting,pilot) : pilot);
      };

      const extractPilots = (payload: any): any[] => {
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

      const load = async (): Promise<void> => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async (): Promise<void> => {
          const [pilotsRes,ratingsRes] = await Promise.all([
            fetch('/api/gc/pilots2?source=all&limit=all',{
              credentials:'same-origin',
              headers:{Accept:'application/json'}
            }),
            fetch('/api/gc/ratings/championship',{
              credentials:'same-origin',
              headers:{Accept:'application/json'}
            })
          ]);

          const pilotsPayload = pilotsRes.ok ? await pilotsRes.json() : {};
          const ratingsPayload = ratingsRes.ok ? await ratingsRes.json() : {};

          extractPilots(pilotsPayload).forEach((row:any) => {
            const id = clean(row?.playerId ?? row?.id);
            const name = clean(row?.displayName || row?.publicName || row?.name);
            if (!id || !name) return;

            const pilot: PilotData = {
              id,
              name,
              avatarUrl:clean(row?.avatarUrl,\`/api/pilot-avatar/\${encodeURIComponent(id)}\`),
              team:clean(row?.team),
              sessionsCount:num(row?.sessionsCount ?? row?.races),
              totalLaps:num(row?.totalLaps),
              totalHours:num(row?.totalHours),
              active30dLaps:num(row?.active30dLaps),
              cleanRate:num(row?.cleanRate),
              favoriteCar:clean(row?.favoriteCar),
              favoriteTrack:clean(row?.favoriteTrack),
              srClass:clean(row?.srClass),
              srScore:num(row?.srScore),
              gsrClass:clean(row?.gsrClass),
              gsrScore:num(row?.gsrScore)
            };

            register(pilot,10);
          });

          extractRatings(ratingsPayload).forEach((row:any) => {
            const id = clean(row?.profilePlayerId);
            const name = clean(row?.driver || row?.displayName || row?.name);
            if (!id || !name) return;

            const existing = byId.get(id) || byName.get(normalize(name)) || emptyPilot(id,name);
            const pilot = mergePilot(existing,{
              id,
              name,
              avatarUrl:\`/api/pilot-avatar/\${encodeURIComponent(id)}\`,
              sessionsCount:num(row?.races),
              srClass:clean(row?.srClass),
              srScore:num(row?.sr),
              gsrClass:clean(row?.gsrClass),
              gsrScore:num(row?.gsr)
            });

            register(pilot,100);
          });

          loaded = true;
        })().catch((error:unknown) => {
          console.warn('[GC Home pilot popover V2] Error cargando directorio',error);
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

      const resolve = (name: string, id = ''): PilotData | null => {
        if (id && byId.has(id)) return byId.get(id) || null;
        return byName.get(normalize(name)) || null;
      };

      const replaceWithLink = (
        element: HTMLElement,
        name: string,
        pilot: PilotData
      ): void => {
        if (element.closest('.gc-home-pilot-link')) return;

        const link = document.createElement('a');
        link.className = 'gc-home-pilot-link';
        link.href = \`/pilotos/\${encodeURIComponent(pilot.id)}\`;
        link.dataset.pilotName = pilot.name;
        link.dataset.pilotId = pilot.id;
        link.textContent = name;
        link.setAttribute('aria-label',\`Ver ficha de \${pilot.name}\`);
        element.replaceWith(link);
      };

      const enhanceBestTimes = (): void => {
        document.querySelectorAll<HTMLElement>('.gc-home2-combo-rank').forEach((row) => {
          const target = row.querySelector<HTMLElement>('div > strong:not(.gc-home-pilot-link)');
          const name = target?.textContent?.trim() || '';
          const pilot = resolve(name);
          if (target && pilot) replaceWithLink(target,name,pilot);
        });
      };

      const enhanceTiming = (): void => {
        document.querySelectorAll<HTMLElement>(
          '.gc-home2-table__row:not(.gc-home2-table__head)'
        ).forEach((row) => {
          const target = row.querySelector<HTMLElement>('span:first-child:not(.gc-home-pilot-link)');
          const name = target?.textContent?.trim() || '';
          const pilot = resolve(name);
          if (target && pilot && name && name !== '--') replaceWithLink(target,name,pilot);
        });
      };

      const enhanceRatings = (): void => {
        document.querySelectorAll<HTMLElement>('.gc-home2-rating-driver').forEach((scope) => {
          const target = scope.querySelector<HTMLElement>('strong:not(.gc-home-pilot-link), a:not(.gc-home-pilot-link)');
          const name = target?.textContent?.trim() || '';
          const href = target instanceof HTMLAnchorElement ? target.getAttribute('href') || '' : '';
          const id = decodeURIComponent(href.match(/\\/pilotos\\/([^/?#]+)/i)?.[1] || '');
          const pilot = resolve(name,id);
          if (!target || !pilot) return;

          if (target instanceof HTMLAnchorElement) {
            target.classList.add('gc-home-pilot-link');
            target.dataset.pilotName = pilot.name;
            target.dataset.pilotId = pilot.id;
            target.href = \`/pilotos/\${encodeURIComponent(pilot.id)}\`;
          } else {
            replaceWithLink(target,name,pilot);
          }
        });
      };

      const enhanceChampionships = (): void => {
        document.querySelectorAll<HTMLElement>('.gc-home2-champ-standing-row').forEach((row) => {
          const target = row.querySelector<HTMLElement>(
            '.gc-home2-champ-standing-meta strong:not(.gc-home-pilot-link), strong:not(.gc-home-pilot-link)'
          );
          const name = target?.textContent?.trim() || '';
          const pilot = resolve(name);
          if (target && pilot) replaceWithLink(target,name,pilot);
        });
      };

      const enhanceAll = async (): Promise<void> => {
        await load();
        if (!loaded) return;
        enhanceBestTimes();
        enhanceTiming();
        enhanceRatings();
        enhanceChampionships();
      };

      const schedule = (): void => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = 0;
          enhanceAll();
        },100);
      };

      new MutationObserver(schedule).observe(root,{
        childList:true,
        subtree:true,
        characterData:true
      });

      enhanceAll();
      window.setTimeout(enhanceAll,1000);
      window.setTimeout(enhanceAll,2500);
      window.setTimeout(enhanceAll,5000);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME PILOT POPOVER V2] Aplicado.');
console.log('  - Texto reducido en mejores tiempos.');
console.log('  - Angel y pilotos solo presentes en ratings enlazados.');
console.log('  - Popover/enlace extendido a SR, GSR y campeonatos.');
console.log(`  - Backup: ${backupFile}`);
