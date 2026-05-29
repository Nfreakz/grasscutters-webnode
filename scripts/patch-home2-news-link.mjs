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

const hiddenBadge = '<span class="gc-home2-btn gc-home2-btn--small gc-home2-btn--ghost" aria-hidden="true">Sistema oculto</span>';
const newsLink = '<a href="/noticias" class="gc-home2-btn gc-home2-btn--small">Ver todas las noticias →</a>';
if (source.includes(hiddenBadge)) {
  source = source.replace(hiddenBadge, newsLink);
  changed = true;
}

const oldRenderStart = '      const renderNews = async () => {';
const oldRenderEnd = '      };\n\n      const renderArchive = async';
const start = source.indexOf(oldRenderStart);
const end = source.indexOf(oldRenderEnd);

if (start !== -1 && end !== -1 && !source.includes('GC_HOME2_NEWS_REAL_V1')) {
  const newRender = `      const renderNews = async () => {
        /* GC_HOME2_NEWS_REAL_V1 */
        const primary = await fetchJson('/api/noticias?limit=4&featured=1');
        let items = getArray(primary);

        if (!items.length) {
          const fallback = await fetchJson('/api/noticias?limit=4');
          items = getArray(fallback);
        }

        const host = $('[data-home2-news]');
        if (!host) return;

        if (!items.length) {
          host.innerHTML = \\`
            <article class="gc-home2-news-card gc-home2-news-card--empty">
              <img src="/ui/home2/gc-home2-news-sim.svg" alt="" width="380" height="216" loading="lazy" decoding="async" />
              <div class="gc-home2-news-card__body">
                <span class="gc-home2-tag">Noticias</span>
                <time>Sin publicar</time>
                <h3>Sin noticias publicadas</h3>
                <p>Cuando publiques una noticia desde /admin/noticias aparecerá aquí automáticamente.</p>
                <a href="/noticias" class="gc-home2-link">Ver noticias →</a>
              </div>
            </article>
          \\`;
          return;
        }

        host.innerHTML = items.slice(0, 4).map((item) => {
          const href = item.href || item.linkUrl || item.link || (item.slug ? \\`/noticias/\${item.slug}\\` : '/noticias');
          const image = item.image || item.imageUrl || item.coverUrl || '/ui/home2/gc-home2-news-sim.svg';
          return \\`
            <article class="gc-home2-news-card">
              <img src="\${image}" alt="" width="380" height="216" loading="lazy" decoding="async" />
              <div class="gc-home2-news-card__body">
                <span class="gc-home2-tag">\${item.category || item.categoria || 'Noticias'}</span>
                <time>\${item.date || item.publishedAt || ''}</time>
                <h3>\${item.title || item.titulo || 'Noticia'}</h3>
                <p>\${item.excerpt || item.resumen || item.summary || ''}</p>
                <a href="\${href}" class="gc-home2-link">Leer noticia →</a>
              </div>
            </article>
          \\`;
        }).join('');
      };

      const renderArchive = async`;

  source = source.slice(0, start) + newRender + source.slice(end + oldRenderEnd.length);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('[patch-home2-news-link] Home2 conectada a /noticias.');
} else {
  console.log('[patch-home2-news-link] OK, sin cambios necesarios.');
}
