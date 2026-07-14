import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const reportDir = path.join(root, '_gc_reports');
fs.mkdirSync(reportDir, { recursive: true });

const ignoredDirs = new Set([
  '.git', 'node_modules', 'dist', '.astro', '_gc_reports', '_gc_backups',
  'playwright-report', 'test-results', 'data'
]);
const codeExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.astro', '.css', '.scss', '.json', '.md', '.yml', '.yaml']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (codeExt.has(path.extname(entry.name).toLowerCase()) || entry.name.startsWith('.env')) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

const files = walk(root);
const fileStats = files.map((file) => {
  const source = read(file);
  return {
    file: rel(file),
    lines: source.split(/\r?\n/).length,
    bytes: Buffer.byteLength(source)
  };
}).sort((a, b) => b.lines - a.lines);

const packagePath = path.join(root, 'package.json');
const pkg = fs.existsSync(packagePath) ? JSON.parse(read(packagePath)) : {};
const dependencyEntries = Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
const floatingDependencies = dependencyEntries
  .filter(([, version]) => ['latest', '*', 'next'].includes(String(version).toLowerCase()) || /^[~^]?\s*$/.test(String(version)))
  .map(([name, version]) => ({ name, version }));

const hardcodedIps = [];
const httpUrls = [];
const mojibake = [];
const inlineAstro = [];
const envVars = new Set();

for (const file of files) {
  const source = read(file);
  const fileRel = rel(file);

  const ipMatches = [...source.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)].map((match) => match[0]);
  if (ipMatches.length) hardcodedIps.push({ file: fileRel, values: [...new Set(ipMatches)].slice(0, 20) });

  const urlMatches = [...source.matchAll(/http:\/\/[^\s"'`)<]+/g)].map((match) => match[0]);
  if (urlMatches.length) httpUrls.push({ file: fileRel, values: [...new Set(urlMatches)].slice(0, 20) });

  const bad = (source.match(/[ÃÂ][^\s]{0,10}/g) || []).slice(0, 12);
  if (bad.length) mojibake.push({ file: fileRel, samples: [...new Set(bad)] });

  if (fileRel.endsWith('.astro')) {
    const scripts = (source.match(/<script\b/gi) || []).length;
    const styles = (source.match(/<style\b/gi) || []).length;
    if (scripts + styles > 2) inlineAstro.push({ file: fileRel, scripts, styles });
  }

  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envVars.add(match[1]);
}

const gitignorePath = path.join(root, '.gitignore');
let duplicateGitignore = [];
if (fs.existsSync(gitignorePath)) {
  const lines = read(gitignorePath).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const counts = new Map();
  lines.forEach((line) => counts.set(line, (counts.get(line) || 0) + 1));
  duplicateGitignore = [...counts.entries()].filter(([, count]) => count > 1).map(([line, count]) => ({ line, count }));
}

const checks = {
  packageJson: fs.existsSync(packagePath),
  lockfile: fs.existsSync(path.join(root, 'package-lock.json')),
  envExample: fs.existsSync(path.join(root, '.env.example')),
  playwrightConfig: fs.existsSync(path.join(root, 'playwright.config.ts')) || fs.existsSync(path.join(root, 'playwright.config.mjs')),
  testsDirectory: fs.existsSync(path.join(root, 'tests')),
  ciWorkflow: fs.existsSync(path.join(root, '.github', 'workflows')),
  serverHardening: fs.existsSync(path.join(root, 'src', 'server', 'gc-platform-hardening.ts')),
  accessibilityLayer: fs.existsSync(path.join(root, 'src', 'styles', 'public', 'gc-accessibility-hardening.css'))
};

const findings = [];
function add(id, severity, title, detail, count = null) {
  findings.push({ id, severity, title, detail, count });
}

if (floatingDependencies.length) add('DEP-001', 'high', 'Dependencias flotantes', 'Hay dependencias con latest/*/next.', floatingDependencies.length);
if (!checks.ciWorkflow) add('QA-001', 'high', 'No se detectó workflow CI', 'No hay barrera automática de check/build/smoke.');
if (!checks.playwrightConfig) add('QA-002', 'high', 'Playwright sin configuración', 'La dependencia existe, pero no se detectó configuración.');
if (fileStats[0]?.lines > 5000) add('ARCH-001', 'high', 'Archivo monolítico', `${fileStats[0].file} tiene ${fileStats[0].lines} líneas.`);
if (hardcodedIps.length) add('CFG-001', 'high', 'Infraestructura hardcodeada', 'Se detectaron direcciones IP literales.', hardcodedIps.length);
if (httpUrls.length) add('SEC-001', 'medium', 'URLs HTTP', 'Se detectaron URLs sin TLS.', httpUrls.length);
if (mojibake.length) add('I18N-001', 'medium', 'Posible mojibake', 'Se detectaron secuencias compatibles con errores de codificación.', mojibake.length);
if (duplicateGitignore.length) add('MAINT-001', 'low', '.gitignore duplicado', 'Hay patrones repetidos.', duplicateGitignore.length);
if (inlineAstro.some((item) => item.scripts + item.styles > 5)) add('FE-001', 'high', 'Astro con exceso de código inline', 'Hay páginas/componentes con muchos bloques script/style.');

const report = {
  generatedAt: new Date().toISOString(),
  root,
  summary: {
    filesScanned: files.length,
    findings: findings.length,
    high: findings.filter((item) => item.severity === 'high').length,
    medium: findings.filter((item) => item.severity === 'medium').length,
    low: findings.filter((item) => item.severity === 'low').length
  },
  checks,
  findings,
  largestFiles: fileStats.slice(0, 30),
  floatingDependencies,
  hardcodedIps,
  httpUrls,
  mojibake,
  inlineAstro,
  duplicateGitignore,
  environmentVariables: [...envVars].sort()
};

const jsonPath = path.join(reportDir, 'project-audit.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');

const markdown = [
  '# GC Project Audit',
  '',
  `Generado: ${report.generatedAt}`,
  '',
  `- Archivos revisados: ${report.summary.filesScanned}`,
  `- Hallazgos altos: ${report.summary.high}`,
  `- Hallazgos medios: ${report.summary.medium}`,
  `- Hallazgos bajos: ${report.summary.low}`,
  '',
  '## Hallazgos',
  '',
  ...findings.map((item) => `- **${item.severity.toUpperCase()} · ${item.id} · ${item.title}:** ${item.detail}${item.count === null ? '' : ` (${item.count})`}`),
  '',
  '## Archivos más grandes',
  '',
  '| Archivo | Líneas | Bytes |',
  '|---|---:|---:|',
  ...report.largestFiles.map((item) => `| \`${item.file}\` | ${item.lines} | ${item.bytes} |`),
  '',
  '## Controles',
  '',
  ...Object.entries(checks).map(([key, value]) => `- ${value ? 'OK' : 'FALTA'} · ${key}`),
  ''
].join('\n');

const mdPath = path.join(reportDir, 'project-audit.md');
fs.writeFileSync(mdPath, markdown);
console.log(`[GC audit] JSON: ${jsonPath}`);
console.log(`[GC audit] Markdown: ${mdPath}`);
console.log(`[GC audit] ${report.summary.high} altos · ${report.summary.medium} medios · ${report.summary.low} bajos`);
