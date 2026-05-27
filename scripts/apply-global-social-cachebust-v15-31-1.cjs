const fs = require('fs');
const path = require('path');

const root = process.cwd();

function file(...parts) {
  return path.join(root, ...parts);
}

function read(target) {
  if (!fs.existsSync(target)) {
    console.warn('[GC SOCIAL CACHEBUST] No existe: ' + path.relative(root, target));
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function backup(target, original) {
  const backupPath = target + '.bak-v15-31-1';
  if (original && !fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
}

function write(target, next, original) {
  if (!original || next === original) {
    console.log('[GC SOCIAL CACHEBUST] Sin cambios: ' + path.relative(root, target));
    return;
  }
  backup(target, original);
  fs.writeFileSync(target, next, 'utf8');
  console.log('[GC SOCIAL CACHEBUST] Actualizado: ' + path.relative(root, target));
}

const replacements = {
  '/og/grasscutters-social-card.png': '/og/grasscutters-social-card-v1531.png',
  '/og/home-og.png': '/og/home-og-v1531.png',
  '/og/comunidad-og.png': '/og/comunidad-og-v1531.png',
  '/og/campeonato-og.png': '/og/campeonato-og-v1531.png',
  '/og/calendario-og.png': '/og/calendario-og-v1531.png',
  '/og/app-android-og.png': '/og/app-android-og-v1531.png',
  '/og/platform-og.png': '/og/platform-og-v1531.png',
  '/og/hotlaps-og.png': '/og/hotlaps-og-v1531.png',
  '/og/combos-og.png': '/og/combos-og-v1531.png',
  '/og/pilotos-og.png': '/og/pilotos-og-v1531.png',
  '/og/fov-og.png': '/og/fov-og-v1531.png',
  '/og/login-og.png': '/og/login-og-v1531.png',
  '/og/apoyo-servidor-og.png': '/og/apoyo-servidor-og-v1531.png',
  '/og/normas-og.png': '/og/normas-og-v1531.png',
  '/og/privacidad-og.png': '/og/privacidad-og-v1531.png',
};

const targets = [
  file('src','layouts','AppLayout.astro'),
  file('src','layouts','MarketingLayout.astro'),
  file('src','pages','hotlaps.astro'),
  file('src','pages','combos.astro'),
  file('src','pages','pilotos.astro'),
  file('src','pages','app.astro'),
  file('src','pages','index.astro'),
  file('src','pages','comunidad.astro'),
  file('src','pages','campeonato.astro'),
  file('src','pages','calendario.astro'),
  file('src','pages','app-android.astro'),
  file('src','pages','apoyo-servidor.astro'),
  file('src','pages','normas.astro'),
  file('src','pages','privacidad.astro'),
];

for (const target of targets) {
  let content = read(target);
  const original = content;
  if (!content) continue;

  for (const [from, to] of Object.entries(replacements)) {
    content = content.split(from).join(to);
  }

  write(target, content, original);
}

console.log('');
console.log('[GC SOCIAL CACHEBUST] Listo.');
console.log('[GC SOCIAL CACHEBUST] Ahora el og:image usa nombres nuevos *-v1531.png, evitando caché de WhatsApp.');
console.log('[GC SOCIAL CACHEBUST] Ejecuta: npm run build');
