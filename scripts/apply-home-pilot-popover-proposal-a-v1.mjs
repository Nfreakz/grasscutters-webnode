import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_PILOT_POPOVER_PROPOSAL_A_V1';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

if (!src.includes('GC_HOME_PILOT_LINKS_POPOVER_V1')) {
  console.error(`[${PACK}] No se encontró el popup actual de pilotos.`);
  process.exit(2);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

/* -------------------------------------------------------------------------- */
/* 1. Sustituir completamente el CSS del popup actual                          */
/* -------------------------------------------------------------------------- */

const cssStartMarker = '  <style is:global>\n    /* GC_HOME_PILOT_LINKS_POPOVER_V1 */';
const cssStart = src.indexOf(cssStartMarker);
const cssEnd = cssStart >= 0 ? src.indexOf('  </style>', cssStart) : -1;

if (cssStart < 0 || cssEnd < 0) {
  console.error(`[${PACK}] No se pudo delimitar el CSS actual del popup.`);
  process.exit(3);
}

const newCss = `  <style is:global>
    /* ${PACK} */

    .gc-home2 .gc-home-pilot-link {
      color: inherit;
      font: inherit;
      font-weight: 900;
      text-transform: uppercase;
      text-decoration: none !important;
      cursor: pointer;
      border-radius: 4px;
      outline: none;
    }

    .gc-home2 .gc-home-pilot-link:hover,
    .gc-home2 .gc-home-pilot-link:focus-visible {
      color: var(--green, #96ff2f);
      text-decoration: none !important;
    }

    .gc-home-pilot-popover {
      position: fixed;
      z-index: 99999;
      width: min(520px, calc(100vw - 24px));
      padding: 0;
      overflow: hidden;
      border: 1px solid rgba(150, 255, 47, .46);
      border-radius: 16px;
      color: #f4fff1;
      background:
        radial-gradient(circle at 100% 0%, rgba(150,255,47,.18), transparent 13rem),
        linear-gradient(180deg, rgba(8,15,10,.995), rgba(3,7,4,.998));
      box-shadow:
        0 28px 85px rgba(0,0,0,.68),
        inset 0 1px 0 rgba(255,255,255,.055),
        0 0 30px rgba(150,255,47,.08);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(8px) scale(.982);
      transition: opacity .16s ease, transform .16s ease, visibility .16s ease;
    }

    .gc-home-pilot-popover::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(rgba(150,255,47,.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(150,255,47,.025) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,.6), transparent 58%);
    }

    .gc-home-pilot-popover.is-open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    .gc-home-pilot-popover__head {
      position: relative;
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 16px 18px 14px;
      border-bottom: 1px solid rgba(150,255,47,.15);
    }

    .gc-home-pilot-popover__avatar {
      width: 76px;
      height: 76px;
      border: 2px solid rgba(150,255,47,.72);
      border-radius: 999px;
      object-fit: cover;
      background: #030704;
      box-shadow:
        0 0 0 4px rgba(150,255,47,.055),
        0 0 28px rgba(150,255,47,.18);
    }

    .gc-home-pilot-popover__identity {
      min-width: 0;
    }

    .gc-home-pilot-popover__eyebrow {
      display: block;
      margin-bottom: 4px;
      color: #96ff2f;
      font-size: 9px;
      font-weight: 950;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .gc-home-pilot-popover__name {
      display: block;
      overflow: hidden;
      color: #f6fff2;
      font-size: clamp(22px, 3vw, 29px);
      font-weight: 950;
      line-height: 1;
      letter-spacing: -.025em;
      text-transform: uppercase;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home-pilot-popover__team {
      display: block;
      overflow: hidden;
      margin-top: 6px;
      color: #9aa593;
      font-size: 11px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home-pilot-popover__close {
      align-self: start;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      margin: -5px -6px 0 0;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: rgba(244,255,241,.8);
      background: transparent;
      font-size: 24px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
    }

    .gc-home-pilot-popover__close:hover,
    .gc-home-pilot-popover__close:focus-visible {
      color: #fff;
      background: rgba(255,255,255,.06);
      outline: none;
    }

    .gc-home-pilot-popover__ratings {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 12px 18px 0;
    }

    .gc-home-pilot-popover__rating {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
      min-height: 60px;
      padding: 10px 15px;
      border: 1px solid rgba(150,255,47,.24);
      border-radius: 10px;
      background:
        linear-gradient(180deg, rgba(150,255,47,.075), rgba(150,255,47,.025));
      box-shadow: inset 0 1px rgba(255,255,255,.035);
    }

    .gc-home-pilot-popover__rating:first-child {
      border-color: rgba(33, 203, 255, .58);
      background:
        linear-gradient(180deg, rgba(33,203,255,.09), rgba(33,203,255,.025));
      box-shadow: inset 0 0 18px rgba(33,203,255,.035);
    }

    .gc-home-pilot-popover__rating span {
      color: #8b9784;
      font-size: 10px;
      font-weight: 950;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    .gc-home-pilot-popover__rating:first-child span {
      color: #37c8ff;
    }

    .gc-home-pilot-popover__rating strong {
      overflow: hidden;
      color: #f5fff1;
      font-size: 18px;
      font-weight: 950;
      line-height: 1;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home-pilot-popover__stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding: 10px 18px;
    }

    .gc-home-pilot-popover__stat {
      min-width: 0;
      min-height: 54px;
      padding: 9px 10px;
      border: 1px solid rgba(255,255,255,.065);
      border-radius: 9px;
      background: rgba(255,255,255,.025);
    }

    .gc-home-pilot-popover__stat span {
      display: block;
      color: #84907c;
      font-size: 8px;
      font-weight: 950;
      letter-spacing: .075em;
      line-height: 1.15;
      text-transform: uppercase;
    }

    .gc-home-pilot-popover__stat strong {
      display: block;
      overflow: hidden;
      margin-top: 5px;
      color: #96ff2f;
      font-size: 15px;
      font-weight: 950;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home-pilot-popover__favorites {
      display: grid;
      gap: 0;
      margin: 0 18px 12px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 9px;
      background: rgba(0,0,0,.18);
    }

    .gc-home-pilot-popover__favorites span {
      display: block;
      overflow: hidden;
      padding: 7px 11px;
      color: #8f9a88;
      font-size: 10px;
      font-weight: 750;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gc-home-pilot-popover__favorites span + span {
      border-top: 1px solid rgba(255,255,255,.055);
    }

    .gc-home-pilot-popover__favorites strong {
      color: #96ff2f;
      font-weight: 900;
    }

    .gc-home-pilot-popover__footer {
      position: relative;
      padding: 0 18px 14px;
      border: 0;
      background: transparent;
    }

    .gc-home-pilot-popover__footer > span {
      display: none;
    }

    .gc-home-pilot-popover__footer a {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 42px;
      border: 1px solid rgba(150,255,47,.56);
      border-radius: 9px;
      color: #071006;
      background:
        linear-gradient(180deg, #adff45 0%, #80e818 100%);
      box-shadow:
        inset 0 1px rgba(255,255,255,.28),
        0 10px 24px rgba(126,232,24,.16);
      font-size: 11px;
      font-weight: 950;
      letter-spacing: .08em;
      text-align: center;
      text-transform: uppercase;
      text-decoration: none;
      transition: transform .18s ease, filter .18s ease;
    }

    .gc-home-pilot-popover__footer a:hover,
    .gc-home-pilot-popover__footer a:focus-visible {
      transform: translateY(-1px);
      filter: brightness(1.08);
      outline: none;
    }

    @media (max-width: 700px) {
      .gc-home-pilot-popover {
        left: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        top: auto !important;
        width: auto;
        max-height: calc(100vh - 24px);
        overflow-y: auto;
      }

      .gc-home-pilot-popover__head {
        grid-template-columns: 64px minmax(0, 1fr) auto;
        padding: 13px;
      }

      .gc-home-pilot-popover__avatar {
        width: 64px;
        height: 64px;
      }

      .gc-home-pilot-popover__ratings,
      .gc-home-pilot-popover__stats {
        padding-left: 13px;
        padding-right: 13px;
      }

      .gc-home-pilot-popover__favorites {
        margin-left: 13px;
        margin-right: 13px;
      }

      .gc-home-pilot-popover__footer {
        padding-left: 13px;
        padding-right: 13px;
      }
    }

    @media (max-width: 430px) {
      .gc-home-pilot-popover__stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .gc-home-pilot-popover__rating {
        padding-inline: 10px;
      }

      .gc-home-pilot-popover__rating strong {
        font-size: 15px;
      }
    }
  </style>`;

src =
  src.slice(0, cssStart) +
  newCss +
  src.slice(cssEnd + '  </style>'.length);

/* -------------------------------------------------------------------------- */
/* 2. Añadir identidad y botón de cierre al markup dinámico                    */
/* -------------------------------------------------------------------------- */

const oldHeadMarkup = `          <div class="gc-home-pilot-popover__head">
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
          </div>`;

const newHeadMarkup = `          <div class="gc-home-pilot-popover__head">
            <img
              class="gc-home-pilot-popover__avatar"
              src="\${escapeHtml(avatar)}"
              alt=""
              width="76"
              height="76"
              onerror="this.onerror=null;this.src='\${DEFAULT_AVATAR}'"
            />
            <div class="gc-home-pilot-popover__identity">
              <span class="gc-home-pilot-popover__eyebrow">Ficha rápida de piloto</span>
              <strong class="gc-home-pilot-popover__name">\${escapeHtml(name)}</strong>
              <span class="gc-home-pilot-popover__team">\${escapeHtml(text(pilot.team,'GrassCutters Racing'))}</span>
            </div>
            <button
              class="gc-home-pilot-popover__close"
              type="button"
              aria-label="Cerrar ficha rápida"
              data-home-pilot-popover-close
            >×</button>
          </div>`;

if (!src.includes(oldHeadMarkup)) {
  console.error(`[${PACK}] No se encontró el encabezado dinámico actual.`);
  process.exit(4);
}

src = src.replace(oldHeadMarkup, newHeadMarkup);

/* 3. Popup más ancho y altura calculada de forma real. */
src = src.replace(
  `        const width = Math.min(340,window.innerWidth - 24);
        const height = popover.offsetHeight || 310;`,
  `        const width = Math.min(520,window.innerWidth - 24);
        const height = popover.offsetHeight || 430;`
);

/* 4. Cierre explícito. */
const listenerAnchor = `      popover.addEventListener('pointerleave',() => closePopover(100));`;

const listenerReplacement = `${listenerAnchor}

      popover.addEventListener('click',(event: MouseEvent) => {
        const target = event.target as Element | null;
        if (target?.closest?.('[data-home-pilot-popover-close]')) {
          event.preventDefault();
          event.stopPropagation();
          closePopover(0);
        }
      });`;

if (!src.includes(listenerAnchor)) {
  console.error(`[${PACK}] No se encontró el listener del popup.`);
  process.exit(5);
}

src = src.replace(listenerAnchor, listenerReplacement);

src = src.replace(
  `/* GC_HOME_PILOT_LINKS_POPOVER_V1 */`,
  `/* ${PACK} */`
);

fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Popup rediseñado según Propuesta A.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
