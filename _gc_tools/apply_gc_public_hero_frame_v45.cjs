#!/usr/bin/env node
/* GC_PUBLIC_HERO_FRAME_MIGRATION_V45
   Ejecutar desde la raíz del repo:
   node .\_gc_tools\apply_gc_public_hero_frame_v45.cjs
*/

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function file(p) {
  return path.join(root, p);
}

function exists(p) {
  return fs.existsSync(file(p));
}

function read(p) {
  return fs.readFileSync(file(p), 'utf8');
}

function write(p, text) {
  fs.writeFileSync(file(p), text, 'utf8');
}

function backup(p) {
  const src = file(p);
  const dst = file(`${p}.bak-public-hero-frame-v45-${stamp}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function normalizeImports(content, importPath) {
  content = content.replace(/import\s+PublicHeroText\s+from\s+['"][^'"]+['"];\s*\n?/g, '');
  if (!content.includes('PublicHeroFrame')) {
    content = content.replace(
      /(import\s+MarketingLayout\s+from\s+['"][^'"]+['"];\s*)/,
      `$1import PublicHeroFrame from '${importPath}';\n`
    );
  }
  return content;
}

function convertExistingComponent(content) {
  return content.replace(/<PublicHeroText([\s\S]*?)\/>/g, '<PublicHeroFrame$1/>');
}

function hero(kicker, titleArray, lead, id, leadId = '') {
  const title = `[${titleArray.map((x) => `'${x.replace(/'/g, "\\'")}'`).join(', ')}]`;
  const leadPart = lead ? `\n            lead="${lead.replace(/"/g, '&quot;')}"` : '';
  const leadIdPart = leadId ? `\n            leadId="${leadId}"` : '';
  return `<PublicHeroFrame
            id="${id}"
            kicker="${kicker}"
            title={${title}}${leadPart}${leadIdPart}
          />`;
}

function replaceAny(content, replacements, label) {
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(content)) {
      return [content.replace(pattern, replacement), true];
    }
  }
  if (content.includes('<PublicHeroFrame')) {
    return [content, true];
  }
  console.warn(`  ⚠ No se encontró bloque hero para ${label}. Puede que la página haya cambiado.`);
  return [content, false];
}

function patchPage(p, importPath, replacements, label) {
  if (!exists(p)) {
    console.warn(`  ⚠ No existe ${p}`);
    return;
  }

  let content = read(p);
  const original = content;

  content = normalizeImports(content, importPath);
  content = convertExistingComponent(content);

  const result = replaceAny(content, replacements, label);
  content = result[0];

  if (content !== original) {
    backup(p);
    write(p, content);
    console.log(`  ✓ ${p}`);
  } else {
    console.log(`  • ${p} sin cambios`);
  }
}

console.log('GC Public Hero Frame v45 - unificando TEXTO + POSICIÓN de heroes...');

patchPage(
  'src/pages/index.astro',
  '../components/public/PublicHeroFrame.astro',
  [[
    /<p class="gc-home2-kicker">GRASSCUTTERS RACE CONTROL<\/p>\s*<h1 id="gc-home2-title">Vive la competición<\/h1>\s*<p class="gc-home2-lead">Cada vuelta cuenta<\/p>/,
    hero('GRASSCUTTERS RACE CONTROL', ['Vive la', 'competición'], 'Cada vuelta cuenta', 'gc-home2-title')
  ]],
  'Inicio'
);

patchPage(
  'src/pages/comunidad.astro',
  '../components/public/PublicHeroFrame.astro',
  [
    [
      /<span class="gc-public-kicker">Comunidad GC<\/span>\s*<h1 id="gc-comunidad-title" class="gc-public-title">Un paddock para correr, mejorar y volver\.<\/h1>\s*<p class="gc-public-description">\s*GrassCutters es una comunidad para rodar, comentar carreras, seguir campeonatos y compartir pista sin perder el buen ambiente\.\s*<\/p>/,
      hero('Comunidad GC', ['Un paddock para', 'correr, mejorar', 'y volver.'], 'GrassCutters es una comunidad para rodar, comentar carreras, seguir campeonatos y compartir pista sin perder el buen ambiente.', 'gc-comunidad-title')
    ],
    [
      /<span class="gc43-kicker">Comunidad GC<\/span>\s*<h1 id="gc43-title">[\s\S]*?<\/h1>\s*<p>\s*GrassCutters es una comunidad para rodar, comentar carreras,\s*seguir campeonatos y compartir pista sin perder el buen ambiente\.\s*<\/p>/,
      hero('Comunidad GC', ['Un paddock para', 'correr, mejorar', 'y volver.'], 'GrassCutters es una comunidad para rodar, comentar carreras, seguir campeonatos y compartir pista sin perder el buen ambiente.', 'gc43-title')
    ],
    [
      /<span class="gc-community-v42-kicker">Comunidad GC<\/span>\s*<h1 id="gc-comunidad-title">[\s\S]*?<\/h1>\s*<p>\s*GrassCutters es una comunidad para rodar, comentar carreras, seguir campeonatos y compartir pista sin perder el buen ambiente\.\s*<\/p>/,
      hero('Comunidad GC', ['Un paddock para', 'correr, mejorar', 'y volver.'], 'GrassCutters es una comunidad para rodar, comentar carreras, seguir campeonatos y compartir pista sin perder el buen ambiente.', 'gc-comunidad-title')
    ],
  ],
  'Comunidad'
);

