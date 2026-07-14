import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `track-asset-online-delivery-${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

const absolute = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => {
  if (!fs.existsSync(absolute(relativePath))) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(absolute(relativePath), 'utf8');
};
const backup = (relativePath) => {
  const target = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(absolute(relativePath), target);
};
const writeIfChanged = (relativePath, original, next) => {
  if (original === next) return false;
  backup(relativePath);
  fs.writeFileSync(absolute(relativePath), next, 'utf8');
  return true;
};

const modified = [];

{
  const relativePath = 'src/server/index.ts';
  const original = read(relativePath);
  let next = original;

  const resolverImport = "import { registerGcTrackAssetsResolverRoutes } from './gc-track-assets-resolver';";
  const deliveryImport = "import { registerGcTrackAssetDeliveryRoutes } from './gc-track-assets-delivery';";

  if (!next.includes(deliveryImport)) {
    if (!next.includes(resolverImport)) throw new Error('No se encontró el import del resolver.');
    next = next.replace(resolverImport, `${resolverImport}\n${deliveryImport}`);
  }

  const registration = 'registerGcTrackAssetDeliveryRoutes(app, { rootDir });';
  if (!next.includes(registration)) {
    const hardeningPattern = /registerGcPlatformHardening\(app,\s*\{\s*rootDir\s*\}\s*\);/;
    const hardeningMatch = next.match(hardeningPattern);
    if (hardeningMatch) {
      next = next.replace(hardeningPattern, `${hardeningMatch[0]}\n${registration}`);
    } else {
      const appMarker = 'const app = express();';
      if (!next.includes(appMarker)) throw new Error('No se encontró const app = express();');
      next = next.replace(appMarker, `${appMarker}\n${registration}`);
    }
  }

  if (writeIfChanged(relativePath, original, next)) modified.push(relativePath);
}

{
  const relativePath = 'public/js/gc-home-track-resolver.js';
  const original = read(relativePath);
  let next = original.replace(/const VERSION = 'v[^']+';/, "const VERSION = 'v25-online-delivery';");

  if (!next.includes('const serverDeliveryUrl =')) {
    const marker = "  const resolveUrl = async (value, kind = 'photo') => {";
    if (!next.includes(marker)) throw new Error('No se encontró resolveUrl.');

    const helper = `  const serverDeliveryUrl = (value, kind = 'photo') => {
    const clean = cleanText(value);
    if (!clean) return '';
    const params = new URLSearchParams({ track: clean, kind, refresh: '1', v: VERSION });
    return \`/api/gc/track-assets/file?\${params.toString()}\`;
  };

`;
    next = next.replace(marker, helper + marker);
  }

  const start = "  const resolveUrl = async (value, kind = 'photo') => {\n    const candidates = candidateUrls(value, kind);";
  if (next.includes(start) && !next.includes('const delivered = serverDeliveryUrl(value, kind);')) {
    next = next.replace(start,
`  const resolveUrl = async (value, kind = 'photo') => {
    const delivered = serverDeliveryUrl(value, kind);
    if (delivered) {
      const deliveredOk = await probeImage(delivered);
      if (deliveredOk) return deliveredOk;
    }
    const candidates = candidateUrls(value, kind);`);
  }

  if (!next.includes('const delivered = serverDeliveryUrl(value, kind);')) {
    throw new Error('No se pudo activar la entrega online.');
  }

  if (writeIfChanged(relativePath, original, next)) modified.push(relativePath);
}

{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  const next = original.replace(
    /<script is:inline src="\/js\/gc-home-track-resolver\.js(?:\?[^"]*)?"><\/script>/,
    '<script is:inline src="/js/gc-home-track-resolver.js?v=25-online-delivery"></script>'
  );
  if (!next.includes('/js/gc-home-track-resolver.js?v=25-online-delivery')) {
    throw new Error('No se pudo actualizar la versión del script.');
  }
  if (writeIfChanged(relativePath, original, next)) modified.push(relativePath);
}

console.log('');
console.log('[GC track asset online fix] Aplicado.');
console.log(`[GC track asset online fix] Backup: ${backupDir}`);
console.log(`[GC track asset online fix] Modificados: ${modified.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC track asset online fix] Siguiente: npm run quality');
