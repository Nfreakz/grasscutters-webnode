const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'pages', 'archivo', 'index.astro');

if (!fs.existsSync(filePath)) {
  console.error(`[GC Archivo] No encuentro el archivo: ${filePath}`);
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

const replacements = [
  [
    "const secondaryFeatured = items.filter((item) => item.slug !== featured?.slug).slice(0, 3);\n",
    "",
  ],
  [
    "<h1>Un archivo para leer el motorsport con calma.</h1>",
    "<h1>Archivo motorsport.</h1>",
  ],
  [
    `          Circuitos, coches, pilotos y conceptos conectados como dossiers: datos útiles, contexto,
          imágenes, referencias y relaciones entre fichas.`,
    `          Circuitos, coches, pilotos y conceptos. Fichas claras, datos útiles e imágenes para consultar rápido.`,
  ],
  [
    "grid-template-columns:minmax(0,1.05fr) minmax(300px,.43fr);",
    "grid-template-columns:minmax(0,1fr) minmax(260px,.34fr);",
  ],
  [
    "align-items:stretch;",
    "align-items:center;",
  ],
  [
    "min-height:clamp(500px,64vh,700px);",
    "min-height:clamp(340px,42vh,500px);",
  ],
  [
    "padding:clamp(24px,4.5vw,56px);",
    "padding:clamp(20px,3.2vw,38px);",
  ],
  [
    "border-radius:38px;",
    "border-radius:30px;",
  ],
  [
    "font-size:clamp(3.8rem,8.2vw,8.9rem);",
    "font-size:clamp(3.2rem,6vw,6.4rem);",
  ],
  [
    "line-height:.79;",
    "line-height:.86;",
  ],
  [
    "letter-spacing:-.1em;",
    "letter-spacing:-.075em;",
  ],
  [
    "margin:.35rem 0 .9rem;",
    "margin:.25rem 0 .65rem;",
  ],
  [
    "max-width:760px;",
    "max-width:650px;",
  ],
  [
    "font-size:clamp(1.05rem,1.45vw,1.34rem);",
    "font-size:clamp(1rem,1.25vw,1.18rem);",
  ],
  [
    "line-height:1.58;",
    "line-height:1.5;",
  ],
  [
    "width:min(100%,840px);",
    "width:min(100%,760px);",
  ],
  [
    "margin-top:clamp(24px,3.4vw,42px);",
    "margin-top:clamp(18px,2.4vw,28px);",
  ],
  [
    "min-height:58px;",
    "min-height:52px;",
  ],
  [
    "align-content:end;",
    "align-content:center;",
  ],
  [
    "gap:16px;",
    "gap:12px;",
  ],
  [
    "padding:clamp(20px,2.5vw,30px);",
    "padding:clamp(18px,2vw,24px);",
  ],
  [
    "border-radius:30px;",
    "border-radius:24px;",
  ],
  [
    "font-size:clamp(4.4rem,8vw,7.4rem);",
    "font-size:clamp(3.4rem,5.4vw,5.5rem);",
  ],
  [
    "min-height:82px;",
    "min-height:64px;",
  ],
  [
    "min-height:210px;",
    "min-height:160px;",
  ],
  [
    "margin:18px 0 clamp(30px,4vw,58px);",
    "margin:16px 0 clamp(24px,3vw,42px);",
  ],
  [
    "padding:clamp(28px,5vw,74px) clamp(14px,3vw,34px) clamp(72px,8vw,124px);",
    "padding:clamp(22px,3.8vw,50px) clamp(14px,3vw,34px) clamp(64px,7vw,110px);",
  ],
  [
    "font-size:clamp(3.4rem,17vw,5.7rem);",
    "font-size:clamp(2.8rem,14vw,4.4rem);",
  ],
];

for (const [from, to] of replacements) {
  if (content.includes(from)) {
    content = content.replace(from, to);
  } else {
    console.warn(`[GC Archivo] No se encontró el fragmento esperado: ${from.slice(0, 80).replace(/\n/g, ' ')}...`);
  }
}

// Quitar bloque completo de “Rutas de lectura”.
const beforeRoutes = content;
content = content.replace(
  /\n\s*\{secondaryFeatured\.length > 0 && \(\s*<section class="gc-archive-home__routes"[\s\S]*?<\/section>\s*\)\}\n/,
  '\n'
);

if (content === beforeRoutes) {
  console.warn('[GC Archivo] No pude eliminar el bloque de rutas por regex. Añado ocultación CSS de seguridad.');
  content = content.replace(
    '</style>',
    `
    .gc-archive-home__routes{
      display:none!important;
    }
  </style>`
  );
}

// Ajuste fino extra para que el hero no vuelva a crecer de más aunque el contenido aumente.
content = content.replace(
  ".gc-archive-home__hero-copy{\n      display:grid;\n      align-content:center;\n      min-width:0;\n    }",
  `.gc-archive-home__hero-copy{
      display:grid;
      align-content:center;
      min-width:0;
      max-width:820px;
    }`
);

if (content === original) {
  console.error('[GC Archivo] No se aplicó ningún cambio. Revisa si el archivo ya había cambiado mucho.');
  process.exit(1);
}

const backupPath = `${filePath}.bak-v15-25`;
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, 'utf8');
}

fs.writeFileSync(filePath, content, 'utf8');

console.log('[GC Archivo] Home del Archivo compactada correctamente.');
console.log(`[GC Archivo] Backup: ${backupPath}`);
