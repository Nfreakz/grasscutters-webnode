import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2c1-championship-residual-${stamp}`);
const changed = [];

function patch(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);

  const original = fs.readFileSync(filePath, 'utf8');
  const next = transform(original);

  if (next === original) {
    console.log(`[GC Phase 2C.1] Sin cambios: ${relativePath}`);
    return;
  }

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, next, 'utf8');
  changed.push(relativePath);
}

function replaceAll(text, from, to) {
  return text.split(from).join(to);
}

function patchShared(text) {
  let next = text;

  next = replaceAll(
    next,
    `$<HTMLFigureElement>('acsrTrackFigure')`,
    `$<HTMLElement>('acsrTrackFigure')`
  );

  next = replaceAll(
    next,
    `const date = new Date(value);`,
    `const date = value instanceof Date ? value : new Date(String(value));`
  );

  return next;
}

patch('src/pages/campeonato.astro', (text) => patchShared(text));

patch('src/pages/campeonato-supra-gt4.astro', (text) => {
  let next = patchShared(text);

  const replacements = [
    [`const normalizeDriverName = (value) =>`, `const normalizeDriverName = (value: unknown) =>`],
    [`function mergeDriverRating(driver, standings)`, `function mergeDriverRating(driver: any, standings: any[])`],
    [`function buildGlobalRatingsRows(payload)`, `function buildGlobalRatingsRows(payload: any): any[]`],
    [`const ensure = (name) =>`, `const ensure = (name: unknown) =>`],
    [`srRows.forEach((row) =>`, `srRows.forEach((row: any) =>`],
    [`gsrRows.forEach((row) =>`, `gsrRows.forEach((row: any) =>`],
    [`function applyGlobalRatingsToChampionship(payload, ratingsRows)`, `function applyGlobalRatingsToChampionship(payload: any, ratingsRows: any[])`],
    [`const mergeRows = (rows) =>`, `const mergeRows = (rows: any[]): any[] =>`],
    [`function renderDrivers(rows, standings = [])`, `function renderDrivers(rows: any[], standings: any[] = [])`],
    [`renderError({ message: error?.message || String(error) });`, `renderError({ message: error instanceof Error ? error.message : String(error) });`]
  ];

  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

  const helper = `      const settledReasonMessage = (result: PromiseSettledResult<any>): string =>
        result.status === 'rejected'
          ? String(result.reason?.message || result.reason || '')
          : '';

`;
  const helperUses = next.split('settledReasonMessage').length - 1;
  if (helperUses === 1 && next.includes(helper)) {
    next = next.replace(helper, '');
  }

  return next;
});

console.log('');
console.log('[GC Phase 2C.1] Limpieza residual aplicada.');
console.log(`[GC Phase 2C.1] Backup: ${backupDir}`);
console.log(`[GC Phase 2C.1] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2C.1] Siguiente: npm run deps:baseline && npm run quality');
