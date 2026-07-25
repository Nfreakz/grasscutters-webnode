import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const homeFile = path.join(projectRoot, 'src', 'pages', 'index.astro');
const profileFile = path.join(projectRoot, 'src', 'pages', 'pilotos', '[playerId].astro');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, '_gc_backups', `identity-canonical-guid-v1-${stamp}`);

function fail(message) {
  console.error(`[GC IDENTITY GUID V1] ERROR: ${message}`);
  process.exit(1);
}

for (const file of [homeFile, profileFile]) {
  if (!fs.existsSync(file)) fail(`No existe ${file}`);
  const backup = path.join(backupRoot, path.relative(projectRoot, file));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file, backup);
}

/* -------------------------------------------------------------------------- */
/* HOME: canonical identity resolver by Steam GUID                             */
/* -------------------------------------------------------------------------- */

let home = fs.readFileSync(homeFile, 'utf8');

if (!home.includes('GC_HOME_PILOT_POPOVER_GLOBAL_V2')) {
  fail('No se encontró GC_HOME_PILOT_POPOVER_GLOBAL_V2 en index.astro.');
}

if (!home.includes('GC_IDENTITY_CANONICAL_GUID_HOME_V1')) {
  const homeAnchor = '\n</MarketingLayout>';
  if (!home.includes(homeAnchor)) fail('No se encontró el cierre de MarketingLayout.');

  const homePatch = `
  <script>
    /* GC_IDENTITY_CANONICAL_GUID_HOME_V1 */
    (() => {
      type DirectoryPilot = {
        id?: unknown;
        playerId?: unknown;
        name?: unknown;
        displayName?: unknown;
        publicName?: unknown;
        steamGuid?: unknown;
        avatarUrl?: unknown;
      };

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

      const numericId = (value: unknown): number => {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0
          ? parsed
          : Number.MAX_SAFE_INTEGER;
      };

      const pilotId = (row: DirectoryPilot): string =>
        String(row?.playerId ?? row?.id ?? '').trim();

      const pilotName = (row: DirectoryPilot): string =>
        String(row?.displayName || row?.publicName || row?.name || '').trim();

      const extractRows = (payload: any): DirectoryPilot[] => {
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

      const run = async (): Promise<void> => {
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

        if (!pilotsResponse.ok || !ratingsResponse.ok) return;

        const [pilotsPayload, ratingsPayload] = await Promise.all([
          pilotsResponse.json(),
          ratingsResponse.json()
        ]);

        const pilots = extractRows(pilotsPayload);
        const ratings = extractRatings(ratingsPayload);

        const canonicalByGuid = new Map<string, DirectoryPilot>();
        const canonicalByName = new Map<string, DirectoryPilot>();
        const ratingGuidByName = new Map<string, string>();

        for (const row of pilots) {
          const id = pilotId(row);
          const name = normalize(pilotName(row));
          const guid = cleanGuid(row?.steamGuid);
          if (!id || !name) continue;

          const currentName = canonicalByName.get(name);
          if (!currentName || numericId(id) < numericId(pilotId(currentName))) {
            canonicalByName.set(name, row);
          }

          if (guid) {
            const currentGuid = canonicalByGuid.get(guid);
            if (!currentGuid || numericId(id) < numericId(pilotId(currentGuid))) {
              canonicalByGuid.set(guid, row);
            }
          }
        }

        for (const row of ratings) {
          const name = normalize(row?.driver || row?.displayName || row?.name);
          const guid = cleanGuid(
            row?.steamGuid ||
            row?.driverKey ||
            (Array.isArray(row?.mergedDriverKeys) ? row.mergedDriverKeys[0] : '')
          );
          if (name && guid) ratingGuidByName.set(name, guid);
        }

        const canonicalForName = (nameValue: unknown): DirectoryPilot | null => {
          const name = normalize(nameValue);
          const guid = ratingGuidByName.get(name);
          if (guid && canonicalByGuid.has(guid)) {
            return canonicalByGuid.get(guid) || null;
          }
          return canonicalByName.get(name) || null;
        };

        const repairLink = (link: HTMLAnchorElement): void => {
          const visibleName = String(
            link.dataset.pilotName ||
            link.textContent ||
            ''
          ).trim();

          const canonical = canonicalForName(visibleName);
          if (!canonical) return;

          const id = pilotId(canonical);
          if (!id) return;

          link.href = \`/pilotos/\${encodeURIComponent(id)}\`;
          link.dataset.pilotId = id;
          link.dataset.pilotName = pilotName(canonical) || visibleName;
          link.dataset.gcIdentityCanonical = '1';

          const avatar = link.closest(
            '.gc-home2-combo-rank, .gc-home2-rating-driver-cell, .gc-home2-champ-standing-row'
          )?.querySelector<HTMLImageElement>('img');

          if (avatar) {
            avatar.src = String(canonical.avatarUrl || \`/api/pilot-avatar/\${encodeURIComponent(id)}\`);
          }
        };

        const repairAll = (): void => {
          document.querySelectorAll<HTMLAnchorElement>(
            '.gc-home-pilot-link'
          ).forEach(repairLink);
        };

        repairAll();

        let timer = 0;
        const root = document.querySelector('[data-gc-home2]');
        if (root) {
          new MutationObserver(() => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              timer = 0;
              repairAll();
            },80);
          }).observe(root,{childList:true,subtree:true,characterData:true});
        }

        window.setTimeout(repairAll,1000);
        window.setTimeout(repairAll,2500);
        window.setTimeout(repairAll,5000);
      };

      run().catch((error: unknown) => {
        console.warn('[GC identity canonical GUID V1] Home repair failed',error);
      });
    })();
  </script>
`;

  home = home.replace(homeAnchor, `${homePatch}${homeAnchor}`);
  fs.writeFileSync(homeFile, home, 'utf8');
}

