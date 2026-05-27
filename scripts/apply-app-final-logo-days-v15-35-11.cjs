const fs = require('fs');
const path = require('path');

const root = process.cwd();

function mustFile(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error('[GC APP FINAL] No encuentro ' + rel);
    process.exit(1);
  }
  return file;
}

function backup(file, original, suffix) {
  const bak = file + '.bak-' + suffix;
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, original, 'utf8');
  return bak;
}

/**
 * 1) /app: mostrar "96 días" en vez de solo "96".
 * No toca imágenes ni assets.
 */
{
  const file = mustFile('src/pages/app.astro');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_APP_UPTIME_DAYS_LABEL_V15_35_11')) {
    const before = "setText('gcServerUptimeDays', String(days));";
    const after = "setText('gcServerUptimeDays', `${days} ${days === 1 ? 'día' : 'días'}`);";

    if (content.includes(before)) {
      content = content.replace(before, after);
    } else {
      // Fallback por si hay espacios o comillas diferentes.
      content = content.replace(
        /setText\(['"]gcServerUptimeDays['"],\s*String\(days\)\);/,
        after
      );
    }

    const css = `
    /* GC_APP_UPTIME_DAYS_LABEL_V15_35_11 */
    .gc-app-server-uptime-v1535 strong{
      white-space:nowrap;
      letter-spacing:-.055em;
    }
`;

    const close = '  </style>';
    if (!content.includes(close)) {
      console.error('[GC APP FINAL] No encuentro cierre </style> en app.astro');
      process.exit(1);
    }

    content = content.replace(close, css + '\n' + close);
  }

  if (content !== original) {
    backup(file, original, 'v15-35-11-uptime-days-label');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP FINAL] Actualizado src/pages/app.astro');
  } else {
    console.log('[GC APP FINAL] Sin cambios en app.astro');
  }
}

/**
 * 2) AppLayout: matar cualquier fondo/recuadro/pseudo-elemento del logo lateral.
 * Lo hacemos aquí, al final del <head>, con especificidad alta.
 */
{
  const file = mustFile('src/layouts/AppLayout.astro');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_LOGO_NO_BOX_FINAL_V15_35_11_APP')) {
    const style = `
    <style is:global>
      /* GC_LOGO_NO_BOX_FINAL_V15_35_11_APP */
      html[data-gc-scope="app"] .gc-rail .gc-brand{
        background:transparent!important;
        box-shadow:none!important;
      }

      html[data-gc-scope="app"] .gc-rail .gc-brand__mark,
      html[data-gc-scope="app"] .gc-rail .gc-brand__mark.gc-brand__mark--logo{
        position:relative!important;
        width:48px!important;
        height:48px!important;
        min-width:48px!important;
        background:none!important;
        background-color:transparent!important;
        background-image:none!important;
        box-shadow:none!important;
        border:0!important;
        outline:0!important;
        border-radius:0!important;
        overflow:visible!important;
        padding:0!important;
        color:inherit!important;
      }

      html[data-gc-scope="app"] .gc-rail .gc-brand__mark::before,
      html[data-gc-scope="app"] .gc-rail .gc-brand__mark::after,
      html[data-gc-scope="app"] .gc-rail .gc-brand__mark.gc-brand__mark--logo::before,
      html[data-gc-scope="app"] .gc-rail .gc-brand__mark.gc-brand__mark--logo::after{
        content:none!important;
        display:none!important;
        background:none!important;
        box-shadow:none!important;
        border:0!important;
      }

      html[data-gc-scope="app"] .gc-rail .gc-brand__mark img,
      html[data-gc-scope="app"] .gc-rail .gc-brand__mark.gc-brand__mark--logo img{
        width:48px!important;
        height:48px!important;
        max-width:48px!important;
        max-height:48px!important;
        object-fit:contain!important;
        border:0!important;
        outline:0!important;
        background:transparent!important;
        box-shadow:none!important;
        border-radius:0!important;
        filter:drop-shadow(0 0 10px color-mix(in srgb,var(--accent,#9dff00) 16%,transparent))!important;
      }
    </style>`;

    const close = '  </head>';
    if (!content.includes(close)) {
      console.error('[GC APP FINAL] No encuentro cierre </head> en AppLayout.astro');
      process.exit(1);
    }
    content = content.replace(close, style + '\n' + close);
  }

  if (content !== original) {
    backup(file, original, 'v15-35-11-logo-no-box-app');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP FINAL] Actualizado src/layouts/AppLayout.astro');
  } else {
    console.log('[GC APP FINAL] Sin cambios en AppLayout.astro');
  }
}

/**
 * 3) MarketingLayout: mismo ajuste en web pública.
 */
{
  const file = mustFile('src/layouts/MarketingLayout.astro');
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  if (!content.includes('GC_LOGO_NO_BOX_FINAL_V15_35_11_PUBLIC')) {
    const style = `
    <style is:global>
      /* GC_LOGO_NO_BOX_FINAL_V15_35_11_PUBLIC */
      html[data-gc-scope="marketing"] .gc-public-brand{
        background:transparent!important;
        box-shadow:none!important;
      }

      html[data-gc-scope="marketing"] .gc-public-brand-mark,
      html[data-gc-scope="marketing"] .gc-public-brand-mark.gc-public-brand-mark--logo{
        position:relative!important;
        width:42px!important;
        height:42px!important;
        min-width:42px!important;
        background:none!important;
        background-color:transparent!important;
        background-image:none!important;
        box-shadow:none!important;
        border:0!important;
        outline:0!important;
        border-radius:0!important;
        overflow:visible!important;
        padding:0!important;
        color:inherit!important;
      }

      html[data-gc-scope="marketing"] .gc-public-brand-mark::before,
      html[data-gc-scope="marketing"] .gc-public-brand-mark::after,
      html[data-gc-scope="marketing"] .gc-public-brand-mark.gc-public-brand-mark--logo::before,
      html[data-gc-scope="marketing"] .gc-public-brand-mark.gc-public-brand-mark--logo::after{
        content:none!important;
        display:none!important;
        background:none!important;
        box-shadow:none!important;
        border:0!important;
      }

      html[data-gc-scope="marketing"] .gc-public-brand-mark img,
      html[data-gc-scope="marketing"] .gc-public-brand-mark.gc-public-brand-mark--logo img{
        width:42px!important;
        height:42px!important;
        max-width:42px!important;
        max-height:42px!important;
        object-fit:contain!important;
        border:0!important;
        outline:0!important;
        background:transparent!important;
        box-shadow:none!important;
        border-radius:0!important;
        filter:drop-shadow(0 0 10px rgba(155,245,66,.14))!important;
      }
    </style>`;

    const close = '  </head>';
    if (!content.includes(close)) {
      console.error('[GC APP FINAL] No encuentro cierre </head> en MarketingLayout.astro');
      process.exit(1);
    }
    content = content.replace(close, style + '\n' + close);
  }

  if (content !== original) {
    backup(file, original, 'v15-35-11-logo-no-box-public');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[GC APP FINAL] Actualizado src/layouts/MarketingLayout.astro');
  } else {
    console.log('[GC APP FINAL] Sin cambios en MarketingLayout.astro');
  }
}

console.log('[GC APP FINAL] Listo. Ejecuta npm run build');
