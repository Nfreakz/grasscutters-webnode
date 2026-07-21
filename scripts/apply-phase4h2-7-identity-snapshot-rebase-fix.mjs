import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const relative = 'src/server/gc-ratings/identityPreview.ts';
const absolute = path.join(root, relative);
const prerequisite = 'GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1';
const marker = 'GC_PHASE4H2_7_IDENTITY_SNAPSHOT_REBASE_FIX_V1';
const expectedBefore = 'f317d44232e1caddd0e849f9384b1d87989066697df56c394ab9d162c2a7999f';
const expectedAfter = 'b316c02f3e2689a121297dab4164f1cbe117e82b56601f59705cd2afe1627429';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function replaceExact(source, before, after, expectedCount = 1) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expectedCount) throw new Error(`Parche incompatible: se esperaban ${expectedCount} coincidencias y se encontraron ${count}.`);
  return parts.join(after);
}

if (!fs.existsSync(absolute)) throw new Error(`Falta el archivo requerido: ${relative}`);
const original = fs.readFileSync(absolute, 'utf8');
if (original.includes(marker)) {
  console.log('[GC Phase 4H.2.7] Ya estaba instalada; no se ha modificado nada.');
  process.exit(0);
}
if (!original.includes(prerequisite)) throw new Error('Instala primero Phase 4H.2.6.');
const originalHash = sha256(original);
if (originalHash !== expectedBefore) {
  throw new Error(`${relative} difiere de Phase 4H.2.6 validada (SHA-256 ${originalHash}). No se ha modificado nada.`);
}

let next = original;
next = replaceExact(next,
  '// GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1',
  '// GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1\n// GC_PHASE4H2_7_IDENTITY_SNAPSHOT_REBASE_FIX_V1');
next = replaceExact(next,
  'ratings: rows.ratings.map((row) => [String(row.id), row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name, row.races_count]),',
  'ratings: rows.ratings.map((row) => [String(row.id), row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name]),');
next = replaceExact(next,
  'results: rows.results.map((row) => [String(row.id), row.event_scope_key, row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name, row.position]),',
  'results: rows.results.map((row) => [String(row.id), row.source_key, row.event_scope_key, row.driver_key, row.steam_guid, row.stracker_player_id, row.display_name]),');
next = replaceExact(next,
  `}\n\nfunction decorateAudit(audit: any) {`,
  `}\n\nfunction decisionFingerprint(decision: ReturnType<typeof normalizeDecision>) {\n  return JSON.stringify({\n    groupRef: decision.groupRef,\n    action: decision.action,\n    targetGroupRef: decision.targetGroupRef,\n    canonicalDriverKey: decision.canonicalDriverKey,\n    canonicalProfileId: decision.canonicalProfileId,\n    canonicalUserId: decision.canonicalUserId,\n    displayName: decision.displayName,\n    keepResultIdsByScope: Object.fromEntries(Object.entries(decision.keepResultIdsByScope).sort(([left], [right]) => left.localeCompare(right)))\n  });\n}\n\nfunction canRebaseAutomaticDecisions(bootstrap: any, decisions: ReturnType<typeof normalizeDecision>[]) {\n  const required = (bootstrap.groups || []).filter((group: any) => group.requiresDecision);\n  if (required.length !== decisions.length) return false;\n  const submitted = new Map<string, ReturnType<typeof normalizeDecision>>();\n  for (const decision of decisions) {\n    if (!decision.groupRef || submitted.has(decision.groupRef)) return false;\n    submitted.set(decision.groupRef, decision);\n  }\n  return required.every((group: any) => {\n    const automatic = group.automatic;\n    const decision = submitted.get(group.groupRef);\n    if (!decision || automatic?.classification !== 'safe' || !automatic.decision) return false;\n    return decisionFingerprint(decision) === decisionFingerprint(normalizeDecision(automatic.decision));\n  });\n}\n\nfunction decorateAudit(audit: any) {`);
next = replaceExact(next,
  `  const bootstrap = await readMysqlIdentityPreviewBootstrapV1();\n  if (cleanText(request.snapshotId, 80) !== bootstrap.snapshotId) {\n    return { ...bootstrap, ok: false, stale: true, safeToExecute: false, message: 'Los datos cambiaron desde que abriste la revisión. Recarga antes de continuar.' };\n  }\n  if (!Array.isArray(request.decisions) || request.decisions.length > 200) {\n    return { ...bootstrap, ok: false, safeToExecute: false, message: 'Decisiones inválidas.' };\n  }\n  const decisions = request.decisions.map((item) => normalizeDecision(item || {}));`,
  `  const bootstrap = await readMysqlIdentityPreviewBootstrapV1();\n  if (!Array.isArray(request.decisions) || request.decisions.length > 200) {\n    return { ...bootstrap, ok: false, safeToExecute: false, message: 'Decisiones inválidas.' };\n  }\n  const decisions = request.decisions.map((item) => normalizeDecision(item || {}));\n  const snapshotChanged = cleanText(request.snapshotId, 80) !== bootstrap.snapshotId;\n  const rebasedAutomaticDecisions = snapshotChanged && canRebaseAutomaticDecisions(bootstrap, decisions);\n  if (snapshotChanged && !rebasedAutomaticDecisions) {\n    return { ...bootstrap, ok: false, stale: true, safeToExecute: false, message: 'Los datos de identidad cambiaron y las decisiones ya no coinciden exactamente con el plan automático actual. Recarga antes de continuar.' };\n  }`);
next = replaceExact(next,
  `version: 'GC_PHASE4H2_6_IDENTITY_SAFE_AUTOMATION_PREVIEW_V1',`,
  `version: 'GC_PHASE4H2_7_IDENTITY_SNAPSHOT_REBASE_FIX_V1',`, 2);
next = replaceExact(next,
  `      snapshotId: bootstrap.snapshotId,\n      readOnly: true,\n      writesAvailable: false,\n      destructiveChangesApplied: false,`,
  `      snapshotId: bootstrap.snapshotId,\n      readOnly: true,\n      writesAvailable: false,\n      destructiveChangesApplied: false,\n      rebasedAutomaticDecisions,`);

const nextHash = sha256(next);
if (nextHash !== expectedAfter) throw new Error(`El resultado no coincide con el hotfix validado (SHA-256 ${nextHash}). No se ha modificado nada.`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(root, '_gc_backups', `phase4h2-7-identity-snapshot-rebase-${stamp}`);
const backup = path.join(backupRoot, relative);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(absolute, backup);
const temporary = `${absolute}.gc-phase4h2-7.tmp`;
fs.writeFileSync(temporary, next);
fs.renameSync(temporary, absolute);

console.log('[GC Phase 4H.2.7] Snapshot estable y rebase automático seguro instalados.');
console.log(`[GC Phase 4H.2.7] Backup: ${path.relative(root, backupRoot)}`);
console.log(`  - ${relative}`);
console.log('No se ha ejecutado SQL ni se ha escrito en MySQL.');
console.log('Siguiente: npm run quality && npm run build');
