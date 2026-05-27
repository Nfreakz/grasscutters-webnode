const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn('[GC GLOBAL SOCIAL] No existe: ' + path.relative(root, filePath));
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function backup(filePath, original, suffix) {
  const backupPath = filePath + '.bak-' + suffix;
  if (original && !fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
}

function write(filePath, content, original, suffix) {
  if (!original || content === original) {
    console.log('[GC GLOBAL SOCIAL] Sin cambios: ' + path.relative(root, filePath));
    return;
  }
  backup(filePath, original, suffix);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[GC GLOBAL SOCIAL] Actualizado: ' + path.relative(root, filePath));
}

function patchAppLayout() {
  const filePath = path.join(root, 'src', 'layouts', 'AppLayout.astro');
  let content = read(filePath);
  const original = content;
  if (!content) return;

  if (!content.includes('GC_GLOBAL_SOCIAL_META_V15_31')) {
    const pageOgBlock = `const pageOgImages = {
  '/app': '/og/platform-og.png',
  '/hotlaps': '/og/hotlaps-og.png',
  '/combos': '/og/combos-og.png',
  '/pilotos': '/og/pilotos-og.png',
  '/perfil': '/og/perfil-og.png',
  '/login': '/og/login-og.png',
  '/herramientas/fov': '/og/fov-og.png',
  '/admin': '/og/admin-og.png',
};`;

    const replacement = `const pageOgImages = {
  '/app': '/og/platform-og.png',
  '/hotlaps': '/og/hotlaps-og.png',
  '/combos': '/og/combos-og.png',
  '/pilotos': '/og/pilotos-og.png',
  '/perfil': '/og/perfil-og.png',
  '/login': '/og/login-og.png',
  '/herramientas/fov': '/og/fov-og.png',
  '/admin': '/og/admin-og.png',
};

/* GC_GLOBAL_SOCIAL_META_V15_31 START */
const routeSocialMeta = {
  '/app': {
    title: 'Panel | GrassCutters Racing',
    description: 'Panel de pista de GrassCutters Racing con combo activo, actividad reciente, hotlaps y accesos principales.',
    image: '/og/platform-og.png',
    imageAlt: 'Panel GrassCutters Racing',
  },
  '/hotlaps': {
    title: 'Hotlaps | GrassCutters Racing',
    description: 'Leaderboard de GrassCutters Racing con tiempos de referencia, filtros por piloto, coche, circuito y vueltas válidas.',
    image: '/og/hotlaps-og.png',
    imageAlt: 'Hotlaps GrassCutters Racing',
  },
  '/combos': {
    title: 'Combos | GrassCutters Racing',
    description: 'Centro de combos de GrassCutters Racing con circuitos, coches, actividad real y referencias para decidir dónde rodar.',
    image: '/og/combos-og.png',
    imageAlt: 'Combos GrassCutters Racing',
  },
  '/pilotos': {
    title: 'Pilotos | GrassCutters Racing',
    description: 'Directorio de pilotos de GrassCutters Racing con perfiles públicos, actividad reciente y datos desde stracker.',
    image: '/og/pilotos-og.png',
    imageAlt: 'Pilotos GrassCutters Racing',
  },
  '/herramientas/fov': {
    title: 'FOV Calculator | GrassCutters Racing',
    description: 'Calculadora de FOV para ajustar la visión del cockpit y mejorar la referencia en pista.',
    image: '/og/fov-og.png',
    imageAlt: 'FOV Calculator GrassCutters Racing',
  },
  '/login': {
    title: 'Login | GrassCutters Racing',
    description: 'Acceso a la plataforma GrassCutters Racing.',
    image: '/og/login-og.png',
    imageAlt: 'Login GrassCutters Racing',
  },
};

const exactRouteSocialMeta = routeSocialMeta[currentPathForSeo];

function resolveSeoText(value, fallback = '') {
  const text = compactSeoText(value, '');
  const generic = ['grasscutters racing platform', 'grasscutters platform', ''];
  if (generic.includes(text.toLowerCase())) return compactSeoText(fallback, text || fallback);
  return text || compactSeoText(fallback, '');
}
/* GC_GLOBAL_SOCIAL_META_V15_31 END */`;

    if (content.includes(pageOgBlock)) {
      content = content.replace(pageOgBlock, replacement);
    } else {
      content = content.replace(/const pageOgImages = \{[\s\S]*?\};/, replacement);
    }
  }

  content = content.replace(
    "const cleanTitle = compactSeoText(title, 'GrassCutters Platform');",
    "const cleanTitle = resolveSeoText(title, exactRouteSocialMeta?.title || 'GrassCutters Platform');"
  );

  content = content.replace(
    "const cleanDescription = compactSeoText(description, 'Panel de pista, hotlaps, combos y perfiles de GrassCutters Racing.');",
    "const cleanDescription = resolveSeoText(description, exactRouteSocialMeta?.description || 'Panel de pista, hotlaps, combos y perfiles de GrassCutters Racing.');"
  );

  content = content.replace(
    "const selectedOgImage = ogImage || matchedOgImage || '/og/platform-og.png';",
    "const selectedOgImage = ogImage || exactRouteSocialMeta?.image || matchedOgImage || '/og/platform-og.png';"
  );

  content = content.replace(
    "const cleanOgImageAlt = compactSeoText(ogImageAlt, 'Imagen social de ' + cleanTitle);",
    "const cleanOgImageAlt = compactSeoText(ogImageAlt, exactRouteSocialMeta?.imageAlt || 'Imagen social de ' + cleanTitle);"
  );

  write(filePath, content, original, 'v15-31-global-social');
}

function patchMarketingLayout() {
  const filePath = path.join(root, 'src', 'layouts', 'MarketingLayout.astro');
  let content = read(filePath);
  const original = content;
  if (!content) return;

  // Asegura fallback global más digno si existe esa línea.
  content = content.replaceAll('/og/grasscutters-social-card.png', '/og/grasscutters-social-card.png');

  const required = {
    "'/'": "'/og/home-og.png'",
    "'/comunidad'": "'/og/comunidad-og.png'",
    "'/campeonato'": "'/og/campeonato-og.png'",
    "'/calendario'": "'/og/calendario-og.png'",
    "'/app-android'": "'/og/app-android-og.png'",
    "'/apoyo-servidor'": "'/og/apoyo-servidor-og.png'",
    "'/normas'": "'/og/normas-og.png'",
    "'/privacidad'": "'/og/privacidad-og.png'",
  };

  if (content.includes('const pageOgImages = {')) {
    for (const [key, value] of Object.entries(required)) {
      const line = `  ${key}: ${value},`;
      if (!content.includes(line)) {
        content = content.replace(/const pageOgImages = \{/, `const pageOgImages = {\n${line}`);
      }
    }
  }

  write(filePath, content, original, 'v15-31-global-social');
}

function patchPageDescriptions() {
  const patches = [
    {
      path: ['src','pages','hotlaps.astro'],
      from: '<AppLayout title="Hotlaps | GrassCutters">',
      to: `<AppLayout
  title="Hotlaps | GrassCutters Racing"
  description="Leaderboard de GrassCutters Racing con tiempos de referencia, filtros por piloto, coche, circuito y vueltas válidas."
  canonicalPath="/hotlaps"
  ogImage="/og/hotlaps-og.png"
  ogImageAlt="Hotlaps GrassCutters Racing"
>`
    },
    {
      path: ['src','pages','combos.astro'],
      from: '<AppLayout title="Combos | GrassCutters">',
      to: `<AppLayout
  title="Combos | GrassCutters Racing"
  description="Centro de combos de GrassCutters Racing con circuitos, coches, actividad real y referencias para decidir dónde rodar."
  canonicalPath="/combos"
  ogImage="/og/combos-og.png"
  ogImageAlt="Combos GrassCutters Racing"
>`
    },
    {
      path: ['src','pages','pilotos.astro'],
      from: '<AppLayout title="Pilotos | GrassCutters">',
      to: `<AppLayout
  title="Pilotos | GrassCutters Racing"
  description="Directorio de pilotos de GrassCutters Racing con perfiles públicos, actividad reciente y datos desde stracker."
  canonicalPath="/pilotos"
  ogImage="/og/pilotos-og.png"
  ogImageAlt="Pilotos GrassCutters Racing"
>`
    },
    {
      path: ['src','pages','app.astro'],
      from: '<AppLayout title="Panel | GrassCutters">',
      to: `<AppLayout
  title="Panel | GrassCutters Racing"
  description="Panel de pista de GrassCutters Racing con combo activo, actividad reciente, hotlaps y accesos principales."
  canonicalPath="/app"
  ogImage="/og/platform-og.png"
  ogImageAlt="Panel GrassCutters Racing"
>`
    },
  ];

  for (const patch of patches) {
    const filePath = path.join(root, ...patch.path);
    let content = read(filePath);
    const original = content;
    if (!content) continue;

    if (content.includes(patch.to)) {
      console.log('[GC GLOBAL SOCIAL] Ya actualizado: ' + patch.path.join('/'));
      continue;
    }

    if (content.includes(patch.from)) {
      content = content.replace(patch.from, patch.to);
      write(filePath, content, original, 'v15-31-global-social');
    } else if (content.includes('<AppLayout') && !content.includes('ogImage=')) {
      console.warn('[GC GLOBAL SOCIAL] Revisa manualmente, AppLayout no coincide: ' + patch.path.join('/'));
    }
  }
}

patchAppLayout();
patchMarketingLayout();
patchPageDescriptions();

console.log('');
console.log('[GC GLOBAL SOCIAL] Listo.');
console.log('[GC GLOBAL SOCIAL] Ejecuta: npm run build');
