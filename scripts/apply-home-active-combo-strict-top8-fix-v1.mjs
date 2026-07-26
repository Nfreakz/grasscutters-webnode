import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_ACTIVE_COMBO_STRICT_TOP8_FIX_V1';
const serverFile = path.join(process.cwd(), 'src', 'server', 'index.ts');
const pageFile = path.join(process.cwd(), 'src', 'pages', 'index.astro');

for (const file of [serverFile, pageFile]) {
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);
}

let server = fs.readFileSync(serverFile, 'utf8');
let page = fs.readFileSync(pageFile, 'utf8');

if (server.includes(PACK) || page.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const stamp = Date.now();
fs.copyFileSync(serverFile, path.join(backupDir, `index.ts.${stamp}.bak`));
fs.copyFileSync(pageFile, path.join(backupDir, `index.astro.${stamp}.bak`));

const oldServer = [
"    const variant = gcComboUnifyTrackVariantV1(lap, vilaSplitMap);",
"    const variantLabel = gcComboUnifyVariantLabelV1(trackFamily.key, variant);",
"    const logicalKey = `${sourceKey}:${trackFamily.key}:${variant}`;",
"    const key = exactTechnical ? gcHomeBootstrapTechnicalKeyV12(lap, sourceKey, trackFamily.key, variant) : logicalKey;"
].join('\n');

const newServer = [
"    const variant = gcComboUnifyTrackVariantV1(lap, vilaSplitMap);",
"    const variantLabel = gcComboUnifyVariantLabelV1(trackFamily.key, variant);",
"    const carBucketKey = gcComboUnifyCarBucketKeyV2(lap) || 'car';",
"    const logicalKey = `${sourceKey}:${trackFamily.key}:${variant}`;",
"    /* " + PACK + ": MAIN no puede mezclar coches distintos en el mismo circuito/layout. */",
"    const strictLogicalKey = `${logicalKey}:${carBucketKey}`;",
"    const key = exactTechnical",
"      ? gcHomeBootstrapTechnicalKeyV12(lap, sourceKey, trackFamily.key, variant)",
"      : strictLogicalKey;"
].join('\n');

if (!server.includes(oldServer)) throw new Error('No se encontró el bloque de buckets esperado en src/server/index.ts');
server = server.replace(oldServer, newServer);
server = server.replaceAll("source: 'gc-home-bootstrap-v1.3'", "source: 'gc-home-bootstrap-v1.4-strict-combo'");
server = server.replace(
  "message: 'Home bootstrap v1.3: GT4 usa el cÃ³digo tÃ©cnico real de sTracker para evitar alias heredados del combo anterior.'",
  "message: 'Home bootstrap v1.4: combo separado por servidor, circuito, variante y coche.'"
);
server = server.replace(
  "message: 'No se pudo generar Home Bootstrap v1.3.'",
  "message: 'No se pudo generar Home Bootstrap v1.4 strict combo.'"
);

const oldIdentity = [
"      const comboTrackIdentity = (combo: any): { code: string; config: string; key: string } => {",
"        const trackCode = normalize(first(combo, [",
"          'track.trackCode', 'track.technicalCode', 'track.rawCode', 'track.code',",
"          'trackCode', 'trackRaw'",
"        ], ''));",
"        const trackConfig = normalize(first(combo, [",
"          'track.trackConfig', 'track.layout', 'track.variant', 'trackConfig', 'layout'",
"        ], ''));",
"        return {",
"          code: trackCode,",
"          config: trackConfig,",
"          key: trackCode ? `${trackCode}:${trackConfig}` : ''",
"        };",
"      };"
].join('\n');

const newIdentity = [
"      const comboTrackIdentity = (combo: any): { code: string; config: string; cars: string[]; key: string } => {",
"        const trackCode = normalize(first(combo, [",
"          'track.trackCode', 'track.technicalCode', 'track.rawCode', 'track.code',",
"          'trackCode', 'trackRaw'",
"        ], ''));",
"        const trackConfig = normalize(first(combo, [",
"          'track.trackConfig', 'track.layout', 'track.variant', 'trackConfig', 'layout'",
"        ], ''));",
"        const rawCars = Array.isArray(combo?.cars) ? combo.cars : [];",
"        const cars = rawCars",
"          .map((car: any) => normalize(typeof car === 'string' ? car : first(car, ['code', 'rawCode', 'name', 'displayName'], '')))",
"          .filter(Boolean)",
"          .sort();",
"        return {",
"          code: trackCode,",
"          config: trackConfig,",
"          cars,",
"          key: trackCode ? `${trackCode}:${trackConfig}:${cars.join(',')}` : ''",
"        };",
"      };"
].join('\n');

if (!page.includes(oldIdentity)) throw new Error('No se encontró comboTrackIdentity esperado en src/pages/index.astro');
page = page.replace(oldIdentity, newIdentity);

const oldSameTrack = [
"            const sameTrack = Boolean(",
"              liveTrack.code &&",
"              historicalTrack.code &&",
"              liveTrack.code === historicalTrack.code &&",
"              (!liveTrack.config || !historicalTrack.config || liveTrack.config === historicalTrack.config)",
"            );"
].join('\n');

const newSameTrack = [
"            const sameTrack = Boolean(",
"              liveTrack.code &&",
"              historicalTrack.code &&",
"              liveTrack.code === historicalTrack.code &&",
"              (!liveTrack.config || !historicalTrack.config || liveTrack.config === historicalTrack.config)",
"            );",
"            const liveCarSet = new Set(liveTrack.cars);",
"            const historicalCarSet = new Set(historicalTrack.cars);",
"            const sameCars = Boolean(",
"              liveCarSet.size &&",
"              historicalCarSet.size &&",
"              [...liveCarSet].every((car) => historicalCarSet.has(car)) &&",
"              [...historicalCarSet].every((car) => liveCarSet.has(car))",
"            );",
"            const sameStrictCombo = sameTrack && sameCars;"
].join('\n');

if (!page.includes(oldSameTrack)) throw new Error('No se encontró sameTrack esperado en src/pages/index.astro');
page = page.replace(oldSameTrack, newSameTrack);
page = page.replace(
  "            if (!liveRows.length && historicalRows.length && sameTrack) {",
  "            if (!liveRows.length && historicalRows.length && sameStrictCombo) {"
);

const oldReturn = [
"            return {",
"              ...historical,",
"              ...livePayload,",
"              diagnostics: {",
"                ...(historical.diagnostics || {}),",
"                ...(livePayload.diagnostics || {})",
"              }",
"            };"
].join('\n');

const newReturn = [
"            /* " + PACK + ": completar solo el mismo combo exacto. */",
"            const mergedRows = sameStrictCombo ? [...liveRows, ...historicalRows] : liveRows;",
"",
"            return {",
"              ...historical,",
"              ...livePayload,",
"              activeCombo: {",
"                ...(historical.activeCombo || {}),",
"                ...(livePayload.activeCombo || {}),",
"                leaderboard: mergedRows,",
"                bestLap: mergedRows[0] || livePayload.activeCombo?.bestLap || historical.activeCombo?.bestLap || null,",
"                latestLap: livePayload.activeCombo?.latestLap || historical.activeCombo?.latestLap || mergedRows[0] || null",
"              },",
"              leaderboard: mergedRows,",
"              diagnostics: {",
"                ...(historical.diagnostics || {}),",
"                ...(livePayload.diagnostics || {}),",
"                activeComboAuthority: sameStrictCombo ? 'acsm-live+strict-history' : 'acsm-live',",
"                strictHistoryMerged: sameStrictCombo,",
"                strictTrackMatch: sameTrack,",
"                strictCarsMatch: sameCars,",
"                liveRows: liveRows.length,",
"                historicalRows: historicalRows.length,",
"                mergedRows: mergedRows.length",
"              }",
"            };"
].join('\n');

if (!page.includes(oldReturn)) throw new Error('No se encontró el retorno live esperado en src/pages/index.astro');
page = page.replace(oldReturn, newReturn);
page = page.replace("/* GC_HOME_HERO_TOP7_V17 */", "/* GC_HOME_HERO_TOP7_V17 */\n/* " + PACK + " */");

fs.writeFileSync(serverFile, server, 'utf8');
fs.writeFileSync(pageFile, page, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Backend: MAIN separado por circuito + variante + coche.`);
console.log(`[${PACK}] Frontend: live + histórico solo con circuito/layout/coches idénticos.`);
console.log(`[${PACK}] Ejecuta npm run build`);
