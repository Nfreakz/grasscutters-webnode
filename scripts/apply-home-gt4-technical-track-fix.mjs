import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const relativePath = 'src/server/index.ts';
const filePath = path.join(root, relativePath);

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${relativePath}`);
}

const original = fs.readFileSync(filePath, 'utf8');
let next = original;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `home-gt4-technical-track-${timestamp}`);
const backupPath = path.join(backupDir, relativePath);

const comboIdFunction = `function gcHomeBootstrapComboIdValueV12(lap: any) {
  const raw = lap?.rawComboId ?? lap?.RawComboId ?? lap?.comboId ?? lap?.ComboId ?? lap?.session?.comboId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
}`;

const helperBlock = `function gcHomeBootstrapComboIdValueV12(lap: any) {
  const raw = lap?.rawComboId ?? lap?.RawComboId ?? lap?.comboId ?? lap?.ComboId ?? lap?.session?.comboId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
}

/* GC_HOME_GT4_TECHNICAL_TRACK_IDENTITY_V1_START
 * GT4 debe identificarse por el código técnico real de sTracker.
 * UiTrackName/displayName pueden conservar el alias del combo anterior y no son
 * una fuente válida para decidir qué circuito está cargado ahora.
 */
function gcHomeBootstrapRawTrackCodeV13(lap: any) {
  const candidates = [
    lap?.rawTrackCode,
    lap?.RawTrackCode,
    lap?.trackCode,
    lap?.Track,
    lap?.track?.rawCode,
    lap?.track?.code,
    lap?.track?.rawName,
    lap?.rawTrackName,
    lap?.track?.name
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (!value || /^\\d+$/.test(value)) continue;
    return value;
  }

  return '';
}

function gcHomeBootstrapTechnicalTrackFamilyV13(lap: any) {
  const rawCode = gcHomeBootstrapRawTrackCodeV13(lap);
  if (!rawCode) return gcComboUnifyTrackFamilyV1(lap?.track);

  const key = gcComboUnifySlugV1(rawCode);
  const displayName = autoTitleFromCode(rawCode, rawCode);

  return {
    key: key || gcComboUnifySlugV1(displayName),
    code: rawCode,
    rawName: rawCode,
    name: displayName,
    displayName
  };
}
/* GC_HOME_GT4_TECHNICAL_TRACK_IDENTITY_V1_END */`;

if (!next.includes('GC_HOME_GT4_TECHNICAL_TRACK_IDENTITY_V1_START')) {
  if (!next.includes(comboIdFunction)) {
    throw new Error('No se encontró gcHomeBootstrapComboIdValueV12.');
  }
  next = next.replace(comboIdFunction, helperBlock);
}

const oldTechnicalCode = `  const trackCode = gcComboUnifySlugV1(
    lap?.track?.rawCode ?? lap?.rawTrackCode ?? lap?.trackCode ?? lap?.track?.code ?? lap?.Track ?? lap?.track?.name ?? trackFamilyKey
  );`;

const newTechnicalCode = `  const trackCode = gcComboUnifySlugV1(
    gcHomeBootstrapRawTrackCodeV13(lap) || trackFamilyKey
  );`;

if (next.includes(oldTechnicalCode)) {
  next = next.replace(oldTechnicalCode, newTechnicalCode);
} else if (!next.includes('gcHomeBootstrapRawTrackCodeV13(lap) || trackFamilyKey')) {
  throw new Error('No se encontró el cálculo técnico de trackCode.');
}

const oldTrackFamilyLine = `    const trackFamily = gcComboUnifyTrackFamilyV1(lap?.track);
    const variant = gcComboUnifyTrackVariantV1(lap, vilaSplitMap);`;

const newTrackFamilyBlock = `    const technicalTrackCode = exactTechnical ? gcHomeBootstrapRawTrackCodeV13(lap) : '';
    const trackFamily = exactTechnical
      ? gcHomeBootstrapTechnicalTrackFamilyV13(lap)
      : gcComboUnifyTrackFamilyV1(lap?.track);
    const variant = gcComboUnifyTrackVariantV1(lap, vilaSplitMap);`;

if (next.includes(oldTrackFamilyLine)) {
  next = next.replace(oldTrackFamilyLine, newTrackFamilyBlock);
} else if (!next.includes('gcHomeBootstrapTechnicalTrackFamilyV13(lap)')) {
  throw new Error('No se encontró la construcción de trackFamily.');
}

const oldTrackObject = `          rawCode: trackFamily.code,
          rawName: trackFamily.rawName,
          familyKey: trackFamily.key,
          variant`;

const newTrackObject = `          rawCode: technicalTrackCode || trackFamily.code,
          rawName: technicalTrackCode || trackFamily.rawName,
          technicalCode: technicalTrackCode || null,
          identitySource: technicalTrackCode ? 'stracker-technical-code' : 'normalized-track',
          familyKey: trackFamily.key,
          variant`;

if (next.includes(oldTrackObject)) {
  next = next.replace(oldTrackObject, newTrackObject);
} else if (!next.includes("identitySource: technicalTrackCode ? 'stracker-technical-code'")) {
  throw new Error('No se encontró el objeto público de circuito del bucket.');
}

const oldDiagnostics = `      activeComboKey: activeCombo?.comboUid || null,
      activeComboLaps: activeCombo?.totalLaps || 0,
      leaderboardRows: activeCombo?.leaderboard?.length || 0,`;

const newDiagnostics = `      activeComboKey: activeCombo?.comboUid || null,
      activeComboLaps: activeCombo?.totalLaps || 0,
      activeTrackTechnicalCode: activeCombo?.track?.technicalCode || activeCombo?.track?.rawCode || null,
      activeTrackDisplayName: activeCombo?.track?.displayName || activeCombo?.track?.name || null,
      activeTrackIdentitySource: activeCombo?.track?.identitySource || null,
      leaderboardRows: activeCombo?.leaderboard?.length || 0,`;

let diagnosticsReplacements = 0;
while (next.includes(oldDiagnostics)) {
  next = next.replace(oldDiagnostics, newDiagnostics);
  diagnosticsReplacements += 1;
}
if (!diagnosticsReplacements && !next.includes('activeTrackTechnicalCode:')) {
  throw new Error('No se encontró el bloque de diagnósticos de home-bootstrap.');
}

next = next
  .replace(/source: 'gc-home-bootstrap-v1\.2'/g, "source: 'gc-home-bootstrap-v1.3'")
  .replace(/Home Bootstrap v1\.2/g, 'Home Bootstrap v1.3')
  .replace(
    "message: 'Home bootstrap v1.2: GT4 queda aislado por combo técnico activo; Liga mantiene agrupación lógica.'",
    "message: 'Home bootstrap v1.3: GT4 usa el código técnico real de sTracker para evitar alias heredados del combo anterior.'"
  );

if (next === original) {
  console.log('[GC home GT4 technical track] Ya estaba aplicado.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(filePath, backupPath);
fs.writeFileSync(filePath, next, 'utf8');

console.log('');
console.log('[GC home GT4 technical track] Aplicado.');
console.log(`[GC home GT4 technical track] Backup: ${backupDir}`);
console.log(`[GC home GT4 technical track] Modificado: ${relativePath}`);
console.log('[GC home GT4 technical track] La identidad GT4 usa el código técnico de sTracker, no UiTrackName/displayName heredados.');
console.log('[GC home GT4 technical track] Siguiente: npm run quality');
