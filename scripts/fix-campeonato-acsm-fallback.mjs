import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filePath = path.join(root, 'src/pages/campeonato.astro');

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${path.relative(root, filePath)}`);
}

let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `      async function load(refresh = false) {
        els.lead.textContent = refresh ? 'Actualizando campeonato...' : 'Cargando campeonato...';

        try {
          const response = await fetch(\`/api/gc/ratings/championship\${refresh ? '?refresh=1' : ''}\`, { cache: 'no-store' });
          const data = await response.json();
          render(data);
        } catch (error) {
          renderError({ message: error?.message || String(error) });
        }
      }
`;

const newBlock = `      async function fetchJson(url) {
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || \`HTTP \${response.status}\`);
        return data;
      }

      async function load(refresh = false) {
        els.lead.textContent = refresh ? 'Actualizando campeonato...' : 'Cargando campeonato...';

        const suffix = refresh ? '?refresh=1' : '';
        try {
          const ratingsData = await fetchJson(\`/api/gc/ratings/championship\${suffix}\`);
          if (ratingsData?.ok && ratingsData?.championship) {
            render(ratingsData);
            return;
          }
          console.warn('[GC campeonato] Ratings no disponible, usando ACSM base.', ratingsData);
        } catch (error) {
          console.warn('[GC campeonato] Falló ratings, usando ACSM base.', error);
        }

        try {
          const acsmData = await fetchJson(\`/api/community/acsr-championship\${suffix}\`);
          render(acsmData);
        } catch (error) {
          renderError({ message: error?.message || String(error) });
        }
      }
`;

if (!content.includes(oldBlock)) {
  if (content.includes('fetch(`/api/gc/ratings/championship')) {
    throw new Error('El bloque load existe pero no coincide exactamente. Revisa src/pages/campeonato.astro alrededor de async function load.');
  }
  console.log('[GC Campeonato ACSM Fallback] El parche parece ya aplicado o el archivo cambió.');
} else {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[GC Campeonato ACSM Fallback] OK');
  console.log('- /campeonato probará /api/gc/ratings/championship primero.');
  console.log('- Si ratings falla, carga /api/community/acsr-championship como antes.');
}

console.log('');
console.log('Ahora ejecuta:');
console.log('npm run build');
