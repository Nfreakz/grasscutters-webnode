import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const checks = [];
function addCheck(label, file, predicate, help) {
  const fullPath = path.join(rootDir, file);
  const exists = fs.existsSync(fullPath);
  const content = exists ? fs.readFileSync(fullPath, 'utf8') : '';
  const ok = exists && predicate(content);
  checks.push({ label, file, ok, exists, help });
}

addCheck(
  'server runtime root supports GC_RUNTIME_ROOT',
  'src/server/index.ts',
  (source) => source.includes("const rootDir = process.env.GC_RUNTIME_ROOT ? path.resolve(process.env.GC_RUNTIME_ROOT) : path.resolve(__dirname, '../..');"),
  'El rootDir runtime ya debe estar integrado en src/server/index.ts. No lo apliques desde un patch en prebuild.'
);

addCheck(
  'Astro runtime V3 is already integrated',
  'src/server/index.ts',
  (source) => source.includes('GC_ASTRO_RUNTIME_PATCH_V3') && source.includes('await mountAstroRuntime();'),
  'El runtime Hostinger/Astro debe estar integrado en src/server/index.ts antes de compilar.'
);

addCheck(
  'logout endpoints are already integrated',
  'src/server/index.ts',
  (source) => source.includes('/api/auth/logout') && source.includes('/api/logout'),
  'Los endpoints de logout deben vivir en src/server/index.ts. El build no debe insertarlos automáticamente.'
);

addCheck(
  'hotlaps/app all-tracks marker is already integrated',
  'src/pages/app.astro',
  (source) => source.includes('GC_APP_HOTLAPS_ALL_TRACKS_SAFE_V1'),
  'El marcador de app/hotlaps all-tracks debe estar integrado. El build no debe modificar app.astro.'
);

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  const mark = check.ok ? 'OK' : 'FAIL';
  console.log(`[GC build guard] ${mark} · ${check.label} · ${check.file}`);
  if (!check.ok) console.log(`  -> ${check.help}`);
}

if (failed.length > 0) {
  console.error(`\n[GC build guard] Build detenido: ${failed.length} comprobación(es) fallida(s).`);
  console.error('[GC build guard] No se ha modificado ningún archivo. Corrige la integración en código fuente y vuelve a ejecutar npm run build.');
  process.exit(1);
}

console.log('\n[GC build guard] OK · Build sin patches mutadores de código fuente.');
