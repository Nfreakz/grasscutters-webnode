const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const safeKeepScripts = new Set([
  'scripts/build-server.mjs',
  'scripts/ensure-hostinger-runtime.mjs',
  'scripts/ensure-rollup-linux.mjs',
  'scripts/patch-auth-logout.mjs',
  'scripts/patch-server-runtime-root.mjs',
  'scripts/prepare-hostinger-dist.mjs',
]);

const knownTempScripts = [
  'scripts/apply-performance-core-v15-29.cjs',
  'scripts/apply-performance-core-v15-29-1.cjs',
  'scripts/apply-performance-core-v15-29-3.cjs',
  'scripts/gc-runtime-diff-diagnostic-v15-29-2.cjs',
  'scripts/apply-pilot-social-cards-v15-30.cjs',
  'scripts/apply-pilot-social-cards-v15-30-1-fix.cjs',
  'scripts/apply-pilot-social-cards-v15-30-2-fix.cjs',
  'scripts/apply-pilot-avatar-only-social-v15-30-3.cjs',
  'scripts/apply-pilot-avatar-only-social-v15-30-4-fix.cjs',
  'scripts/apply-pilot-social-image-express-v15-30-5.cjs',
  'scripts/apply-pilot-social-text-v15-30-6.cjs',
  'scripts/apply-global-social-cards-v15-31.cjs',
  'scripts/apply-global-social-cachebust-v15-31-1.cjs',
  'scripts/apply-security-core-v15-32.cjs',
  'scripts/apply-user-avatar-menu-v15-33.cjs',
  'scripts/apply-user-menu-order-v15-33-1.cjs',
];

const oldOgImages = [
  'public/og/grasscutters-social-card.png',
  'public/og/home-og.png',
  'public/og/comunidad-og.png',
  'public/og/campeonato-og.png',
  'public/og/calendario-og.png',
  'public/og/app-android-og.png',
  'public/og/platform-og.png',
  'public/og/hotlaps-og.png',
  'public/og/combos-og.png',
  'public/og/pilotos-og.png',
  'public/og/fov-og.png',
  'public/og/login-og.png',
  'public/og/apoyo-servidor-og.png',
  'public/og/normas-og.png',
  'public/og/privacidad-og.png',
];

const tempAstroEndpoints = [
  'src/pages/api/pilot-social-image/[playerId].png.ts',
];

const textExtensions = new Set([
  '.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.md', '.html', '.xml', '.txt', '.yml', '.yaml'
]);

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function toRel(abs) {
  return path.relative(root, abs).replace(/\\/g, '/');
}

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = toRel(abs);

    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.astro'].includes(entry.name)) continue;
      walk(abs, results);
      continue;
    }

    results.push(rel);
  }
  return results;
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return 'ERROR: ' + error.message;
  }
}

function fileContainsReference(relPath, needle) {
  const files = walk(root).filter((rel) => {
    const ext = path.extname(rel).toLowerCase();
    if (!textExtensions.has(ext)) return false;
    if (rel.startsWith('node_modules/') || rel.startsWith('.git/') || rel.startsWith('dist/')) return false;
    if (rel.endsWith('.bak') || rel.includes('.bak-')) return false;
    return true;
  });

  const normalizedNeedle = needle.replace(/\\/g, '/');

  for (const rel of files) {
    if (rel === relPath) continue;
    try {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      if (text.includes(normalizedNeedle)) return rel;
    } catch (_) {}
  }

  return '';
}

function collectTempScripts() {
  const candidates = new Set();

  for (const rel of knownTempScripts) {
    if (exists(rel)) candidates.add(rel);
  }

  const scriptsDir = path.join(root, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    for (const rel of walk(scriptsDir)) {
      const name = path.basename(rel);
      if (safeKeepScripts.has(rel)) continue;
      if (/^apply-.*\.cjs$/i.test(name)) candidates.add(rel);
      if (/^gc-runtime-diff-diagnostic.*\.cjs$/i.test(name)) candidates.add(rel);
      if (/^gc-.*diagnostic.*\.cjs$/i.test(name) && name.includes('runtime')) candidates.add(rel);
    }
  }

  return Array.from(candidates).sort();
}

function collectBackups() {
  return walk(root).filter((rel) => {
    const name = path.basename(rel);
    if (rel.startsWith('node_modules/') || rel.startsWith('.git/')) return false;
    if (name.includes('.bak-')) return true;
    if (/\.bak$/i.test(name)) return true;
    return false;
  }).sort();
}

function collectReports() {
  return walk(reportDir)
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => /gc-runtime-diagnostic|runtime-diff|cleanup-temp/i.test(rel))
    .sort();
}

