import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4a-ratings-integrity-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4a-ratings-integrity-payload');
const changed = [];
const MARKER = 'GC_PHASE4A_RATINGS_INTEGRITY_GUARD_V1';

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readPayload(name) {
  const filePath = path.join(payloadDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Falta payload ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8').trimEnd();
}

function save(relativePath, original, next) {
  if (next === original) return false;
  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target(relativePath), backupPath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
  return true;
}

function replaceRequired(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`No se encontró el bloque requerido: ${label}`);
  return text.replace(oldValue, newValue);
}

function injectBeforeRequired(text, marker, block, label) {
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`No se encontró el marcador requerido: ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
}

function patchSection(text, startMarker, endMarker, patcher, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`No se encontró la sección requerida: ${label}`);
  return text.slice(0, start) + patcher(text.slice(start, end)) + text.slice(end);
}

const integrityHelpers = readPayload('rating-integrity-helpers.txt');
const roundUiGuard = readPayload('round-ui-guard.txt');

// 1) Backend ratings: guardia de lectura, deduplicación visible y diagnóstico.
{
  const relativePath = 'src/server/gc-ratings/ratingService.ts';
  const original = read(relativePath);
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4A] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = injectBeforeRequired(
      original,
      'function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {',
      integrityHelpers,
      'enrichChampionship'
    );

    next = patchSection(
      next,
      'function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {',
      'function orderRowsForGsr(rows: any[]) {',
      (section) => {
        let out = section;
        out = replaceRequired(
          out,
          '  const publicRatingDrivers = mergeDriversForPublicLeaderboard(snapshot.drivers);',
          '  const runtimeSnapshot = buildRuntimeIntegritySnapshotV1(snapshot);\n  const publicRatingDrivers = mergeDriversForPublicLeaderboard(runtimeSnapshot.drivers);',
          'snapshot runtime dentro de enrichChampionship'
        );
        out = replaceRequired(
          out,
          '  snapshot.eventResults.forEach((result) => {',
          '  runtimeSnapshot.eventResults.forEach((result) => {',
          'resultados runtime dentro de enrichChampionship'
        );
        out = replaceRequired(
          out,
          'manualEventsFromSnapshot(snapshot, championshipEvents)',
          'manualEventsFromSnapshot(runtimeSnapshot, championshipEvents)',
          'eventos manuales runtime'
        );
        out = replaceRequired(
          out,
          'reviewedEventsFromSnapshot(snapshot, [...championshipEvents, ...processedStrackerEvents])',
          'reviewedEventsFromSnapshot(runtimeSnapshot, [...championshipEvents, ...processedStrackerEvents])',
          'eventos revisados runtime'
        );
        return out;
      },
      'enrichChampionship'
    );

    const warningAnchor = "    if (snapshot.eventResults.length && !strackerLinkedResults.length) megaAuditWarnings.push('No hay resultados enlazados a sTracker. El SR podría estar congelado o usando fallback.');";
    next = replaceRequired(
      next,
      warningAnchor,
      `${warningAnchor}\n    const duplicateAudit = buildRatingDuplicateAuditV1(snapshot.eventResults);\n    if (duplicateAudit.duplicateGroups > 0) megaAuditWarnings.push(\`Hay \${duplicateAudit.duplicateGroups} grupo(s) de resultados duplicados. La vista pública los está suprimiendo sin borrar datos.\`);`,
      'auditoría de duplicados'
    );

    next = replaceRequired(
      next,
      '      preDeployStatus,\n      pendingCompletedEvents,',
      '      dataIntegrity: duplicateAudit,\n      preDeployStatus,\n      pendingCompletedEvents,',
      'dataIntegrity en diagnostics'
    );

    next = replaceRequired(
      next,
      '    const snapshot = await this.getSnapshot();\n    const acsm = await fetchChampionship(source);\n    const championship = enrichChampionship(acsm.championship, snapshot);',
      '    const snapshot = await this.getSnapshot();\n    const runtimeSnapshot = buildRuntimeIntegritySnapshotV1(snapshot);\n    const acsm = await fetchChampionship(source);\n    const championship = enrichChampionship(acsm.championship, runtimeSnapshot);',
      'runtimeSnapshot en getChampionshipPayload'
    );

    next = replaceRequired(
      next,
      '      leaderboard: buildLeaderboard(snapshot.drivers),\n      diagnostics: await this.buildDiagnostics(snapshot, acsm.championship)',
      '      leaderboard: buildLeaderboard(runtimeSnapshot.drivers),\n      diagnostics: await this.buildDiagnostics(snapshot, acsm.championship)',
      'leaderboard runtime en getChampionshipPayload'
    );

    next = replaceRequired(
      next,
      '  async getDriver(driverKey: string) {\n    const snapshot = await this.getSnapshot();\n    const driver = snapshot.drivers.find((item) => item.driverKey === driverKey);',
      '  async getDriver(driverKey: string) {\n    const storedSnapshot = await this.getSnapshot();\n    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);\n    const driver = snapshot.drivers.find((item) => item.driverKey === driverKey);',
      'runtimeSnapshot en getDriver'
    );

    next = replaceRequired(
      next,
      '  async getLeaderboard() {\n    const snapshot = await this.getSnapshot();',
      '  async getLeaderboard() {\n    const storedSnapshot = await this.getSnapshot();\n    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);',
      'runtimeSnapshot en getLeaderboard'
    );

    next = replaceRequired(
      next,
      '    const snapshot = await this.getSnapshot();\n    const fallback = snapshot.drivers.find((driver) => driver.strackerPlayerId === playerId);',
      '    const storedSnapshot = await this.getSnapshot();\n    const snapshot = buildRuntimeIntegritySnapshotV1(storedSnapshot);\n    const fallback = snapshot.drivers.find((driver) => driver.strackerPlayerId === playerId);',
      'runtimeSnapshot en resolveDriverProfileByPlayerId'
    );

    save(relativePath, original, next);
  }
}

// 2) Detalle de ronda: segunda barrera defensiva y participantes únicos.
{
  const relativePath = 'src/pages/campeonato/ronda/[eventId].astro';
  const original = read(relativePath);
  if (original.includes(MARKER)) {
    console.log(`[GC Phase 4A] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = injectBeforeRequired(
      original,
      '      const safetyNumber = (value, fallback = 0) => {',
      roundUiGuard,
      'safetyNumber de la ronda'
    );

    next = replaceRequired(
      next,
      '      const renderResults = (tbody, rows, type) => {\n        const list = Array.isArray(rows) ? rows : [];',
      "      const renderResults = (tbody, rows, type) => {\n        const sourceRows = Array.isArray(rows) ? rows : [];\n        const list = type === 'race' ? dedupeRaceResultsV1(sourceRows) : sourceRows;",
      'dedupe en renderResults'
    );

    next = replaceRequired(
      next,
      '        const raceResults = Array.isArray(event.raceResults) ? event.raceResults : [];',
      '        const raceResults = dedupeRaceResultsV1(Array.isArray(event.raceResults) ? event.raceResults : []);',
      'dedupe en render de ronda'
    );

    save(relativePath, original, next);
  }
}

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

if (!changed.length) {
  console.log(`[GC Phase 4A] Sin cambios: ${MARKER} ya estaba aplicado.`);
  process.exit(0);
}

console.log('[GC Phase 4A] Aplicado correctamente.');
console.log(`[GC Phase 4A] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4A] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('[GC Phase 4A] No se ha borrado ni migrado ningún dato de ratings.');
console.log('[GC Phase 4A] Revisa /api/gc/ratings/diagnostics -> diagnostics.dataIntegrity.');
