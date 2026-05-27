const fs = require('fs');
const path = require('path');

const root = process.cwd();

function mustRead(rel) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) {
    console.error('[GC APP DETAILS] No encuentro ' + rel);
    process.exit(1);
  }
  return { target, content: fs.readFileSync(target, 'utf8') };
}

function backup(target, original, suffix) {
  const backupPath = target + '.bak-' + suffix;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
  return backupPath;
}

/**
 * 1) Pulido fino de /app sin cambiar estructura.
 */
{
  const { target, content: original } = mustRead('src/pages/app.astro');
  let content = original;

  if (!content.includes('GC_APP_PANEL_DETAILS_V15_35_2')) {
    const css = `
    /* GC_APP_PANEL_DETAILS_V15_35_2 */
    .gc-app-dashboard-v3{
      padding-bottom:clamp(20px,3vw,36px);
    }

    .gc-app-hero-v3{
      min-height:auto;
      padding-block:clamp(26px,3.4vw,40px)!important;
      border-color:color-mix(in srgb,var(--accent,#9dff00) 30%,var(--line));
    }

    .gc-app-hero-v3 .gc-kicker{
      color:var(--accent);
      opacity:1;
      text-shadow:0 0 18px color-mix(in srgb,var(--accent,#9dff00) 18%,transparent);
    }

    .gc-app-hero-v3 .gc-title{
      margin-bottom:.32rem;
      max-width:720px;
    }

    .gc-app-hero-v3 .gc-subtitle{
      max-width:620px;
      color:color-mix(in srgb,var(--text,#f2fff0) 74%,var(--muted));
    }

    .gc-hero__meta{
      gap:8px;
    }

    .gc-hero__meta .gc-chip{
      min-height:30px;
      padding:.42rem .72rem;
      border-radius:0;
      background:rgba(255,255,255,.035);
      border-color:rgba(255,255,255,.11);
    }

    .gc-hero__meta .gc-chip--accent{
      background:color-mix(in srgb,var(--accent,#9dff00) 12%,rgba(0,0,0,.22));
      border-color:color-mix(in srgb,var(--accent,#9dff00) 58%,rgba(255,255,255,.08));
      color:var(--accent);
    }

    .gc-app-session-v3{
      align-self:center;
      min-height:auto;
      padding:0;
      overflow:hidden;
    }

    .gc-app-session-v3 .gc-live-panel__title{
      padding:14px 16px;
      margin:0;
      border-bottom:1px solid rgba(255,255,255,.08);
      background:rgba(0,0,0,.14);
    }

    .gc-app-session-v3 .gc-status-list{
      padding:0;
      gap:0;
    }

    .gc-app-session-v3 .gc-status-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      padding:13px 16px;
      border-width:0 0 1px;
      border-radius:0;
      background:rgba(0,0,0,.08);
    }

    .gc-app-session-v3 .gc-status-row:last-child{
      border-bottom:0;
    }

    .gc-app-session-v3 .gc-status-row span{
      color:color-mix(in srgb,var(--text,#f2fff0) 66%,var(--muted));
    }

    .gc-app-session-v3 .gc-status-row strong{
      max-width:180px;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:var(--text);
      font-weight:950;
    }

    .gc-app-metrics-v3{
      border:1px solid color-mix(in srgb,var(--accent,#9dff00) 18%,var(--line));
      border-radius:0;
      overflow:hidden;
      background:rgba(255,255,255,.018);
    }

    .gc-app-metrics-v3 .gc-metric{
      border-width:0 1px 0 0;
      border-radius:0;
      min-height:112px;
      box-shadow:none;
    }

    .gc-app-metrics-v3 .gc-metric:last-child{
      border-right:0;
    }

    .gc-app-metrics-v3 .gc-metric strong{
      font-variant-numeric:tabular-nums;
    }

    .gc-app-top-grid-v3{
      gap:clamp(16px,2vw,26px);
    }

    .gc-app-combo-v3{
      min-height:0;
      padding:clamp(18px,2.2vw,26px);
    }

    .gc-app-combo-v3 .gc-app-card-head-v3{
      padding-bottom:14px;
      margin-bottom:18px;
      border-bottom:1px solid rgba(255,255,255,.10);
    }

    .gc-app-combo-body-v3{
      grid-template-columns:minmax(0,1fr) minmax(190px,.28fr);
      align-items:center;
    }

    .gc-app-combo-body-v3 h3{
      margin-bottom:12px;
      color:#f2fff0;
      text-shadow:0 0 30px rgba(156,255,63,.08);
    }

    .gc-app-chip-list-v3 .gc-chip{
      border-radius:0;
      background:rgba(255,255,255,.035);
      border-color:rgba(255,255,255,.12);
      color:color-mix(in srgb,var(--text,#f2fff0) 88%,var(--accent));
    }

    .gc-app-best-v3{
      min-height:166px;
      border-radius:20px;
      background:
        radial-gradient(circle at 75% 10%, color-mix(in srgb,var(--accent,#9dff00) 11%,transparent), transparent 8rem),
        rgba(0,0,0,.28);
    }

    .gc-app-best-v3 strong{
      font-variant-numeric:tabular-nums;
    }

    .gc-app-best-v3 small,
    .gc-app-readout-v3 small{
      color:color-mix(in srgb,var(--text,#f2fff0) 48%,var(--muted));
    }

    .gc-app-mini-stats-v3{
      margin-top:16px;
    }

    .gc-app-mini-stats-v3 div{
      min-height:72px;
      display:grid;
      align-content:center;
      border-radius:16px;
    }

    .gc-app-pit-actions-v6{
      margin-top:18px;
      padding-top:18px;
    }

    .gc-app-pit-actions-v6 .gc-btn{
      border-radius:999px;
      flex:1 1 130px;
      justify-content:center;
      background:rgba(255,255,255,.035);
    }

    .gc-app-pit-actions-v6 .gc-btn--primary{
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      color:#061006;
      border-color:transparent;
    }

    .gc-app-readout-card-v3{
      display:grid;
      align-content:start;
      min-height:100%;
      padding:clamp(18px,2vw,24px);
    }

    .gc-app-readout-card-v3 .gc-app-card-head-v3{
      min-height:84px;
      margin-bottom:12px;
      padding-bottom:12px;
      border-bottom:1px solid rgba(255,255,255,.08);
    }

    .gc-app-readout-grid-v3{
      gap:10px;
    }

    .gc-app-readout-v3{
      min-height:122px;
      border-radius:16px;
    }

    .gc-app-readout-v3 strong{
      font-variant-numeric:tabular-nums;
    }

    .gc-app-references-v3{
      margin-top:2px;
      padding:clamp(18px,2vw,24px);
    }

    .gc-app-references-v3 .gc-app-card-head-v3{
      align-items:center;
      padding-bottom:14px;
      border-bottom:1px solid rgba(255,255,255,.09);
    }

    .gc-app-references-v3 h2,
    .gc-app-actions-v3 h2{
      letter-spacing:-.055em;
    }

    .gc-app-table-wrap-v3{
      max-height:330px;
      border-color:rgba(255,255,255,.09);
      background:rgba(0,0,0,.12);
    }

    .gc-app-table-v3 th{
      position:sticky;
      top:0;
      z-index:1;
      background:color-mix(in srgb,var(--panel,#07110a) 92%,#000);
      color:color-mix(in srgb,var(--accent,#9dff00) 50%,var(--soft));
    }

    .gc-app-table-v3 td{
      color:color-mix(in srgb,var(--text,#f2fff0) 78%,var(--muted));
    }

    .gc-app-table-v3 td:nth-child(4) strong{
      color:var(--text);
      font-variant-numeric:tabular-nums;
    }

    .gc-app-actions-v3{
      margin-top:4px;
      padding:clamp(18px,2vw,24px);
    }

    .gc-app-actions-v3 .gc-app-card-head-v3{
      align-items:center;
      margin-bottom:16px;
      padding-bottom:14px;
      border-bottom:1px solid rgba(255,255,255,.08);
    }

    .gc-app-action-grid-v3{
      gap:10px;
    }

    .gc-app-action-card-v3{
      min-height:74px;
      padding:13px 14px;
      border-color:rgba(255,255,255,.10);
    }

    .gc-app-action-card-v3>span{
      width:28px;
      height:28px;
      font-size:.6rem;
    }

    .gc-app-action-card-v3 strong{
      font-size:.92rem;
    }

    .gc-app-action-card-v3 p{
      max-width:220px;
      opacity:.78;
    }

    @media(max-width:1180px){
      .gc-app-metrics-v3{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }

      .gc-app-metrics-v3 .gc-metric:nth-child(2){
        border-right:0;
      }

      .gc-app-metrics-v3 .gc-metric:nth-child(n+3){
        border-top:1px solid var(--line);
      }
    }

    @media(max-width:720px){
      .gc-app-session-v3 .gc-status-row strong{
        max-width:52vw;
      }

      .gc-app-table-wrap-v3{
        max-height:380px;
      }

      .gc-app-metrics-v3{
        grid-template-columns:1fr;
      }

      .gc-app-metrics-v3 .gc-metric{
        border-right:0;
        border-bottom:1px solid var(--line);
      }

      .gc-app-metrics-v3 .gc-metric:last-child{
        border-bottom:0;
      }
    }
`;

    const close = '  </style>';
    if (!content.includes(close)) {
      console.error('[GC APP DETAILS] No encuentro cierre </style> en app.astro');
      process.exit(1);
    }
    content = content.replace(close, css + '\n' + close);
  }

  if (content !== original) {
    backup(target, original, 'v15-35-2-app-details');
    fs.writeFileSync(target, content, 'utf8');
    console.log('[GC APP DETAILS] Actualizado src/pages/app.astro');
  } else {
    console.log('[GC APP DETAILS] Sin cambios en src/pages/app.astro');
  }
}

