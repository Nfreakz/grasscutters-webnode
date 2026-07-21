import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4h2-4-identity-residual-conflict-${stamp}`);
const changed = [];

const files = {
  audit: 'src/server/gc-ratings/identityAudit.ts',
  preview: 'src/server/gc-ratings/identityPreview.ts',
  reviewPage: 'src/pages/admin/integridad-ratings/identidades/preview.astro'
};

const markers = {
  audit: 'GC_PHASE4H2_4_IDENTITY_AUDIT_RESIDUAL_CONFLICT_FIX_V1',
  preview: 'GC_PHASE4H2_4_IDENTITY_PREVIEW_RESIDUAL_CONFLICT_FIX_V1',
  reviewPage: 'GC_PHASE4H2_4_IDENTITY_REVIEW_RESIDUAL_CONFLICT_FIX_V1'
};

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}. Instala primero Phase 4H.2.3.`);
  return fs.readFileSync(filePath, 'utf8');
}

function replaceRequired(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`No se encontró ${label}. El archivo no coincide con la base 4H.2.3.`);
  return content.replace(before, after);
}

function save(relativePath, content) {
  const target = path.join(root, relativePath);
  const original = fs.readFileSync(target, 'utf8');
  if (original === content) return;
  const backup = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
  fs.writeFileSync(target, content, 'utf8');
  changed.push(relativePath);
}

const current = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const applied = Object.keys(files).filter((key) => current[key].includes(markers[key]));
if (applied.length === Object.keys(files).length) {
  console.log('[GC Phase 4H.2.4] Sin cambios: el parche ya estaba aplicado.');
  process.exit(0);
}
if (applied.length) throw new Error(`Instalación parcial detectada (${applied.join(', ')}). Restaura el backup de esta fase antes de repetir.`);

let audit = current.audit;
audit = replaceRequired(audit,
  '// GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',
  '// GC_PHASE4H2_4_IDENTITY_AUDIT_RESIDUAL_CONFLICT_FIX_V1',
  'el marcador 4H.2.3 del auditor');
audit = replaceRequired(audit,
  "    const sameSourcePlayerConflicts = playerIdsBySource.filter((entry) => entry.playerIds.length > 1);\n    const unscopedPlayerIds = [...new Set(bucket",
  "    const sameSourcePlayerConflicts = playerIdsBySource.filter((entry) => entry.playerIds.length > 1);\n    const scopedPlayerIds = new Set(playerIdsBySource.flatMap((entry) => entry.playerIds));\n    const unscopedPlayerIds = [...new Set(bucket",
  'el conjunto de Player ID con origen');
audit = replaceRequired(audit,
  "      .map((record) => record.playerId)\n      .filter((value): value is number => value !== null))].sort((a, b) => a - b);\n    const steamGuids",
  "      .map((record) => record.playerId)\n      .filter((value): value is number => value !== null))].sort((a, b) => a - b);\n    // Un ID heredado de rating, perfil o usuario no es conflicto si ya aparece\n    // correctamente acotado por servidor en los resultados de la misma identidad.\n    const unresolvedUnscopedPlayerIds = unscopedPlayerIds.filter((playerId) => !scopedPlayerIds.has(playerId));\n    const steamGuids",
  'la resolución de Player ID heredados');
audit = replaceRequired(audit,
  "    if (sameSourcePlayerConflicts.length) conflicts.push('MULTIPLE_PLAYER_IDS_SAME_SOURCE');\n    if (unscopedPlayerIds.length > 1) conflicts.push('MULTIPLE_UNSCOPED_PLAYER_IDS');",
  "    if (sameSourcePlayerConflicts.length) conflicts.push('MULTIPLE_PLAYER_IDS_SAME_SOURCE');\n    if (unresolvedUnscopedPlayerIds.length > 1) conflicts.push('MULTIPLE_UNRESOLVED_UNSCOPED_PLAYER_IDS');",
  'el conflicto residual de Player ID');
audit = replaceRequired(audit,
  "      playerIdsBySource,\n      unscopedPlayerIds,\n      identityStatus: confirmedMultiserver ? 'CONFIRMED_MULTISERVER_IDENTITY' : conflicts.length ? 'REVIEW_REQUIRED' : 'CONFIRMED_IDENTITY',",
  "      playerIdsBySource,\n      unscopedPlayerIds,\n      unresolvedUnscopedPlayerIds,\n      identityStatus: conflicts.length ? 'REVIEW_REQUIRED' : confirmedMultiserver ? 'CONFIRMED_MULTISERVER_IDENTITY' : 'CONFIRMED_IDENTITY',",
  'la prioridad del estado de revisión');
audit = replaceRequired(audit,
  "    version: 'GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',",
  "    version: 'GC_PHASE4H2_4_IDENTITY_AUDIT_RESIDUAL_CONFLICT_FIX_V1',",
  'la versión del auditor');
audit = replaceRequired(audit,
  "      eventDuplicateScope: 'source_key + event_scope_key',\n      unscopedPlayerIdCanMerge: false,",
  "      eventDuplicateScope: 'source_key + event_scope_key',\n      coveredUnscopedPlayerIdsAreConflict: false,\n      unresolvedUnscopedPlayerIdsRequireReview: true,\n      unscopedPlayerIdCanMerge: false,",
  'las reglas de Player ID heredados');

let preview = current.preview;
preview = replaceRequired(preview,
  '// GC_PHASE4H2_3_IDENTITY_PREVIEW_FALSE_POSITIVE_FIX_V1',
  '// GC_PHASE4H2_4_IDENTITY_PREVIEW_RESIDUAL_CONFLICT_FIX_V1',
  'el marcador 4H.2.3 del preview');
preview = replaceRequired(preview,
  "      version: 'GC_PHASE4H2_IDENTITY_PREVIEW_V1',",
  "      version: 'GC_PHASE4H2_4_IDENTITY_PREVIEW_RESIDUAL_CONFLICT_FIX_V1',",
  'la versión del bootstrap de preview');

let reviewPage = current.reviewPage;
reviewPage = replaceRequired(reviewPage,
  '// GC_PHASE4H2_3_IDENTITY_REVIEW_FALSE_POSITIVE_FIX_V1',
  '// GC_PHASE4H2_4_IDENTITY_REVIEW_RESIDUAL_CONFLICT_FIX_V1',
  'el marcador 4H.2.3 de la interfaz');
reviewPage = replaceRequired(reviewPage,
  "MULTIPLE_UNSCOPED_PLAYER_IDS:'Varios Player ID sin servidor conocido'",
  "MULTIPLE_UNRESOLVED_UNSCOPED_PLAYER_IDS:'Varios Player ID heredados sin correspondencia de servidor'",
  'la etiqueta del conflicto residual');

save(files.audit, audit);
save(files.preview, preview);
save(files.reviewPage, reviewPage);

console.log('');
console.log('[GC Phase 4H.2.4] Conflictos residuales multiserver corregidos.');
console.log(`[GC Phase 4H.2.4] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4H.2.4] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('No se ha ejecutado SQL ni se ha escrito en MySQL.');
console.log('Siguiente: npm run quality && npm run build');
