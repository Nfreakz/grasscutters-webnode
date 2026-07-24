import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-pilot-popover-v1-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME PILOT POPOVER V1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (source.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  console.log('[GC HOME PILOT POPOVER V1] El parche ya está aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const anchor = '\n</MarketingLayout>';
if (!source.includes(anchor)) fail('No se encontró el cierre de MarketingLayout.');

const patch = `
  <style is:global>
    /* GC_HOME_PILOT_LINKS_POPOVER_V1 */
    .gc-home2 .gc-home-pilot-link{
      color:inherit;
      font:inherit;
      font-weight:inherit;
      text-decoration:none;
      cursor:pointer;
      border-radius:4px;
      outline:none;
    }

    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible{
      color:var(--green,#96ff2f);
      text-decoration:underline;
      text-decoration-thickness:1px;
      text-underline-offset:3px;
    }

    .gc-home-pilot-popover{
      position:fixed;
      z-index:99999;
      width:min(340px,calc(100vw - 24px));
      padding:0;
      border:1px solid rgba(150,255,47,.34);
      border-radius:14px;
      background:
        radial-gradient(circle at 100% 0%,rgba(150,255,47,.12),transparent 11rem),
        linear-gradient(180deg,rgba(8,15,10,.99),rgba(3,7,4,.995));
      box-shadow:
        0 24px 70px rgba(0,0,0,.62),
        inset 0 1px 0 rgba(255,255,255,.05);
      color:#f4fff1;
      opacity:0;
      visibility:hidden;
      pointer-events:none;
      transform:translateY(7px) scale(.985);
      transition:opacity .14s ease,transform .14s ease,visibility .14s ease;
      overflow:hidden;
    }

    .gc-home-pilot-popover.is-open{
      opacity:1;
      visibility:visible;
      pointer-events:auto;
      transform:translateY(0) scale(1);
    }

    .gc-home-pilot-popover__head{
      display:grid;
      grid-template-columns:58px minmax(0,1fr);
      gap:12px;
      align-items:center;
      padding:15px;
      border-bottom:1px solid rgba(150,255,47,.14);
    }

    .gc-home-pilot-popover__avatar{
      width:58px;
      height:58px;
      border:1px solid rgba(150,255,47,.52);
      border-radius:999px;
      object-fit:cover;
      background:#030704;
      box-shadow:0 0 24px rgba(150,255,47,.14);
    }

    .gc-home-pilot-popover__eyebrow{
      display:block;
      margin-bottom:3px;
      color:#96ff2f;
      font-family:Inter,system-ui,sans-serif;
      font-size:9px;
      font-weight:900;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    .gc-home-pilot-popover__name{
      display:block;
      color:#f4fff1;
      font-family:Inter,system-ui,sans-serif;
      font-size:20px;
      font-weight:900;
      line-height:1.05;
      text-transform:uppercase;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .gc-home-pilot-popover__team{
      display:block;
      margin-top:4px;
      color:#84907c;
      font-family:Inter,system-ui,sans-serif;
      font-size:11px;
      font-weight:700;
    }

    .gc-home-pilot-popover__ratings{
      display:flex;
      gap:8px;
      padding:11px 15px 0;
    }

    .gc-home-pilot-popover__rating{
      flex:1 1 0;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      min-width:0;
      padding:8px 10px;
      border:1px solid rgba(150,255,47,.16);
      border-radius:9px;
      background:rgba(150,255,47,.045);
    }

    .gc-home-pilot-popover__rating span{
      color:#84907c;
      font-size:9px;
      font-weight:900;
      letter-spacing:.09em;
      text-transform:uppercase;
    }

    .gc-home-pilot-popover__rating strong{
      color:#f4fff1;
      font-size:14px;
      font-weight:900;
    }

    .gc-home-pilot-popover__stats{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:8px;
      padding:12px 15px;
    }

    .gc-home-pilot-popover__stat{
      min-width:0;
      padding:8px 9px;
      border:1px solid rgba(255,255,255,.06);
      border-radius:8px;
      background:rgba(255,255,255,.025);
    }

    .gc-home-pilot-popover__stat span{
      display:block;
      color:#84907c;
      font-size:8px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .gc-home-pilot-popover__stat strong{
      display:block;
      margin-top:3px;
      color:#96ff2f;
      font-size:13px;
      font-weight:900;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .gc-home-pilot-popover__favorites{
      display:grid;
      gap:5px;
      padding:0 15px 13px;
      color:#84907c;
      font-size:10px;
      font-weight:700;
    }

    .gc-home-pilot-popover__favorites strong{
      color:#dfffd0;
      font-weight:800;
    }

    .gc-home-pilot-popover__footer{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:10px 15px 12px;
      border-top:1px solid rgba(150,255,47,.12);
      background:rgba(0,0,0,.18);
    }

    .gc-home-pilot-popover__footer span{
      color:#84907c;
      font-size:9px;
      font-weight:800;
    }

    .gc-home-pilot-popover__footer a{
      color:#96ff2f;
      font-size:10px;
      font-weight:900;
      letter-spacing:.06em;
      text-transform:uppercase;
      text-decoration:none;
    }

    @media (max-width:700px){
      .gc-home-pilot-popover{
        left:12px!important;
        right:12px!important;
        bottom:12px!important;
        top:auto!important;
        width:auto;
      }
    }
  </style>

  <div class="gc-home-pilot-popover" data-home-pilot-popover aria-hidden="true"></div>

  <script>
    /* GC_HOME_PILOT_LINKS_POPOVER_V1 */
    (() => {
      type PilotRow = {
        id?: unknown;
        playerId?: unknown;
        profilePlayerId?: unknown;
        name?: unknown;
        displayName?: unknown;
        publicName?: unknown;
        avatarUrl?: unknown;
        team?: unknown;
        sessionsCount?: unknown;
        races?: unknown;
        totalLaps?: unknown;
        totalHours?: unknown;
        active30dLaps?: unknown;
        srClass?: unknown;
        srScore?: unknown;
        gsrClass?: unknown;
        gsrScore?: unknown;
        favoriteCar?: unknown;
        favoriteTrack?: unknown;
        cleanRate?: unknown;
      };

      const root = document.querySelector<HTMLElement>('[data-gc-home2]');
      const popover = document.querySelector<HTMLElement>('[data-home-pilot-popover]');
      if (!root || !popover) return;

      const DEFAULT_AVATAR = '/images/pilot-avatar-default.png';
      const pilotsByName = new Map<string, PilotRow>();
      const pilotsById = new Map<string, PilotRow>();
      let loadPromise: Promise<void> | null = null;
      let activeLink: HTMLAnchorElement | null = null;
      let closeTimer = 0;
      let renderTimer = 0;

      const normalize = (value: unknown): string => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'');

      const text = (value: unknown, fallback = '--'): string => {
        const out = String(value ?? '').trim();
        return out || fallback;
      };

      const numberText = (value: unknown, digits = 0): string => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '--';
        return new Intl.NumberFormat('es-ES',{
          maximumFractionDigits:digits,
          minimumFractionDigits:digits
        }).format(n);
      };

      const escapeHtml = (value: unknown): string => String(value ?? '')
        .replace(/[&<>"']/g,(char) => ({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        } as Record<string,string>)[char] || char);

      const pilotName = (row: PilotRow): string =>
        text(row.displayName || row.publicName || row.name,'Piloto');

      const pilotId = (row: PilotRow): string =>
        text(row.profilePlayerId || row.playerId || row.id,'');

      const register = (row: PilotRow): void => {
        const name = normalize(pilotName(row));
        const id = pilotId(row);
        if (!name || !id) return;

        const current = pilotsByName.get(name);
        const currentId = Number(pilotId(current || {}));
        const nextId = Number(id);

        if (
          !current ||
          (
            Number.isFinite(nextId) &&
            (!Number.isFinite(currentId) || nextId < currentId)
          )
        ) {
          pilotsByName.set(name,row);
        }

        pilotsById.set(id,row);
      };

      const extractRows = (payload: any): PilotRow[] => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.pilots)) return payload.pilots;
        if (Array.isArray(payload?.data?.items)) return payload.data.items;
        if (Array.isArray(payload?.data?.pilots)) return payload.data.pilots;
        return [];
      };

      const loadPilots = async (): Promise<void> => {
        if (pilotsByName.size) return;
        if (loadPromise) return loadPromise;

        loadPromise = (async (): Promise<void> => {
          const response = await fetch('/api/gc/pilots2?source=all&limit=all',{
            credentials:'same-origin',
            headers:{Accept:'application/json'}
          });
          if (!response.ok) throw new Error(\`Pilots2 HTTP \${response.status}\`);
          const payload = await response.json();
          extractRows(payload).forEach(register);
        })().catch((error: unknown) => {
          console.warn('[GC Home pilot popover] No se pudo cargar pilots2',error);
        }).finally(() => {
          loadPromise = null;
        });

        return loadPromise;
      };

      const resolveByName = (name: string): PilotRow | null =>
        pilotsByName.get(normalize(name)) || null;

      const rowName = (scope: Element): string =>
        scope.querySelector<HTMLElement>(
          '.gc-home2-driver-name, strong, span:first-child'
        )?.textContent?.trim() || '';

      const makeLink = (
        element: HTMLElement,
        name: string,
        pilot: PilotRow
      ): HTMLAnchorElement => {
        const id = pilotId(pilot);
        const link = document.createElement('a');
        link.className = 'gc-home-pilot-link';
        link.href = \`/pilotos/\${encodeURIComponent(id)}\`;
        link.dataset.pilotName = pilotName(pilot);
        link.dataset.pilotId = id;
        link.textContent = name;
        link.setAttribute('aria-label',\`Ver ficha de \${pilotName(pilot)}\`);
        element.replaceWith(link);
        return link;
      };

      const enhanceComboRows = (): void => {
        document.querySelectorAll<HTMLElement>(
          '.gc-home2-combo-rank'
        ).forEach((row) => {
          if (row.dataset.gcPilotLinked === '1') return;
          const nameEl = row.querySelector<HTMLElement>('div > strong');
          const name = nameEl?.textContent?.trim() || '';
          const pilot = resolveByName(name);
          if (!nameEl || !pilot) return;
          makeLink(nameEl,name,pilot);
          row.dataset.gcPilotLinked = '1';
        });
      };

      const enhanceTimingRows = (): void => {
        document.querySelectorAll<HTMLElement>(
          '.gc-home2-table__row:not(.gc-home2-table__head)'
        ).forEach((row) => {
          if (row.dataset.gcPilotLinked === '1') return;
          const nameEl = row.querySelector<HTMLElement>('span:first-child');
          const name = nameEl?.textContent?.trim() || '';
          const pilot = resolveByName(name);
          if (!nameEl || !pilot || name === '--' || !name) return;
          makeLink(nameEl,name,pilot);
          row.dataset.gcPilotLinked = '1';
        });
      };

      const ratingText = (
        cls: unknown,
        score: unknown,
        digits = 0
      ): string => {
        const classText = text(cls,'--');
        const scoreText = numberText(score,digits);
        return scoreText === '--' ? classText : \`\${classText} · \${scoreText}\`;
      };

      const popoverMarkup = (pilot: PilotRow): string => {
        const id = pilotId(pilot);
        const name = pilotName(pilot);
        const avatar = text(pilot.avatarUrl, id ? \`/api/pilot-avatar/\${encodeURIComponent(id)}\` : DEFAULT_AVATAR);
        const sessions = pilot.sessionsCount ?? pilot.races;
        const laps = pilot.totalLaps;
        const hours = pilot.totalHours;
        const active = pilot.active30dLaps;
        const clean = Number(pilot.cleanRate);
        const cleanText = Number.isFinite(clean) ? \`\${numberText(clean,1)}%\` : '--';

        return \`
          <div class="gc-home-pilot-popover__head">
            <img
              class="gc-home-pilot-popover__avatar"
              src="\${escapeHtml(avatar)}"
              alt=""
              width="58"
              height="58"
              onerror="this.onerror=null;this.src='\${DEFAULT_AVATAR}'"
            />
            <div>
              <span class="gc-home-pilot-popover__eyebrow">Ficha rápida de piloto</span>
              <strong class="gc-home-pilot-popover__name">\${escapeHtml(name)}</strong>
              <span class="gc-home-pilot-popover__team">\${escapeHtml(text(pilot.team,'GrassCutters Racing'))}</span>
            </div>
          </div>

          <div class="gc-home-pilot-popover__ratings">
            <div class="gc-home-pilot-popover__rating">
              <span>SR</span>
              <strong>\${escapeHtml(ratingText(pilot.srClass,pilot.srScore,1))}</strong>
            </div>
            <div class="gc-home-pilot-popover__rating">
              <span>GSR</span>
              <strong>\${escapeHtml(ratingText(pilot.gsrClass,pilot.gsrScore,0))}</strong>
            </div>
          </div>

          <div class="gc-home-pilot-popover__stats">
            <div class="gc-home-pilot-popover__stat">
              <span>Carreras</span>
              <strong>\${escapeHtml(numberText(sessions))}</strong>
            </div>
            <div class="gc-home-pilot-popover__stat">
              <span>Vueltas</span>
              <strong>\${escapeHtml(numberText(laps))}</strong>
            </div>
            <div class="gc-home-pilot-popover__stat">
              <span>Horas</span>
              <strong>\${escapeHtml(numberText(hours,1))}</strong>
            </div>
            <div class="gc-home-pilot-popover__stat">
              <span>Activas 30d</span>
              <strong>\${escapeHtml(numberText(active))}</strong>
            </div>
            <div class="gc-home-pilot-popover__stat">
              <span>Limpieza</span>
              <strong>\${escapeHtml(cleanText)}</strong>
            </div>
            <div class="gc-home-pilot-popover__stat">
              <span>ID</span>
              <strong>\${escapeHtml(id)}</strong>
            </div>
          </div>

          <div class="gc-home-pilot-popover__favorites">
            <span>Coche habitual: <strong>\${escapeHtml(text(pilot.favoriteCar))}</strong></span>
            <span>Circuito habitual: <strong>\${escapeHtml(text(pilot.favoriteTrack))}</strong></span>
          </div>

          <div class="gc-home-pilot-popover__footer">
            <span>Datos consolidados de la plataforma</span>
            <a href="/pilotos/\${encodeURIComponent(id)}">Ver ficha completa →</a>
          </div>
        \`;
      };

      const placePopover = (link: HTMLAnchorElement): void => {
        const rect = link.getBoundingClientRect();
        const width = Math.min(340,window.innerWidth - 24);
        const height = popover.offsetHeight || 310;
        const gap = 10;

        let left = rect.left;
        let top = rect.bottom + gap;

        if (left + width > window.innerWidth - 12) {
          left = window.innerWidth - width - 12;
        }
        if (left < 12) left = 12;

        if (top + height > window.innerHeight - 12) {
          top = rect.top - height - gap;
        }
        if (top < 12) top = 12;

        popover.style.left = \`\${Math.round(left)}px\`;
        popover.style.top = \`\${Math.round(top)}px\`;
      };

      const openPopover = (link: HTMLAnchorElement): void => {
        if (closeTimer) window.clearTimeout(closeTimer);
        const pilot = pilotsById.get(link.dataset.pilotId || '') ||
          resolveByName(link.dataset.pilotName || link.textContent || '');
        if (!pilot) return;

        activeLink = link;
        popover.innerHTML = popoverMarkup(pilot);
        popover.classList.add('is-open');
        popover.setAttribute('aria-hidden','false');
        requestAnimationFrame(() => placePopover(link));
      };

      const closePopover = (delay = 100): void => {
        if (closeTimer) window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
          popover.classList.remove('is-open');
          popover.setAttribute('aria-hidden','true');
          activeLink = null;
        },delay);
      };

      const enhance = async (): Promise<void> => {
        await loadPilots();
        enhanceComboRows();
        enhanceTimingRows();
      };

      root.addEventListener('pointerover',(event: PointerEvent) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('.gc-home-pilot-link') as HTMLAnchorElement | null;
        if (link) openPopover(link);
      });

      root.addEventListener('pointerout',(event: PointerEvent) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('.gc-home-pilot-link');
        if (link) closePopover(140);
      });

      root.addEventListener('focusin',(event: FocusEvent) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('.gc-home-pilot-link') as HTMLAnchorElement | null;
        if (link) openPopover(link);
      });

      root.addEventListener('focusout',(event: FocusEvent) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('.gc-home-pilot-link');
        if (link) closePopover(100);
      });

      popover.addEventListener('pointerenter',() => {
        if (closeTimer) window.clearTimeout(closeTimer);
      });

      popover.addEventListener('pointerleave',() => closePopover(100));

      document.addEventListener('click',(event: MouseEvent) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('.gc-home-pilot-link') as HTMLAnchorElement | null;

        if (
          link &&
          window.matchMedia('(hover:none)').matches &&
          activeLink !== link
        ) {
          event.preventDefault();
          openPopover(link);
          return;
        }

        if (
          popover.classList.contains('is-open') &&
          !target?.closest?.('[data-home-pilot-popover]') &&
          !link
        ) {
          closePopover(0);
        }
      });

      window.addEventListener('scroll',() => {
        if (activeLink) placePopover(activeLink);
      },{passive:true});

      window.addEventListener('resize',() => {
        if (activeLink) placePopover(activeLink);
      });

      new MutationObserver(() => {
        if (renderTimer) window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(() => {
          renderTimer = 0;
          enhance();
        },100);
      }).observe(root,{
        childList:true,
        subtree:true
      });

      enhance();
      window.setTimeout(enhance,1200);
      window.setTimeout(enhance,3000);
    })();
  </script>
`;

source = source.replace(anchor, `${patch}${anchor}`);
fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME PILOT POPOVER V1] Aplicado.');
console.log('  - Enlaces en mejores tiempos y timing sheet.');
console.log('  - Popover con avatar, carreras y estadísticas.');
console.log('  - Hover, teclado y soporte táctil.');
console.log(`  - Backup: ${backupFile}`);
