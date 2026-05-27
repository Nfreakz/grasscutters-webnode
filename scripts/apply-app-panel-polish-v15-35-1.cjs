const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP POLISH] No encuentro ' + target);
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_PANEL_POLISH_V15_35_1')) {
  console.log('[GC APP POLISH] v15.35.1 ya parece aplicado.');
  process.exit(0);
}

function replaceAll(from, to) {
  content = content.split(from).join(to);
}

// Textos: menos genéricos, más panel.
replaceAll('GrassCutters Platform', 'GrassCutters Control');
replaceAll('Panel de pista.', 'Race Control');
replaceAll('Resumen de pista con combo activo, actividad reciente y accesos principales.', 'Combo activo, vueltas recientes y accesos de boxes.');
replaceAll('Panel listo', 'Sistema listo');
replaceAll('Combo activo', 'Combo');
replaceAll('Comprobando', 'Check');
replaceAll('Leyendo actividad reciente.', 'Actividad reciente');
replaceAll('Abrir combo', 'Ver combo');
replaceAll('Mejor referencia', 'Best lap');
replaceAll('Pendiente de datos', 'Sin referencia');
replaceAll('Unirse al servidor', 'Entrar al server');
replaceAll('Lectura rápida', 'Lectura de pista');
replaceAll('Estado útil del último refresco.', 'Datos del último refresco.');
replaceAll('Vueltas recientes', 'Vueltas');
replaceAll('cargadas en esta vista', 'último refresco');
replaceAll('Referencia rápida', 'Best');
replaceAll('Último movimiento', 'Última vuelta');
replaceAll('Últimas vueltas', 'Actividad reciente');
replaceAll('Cargando actividad...', 'Cargando vueltas...');
replaceAll('Accesos rápidos', 'Boxes');
replaceAll('Lo que más se usa cuando entras al panel.', 'Accesos principales del panel.');
replaceAll('Garage', 'Pit wall');
replaceAll('Tabla de tiempos, filtros por piloto, coche y circuito.', 'Tiempos y filtros.');
replaceAll('Actividad por combinación y referencia rápida del combo activo.', 'Combos y referencias.');
replaceAll('Actividad de la comunidad y perfiles de conducción.', 'Perfiles y actividad.');
replaceAll('Cuenta, piloto vinculado y resumen personal.', 'Cuenta y piloto.');
replaceAll('Utilidades internas para mantener el garaje ordenado.', 'Herramientas del panel.');

