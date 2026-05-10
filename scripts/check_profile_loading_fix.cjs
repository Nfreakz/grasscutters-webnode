/* Check rápido para el fix de /perfil */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const profilePath = path.join(root, 'src', 'pages', 'perfil.astro');

if (!fs.existsSync(profilePath)) {
  console.error('ERROR: No encuentro src/pages/perfil.astro.');
  process.exit(1);
}

const source = fs.readFileSync(profilePath, 'utf8');
const badFragments = [
  'linkUi.select.innerHTML = "<option value="">',
  'return "<option value="" + escapeHtml(id)',
  '"<span title="" + escapeHtml(guid)'
];
const found = badFragments.filter((fragment) => source.includes(fragment));
if (found.length) {
  console.error('ERROR: aún quedan comillas rotas en perfil.astro:');
  found.forEach((fragment) => console.error(' -', fragment));
  process.exit(1);
}

const scripts = [...source.matchAll(/<script\s+is:inline>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
try {
  for (const script of scripts) new Function(script);
} catch (error) {
  console.error('ERROR: JavaScript inline de perfil.astro no compila:');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}

if (!source.includes('Vincular cuenta con piloto') || !source.includes('/api/auth/link-pilot')) {
  console.error('ERROR: no encuentro el bloque de vincular piloto en perfil.astro.');
  process.exit(1);
}

console.log('OK: /perfil tiene el bloque de vincular piloto y el JavaScript compila.');