/* -------------------------------------------------------------------------- */
/* PROFILE: redirect mirror/server IDs to canonical Data Core ID               */
/* -------------------------------------------------------------------------- */

let profile = fs.readFileSync(profileFile, 'utf8');

if (!profile.includes('GC_IDENTITY_CANONICAL_GUID_PROFILE_V1')) {
  const oldLoadStart = `      async function load() {
        if (!playerId || !/^\\d+$/.test(playerId)) {`;

  const newLoadStart = `      /* GC_IDENTITY_CANONICAL_GUID_PROFILE_V1 */
      async function resolveCanonicalPlayerId(inputPlayerId) {
        try {
          const response = await fetch('/api/gc/pilots2?source=all&limit=all', {
            credentials:'include',
            cache:'no-store',
            headers:{Accept:'application/json'}
          });
          if (!response.ok) return inputPlayerId;

          const payload = await response.json();
          const rows = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload?.pilots)
                ? payload.pilots
                : Array.isArray(payload?.data?.items)
                  ? payload.data.items
                  : Array.isArray(payload?.data?.pilots)
                    ? payload.data.pilots
                    : [];

          const current = rows.find((row) =>
            String(row?.playerId ?? row?.id ?? '') === String(inputPlayerId)
          );
          const guid = String(current?.steamGuid || '').trim().toLowerCase();
          if (!guid) return inputPlayerId;

          const equivalents = rows.filter((row) =>
            String(row?.steamGuid || '').trim().toLowerCase() === guid
          );

          const canonical = equivalents
            .map((row) => String(row?.playerId ?? row?.id ?? ''))
            .filter((id) => /^\\d+$/.test(id))
            .sort((a,b) => Number(a) - Number(b))[0];

          return canonical || inputPlayerId;
        } catch {
          return inputPlayerId;
        }
      }

      async function load() {
        if (!playerId || !/^\\d+$/.test(playerId)) {`;

  if (!profile.includes(oldLoadStart)) {
    fail('No se encontró el inicio de load() esperado en el perfil.');
  }

  profile = profile.replace(oldLoadStart, newLoadStart);

  const oldTry = `        try {
          const response = await fetch(\`/api/pilots/\${encodeURIComponent(playerId)}/profile\`, {`;

  const newTry = `        try {
          const canonicalPlayerId = await resolveCanonicalPlayerId(playerId);

          if (canonicalPlayerId !== playerId) {
            window.location.replace(\`/pilotos/\${encodeURIComponent(canonicalPlayerId)}\`);
            return;
          }

          const response = await fetch(\`/api/pilots/\${encodeURIComponent(canonicalPlayerId)}/profile\`, {`;

  if (!profile.includes(oldTry)) {
    fail('No se encontró el fetch de perfil esperado.');
  }

  profile = profile.replace(oldTry, newTry);
  fs.writeFileSync(profileFile, profile, 'utf8');
}

console.log('[GC IDENTITY GUID V1] Corrección aplicada.');
console.log('  - Home resuelve perfiles por Steam GUID.');
console.log('  - El ID canónico es el menor ID de Data Core con el mismo GUID.');
console.log('  - profilePlayerId local de otro servidor deja de tener prioridad.');
console.log('  - Perfiles con ID técnico redirigen al ID canónico.');
console.log('  - Don Bixi: 3903116451 -> 32.');
console.log('  - Jesus Sue conserva el ID 9.');
console.log(`  - Backup: ${backupRoot}`);
