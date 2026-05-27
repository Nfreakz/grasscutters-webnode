const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP COMPOSITION] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_PANEL_COMPOSITION_V15_35_4')) {
  console.log('[GC APP COMPOSITION] v15.35.4 ya parece aplicado.');
  process.exit(0);
}

const bestLapRegex = /\n\s*<div class="gc-app-best-v3">\s*\n\s*<span>Best lap<\/span>\s*\n\s*<strong id="gcComboBest">--<\/strong>\s*\n\s*<small id="gcComboBestMeta">Sin referencia<\/small>\s*\n\s*<\/div>/;

let bestLapBlock = `
          <div class="gc-app-best-v3 gc-app-best-v3--readout">
            <span>Best lap combo</span>
            <strong id="gcComboBest">--</strong>
            <small id="gcComboBestMeta">Sin referencia</small>
          </div>`;

if (!bestLapRegex.test(content)) {
  const oldBestLapRegex = /\n\s*<div class="gc-app-best-v3">\s*\n\s*<span>Mejor referencia<\/span>\s*\n\s*<strong id="gcComboBest">--<\/strong>\s*\n\s*<small id="gcComboBestMeta">Pendiente de datos<\/small>\s*\n\s*<\/div>/;
  if (oldBestLapRegex.test(content)) {
    content = content.replace(oldBestLapRegex, '');
  } else if (!content.includes('gc-app-best-v3--readout')) {
    console.warn('[GC APP COMPOSITION] No he encontrado el bloque Best lap original dentro del combo. Sigo solo con CSS.');
  }
} else {
  content = content.replace(bestLapRegex, '');
}

if (!content.includes('gc-app-best-v3--readout')) {
  const readoutHead = `          <span class="gc-chip" id="gcApiState">Estado</span>
        </div>`;
  if (!content.includes(readoutHead)) {
    console.warn('[GC APP COMPOSITION] No encuentro cabecera de Lectura de pista para insertar Best lap.');
  } else {
    content = content.replace(readoutHead, readoutHead + '\n\n' + bestLapBlock);
  }
}

const css = `
    /* GC_APP_PANEL_COMPOSITION_V15_35_4 */
    .gc-app-hero-v3 > div:first-child{
      padding-left:clamp(30px,4.2vw,86px);
    }

    .gc-app-session-v3{
      width:min(420px,100%);
      justify-self:end;
      margin-right:clamp(28px,4vw,78px);
    }

    .gc-app-combo-body-v3{
      grid-template-columns:1fr!important;
    }

    .gc-app-combo-v3{
      background-size:cover!important;
      background-position:center!important;
      background-repeat:no-repeat!important;
      isolation:isolate;
    }

    .gc-app-combo-v3::before{
      content:"";
      position:absolute;
      inset:0;
      z-index:0;
      pointer-events:none;
      backdrop-filter:blur(3.5px) saturate(.9) brightness(.78);
      -webkit-backdrop-filter:blur(3.5px) saturate(.9) brightness(.78);
      background:
        linear-gradient(90deg,rgba(3,10,5,.88),rgba(3,10,5,.58) 48%,rgba(3,10,5,.78)),
        linear-gradient(180deg,rgba(3,10,5,.52),rgba(3,10,5,.84)),
        radial-gradient(circle at 18% 20%, color-mix(in srgb,var(--accent,#9dff00) 13%,transparent), transparent 24rem);
    }

    .gc-app-combo-v3::after{
      z-index:1!important;
      background:
        linear-gradient(90deg,rgba(0,0,0,.36),transparent 52%,rgba(0,0,0,.18)),
        linear-gradient(0deg,rgba(0,0,0,.36),transparent 58%)!important;
    }

    .gc-app-combo-v3 > *{
      position:relative;
      z-index:2!important;
    }

    .gc-app-combo-body-v3 h3{
      max-width:760px;
    }

    .gc-app-readout-card-v3{
      align-content:start;
    }

    .gc-app-readout-card-v3 .gc-app-card-head-v3{
      min-height:auto;
      margin-bottom:12px;
    }

    .gc-app-best-v3--readout{
      display:grid;
      align-content:center;
      gap:8px;
      min-height:138px;
      margin:0 0 12px;
      padding:18px;
      border:1px solid color-mix(in srgb,var(--accent,#9dff00) 24%,rgba(255,255,255,.12));
      border-radius:18px;
      background:
        radial-gradient(circle at 88% 12%, color-mix(in srgb,var(--accent,#9dff00) 15%,transparent), transparent 9rem),
        linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),
        rgba(0,0,0,.18);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.035),
        0 16px 46px rgba(0,0,0,.18);
    }

    .gc-app-best-v3--readout span{
      color:var(--soft);
      font-size:.68rem;
      font-weight:950;
      text-transform:uppercase;
      letter-spacing:.14em;
    }

    .gc-app-best-v3--readout strong{
      color:var(--accent);
      font-size:clamp(2.45rem,4.2vw,4rem);
      line-height:.86;
      letter-spacing:-.075em;
      font-variant-numeric:tabular-nums;
      text-shadow:0 0 26px color-mix(in srgb,var(--accent,#9dff00) 18%,transparent);
    }

    .gc-app-best-v3--readout small{
      max-width:320px;
      color:color-mix(in srgb,var(--text,#f2fff0) 55%,var(--muted));
      line-height:1.35;
    }

    .gc-app-readout-grid-v3{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    @media(max-width:1180px){
      .gc-app-hero-v3 > div:first-child{
        padding-left:clamp(12px,2vw,24px);
      }

      .gc-app-session-v3{
        margin-right:0;
        justify-self:stretch;
        width:100%;
      }
    }

    @media(max-width:720px){
      .gc-app-hero-v3 > div:first-child{
        padding-left:0;
      }

      .gc-app-best-v3--readout{
        min-height:120px;
      }

      .gc-app-readout-grid-v3{
        grid-template-columns:1fr;
      }
    }
`;

const close = '  </style>';
if (!content.includes(close)) {
  console.error('[GC APP COMPOSITION] No encuentro cierre </style> en app.astro');
  process.exit(1);
}

content = content.replace(close, css + '\n' + close);

const backup = target + '.bak-v15-35-4-app-composition';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP COMPOSITION] v15.35.4 aplicado.');
console.log('[GC APP COMPOSITION] Backup: ' + backup);
console.log('[GC APP COMPOSITION] Ejecuta: npm run build');
