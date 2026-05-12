#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const problems = [];
const warnings = [];
const ok = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, exts = ['.ts', '.js', '.mjs', '.astro', '.json', '.env', '.md']) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', '.astro'].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (exts.includes(path.extname(entry.name))) out.push(full);
    }
  }
  return out;
}

function rel(abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function grep(pattern, files) {
  const hits = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) hits.push({ file: rel(file), line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

function countOccurrences(content, needle) {
  return content.split(needle).length - 1;
}

console.log('\n[GC Pre-push] Revisando proyecto...\n');

const srcFiles = walk('src');
const scriptFiles = walk('scripts');
const allFiles = [...srcFiles, ...scriptFiles];

// 1. Rutas peligrosas express/router v5 style.
const archiveStarHits = grep(/archive-media.*\/\*/, srcFiles);
if (archiveStarHits.length) {
  problems.push({
    title: 'Quedan rutas peligrosas /archive-media/*',
    detail: archiveStarHits.map((h) => `${h.file}:${h.line} ${h.text}`).join('\n'),
  });
} else {
  ok.push('No quedan rutas /archive-media/* peligrosas.');
}

// 2. index.ts imports/register duplicados.
if (exists('src/server/index.ts')) {
  const index = read('src/server/index.ts');

  const checks = [
    'registerMotorsportArchiveHardDeleteRoutes(app, { rootDir });',
    'registerAdminUserProfileLinkRoutes(app, { rootDir });',
    'registerMotorsportArchiveRoutes(app, { rootDir });',
    'registerMotorsportArchiveImageUrlRoutes(app, { rootDir });',
  ];

  for (const needle of checks) {
    const count = countOccurrences(index, needle);
    if (count > 1) {
      warnings.push(`Registro duplicado en src/server/index.ts: ${needle} aparece ${count} veces.`);
    }
  }

  if (!index.includes("app.use('/archive-media', express.static")) {
    warnings.push("No veo app.use('/archive-media', express.static(...)) en src/server/index.ts. Las imágenes persistentes pueden no servirse.");
  } else {
    ok.push("Montaje estático /archive-media detectado.");
  }

  if (index.includes("app.get('/archive-media/*") || index.includes('app.get(`${mediaPublicUrl}/*`')) {
    problems.push({
      title: 'index.ts contiene una ruta /archive-media/* rota',
      detail: 'Elimina app.get("/archive-media/*") o app.get(`${mediaPublicUrl}/*`) y usa express.static.',
    });
  }

  if (!index.includes('registerAdminUserProfileLinkRoutes(app, { rootDir });')) {
    warnings.push('No veo registradas las rutas de vincular/desvincular usuarios con pilotos.');
  } else {
    ok.push('Rutas de vincular/desvincular usuarios detectadas.');
  }

  if (!index.includes('registerMotorsportArchiveHardDeleteRoutes(app, { rootDir });')) {
    warnings.push('No veo registrado el hard-delete del Archivo Motorsport.');
  } else {
    ok.push('Hard-delete del Archivo Motorsport detectado.');
  }
} else {
  problems.push({ title: 'Falta src/server/index.ts', detail: 'No se puede validar el servidor.' });
}

// 3. Archivos clave.
const required = [
  'src/server/admin-user-profile-link-routes.ts',
  'src/server/motorsport-archive-hard-delete-routes.ts',
  'src/server/motorsport-archive-image-url-routes.ts',
  'src/lib/motorsport-archive/storage.ts',
  'public/gc-admin-pagination.js',
  'public/gc-admin-user-profile-links.js',
  'src/pages/admin/archivo.astro',
  'src/pages/admin/archivo/imagen-url.astro',
  'src/pages/admin/usuarios.astro',
  'src/pages/archivo.astro',
  'src/pages/archivo/buscar.astro',
];

for (const file of required) {
  if (!exists(file)) warnings.push(`Falta archivo esperado: ${file}`);
  else ok.push(`Archivo esperado OK: ${file}`);
}

// 4. Backups temporales que NO conviene subir.
const backupFiles = [];
for (const file of allFiles) {
  const r = rel(file);
  if (/\.backup|backup-|\.tmp$|\.bak$/i.test(r)) backupFiles.push(r);
}
if (backupFiles.length) {
  warnings.push(`Hay backups/parches temporales dentro del árbol src/scripts. Revisa antes de git add:\n${backupFiles.slice(0, 80).join('\n')}${backupFiles.length > 80 ? '\n...' : ''}`);
}

// 5. Datos locales que no deberían subirse.
const localDataCandidates = [
  'data/app/motorsport-archive.json',
  'data/app/users.json',
  'data/app/display-names.json',
  'public/archive-media',
];

for (const candidate of localDataCandidates) {
  if (exists(candidate)) {
    warnings.push(`Existe dato local: ${candidate}. Si no quieres subir pruebas locales, confirma que .gitignore lo excluye o no hagas git add.`);
  }
}

// 6. .gitignore básico.
if (exists('.gitignore')) {
  const gitignore = read('.gitignore');
  const wantedIgnores = ['data/app/*.json', 'data/app/*.sqlite', 'gc-local-persistent', '*.backup-*'];
  for (const item of wantedIgnores) {
    if (!gitignore.includes(item)) {
      warnings.push(`.gitignore no contiene "${item}". Recomendado para evitar subir datos/backups locales.`);
    }
  }
} else {
  warnings.push('No encuentro .gitignore.');
}

// 7. Type/build opcional.
const shouldBuild = process.env.GC_PREPUSH_BUILD === '1';
if (shouldBuild) {
  console.log('[GC Pre-push] Ejecutando npm run build...\n');
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    problems.push({ title: 'npm run build falló', detail: `Código de salida ${result.status}` });
  } else {
    ok.push('npm run build OK.');
  }
} else {
  warnings.push('No se ejecutó build. Para incluirlo: $env:GC_PREPUSH_BUILD="1"; node scripts/gc-prepush-check.mjs');
}

console.log('==============================');
console.log('✅ OK');
console.log('==============================');
for (const line of ok) console.log(`- ${line}`);

console.log('\n==============================');
console.log('⚠️ Avisos');
console.log('==============================');
if (!warnings.length) console.log('- Sin avisos.');
else for (const line of warnings) console.log(`- ${line}`);

console.log('\n==============================');
console.log('❌ Problemas');
console.log('==============================');
if (!problems.length) {
  console.log('- Sin problemas bloqueantes.');
} else {
  for (const p of problems) {
    console.log(`\n## ${p.title}`);
    console.log(p.detail);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  ok,
  warnings,
  problems,
};

const reportPath = path.join(root, 'prepush-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\n[GC Pre-push] Report JSON: ${reportPath}`);

if (problems.length) {
  console.error('\n[GC Pre-push] Hay problemas bloqueantes. No hagas push todavía.\n');
  process.exit(1);
}

console.log('\n[GC Pre-push] Sin problemas bloqueantes. Revisa los avisos antes de git add/push.\n');