/**
 * 2) Bajar peso del texto de sistema del layout app.
 */
{
  const { target, content: original } = mustRead('src/layouts/AppLayout.astro');
  let content = original;

  if (!content.includes('GC_APP_LAYOUT_SYSTEM_POLISH_V15_35_2')) {
    // Hacer el kicker superior menos técnico y menos ruidoso.
    content = content.replace(
      '<span class="gc-topbar__kicker">GrassCutters Node Platform</span>',
      '<span class="gc-topbar__kicker">Panel</span>'
    );

    // Rebajar el bloque Sistema del rail y hacerlo más discreto.
    content = content.replace(
      `<div class="gc-railmeta">
          <h3>Sistema</h3>
          <dl>
            <div><dt>Web</dt><dd>Astro</dd></div>
            <div><dt>API</dt><dd>Node</dd></div>
            <div><dt>DB</dt><dd>Stracker</dd></div>
          </dl>
        </div>`,
      `<div class="gc-railmeta gc-railmeta--system-v1535" aria-label="Estado técnico">
          <h3>Sistema</h3>
          <dl>
            <div><dt>Web</dt><dd>Astro</dd></div>
            <div><dt>API</dt><dd>Node</dd></div>
            <div><dt>DB</dt><dd>Stracker</dd></div>
          </dl>
        </div>`
    );

    const layoutCss = `
    <style is:global>
      /* GC_APP_LAYOUT_SYSTEM_POLISH_V15_35_2 */
      .gc-topbar__kicker{
        color:color-mix(in srgb,var(--text,#f2fff0) 42%,var(--muted,#8fa293))!important;
        font-size:.62rem!important;
        letter-spacing:.16em!important;
        opacity:.62!important;
      }

      .gc-railmeta--system-v1535{
        margin-top:auto!important;
        padding:10px!important;
        border-radius:14px!important;
        border:1px solid rgba(255,255,255,.06)!important;
        background:rgba(255,255,255,.018)!important;
        opacity:.72;
        transition:opacity .16s ease,border-color .16s ease,background .16s ease;
      }

      .gc-railmeta--system-v1535:hover{
        opacity:1;
        border-color:color-mix(in srgb,var(--accent,#9dff00) 18%,rgba(255,255,255,.08))!important;
        background:rgba(255,255,255,.028)!important;
      }

      .gc-railmeta--system-v1535 h3{
        margin:0 0 7px!important;
        color:color-mix(in srgb,var(--accent,#9dff00) 54%,var(--muted,#8fa293))!important;
        font-size:.58rem!important;
        line-height:1!important;
        letter-spacing:.16em!important;
      }

      .gc-railmeta--system-v1535 dl{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:4px!important;
        margin:0!important;
      }

      .gc-railmeta--system-v1535 dl div{
        display:flex!important;
        justify-content:space-between!important;
        align-items:center!important;
        gap:8px!important;
        min-height:20px!important;
        padding:4px 6px!important;
        border-radius:8px!important;
        background:rgba(0,0,0,.14)!important;
        border:0!important;
      }

      .gc-railmeta--system-v1535 dt,
      .gc-railmeta--system-v1535 dd{
        margin:0!important;
        font-size:.58rem!important;
        line-height:1!important;
        letter-spacing:.08em!important;
      }

      .gc-railmeta--system-v1535 dt{
        color:color-mix(in srgb,var(--text,#f2fff0) 38%,var(--muted,#8fa293))!important;
        text-transform:uppercase!important;
      }

      .gc-railmeta--system-v1535 dd{
        color:color-mix(in srgb,var(--text,#f2fff0) 56%,var(--muted,#8fa293))!important;
        font-weight:900!important;
      }

      @media(max-width:980px){
        .gc-railmeta--system-v1535{
          opacity:.86;
        }
      }
    </style>`;

    const headClose = '  </head>';
    if (!content.includes(headClose)) {
      console.error('[GC APP DETAILS] No encuentro cierre </head> en AppLayout.astro');
      process.exit(1);
    }
    content = content.replace(headClose, layoutCss + '\n' + headClose);
  }

  if (content !== original) {
    backup(target, original, 'v15-35-2-layout-system');
    fs.writeFileSync(target, content, 'utf8');
    console.log('[GC APP DETAILS] Actualizado src/layouts/AppLayout.astro');
  } else {
    console.log('[GC APP DETAILS] Sin cambios en src/layouts/AppLayout.astro');
  }
}

console.log('[GC APP DETAILS] Listo. Ejecuta npm run build');
