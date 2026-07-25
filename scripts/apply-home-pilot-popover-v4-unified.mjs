import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(
  projectRoot,
  '_gc_backups',
  `home-pilot-popover-v4-unified-${stamp}`,
  'src',
  'pages',
  'index.astro'
);

function fail(message) {
  console.error(`[GC HOME PILOT POPOVER V4] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  fail('No se encontró el popover base de pilotos.');
}

if (source.includes('GC_HOME_PILOT_POPOVER_UNIFIED_V4')) {
  console.log('[GC HOME PILOT POPOVER V4] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

/* Retira el enriquecimiento V3 dependiente del leaderboard resumido. */
source = source.replace(
  /\n\s*<style is:global>\s*\/\* GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3 \*\/[\s\S]*?<\/style>\s*\n\s*<script>\s*\/\* GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3 \*\/[\s\S]*?<\/script>\s*/g,
  '\n'
);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_PILOT_POPOVER_UNIFIED_V4 */
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
      min-width:27px;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge strong{
      margin-left:auto;
      font-size:13px;
    }

    .gc-home-pilot-popover__rating .gc-rating-badge small{
      font-size:11px;
      opacity:.96;
    }

    .gc-home-pilot-popover__stat strong{
      color:#96ff2f !important;
    }
  </style>

  <script>
    /* GC_HOME_PILOT_POPOVER_UNIFIED_V4 */
    (() => {
      type PilotSummary = {
        id: string;
        name: string;
        steamGuid: string;
        avatarUrl: string;
        srClass: string;
        srScore: number | null;
        gsrClass: string;
        gsrScore: number | null;
        validLaps: number | null;
        totalLaps: number | null;
        totalHours: number | null;
        active30dLaps: number | null;
        cleanRate: number | null;
        tracksCount: number | null;
      };

      const popover = document.querySelector<HTMLElement>(
        '[data-home-pilot-popover]'
      );

      if (!popover) return;

      const byName = new Map<string, PilotSummary>();
      const byId = new Map<string, PilotSummary>();
      const byGuid = new Map<string, PilotSummary>();

      let loaded = false;
      let loading: Promise<void> | null = null;
      let timer = 0;

      const normalize = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'');

      const clean = (value: unknown): string =>
        String(value ?? '').trim();

      const guid = (value: unknown): string =>
        clean(value).toLowerCase().replace(/^steam:/,'');

      const num = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const numericId = (value: string): number => {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0
          ? parsed
          : Number.MAX_SAFE_INTEGER;
      };

      const extractRows = (payload: any): any[] => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.pilots)) return payload.pilots;
        if (Array.isArray(payload?.data?.items)) return payload.data.items;
        if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
        return [];
      };

      const toSummary = (row: any): PilotSummary => {
        const id = clean(row?.playerId ?? row?.id);
        return {
          id,
          name:clean(row?.displayName || row?.publicName || row?.name),
          steamGuid:guid(row?.steamGuid),
          avatarUrl:clean(
            row?.avatarUrl ||
            (id ? \`/api/pilot-avatar/\${encodeURIComponent(id)}\` : '')
          ),
          srClass:clean(row?.srClass),
          srScore:num(row?.srScore),
          gsrClass:clean(row?.gsrClass),
          gsrScore:num(row?.gsrScore),
          validLaps:num(row?.validLaps),
          totalLaps:num(row?.totalLaps),
          totalHours:num(row?.totalHours),
          active30dLaps:num(row?.active30dLaps),
          cleanRate:num(row?.cleanRate),
          tracksCount:num(row?.tracksCount)
        };
      };

      const preferCanonical = (
        current: PilotSummary | undefined,
        candidate: PilotSummary
      ): PilotSummary => {
        if (!current) return candidate;
        return numericId(candidate.id) < numericId(current.id)
          ? candidate
          : current;
      };

      const load = async (): Promise<void> => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async (): Promise<void> => {
          const response = await fetch(
            '/api/gc/pilots2?source=all&limit=all',
            {
              credentials:'same-origin',
              headers:{Accept:'application/json'}
            }
          );

          if (!response.ok) {
            throw new Error(\`Pilots2 HTTP \${response.status}\`);
          }

          const payload = await response.json();
          const rows = extractRows(payload);

          for (const row of rows) {
            const candidate = toSummary(row);
            if (!candidate.id || !candidate.name) continue;

            const nameKey = normalize(candidate.name);
            const guidKey = candidate.steamGuid;

            byName.set(
              nameKey,
              preferCanonical(byName.get(nameKey),candidate)
            );

            byId.set(candidate.id,candidate);

            if (guidKey) {
              byGuid.set(
                guidKey,
                preferCanonical(byGuid.get(guidKey),candidate)
              );
            }
          }

          /* Reemplaza por el registro canónico de cada GUID. */
          for (const [nameKey,pilot] of byName.entries()) {
            if (pilot.steamGuid && byGuid.has(pilot.steamGuid)) {
              byName.set(
                nameKey,
                byGuid.get(pilot.steamGuid) || pilot
              );
            }
          }

          loaded = true;
        })().catch((error: unknown) => {
          console.warn(
            '[GC Home pilot popover V4] No se pudo cargar pilots2',
            error
          );
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

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

      const classKey = (value: unknown): string => String(value || 'unknown')
        .trim()
        .toLowerCase()
        .replace('+','plus')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-|-$/g,'') || 'unknown';

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

      const resolvePilot = (): PilotSummary | null => {
        const visibleName = popover
          .querySelector<HTMLElement>('.gc-home-pilot-popover__name')
          ?.textContent
          ?.trim() || '';

        const fullLink = popover.querySelector<HTMLAnchorElement>(
          '.gc-home-pilot-popover__footer a[href*="/pilotos/"]'
        );

        const id = decodeURIComponent(
          String(fullLink?.getAttribute('href') || '')
            .match(/\\/pilotos\\/([^/?#]+)/i)?.[1] || ''
        );

        const byIdPilot = id ? byId.get(id) : undefined;
        if (byIdPilot?.steamGuid && byGuid.has(byIdPilot.steamGuid)) {
          return byGuid.get(byIdPilot.steamGuid) || byIdPilot;
        }

        return byIdPilot || byName.get(normalize(visibleName)) || null;
      };

      const updateStat = (
        block: HTMLElement | undefined,
        labelText: string,
        valueText: string
      ): void => {
        if (!block) return;

        const label = block.querySelector<HTMLElement>('span');
        const value = block.querySelector<HTMLElement>('strong');

        if (label) label.textContent = labelText;
        if (value) value.textContent = valueText;
      };

      const update = async (): Promise<void> => {
        if (!popover.classList.contains('is-open')) return;

        await load();
        if (!loaded) return;

        const pilot = resolvePilot();
        if (!pilot) return;

        const ratings = popover.querySelectorAll<HTMLElement>(
          '.gc-home-pilot-popover__rating'
        );

        if (ratings[0]) {
          ratings[0].innerHTML = badge(
            'sr',
            pilot.srClass,
            pilot.srScore
          );
        }

        if (ratings[1]) {
          ratings[1].innerHTML = badge(
            'gsr',
            pilot.gsrClass,
            pilot.gsrScore
          );
        }

        const stats = Array.from(
          popover.querySelectorAll<HTMLElement>(
            '.gc-home-pilot-popover__stat'
          )
        );

        updateStat(stats[0],'Vueltas vál.',fmt(pilot.validLaps,0));
        updateStat(stats[1],'Vueltas',fmt(pilot.totalLaps,0));
        updateStat(stats[2],'Horas',fmt(pilot.totalHours,1));
        updateStat(stats[3],'Activas 30d',fmt(pilot.active30dLaps,0));
        updateStat(
          stats[4],
          'Limpieza',
          pilot.cleanRate === null
            ? '--'
            : \`\${fmt(pilot.cleanRate,1)}%\`
        );
        updateStat(stats[5],'Circuitos',fmt(pilot.tracksCount,0));

        const avatar = popover.querySelector<HTMLImageElement>(
          '.gc-home-pilot-popover__avatar'
        );

        if (avatar && pilot.avatarUrl) {
          avatar.src = pilot.avatarUrl;
        }

        const fullLink = popover.querySelector<HTMLAnchorElement>(
          '.gc-home-pilot-popover__footer a'
        );

        if (fullLink) {
          fullLink.href = \`/pilotos/\${encodeURIComponent(pilot.id)}\`;
        }

        popover.dataset.gcUnifiedPilot = pilot.id;
      };

      const schedule = (): void => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = 0;
          update();
        },60);
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

console.log('[GC HOME PILOT POPOVER V4] Sistema unificado aplicado.');
console.log('  - Único origen: /api/gc/pilots2.');
console.log('  - Identidad canónica por Steam GUID.');
console.log('  - Mismo formato para todos los pilotos.');
console.log('  - Eliminado enriquecimiento parcial por leaderboard.');
console.log(`  - Backup: ${backupFile}`);