patchPage(
  'src/pages/campeonato.astro',
  '../components/public/PublicHeroFrame.astro',
  [[
    /<span class="gc-public-kicker">Campeonato<\/span>\s*<h2 class="gc-public-section-title">Campeonato semanal ACSM\.<\/h2>\s*<p class="gc-public-section-lead" id="acsrChampionshipLead">Cargando campeonato\.\.\.<\/p>/,
    hero('Campeonato', ['Campeonato', 'semanal ACSM.'], 'Cargando campeonato...', 'acsrChampionshipTitle', 'acsrChampionshipLead')
  ]],
  'Campeonato'
);

patchPage(
  'src/pages/ratings.astro',
  '../components/public/PublicHeroFrame.astro',
  [[
    /<span class="gc-public-kicker">Ratings<\/span>\s*<h1 class="gc-public-section-title">Dos sistemas separados\.<\/h1>\s*<p class="gc-public-section-lead" id="ratingsLead">SR mide limpieza en pista\. GSR mide rendimiento competitivo\.<\/p>/,
    hero('Ratings', ['Dos sistemas', 'separados.'], 'SR mide limpieza en pista. GSR mide rendimiento competitivo.', 'ratingsTitle', 'ratingsLead')
  ]],
  'Ratings'
);

patchPage(
  'src/pages/calendario.astro',
  '../components/public/PublicHeroFrame.astro',
  [[
    /<span class="gc-public-kicker">Calendario GC<\/span>\s*<h1 class="gc-public-title">Calendario de pista\.<\/h1>\s*<p class="gc-public-description">Consulta el combo semanal, las carreras LFM y las carreras GrassCutters programadas\.<\/p>/,
    hero('Calendario GC', ['Calendario', 'de pista.'], 'Consulta el combo semanal, las carreras LFM y las carreras GrassCutters programadas.', 'calendarHeroTitle')
  ]],
  'Calendario'
);

patchPage(
  'src/pages/archivo/index.astro',
  '../../components/public/PublicHeroFrame.astro',
  [[
    /<p class="gc-archive-kicker">GRASSCUTTERS DATABASE<\/p>\s*<h1>Archivo<\/h1>\s*<p class="gc-archive-race-hero__lead">\s*Base de datos editorial sobre motorsport: circuitos, coches, pilotos, conceptos técnicos, historia y cultura racing organizada para consultar y ampliar contexto\.\s*<\/p>/,
    hero('GRASSCUTTERS DATABASE', ['Archivo'], 'Base de datos editorial sobre motorsport: circuitos, coches, pilotos, conceptos técnicos, historia y cultura racing organizada para consultar y ampliar contexto.', 'archiveHeroTitle')
  ]],
  'Archivo'
);

patchPage(
  'src/pages/noticias.astro',
  '../components/public/PublicHeroFrame.astro',
  [[
    /<p class="gc-archive-kicker">GRASSCUTTERS NEWSROOM<\/p>\s*<h1>Noticias<\/h1>\s*<p class="gc-archive-race-hero__lead">\s*Canal de noticias sobre GrassCutters, sim racing y motorsport: novedades de la comunidad, herramientas, carreras, campeonatos y temas relevantes del mundo del motor\.\s*<\/p>/,
    hero('GRASSCUTTERS NEWSROOM', ['Noticias'], 'Canal de noticias sobre GrassCutters, sim racing y motorsport: novedades de la comunidad, herramientas, carreras, campeonatos y temas relevantes del mundo del motor.', 'newsHeroTitle')
  ]],
  'Noticias'
);

console.log('');
console.log('Listo. Prueba con:');
console.log('  npm run build');
console.log('  npm run dev');
console.log('');
console.log('Backups creados como .bak-public-hero-frame-v45-*');
