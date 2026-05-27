const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'app.astro');

if (!fs.existsSync(target)) {
  console.error('[GC APP CENTERING] No encuentro src/pages/app.astro');
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_APP_PANEL_CENTERING_V15_35_3')) {
  console.log('[GC APP CENTERING] v15.35.3 ya parece aplicado.');
  process.exit(0);
}

const css = `
    /* GC_APP_PANEL_CENTERING_V15_35_3 */
    .gc-app-dashboard-v3{
      width:100%;
      max-width:1480px;
      margin-inline:auto;
      padding-inline:clamp(8px,1.2vw,18px);
      box-sizing:border-box;
    }

    .gc-app-dashboard-v3 > *{
      width:100%;
    }

    @media (min-width: 1600px){
      .gc-app-dashboard-v3{
        max-width:1440px;
      }
    }

    @media (max-width: 980px){
      .gc-app-dashboard-v3{
        padding-inline:0;
      }
    }
`;

const close = '  </style>';
if (!content.includes(close)) {
  console.error('[GC APP CENTERING] No encuentro cierre </style> en app.astro');
  process.exit(1);
}

content = content.replace(close, css + '\n' + close);

const backup = target + '.bak-v15-35-3-app-centering';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC APP CENTERING] Centrado y ancho máximo aplicados a /app.');
console.log('[GC APP CENTERING] Backup: ' + backup);
console.log('[GC APP CENTERING] Ejecuta: npm run build');
