import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filePath = path.join(root, 'src', 'pages', 'home2.astro');

if (!fs.existsSync(filePath)) {
  console.warn('[patch-home2-news-link] src/pages/home2.astro no existe. Se omite.');
  process.exit(0);
}

let source = fs.readFileSync(filePath, 'utf8');
let changed = false;

const hiddenBadgeRegex = /<span class="gc-home2-btn gc-home2-btn--small gc-home2-btn--ghost" aria-hidden="true">Sistema oculto<\/span>/g;
const newsLink = '<a href="/noticias" class="gc-home2-btn gc-home2-btn--small">Ver todas las noticias →</a>';

if (hiddenBadgeRegex.test(source)) {
  source = source.replace(hiddenBadgeRegex, newsLink);
  changed = true;
}

const oldNewsApi = "        const data = await fetchJson('/api/news?limit=4&featured=1') || await fetchJson('/data/home2-news.json');";
const newNewsApi = "        const data = await fetchJson('/api/noticias?limit=4&featured=1') || await fetchJson('/data/home2-news.json');";

if (source.includes(oldNewsApi)) {
  source = source.replace(oldNewsApi, newNewsApi);
  changed = true;
}

const oldDataLines = "        const data = await fetchJson('/api/noticias?limit=4&featured=1') || await fetchJson('/data/home2-news.json');\n        const items = getArray(data);";

const newDataLines = "        let data = await fetchJson('/api/noticias?limit=4&featured=1');\n        let items = getArray(data);\n\n        if (!items.length) {\n          data = await fetchJson('/api/noticias?limit=4') || await fetchJson('/data/home2-news.json');\n          items = getArray(data);\n        }";

if (source.includes(oldDataLines)) {
  source = source.replace(oldDataLines, newDataLines);
  changed = true;
}

const oldHref = "const href = item.href || item.linkUrl || item.link || (item.slug ? `/noticias/${item.slug}` : '');";
const newHref = "const href = item.href || item.linkUrl || item.link || (item.slug ? `/noticias/${item.slug}` : '/noticias');";

if (source.includes(oldHref)) {
  source = source.replace(oldHref, newHref);
  changed = true;
}

source = source.replaceAll('Leer más →</a>', 'Leer noticia →</a>');

if (changed) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('[patch-home2-news-link] Home2 conectada a /noticias.');
} else {
  console.log('[patch-home2-news-link] OK, sin cambios necesarios.');
}
