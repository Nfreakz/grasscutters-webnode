const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP TOP DRIVER FIX] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_TOP_DRIVER_V15_35_5_1')) {
  console.log('[GC APP TOP DRIVER FIX] v15.35.5.1 ya parece aplicado.');
  process.exit(0);
}

const topDriverCard = `
        <div class="gc-app-top-driver-v1535" aria-label="Mejor piloto del combo">
          <div class="gc-app-top-driver-v1535__avatar">
            <img id="gcTopDriverAvatar" src="/images/pilot-avatar-default.png" alt="" loading="lazy" decoding="async" />
          </div>
          <div class="gc-app-top-driver-v1535__body">
            <span>Mejor piloto</span>
            <strong id="gcTopDriverName">--</strong>
            <small id="gcTopDriverMeta">Sin referencia cargada</small>
          </div>
          <div class="gc-app-top-driver-v1535__time">
            <span>Tiempo</span>
            <strong id="gcTopDriverTime">--</strong>
          </div>
        </div>
`;

/**
 * 1) Insertar card dentro del article de Lectura de pista.
 * Estrategia robusta:
 * - buscar gcQuickDbMeta, que solo está dentro de Lectura de pista
 * - desde ahí buscar el siguiente </article>
 * - insertar la card justo antes
 */
if (!content.includes('gc-app-top-driver-v1535')) {
  const markerIndex = content.indexOf('gcQuickDbMeta');
  if (markerIndex === -1) {
    console.error('[GC APP TOP DRIVER FIX] No encuentro gcQuickDbMeta. No puedo localizar Lectura de pista.');
    process.exit(1);
  }

  const articleEndIndex = content.indexOf('</article>', markerIndex);
  if (articleEndIndex === -1) {
    console.error('[GC APP TOP DRIVER FIX] No encuentro cierre </article> después de gcQuickDbMeta.');
    process.exit(1);
  }

  content = content.slice(0, articleEndIndex) + topDriverCard + content.slice(articleEndIndex);
}

/**
 * 2) Insertar helper JS antes de renderLapReadout.
 */
const helper = `      function driverAvatarUrl(row){
        const id = pick(row, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']);
        const direct = pick(row, ['avatarUrl','avatar_url','driver.avatarUrl','player.avatarUrl','pilot.avatarUrl']);
        if (direct) return String(direct);
        if (id !== undefined && id !== null && id !== '') return \`/api/pilot-avatar/\${encodeURIComponent(String(id))}\`;
        return '/images/pilot-avatar-default.png';
      }

      function renderTopDriver(row){
        const avatar = byId('gcTopDriverAvatar');
        const name = row ? driverName(row) : '--';
        const car = row ? carName(row) : '';
        const track = row ? trackName(row) : '';
        const time = row ? lapTime(row) : '--';
        const meta = row
          ? [car, track].filter(Boolean).join(' · ')
          : 'Sin referencia cargada';

        setText('gcTopDriverName', name || '--');
        setText('gcTopDriverTime', time || '--');
        setText('gcTopDriverMeta', meta || 'Sin referencia cargada');

        if (avatar) {
          avatar.src = row ? driverAvatarUrl(row) : '/images/pilot-avatar-default.png';
          avatar.alt = row ? \`Avatar de \${name}\` : '';
          avatar.onerror = () => {
            avatar.onerror = null;
            avatar.src = '/images/pilot-avatar-default.png';
          };
        }
      }

`;