// Clases CSS: parche añadido antes de cierre de </style>.
const polishCss = `
    /* GC_APP_PANEL_POLISH_V15_35_1 */
    .gc-app-dashboard-v3{
      gap:clamp(18px,2.4vw,28px);
    }

    .gc-app-hero-v3{
      position:relative;
      overflow:hidden;
      border:1px solid color-mix(in srgb,var(--accent,#9dff00) 22%,var(--line));
      border-radius:28px;
      background:
        linear-gradient(120deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),
        radial-gradient(circle at 82% 12%, color-mix(in srgb,var(--accent2,#35d3ff) 12%,transparent), transparent 22rem),
        radial-gradient(circle at 8% 18%, color-mix(in srgb,var(--accent,#9dff00) 12%,transparent), transparent 20rem);
      box-shadow:0 18px 70px rgba(0,0,0,.20), inset 0 0 0 1px rgba(255,255,255,.035);
    }

    .gc-app-hero-v3::after{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background:
        linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px),
        linear-gradient(0deg,rgba(255,255,255,.026) 1px,transparent 1px);
      background-size:42px 42px;
      mask-image:linear-gradient(90deg,rgba(0,0,0,.48),transparent 72%);
      opacity:.46;
    }

    .gc-app-hero-v3 > *{
      position:relative;
      z-index:1;
    }

    .gc-app-hero-v3 .gc-title{
      letter-spacing:-.085em;
      text-transform:none;
    }

    .gc-app-hero-v3 .gc-subtitle{
      color:var(--soft);
      font-size:clamp(1rem,1.4vw,1.18rem);
    }

    .gc-app-session-v3{
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 16%,transparent), transparent 10rem),
        rgba(0,0,0,.18);
      border-color:color-mix(in srgb,var(--accent,#9dff00) 18%,var(--line));
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.035);
    }

    .gc-app-session-v3 .gc-status-row{
      border-radius:14px;
      background:rgba(0,0,0,.16);
      border:1px solid rgba(255,255,255,.07);
    }

    .gc-app-metrics-v3{
      gap:12px;
    }

    .gc-app-metrics-v3 .gc-metric{
      position:relative;
      overflow:hidden;
      border-color:color-mix(in srgb,var(--accent,#9dff00) 16%,var(--line));
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 10%,transparent), transparent 8rem),
        linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));
    }

    .gc-app-metrics-v3 .gc-metric strong{
      font-size:clamp(1.85rem,3.2vw,2.85rem);
      line-height:.92;
      letter-spacing:-.06em;
      color:var(--text);
    }

    .gc-app-metrics-v3 .gc-metric span{
      color:var(--soft);
      letter-spacing:.13em;
    }

    .gc-app-combo-v3{
      position:relative;
      overflow:hidden;
      border-radius:28px;
      border-color:color-mix(in srgb,var(--accent,#9dff00) 24%,var(--line));
      box-shadow:0 20px 80px rgba(0,0,0,.22);
      background:
        linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.46)),
        radial-gradient(circle at 18% 14%, color-mix(in srgb,var(--accent,#9dff00) 10%,transparent), transparent 18rem),
        var(--panel);
    }

    .gc-app-combo-v3::after{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background:linear-gradient(90deg,rgba(0,0,0,.34),transparent 58%,rgba(0,0,0,.38));
      z-index:0;
    }

    .gc-app-combo-v3 > *{
      position:relative;
      z-index:1;
    }

    .gc-app-combo-body-v3 h3{
      font-size:clamp(2.75rem,5.7vw,5.4rem);
      line-height:.82;
      letter-spacing:-.09em;
      max-width:780px;
      text-wrap:balance;
    }

    .gc-app-card-head-v3 h2{
      color:var(--text);
      letter-spacing:-.055em;
    }

    .gc-app-card-head-v3 p{
      color:var(--muted);
    }

    .gc-app-best-v3{
      border-color:rgba(255,255,255,.13);
      background:rgba(0,0,0,.24);
      backdrop-filter:blur(10px);
    }

    .gc-app-best-v3 strong{
      font-size:clamp(2rem,3.6vw,3.25rem);
      color:var(--accent);
      text-shadow:0 0 24px color-mix(in srgb,var(--accent,#9dff00) 18%,transparent);
    }

    .gc-app-mini-stats-v3 div,
    .gc-app-readout-v3{
      background:rgba(0,0,0,.16);
      border-color:rgba(255,255,255,.09);
    }

    .gc-app-mini-stats-v3 strong,
    .gc-app-readout-v3 strong{
      color:var(--text);
    }

    .gc-app-readout-card-v3,
    .gc-app-actions-v3,
    .gc-app-references-v3{
      border-radius:24px;
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb,var(--accent,#9dff00) 7%,transparent), transparent 10rem),
        linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.016));
    }

    .gc-app-readout-v3 strong{
      font-size:clamp(1.35rem,2.6vw,2.1rem);
      letter-spacing:-.05em;
    }

    .gc-app-action-grid-v3{
      grid-template-columns:repeat(5,minmax(0,1fr));
    }

    .gc-app-action-card-v3{
      min-height:80px;
      border-radius:15px;
      background:rgba(255,255,255,.026);
    }

    .gc-app-action-card-v3 p{
      font-size:.78rem;
      color:var(--muted);
    }

    .gc-app-table-wrap-v3{
      border-radius:18px;
      border:1px solid rgba(255,255,255,.08);
    }

    .gc-app-table-v3 tbody tr:hover td{
      background:color-mix(in srgb,var(--accent,#9dff00) 7%,transparent);
    }

    .gc-app-table-v3 td strong{
      color:var(--text);
    }

    @media(max-width:720px){
      .gc-app-hero-v3{
        border-radius:22px;
      }

      .gc-app-combo-body-v3 h3{
        font-size:clamp(2.25rem,13vw,3.8rem);
      }

      .gc-app-action-grid-v3{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
    }

    @media(max-width:460px){
      .gc-app-action-grid-v3{
        grid-template-columns:1fr;
      }

      .gc-app-pit-actions-v6 .gc-btn{
        width:100%;
        justify-content:center;
      }
    }
`;

const styleClose = '  </style>';
if (!content.includes(styleClose)) {
  console.error('[GC APP POLISH] No encuentro cierre de style.');
  process.exit(1);
}
content = content.replace(styleClose, polishCss + '\n' + styleClose);

// Eliminar console.info si sigue presente.
content = content.replace(/\n\s*console\.info\('\[GC \/app v6\.3 panel fix\]'[\s\S]*?\n\s*\}\);\n/g, '\n');

const backup = target + '.bak-v15-35-1-app-polish';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP POLISH] v15.35.1 aplicado sobre el panel existente.');
console.log('[GC APP POLISH] Backup: ' + backup);
console.log('[GC APP POLISH] Ejecuta: npm run build');
