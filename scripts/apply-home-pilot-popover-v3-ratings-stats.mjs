import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(
  projectRoot,
  '_gc_backups',
  `home-pilot-popover-v3-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME PILOT POPOVER V3] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  fail('No se encontró el popover base de pilotos.');
}

if (source.includes('GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3')) {
  console.log('[GC HOME PILOT POPOVER V3] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3 */
    .gc-home-pilot-popover__rating{
      padding:7px !important;
      background:rgba(255,255,255,.018) !important;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge{
      width:100%;
      min-height:34px;
      justify-content:flex-start;
      gap:7px;
      padding:6px 9px;
      box-sizing:border-box;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge__type{
      min-width:25px;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge strong{
      margin-left:auto;
      font-size:13px;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge small{
      font-size:11px;
      opacity:.95;
    }

    .gc-home-pilot-popover__stat strong[data-stat="official-races"],
    .gc-home-pilot-popover__stat strong[data-stat="podiums"]{
      color:#f4fff1;
    }
  </style>

  <script>
    /* GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3 */
    (() => {
      type RatingSummary = {
        name: string;
        srClass: string;
        srScore: number | null;
        gsrClass: string;
        gsrScore: number | null;
        races: number;
        wins: number;
        podiums: number;
      };

      const popover = document.querySelector<HTMLElement>(
        '[data-home-pilot-popover]'
      );

      if (!popover) return;

      const byName = new Map<string, RatingSummary>();
      let loaded = false;
      let loading: Promise<void> | null = null;
      let timer = 0;

      const normalize = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'');

      const num = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const classKey = (value: unknown): string => String(value || 'unknown')
        .trim()
        .toLowerCase()
        .replace('+','plus')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-|-$/g,'') || 'unknown';

      const fmt = (
        value: number | null,
        digits = 0
      ): string => value === null
        ? '--'
        : new Intl.NumberFormat('es-ES',{
            minimumFractionDigits:digits,
            maximumFractionDigits:digits
          }).format(value);

      const escapeHtml = (value: unknown): string => String(value ?? '')
        .replace(/[&<>"']/g,(char) => ({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        } as Record<string,string>)[char] || char);

      const load = async (): Promise<void> => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async (): Promise<void> => {
          const response = await fetch('/api/gc/ratings/championship',{
            credentials:'same-origin',
            headers:{Accept:'application/json'}
          });

          if (!response.ok) {
            throw new Error(\`Ratings HTTP \${response.status}\`);
          }

          const payload = await response.json();
          const srRows = Array.isArray(payload?.leaderboard?.sr)
            ? payload.leaderboard.sr
            : [];
          const gsrRows = Array.isArray(payload?.leaderboard?.gsr)
            ? payload.leaderboard.gsr
            : [];

          for (const row of [...srRows,...gsrRows]) {
            const name = String(
              row?.driver ||
              row?.displayName ||
              row?.name ||
              ''
            ).trim();

            const key = normalize(name);
            if (!key) continue;

            const current = byName.get(key) || {
              name,
              srClass:'',
              srScore:null,
              gsrClass:'',
              gsrScore:null,
              races:0,
              wins:0,
              podiums:0
            };

            current.name = name || current.name;

            if (row?.sr !== undefined && row?.sr !== null) {
              current.srScore = num(row.sr);
              current.srClass = String(row?.srClass || '');
            }

            if (row?.gsr !== undefined && row?.gsr !== null) {
              current.gsrScore = num(row.gsr);
              current.gsrClass = String(row?.gsrClass || '');
            }

            current.races = Math.max(
              current.races,
              Number(row?.races || 0)
            );
            current.wins = Math.max(
              current.wins,
              Number(row?.wins || 0)
            );
            current.podiums = Math.max(
              current.podiums,
              Number(row?.podiums || 0)
            );

            byName.set(key,current);
          }

          loaded = true;
        })().catch((error: unknown) => {
          console.warn(
            '[GC Home pilot popover V3] No se pudieron cargar ratings',
            error
          );
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

      const badge = (
        type: 'sr' | 'gsr',
        ratingClass: string,
        score: number | null
      ): string => {
        const safeClass = ratingClass || '--';
        const digits = type === 'sr' ? 1 : 0;

        return \`
          <span class="gc-rating-badge gc-rating-badge--\${type} gc-rating-badge--\${type}-\${classKey(safeClass)}">
            <span class="gc-rating-badge__type">\${type.toUpperCase()}</span>
            <strong>\${escapeHtml(safeClass)}</strong>
            <small>\${escapeHtml(fmt(score,digits))}</small>
          </span>
        \`;
      };

      const statBlocks = (): HTMLElement[] =>
        Array.from(
          popover.querySelectorAll<HTMLElement>(
            '.gc-home-pilot-popover__stat'
          )
        );

      const update = async (): Promise<void> => {
        if (!popover.classList.contains('is-open')) return;

        await load();
        if (!loaded) return;

        const visibleName = popover
          .querySelector<HTMLElement>('.gc-home-pilot-popover__name')
          ?.textContent
          ?.trim() || '';

        const rating = byName.get(normalize(visibleName));
        if (!rating) return;

        const ratingCells = popover.querySelectorAll<HTMLElement>(
          '.gc-home-pilot-popover__rating'
        );

        if (ratingCells[0]) {
          ratingCells[0].innerHTML = badge(
            'sr',
            rating.srClass,
            rating.srScore
          );
        }

        if (ratingCells[1]) {
          ratingCells[1].innerHTML = badge(
            'gsr',
            rating.gsrClass,
            rating.gsrScore
          );
        }

        const stats = statBlocks();

        if (stats[0]) {
          const label = stats[0].querySelector<HTMLElement>('span');
          const value = stats[0].querySelector<HTMLElement>('strong');

          if (label) label.textContent = 'Carreras ofic.';
          if (value) {
            value.textContent = fmt(rating.races,0);
            value.dataset.stat = 'official-races';
          }
        }

        if (stats[5]) {
          const label = stats[5].querySelector<HTMLElement>('span');
          const value = stats[5].querySelector<HTMLElement>('strong');

          if (label) label.textContent = 'Podios';
          if (value) {
            value.textContent = fmt(rating.podiums,0);
            value.dataset.stat = 'podiums';
          }
        }
      };

      const schedule = (): void => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = 0;
          update();
        },40);
      };

      new MutationObserver(schedule).observe(popover,{
        attributes:true,
        attributeFilter:['class'],
        childList:true,
        subtree:true
      });

      popover.addEventListener('pointerenter',schedule);
      popover.addEventListener('focusin',schedule);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME PILOT POPOVER V3] Aplicado.');
console.log('  - SR/GSR con badges oficiales de colores.');
console.log('  - Carreras = solo carreras oficiales computadas.');
console.log('  - ID sustituido por podios.');
console.log(`  - Backup: ${backupFile}`);