if (!content.includes('function renderTopDriver(row)')) {
  const renderLapRegex = /(\n\s*)function\s+renderLapReadout\s*\(/;
  const match = content.match(renderLapRegex);

  if (!match || match.index === undefined) {
    console.error('[GC APP TOP DRIVER FIX] No encuentro function renderLapReadout(...).');
    process.exit(1);
  }

  content = content.slice(0, match.index + match[1].length) + helper + content.slice(match.index + match[1].length);
}

/**
 * 3) Llamar renderTopDriver(best) dentro de renderLapReadout.
 * Lo anclamos antes del primer setText de gcQuickRefs, que pertenece a esa función.
 */
if (!content.includes('renderTopDriver(best);')) {
  const quickRefsIndex = content.indexOf("setText('gcQuickRefs'");
  const quickRefsIndexDouble = content.indexOf('setText("gcQuickRefs"');
  const anchorIndex = quickRefsIndex !== -1 ? quickRefsIndex : quickRefsIndexDouble;

  if (anchorIndex === -1) {
    console.error('[GC APP TOP DRIVER FIX] No encuentro setText(gcQuickRefs).');
    process.exit(1);
  }

  content = content.slice(0, anchorIndex) + 'renderTopDriver(best);\n        ' + content.slice(anchorIndex);
}

/**
 * 4) CSS: card de mejor piloto + imagen de circuito visible.
 */
const css = `
    /* GC_APP_TOP_DRIVER_V15_35_5_1 */
    .gc-app-readout-card-v3{
      gap:12px;
    }

    .gc-app-top-driver-v1535{
      display:grid;
      grid-template-columns:58px minmax(0,1fr) auto;
      align-items:center;
      gap:14px;
      min-height:104px;
      padding:15px;
      border:1px solid color-mix(in srgb,var(--accent,#9dff00) 24%,rgba(255,255,255,.10));
      border-radius:18px;
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 15%,transparent), transparent 9rem),
        linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.018)),
        rgba(0,0,0,.18);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.035),
        0 16px 44px rgba(0,0,0,.16);
    }

    .gc-app-top-driver-v1535__avatar{
      width:58px;
      height:58px;
      border-radius:999px;
      padding:3px;
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      box-shadow:0 0 24px color-mix(in srgb,var(--accent,#9dff00) 18%,transparent);
    }

    .gc-app-top-driver-v1535__avatar img{
      width:100%;
      height:100%;
      display:block;
      object-fit:cover;
      border-radius:999px;
      background:#07110a;
    }

    .gc-app-top-driver-v1535 span{
      display:block;
      color:var(--soft);
      font-size:.62rem;
      font-weight:950;
      letter-spacing:.13em;
      text-transform:uppercase;
    }

    .gc-app-top-driver-v1535__body strong{
      display:block;
      margin-top:5px;
      max-width:260px;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:var(--text);
      font-size:1.18rem;
      line-height:1.05;
      letter-spacing:-.035em;
    }

    .gc-app-top-driver-v1535__body small{
      display:block;
      margin-top:5px;
      max-width:360px;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:color-mix(in srgb,var(--text,#f2fff0) 50%,var(--muted));
      line-height:1.25;
    }

    .gc-app-top-driver-v1535__time{
      min-width:120px;
      padding-left:14px;
      border-left:1px solid rgba(255,255,255,.10);
      text-align:right;
    }

    .gc-app-top-driver-v1535__time strong{
      display:block;
      margin-top:6px;
      color:var(--accent);
      font-size:clamp(1.45rem,2.4vw,2.2rem);
      line-height:.9;
      letter-spacing:-.055em;
      font-variant-numeric:tabular-nums;
      text-shadow:0 0 22px color-mix(in srgb,var(--accent,#9dff00) 17%,transparent);
    }

    .gc-app-combo-v3.has-track-image{
      background:
        radial-gradient(circle at 18% 14%, color-mix(in srgb,var(--accent,#9dff00) 7%,transparent), transparent 18rem),
        color-mix(in srgb,var(--panel,#07110a) 86%,#000)!important;
    }

    .gc-app-combo-v3.has-track-image::before{
      content:""!important;
      position:absolute!important;
      inset:0!important;
      z-index:0!important;
      pointer-events:none!important;
      background-image:var(--gc-track-image)!important;
      background-size:cover!important;
      background-position:center!important;
      opacity:.54!important;
      filter:blur(3px) saturate(1.08) contrast(1.04) brightness(.9)!important;
      transform:scale(1.045)!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }

    .gc-app-combo-v3.has-track-image::after{
      z-index:1!important;
      background:
        linear-gradient(90deg,rgba(3,10,5,.86),rgba(3,10,5,.52) 46%,rgba(3,10,5,.72)),
        linear-gradient(180deg,rgba(3,10,5,.38),rgba(3,10,5,.78)),
        radial-gradient(circle at 12% 22%, color-mix(in srgb,var(--accent,#9dff00) 16%,transparent), transparent 28rem)!important;
    }

    .gc-app-combo-v3.has-track-image > *{
      position:relative!important;
      z-index:2!important;
    }

    @media(max-width:720px){
      .gc-app-top-driver-v1535{
        grid-template-columns:52px minmax(0,1fr);
      }

      .gc-app-top-driver-v1535__avatar{
        width:52px;
        height:52px;
      }

      .gc-app-top-driver-v1535__time{
        grid-column:1 / -1;
        min-width:0;
        padding-left:0;
        padding-top:12px;
        border-left:0;
        border-top:1px solid rgba(255,255,255,.10);
        text-align:left;
      }
    }
`;

if (!content.includes('GC_APP_TOP_DRIVER_V15_35_5_1')) {
  const close = '  </style>';
  if (!content.includes(close)) {
    console.error('[GC APP TOP DRIVER FIX] No encuentro cierre </style>.');
    process.exit(1);
  }
  content = content.replace(close, css + '\n' + close);
}

const backup = target + '.bak-v15-35-5-1-top-driver';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP TOP DRIVER FIX] v15.35.5.1 aplicado.');
console.log('[GC APP TOP DRIVER FIX] Backup: ' + backup);
console.log('[GC APP TOP DRIVER FIX] Ejecuta: npm run build');
