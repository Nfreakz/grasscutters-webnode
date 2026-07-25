import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const indexFile = path.join(projectRoot, 'src', 'pages', 'index.astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, '_gc_backups', `home-v5-stability-${stamp}`);

function fail(message) {
  console.error(`[GC HOME V5] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexFile)) fail(`No existe ${indexFile}`);

const backupFile = path.join(backupRoot, 'src', 'pages', 'index.astro');
fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(indexFile, backupFile);

let source = fs.readFileSync(indexFile, 'utf8');

if (source.includes('GC_HOME_POPOVER_ROWS_STABILITY_V5')) {
  console.log('[GC HOME V5] El parche ya está aplicado.');
  process.exit(0);
}

/* Remove obsolete duplicated enhancement blocks that keep observing/repainting. */
const obsoleteMarkers = [
  'GC_HOME_CUSTOM_AVATAR_DIRECTORY_V2',
  'GC_HOME_CUSTOM_AVATAR_CANONICAL_V3',
  'GC_HOME_PILOT_POPOVER_GLOBAL_V2',
  'GC_HOME_PILOT_POPOVER_RATINGS_STATS_V3'
];

let removedBlocks = 0;

for (const marker of obsoleteMarkers) {
  const patterns = [
    new RegExp(
      `\\n\\s*<script>\\s*\\/\\* ${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\*\\/[\\s\\S]*?<\\/script>\\s*`,
      'g'
    ),
    new RegExp(
      `\\n\\s*<style is:global>\\s*\\/\\* ${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\*\\/[\\s\\S]*?<\\/style>\\s*`,
      'g'
    )
  ];

  for (const pattern of patterns) {
    const before = source;
    source = source.replace(pattern, '\n');
    if (source !== before) removedBlocks += 1;
  }
}

/* Raise common home ranking render limits from five to seven, only in index. */
const limitPatterns = [
  [/\.slice\(\s*0\s*,\s*5\s*\)/g, '.slice(0, 7)'],
  [/\.slice\(\s*0\s*,\s*6\s*\)/g, '.slice(0, 7)'],
  [/limit:\s*5\b/g, 'limit: 7'],
  [/limit:\s*6\b/g, 'limit: 7']
];

let limitChanges = 0;
for (const [pattern, replacement] of limitPatterns) {
  const matches = source.match(pattern);
  if (matches) limitChanges += matches.length;
  source = source.replace(pattern, replacement);
}

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_POPOVER_ROWS_STABILITY_V5 */

    /* Seven visible drivers without increasing the panels. */
    .gc-home2 [data-home2-combo-ranking],
    .gc-home2 [data-home2-combo-ranking-gt4]{
      gap:4px !important;
    }

    .gc-home2 [data-home2-combo-ranking] > .gc-home2-combo-rank,
    .gc-home2 [data-home2-combo-ranking-gt4] > .gc-home2-combo-rank{
      min-height:34px !important;
      padding:4px 7px !important;
      gap:6px !important;
    }

    .gc-home2 .gc-home2-combo-ranking-list .gc-home2-rank-badge{
      width:21px !important;
      min-width:21px !important;
      height:21px !important;
      min-height:21px !important;
      font-size:12px !important;
    }

    .gc-home2 .gc-home2-combo-rank__avatar{
      width:21px !important;
      min-width:21px !important;
      height:21px !important;
      min-height:21px !important;
    }

    .gc-home2 .gc-home2-combo-rank .gc-home-pilot-link,
    .gc-home2 .gc-home2-combo-rank strong{
      font-size:11px !important;
      line-height:1 !important;
    }

    .gc-home2 .gc-home2-combo-rank small{
      margin-top:2px !important;
      font-size:7.5px !important;
      line-height:1 !important;
    }

    .gc-home2 .gc-home2-combo-rank em{
      font-size:12px !important;
      line-height:1 !important;
    }

    /* Avoid visual resizing/fading when data refreshes. */
    .gc-home2 img{
      transition:none !important;
      animation:none !important;
    }

    .gc-home2 .gc-home2-combo-rank,
    .gc-home2 .gc-home2-table__row,
    .gc-home2 .gc-home2-champ-standing-row,
    .gc-home2 .gc-home2-rating-row{
      transition:
        border-color .12s ease,
        background-color .12s ease !important;
    }

    .gc-home-pilot-popover__stat strong[data-stat="podiums"]{
      color:#96ff2f !important;
    }
  </style>

  <script>
    /* GC_HOME_POPOVER_ROWS_STABILITY_V5 */
    (() => {
      const root = document.querySelector<HTMLElement>('[data-gc-home2]');
      const popover = document.querySelector<HTMLElement>('[data-home-pilot-popover]');
      if (!root || !popover) return;

      type PodiumValue = number | null;

      const podiumCache = new Map<string, PodiumValue>();
      const stableImageSrc = new WeakMap<HTMLImageElement, string>();
      let podiumTimer = 0;

      const placeholderNames = [
        '/images/pilot-avatar-default.png',
        '/ui/home2/gc-home2-track-fallback.svg',
        'image-pending'
      ];

      const isPlaceholder = (value: string): boolean => {
        const normalized = String(value || '').toLowerCase();
        return placeholderNames.some((token) => normalized.includes(token));
      };

      const rememberImage = (img: HTMLImageElement): void => {
        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        if (src && !isPlaceholder(src)) stableImageSrc.set(img, src);
      };

      root.querySelectorAll<HTMLImageElement>('img').forEach(rememberImage);

      /*
       * Core data can refresh normally, but a good image is not allowed to
       * flash back to a placeholder while the same row is being rebuilt.
       */
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === 'attributes' &&
            mutation.target instanceof HTMLImageElement
          ) {
            const img = mutation.target;
            const src = img.currentSrc || img.src || img.getAttribute('src') || '';
            const previous = stableImageSrc.get(img);

            if (isPlaceholder(src) && previous && previous !== src) {
              img.src = previous;
              continue;
            }

            rememberImage(img);
          }
        }
      }).observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });

      const numberOrNull = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const findPodiums = (payload: any): PodiumValue => {
        const candidates = [
          payload?.summary?.podiums,
          payload?.summary?.officialPodiums,
          payload?.ratings?.podiums,
          payload?.ratings?.officialPodiums,
          payload?.pilot?.podiums,
          payload?.pilot?.officialPodiums,
          payload?.stats?.podiums,
          payload?.championship?.podiums
        ];

        for (const candidate of candidates) {
          const parsed = numberOrNull(candidate);
          if (parsed !== null) return parsed;
        }

        return null;
      };

      const profileId = (): string => {
        const fullLink = popover.querySelector<HTMLAnchorElement>(
          '.gc-home-pilot-popover__footer a[href*="/pilotos/"]'
        );

        return decodeURIComponent(
          String(fullLink?.getAttribute('href') || '')
            .match(/\\/pilotos\\/([^/?#]+)/i)?.[1] || ''
        );
      };

      const loadPodiums = async (id: string): Promise<PodiumValue> => {
        if (!id) return null;
        if (podiumCache.has(id)) return podiumCache.get(id) ?? null;

        try {
          const response = await fetch(
            \`/api/pilots/\${encodeURIComponent(id)}/profile\`,
            {
              credentials: 'same-origin',
              headers: { Accept: 'application/json' }
            }
          );

          if (!response.ok) {
            podiumCache.set(id, null);
            return null;
          }

          const payload = await response.json();
          const podiums = findPodiums(payload);
          podiumCache.set(id, podiums);
          return podiums;
        } catch {
          podiumCache.set(id, null);
          return null;
        }
      };

      const applyPodiums = async (): Promise<void> => {
        if (!popover.classList.contains('is-open')) return;

        const stats = Array.from(
          popover.querySelectorAll<HTMLElement>(
            '.gc-home-pilot-popover__stat'
          )
        );

        const block = stats[5];
        if (!block) return;

        const label = block.querySelector<HTMLElement>('span');
        const value = block.querySelector<HTMLElement>('strong');

        if (label) label.textContent = 'Podios';
        if (value) {
          value.textContent = '--';
          value.dataset.stat = 'podiums';
        }

        const id = profileId();
        const podiums = await loadPodiums(id);

        if (
          popover.classList.contains('is-open') &&
          profileId() === id &&
          value
        ) {
          value.textContent = podiums === null
            ? '--'
            : new Intl.NumberFormat('es-ES').format(podiums);
        }
      };

      const schedulePodiums = (): void => {
        if (podiumTimer) window.clearTimeout(podiumTimer);
        podiumTimer = window.setTimeout(() => {
          podiumTimer = 0;
          applyPodiums();
        }, 80);
      };

      new MutationObserver(schedulePodiums).observe(popover, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });

      popover.addEventListener('pointerenter', schedulePodiums);
      popover.addEventListener('focusin', schedulePodiums);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(indexFile, source, 'utf8');

const reportDir = path.join(projectRoot, '_gc_reports', 'home');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'home-v5-stability.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    removedObsoleteBlocks: removedBlocks,
    rankingLimitChanges: limitChanges,
    retainedSystems: [
      'base pilot links/popover',
      'canonical Steam GUID identity',
      'unified pilots2 statistics'
    ],
    changes: [
      'podiums replaces circuits in sixth popup statistic',
      'up to seven ranking rows',
      'compact Liga and GT4 rows',
      'placeholder image flash suppression',
      'duplicate old observers removed'
    ]
  }, null, 2) + '\n',
  'utf8'
);

console.log('[GC HOME V5] Aplicado.');
console.log(`  - Bloques antiguos retirados: ${removedBlocks}`);
console.log(`  - Límites de ranking ajustados: ${limitChanges}`);
console.log('  - Sexta estadística: Podios.');
console.log('  - Filas Liga/GT4 compactadas para 7 pilotos.');
console.log('  - Estabilización de imágenes activada.');
console.log(`  - Backup: ${backupFile}`);
