import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-custom-avatars-v2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME AVATARS V2] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');
if (source.includes('GC_HOME_CUSTOM_AVATAR_DIRECTORY_V2')) {
  console.log('[GC HOME AVATARS V2] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <script>
    /* GC_HOME_CUSTOM_AVATAR_DIRECTORY_V2 */
    (() => {
      const DEFAULT_AVATAR = '/images/pilot-avatar-default.png';
      const root = document.querySelector('[data-gc-home2]');
      if (!root) return;

      const normalizeName = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');

      const cleanAvatar = (value) => {
        const src = String(value || '').trim();
        if (!src || src === DEFAULT_AVATAR) return '';
        return src;
      };

      const byName = new Map();
      const byId = new Map();
      let loaded = false;
      let loading = null;
      let scheduled = 0;

      const rowName = (row) =>
        row?.displayName ||
        row?.publicName ||
        row?.name ||
        row?.driverName ||
        row?.driver?.displayName ||
        row?.driver?.name ||
        '';

      const rowId = (row) =>
        row?.profilePlayerId ??
        row?.playerId ??
        row?.strackerPlayerId ??
        row?.pilotId ??
        row?.id ??
        row?.driver?.id ??
        '';

      const rowAvatar = (row) => cleanAvatar(
        row?.customAvatarUrl ||
        row?.profileAvatarUrl ||
        row?.avatarUrl ||
        row?.avatar_url ||
        row?.profile?.avatarUrl ||
        row?.player?.avatarUrl ||
        row?.driver?.avatarUrl ||
        row?.pilot?.avatarUrl ||
        ''
      );

      const register = (row) => {
        const avatar = rowAvatar(row);
        if (!avatar) return;

        const name = normalizeName(rowName(row));
        const id = String(rowId(row) ?? '').trim();

        if (name) byName.set(name, avatar);
        if (id) byId.set(id, avatar);
      };

      const extractRows = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.pilots)) return payload.pilots;
        if (Array.isArray(payload?.data?.items)) return payload.data.items;
        if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
        return [];
      };

      const loadDirectory = async () => {
        if (loaded) return;
        if (loading) return loading;

        loading = (async () => {
          const response = await fetch('/api/gc/pilots2?source=all&limit=all', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
          });
          if (!response.ok) throw new Error(\`Pilots2 HTTP \${response.status}\`);

          const payload = await response.json();
          extractRows(payload).forEach(register);
          loaded = true;
        })().catch((error) => {
          console.warn('[GC Home avatars V2] No se pudo cargar el directorio de pilotos', error);
        }).finally(() => {
          loading = null;
        });

        return loading;
      };

      const textFrom = (selector, scope = document) =>
        scope?.querySelector?.(selector)?.textContent?.trim() || '';

      const profileIdFromLink = (scope) => {
        const link = scope?.querySelector?.('a[href*="/pilotos/"]');
        const match = String(link?.getAttribute?.('href') || '').match(/\\/pilotos\\/([^/?#]+)/i);
        return match?.[1] ? decodeURIComponent(match[1]) : '';
      };

      const avatarContext = (img) => {
        if (img.matches('[data-home2-best-avatar]')) {
          return {
            name: textFrom('[data-home2-best-driver]'),
            id: ''
          };
        }

        const ratingRow = img.closest('.gc-home2-rating-driver-cell');
        if (ratingRow) {
          return {
            name: textFrom('.gc-home2-rating-driver a, .gc-home2-rating-driver strong', ratingRow),
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
            name: textFrom('.gc-home2-champ-standing-meta strong, strong', championshipRow),
            id: profileIdFromLink(championshipRow)
          };
        }

        return { name: '', id: '' };
      };

      const resolveAvatar = ({ name, id }) => {
        const safeId = String(id || '').trim();
        if (safeId && byId.has(safeId)) return byId.get(safeId);

        const safeName = normalizeName(name);
        if (safeName && byName.has(safeName)) return byName.get(safeName);

        return '';
      };

      const applyAvatar = (img) => {
        const avatar = resolveAvatar(avatarContext(img));
        if (!avatar) return;

        if (img.getAttribute('src') !== avatar) {
          img.onerror = function () {
            this.onerror = null;
            this.src = DEFAULT_AVATAR;
          };
          img.setAttribute('src', avatar);
          img.dataset.gcCustomAvatar = '1';
        }
      };

      const hydrate = async () => {
        await loadDirectory();
        if (!loaded) return;

        document.querySelectorAll([
          '[data-home2-best-avatar]',
          '.gc-home2-combo-rank__avatar',
          '.gc-home2-rating-driver-avatar',
          '.gc-home2-champ-standing-avatar',
          '.gc-home2-champ-standing-row img'
        ].join(',')).forEach(applyAvatar);
      };

      const scheduleHydrate = () => {
        if (scheduled) window.clearTimeout(scheduled);
        scheduled = window.setTimeout(() => {
          scheduled = 0;
          hydrate();
        }, 80);
      };

      hydrate();

      new MutationObserver(scheduleHydrate).observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });

      window.addEventListener('pageshow', scheduleHydrate);
      window.setTimeout(scheduleHydrate, 1200);
      window.setTimeout(scheduleHydrate, 3000);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME AVATARS V2] Parche aplicado.');
console.log('  - Directorio real desde /api/gc/pilots2?source=all&limit=all');
console.log('  - Emparejamiento por playerId y nombre normalizado');
console.log('  - Hero, mejores tiempos, GT4, SR/GSR y campeonato');
console.log(`  - Backup: ${backupFile}`);
