import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-custom-avatars-v3-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME AVATARS V3] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_CUSTOM_AVATAR_CANONICAL_V3')) {
  console.log('[GC HOME AVATARS V3] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <script>
    /* GC_HOME_CUSTOM_AVATAR_CANONICAL_V3 */
    (() => {
      const DEFAULT_AVATAR = '/images/pilot-avatar-default.png';
      const root = document.querySelector('[data-gc-home2]');
      if (!root) return;

      type AvatarCandidate = {
        id: string;
        avatar: string;
        priority: number;
      };

      const canonicalByName = new Map<string, AvatarCandidate>();
      const canonicalById = new Map<string, string>();

      let loaded = false;
      let loading: Promise<void> | null = null;
      let scheduled = 0;

      const normalizeName = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');

      const safeId = (value: unknown): string => {
        const raw = String(value ?? '').trim();
        return /^\\d+$/.test(raw) ? raw : '';
      };

      const idScore = (id: string): number => {
        const numeric = Number(id);
        if (!Number.isFinite(numeric) || numeric <= 0) return Number.MAX_SAFE_INTEGER;
        return numeric;
      };

      const avatarUrl = (id: string): string =>
        id ? \`/api/pilot-avatar/\${encodeURIComponent(id)}\` : DEFAULT_AVATAR;

      const register = (
        nameValue: unknown,
        idValue: unknown,
        directAvatar: unknown,
        priority: number
      ): void => {
        const name = normalizeName(nameValue);
        const id = safeId(idValue);
        if (!name || !id) return;

        const direct = String(directAvatar || '').trim();
        const avatar = direct && direct !== DEFAULT_AVATAR ? direct : avatarUrl(id);

        canonicalById.set(id, avatar);

        const current = canonicalByName.get(name);
        const candidate: AvatarCandidate = { id, avatar, priority };

        if (
          !current ||
          candidate.priority > current.priority ||
          (
            candidate.priority === current.priority &&
            idScore(candidate.id) < idScore(current.id)
          )
        ) {
          canonicalByName.set(name, candidate);
        }
      };

      const extractPilotRows = (payload: any): any[] => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.pilots)) return payload.pilots;
        if (Array.isArray(payload?.data?.items)) return payload.data.items;
        if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
        return [];
      };

      const extractRatingRows = (payload: any): any[] => [
        ...(Array.isArray(payload?.leaderboard?.sr) ? payload.leaderboard.sr : []),
        ...(Array.isArray(payload?.leaderboard?.gsr) ? payload.leaderboard.gsr : [])
      ];

      const loadCanonicalDirectory = async (): Promise<void> => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async (): Promise<void> => {
          const [pilotsResponse, ratingsResponse] = await Promise.all([
            fetch('/api/gc/pilots2?source=all&limit=all', {
              credentials: 'same-origin',
              headers: { Accept: 'application/json' }
            }),
            fetch('/api/gc/ratings/championship', {
              credentials: 'same-origin',
              headers: { Accept: 'application/json' }
            })
          ]);

          if (!pilotsResponse.ok) {
            throw new Error(\`Pilots2 HTTP \${pilotsResponse.status}\`);
          }
          if (!ratingsResponse.ok) {
            throw new Error(\`Ratings HTTP \${ratingsResponse.status}\`);
          }

          const [pilotsPayload, ratingsPayload] = await Promise.all([
            pilotsResponse.json(),
            ratingsResponse.json()
          ]);

          // Priority 10: consolidated pilots directory.
          // Duplicate names keep the lowest numeric ID.
          extractPilotRows(pilotsPayload).forEach((row: any) => {
            register(
              row?.displayName || row?.publicName || row?.name,
              row?.playerId ?? row?.id,
              row?.avatarUrl || row?.avatar_url,
              10
            );
          });

          // Priority 100: canonical profilePlayerId emitted by ratings.
          // This wins over technical mirror/server IDs.
          extractRatingRows(ratingsPayload).forEach((row: any) => {
            register(
              row?.driver || row?.displayName || row?.name,
              row?.profilePlayerId,
              '',
              100
            );
          });

          loaded = true;
        })().catch((error: unknown) => {
          console.warn('[GC Home avatars V3] No se pudo crear el índice canónico', error);
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

      const textFrom = (
        selector: string,
        scope: ParentNode | null = document
      ): string => scope?.querySelector?.(selector)?.textContent?.trim() || '';

      const profileIdFromLink = (scope: ParentNode | null): string => {
        const link = scope?.querySelector?.('a[href*="/pilotos/"]');
        const match = String(link?.getAttribute?.('href') || '').match(/\\/pilotos\\/([^/?#]+)/i);
        return match?.[1] ? decodeURIComponent(match[1]) : '';
      };

      const context = (
        img: HTMLImageElement
      ): { name: string; id: string } => {
        if (img.matches('[data-home2-best-avatar]')) {
          return {
            name: textFrom('[data-home2-best-driver]'),
            id: ''
          };
        }

        const ratingRow = img.closest('.gc-home2-rating-driver-cell');
        if (ratingRow) {
          return {
            name: textFrom(
              '.gc-home2-rating-driver a, .gc-home2-rating-driver strong',
              ratingRow
            ),
            id: profileIdFromLink(ratingRow)
          };
        }

        const comboRow = img.closest('.gc-home2-combo-rank');
        if (comboRow) {
          return {
            name: textFrom('strong', comboRow),
            id: profileIdFromLink(comboRow)
          };
        }

        const championshipRow = img.closest('.gc-home2-champ-standing-row');
        if (championshipRow) {
          return {
            name: textFrom(
              '.gc-home2-champ-standing-meta strong, strong',
              championshipRow
            ),
            id: profileIdFromLink(championshipRow)
          };
        }

        return { name: '', id: '' };
      };

      const resolve = (
        value: { name: string; id: string }
      ): string => {
        const directId = safeId(value.id);
        if (directId) {
          return canonicalById.get(directId) || avatarUrl(directId);
        }

        const name = normalizeName(value.name);
        const candidate = name ? canonicalByName.get(name) : undefined;
        return candidate?.avatar || '';
      };

      const apply = (img: HTMLImageElement): void => {
        const avatar = resolve(context(img));
        if (!avatar) return;

        if (img.getAttribute('src') !== avatar) {
          img.onerror = function () {
            this.onerror = null;
            this.src = DEFAULT_AVATAR;
          };
          img.setAttribute('src', avatar);
          img.dataset.gcCanonicalAvatar = '1';
        }
      };

      const hydrate = async (): Promise<void> => {
        await loadCanonicalDirectory();
        if (!loaded) return;

        document.querySelectorAll<HTMLImageElement>([
          '[data-home2-best-avatar]',
          '.gc-home2-combo-rank__avatar',
          '.gc-home2-rating-driver-avatar',
          '.gc-home2-champ-standing-avatar',
          '.gc-home2-champ-standing-row img'
        ].join(',')).forEach(apply);
      };

      const schedule = (): void => {
        if (scheduled) window.clearTimeout(scheduled);
        scheduled = window.setTimeout(() => {
          scheduled = 0;
          hydrate();
        }, 100);
      };

      hydrate();

      new MutationObserver(schedule).observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });

      window.addEventListener('pageshow', schedule);
      window.setTimeout(schedule, 1000);
      window.setTimeout(schedule, 2500);
      window.setTimeout(schedule, 5000);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME AVATARS V3] Índice canónico aplicado.');
console.log('  - Ratings profilePlayerId tiene prioridad.');
console.log('  - Duplicados pilots2 usan el ID numérico más pequeño.');
console.log('  - IDs técnicos del mirror ya no sobrescriben el avatar.');
console.log(`  - Backup: ${backupFile}`);