function collectTempAstroEndpoints() {
  return tempAstroEndpoints.filter(exists);
}

function collectOldOgImages() {
  const deletable = [];
  const kept = [];

  for (const rel of oldOgImages) {
    if (!exists(rel)) continue;
    const reference = fileContainsReference(rel, '/' + rel.replace(/^public\//, ''));
    if (reference) kept.push({ rel, reference });
    else deletable.push(rel);
  }

  return { deletable, kept };
}

function removeFile(rel, removed, errors) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  try {
    if (apply) fs.unlinkSync(abs);
    removed.push(rel);
  } catch (error) {
    errors.push({ rel, error: error.message });
  }
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const tempScripts = collectTempScripts();
const backups = collectBackups();
const reports = collectReports();
const tempEndpoints = collectTempAstroEndpoints();
const oldOg = collectOldOgImages();

const planned = [
  ...tempScripts,
  ...backups,
  ...reports,
  ...tempEndpoints,
  ...oldOg.deletable,
];

const removed = [];
const errors = [];

for (const rel of planned) removeFile(rel, removed, errors);

const lines = [];
lines.push('# GC cleanup temp files v15.34');
lines.push('');
lines.push(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Root: ${root}`);
lines.push('');

lines.push('## Git status before/after command context');
lines.push('```txt');
lines.push(run('git status --short'));
lines.push('```');
lines.push('');

lines.push('## Temporary scripts');
if (tempScripts.length) tempScripts.forEach((rel) => lines.push('- ' + rel));
else lines.push('No temporary apply/diagnostic scripts found.');
lines.push('');

lines.push('## Backup files');
if (backups.length) backups.forEach((rel) => lines.push('- ' + rel));
else lines.push('No backup files found.');
lines.push('');

lines.push('## Temporary reports');
if (reports.length) reports.forEach((rel) => lines.push('- ' + rel));
else lines.push('No temporary reports found.');
lines.push('');

lines.push('## Temporary Astro endpoints');
if (tempEndpoints.length) tempEndpoints.forEach((rel) => lines.push('- ' + rel));
else lines.push('No temporary Astro endpoints found.');
lines.push('');

lines.push('## Old OG images to delete if unreferenced');
if (oldOg.deletable.length) oldOg.deletable.forEach((rel) => lines.push('- ' + rel));
else lines.push('No unreferenced old OG images found.');
lines.push('');

lines.push('## Old OG images kept because still referenced');
if (oldOg.kept.length) oldOg.kept.forEach((item) => lines.push(`- ${item.rel} referenced by ${item.reference}`));
else lines.push('None.');
lines.push('');

lines.push(`## ${apply ? 'Removed' : 'Would remove'}`);
if (removed.length) removed.forEach((rel) => lines.push('- ' + rel));
else lines.push('Nothing.');
lines.push('');

lines.push('## Errors');
if (errors.length) errors.forEach((item) => lines.push(`- ${item.rel}: ${item.error}`));
else lines.push('None.');
lines.push('');

lines.push('## Next commands');
if (!apply) {
  lines.push('```powershell');
  lines.push('node scripts/gc-clean-temp-files-v15-34.cjs --apply');
  lines.push('npm run build');
  lines.push('git status');
  lines.push('```');
} else {
  lines.push('```powershell');
  lines.push('npm run build');
  lines.push('git status');
  lines.push('git add -A');
  lines.push('git commit -m "Clean temporary patch files"');
  lines.push('git push');
  lines.push('```');
}

const reportName = `gc-cleanup-temp-files-v15-34-${nowStamp()}.md`;
const reportPath = path.join(reportDir, reportName);
fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

console.log(`[GC CLEANUP] ${apply ? 'APPLY' : 'DRY-RUN'} complete.`);
console.log(`[GC CLEANUP] Report: ${reportPath}`);
console.log('');
console.log(apply ? '[GC CLEANUP] Files removed:' : '[GC CLEANUP] Files that would be removed:');
if (removed.length) removed.forEach((rel) => console.log(' - ' + rel));
else console.log(' - none');

if (oldOg.kept.length && verbose) {
  console.log('');
  console.log('[GC CLEANUP] Old OG images kept because referenced:');
  oldOg.kept.forEach((item) => console.log(' - ' + item.rel + ' <- ' + item.reference));
}

if (errors.length) {
  console.log('');
  console.log('[GC CLEANUP] Errors:');
  errors.forEach((item) => console.log(' - ' + item.rel + ': ' + item.error));
  process.exitCode = 1;
}
