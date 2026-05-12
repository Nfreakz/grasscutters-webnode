#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const targets = [
  'src/pages/archivo/[category]/[slug].astro',
  'src/pages/admin/archivo/editar/[id].astro',
];

const cssTag = '<link rel="stylesheet" href="/gc-archivo-share-v832.css" />';
const jsTag = '<script src="/gc-archivo-share-v832.js" is:inline></script>';

function installIntoAstro(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[Archivo share v8.3.2] No existe, omitido: ${path.relative(root, filePath)}`);
    return;
  }

  const backup = `${filePath}.backup-share-v832-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let code = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(backup, code, 'utf8');

  if (!code.includes('/gc-archivo-share-v832.css')) {
    if (code.includes('</head>')) {
      code = code.replace('</head>', `  ${cssTag}\n</head>`);
    } else {
      code = code.replace('---\n', `---\n`);
      code = code.replace(/<([A-Za-z]+Layout)([^>]*)>/, `<$1$2>\n  ${cssTag}`);
    }
  }

  if (!code.includes('/gc-archivo-share-v832.js')) {
    if (code.includes('</AppLayout>')) {
      code = code.replace('</AppLayout>', `\n  ${jsTag}\n</AppLayout>`);
    } else if (code.includes('</MarketingLayout>')) {
      code = code.replace('</MarketingLayout>', `\n  ${jsTag}\n</MarketingLayout>`);
    } else if (code.includes('</Layout>')) {
      code = code.replace('</Layout>', `\n  ${jsTag}\n</Layout>`);
    } else {
      code += `\n${jsTag}\n`;
    }
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`[Archivo share v8.3.2] Instalado en ${path.relative(root, filePath)}`);
  console.log(`[Archivo share v8.3.2] Backup: ${backup}`);
}

for (const target of targets) {
  installIntoAstro(path.join(root, target));
}

console.log('[Archivo share v8.3.2] Instalación completada.');
