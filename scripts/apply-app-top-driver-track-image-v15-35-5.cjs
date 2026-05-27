const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP TOP DRIVER] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_TOP_DRIVER_V15_35_5')) {
  console.log('[GC APP TOP DRIVER] v15.35.5 ya parece aplicado.');
  process.exit(0);
}

/**
 * 1) Insertar card "mejor piloto" dentro de Lectura de pista, debajo del grid.
 */
const readoutGridClose = `        </div>
      </article>

      <article class="gc-section gc-app-actions-v3">`;

const topDriverCard = `        </div>

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
      </article>

      <article class="gc-section gc-app-actions-v3">`;

if (content.includes('gc-app-top-driver-v1535')) {
  console.log('[GC APP TOP DRIVER] Card de mejor piloto ya existe.');
} else if (content.includes(readoutGridClose)) {
  content = content.replace(readoutGridClose, topDriverCard);
} else {
  console.error('[GC APP TOP DRIVER] No encuentro el cierre del bloque Lectura de pista para insertar la card.');
  process.exit(1);
}

/**
 * 2) Añadir helper para pintar el piloto destacado.
 */
const renderLapReadoutStart = `      function renderLapReadout(bestData, recentData){`;

const helper = `      function driverAvatarUrl(row){
        const id = pick(row, ['playerId','driverId','pilotId','id','driver.id','player.id','pilot.id']);
        const direct = pick(row, ['avatarUrl','avatar_url','driver.avatarUrl','player.avatarUrl','pilot.avatarUrl']);
        if (direct) return String(direct);
        if (id !== undefined && id !== null && id !== '') return \`/api/pilot-avatar/\${encodeURIComponent(String(id))}\`;
        return '/images/pilot-avatar-default.png';
      }

      function renderTopDriver(row){
        const avatar = byId('gcTopDriverAvatar');
        const name = driverName(row);
        const car = carName(row);
        const track = trackName(row);
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
  if (!content.includes(renderLapReadoutStart)) {
    console.error('[GC APP TOP DRIVER] No encuentro renderLapReadout para insertar helper.');
    process.exit(1);
  }
  content = content.replace(renderLapReadoutStart, helper + renderLapReadoutStart);
}

const bestConst = `        const best = bestItems[0] || [...recentItems].sort((a,b) => lapMs(a) - lapMs(b))[0] || null;
        const last = recentLaps[0] || null;`;

const bestConstReplacement = `        const best = bestItems[0] || [...recentItems].sort((a,b) => lapMs(a) - lapMs(b))[0] || null;
        const last = recentLaps[0] || null;

        renderTopDriver(best);`;

if (!content.includes('renderTopDriver(best);')) {
  if (!content.includes(bestConst)) {
    console.error('[GC APP TOP DRIVER] No encuentro punto para llamar renderTopDriver(best).');
    process.exit(1);
  }
  content = content.replace(bestConst, bestConstReplacement);
}

/**
 * 3) CSS: card de mejor piloto + arreglar imagen de circuito demasiado enterrada.
 */
const css = `
    /* GC_APP_TOP_DRIVER_V15_35_5 */
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
      opacity:.52!important;
      filter:blur(3.5px) saturate(1.08) contrast(1.02) brightness(.88)!important;
      transform:scale(1.045)!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }

    .gc-app-combo-v3.has-track-image::after{
      z-index:1!important;
      background:
        linear-gradient(90deg,rgba(3,10,5,.88),rgba(3,10,5,.56) 46%,rgba(3,10,5,.74)),
        linear-gradient(180deg,rgba(3,10,5,.44),rgba(3,10,5,.82)),
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

const close = '  </style>';
if (!content.includes(close)) {
  console.error('[GC APP TOP DRIVER] No encuentro cierre </style>.');
  process.exit(1);
}
content = content.replace(close, css + '\n' + close);

const backup = target + '.bak-v15-35-5-top-driver';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP TOP DRIVER] v15.35.5 aplicado.');
console.log('[GC APP TOP DRIVER] Backup: ' + backup);
console.log('[GC APP TOP DRIVER] Ejecuta: npm run build');
