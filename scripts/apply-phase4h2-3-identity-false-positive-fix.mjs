import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4h2-3-identity-false-positive-${stamp}`);
const changed = [];

const files = {
  audit: 'src/server/gc-ratings/identityAudit.ts',
  preview: 'src/server/gc-ratings/identityPreview.ts',
  reviewPage: 'src/pages/admin/integridad-ratings/identidades/preview.astro',
  auditPage: 'src/pages/admin/integridad-ratings/identidades.astro'
};

const markers = {
  audit: 'GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',
  preview: 'GC_PHASE4H2_3_IDENTITY_PREVIEW_FALSE_POSITIVE_FIX_V1',
  reviewPage: 'GC_PHASE4H2_3_IDENTITY_REVIEW_FALSE_POSITIVE_FIX_V1',
  auditPage: 'GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1'
};

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}. Instala primero Phase 4H.2.2.`);
  return fs.readFileSync(filePath, 'utf8');
}

function replaceRequired(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`No se encontró ${label}. El archivo no coincide con la base 4H.2.2.`);
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
  console.log('[GC Phase 4H.2.3] Sin cambios: el parche ya estaba aplicado.');
  process.exit(0);
}
if (applied.length) throw new Error(`Instalación parcial detectada (${applied.join(', ')}). Restaura el backup de esta fase antes de repetir.`);

let audit = current.audit;
audit = replaceRequired(audit,
  '// GC_PHASE4H1_1_IDENTITY_AUDIT_SOURCE_SAFE_V1',
  '// GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',
  'el marcador 4H.1.1');
audit = replaceRequired(audit,
  "  const eventId = text(row.event_id ?? row.eventId) || `unknown-${index}`;\n  return {",
  "  const eventId = text(row.event_id ?? row.eventId) || `unknown-${index}`;\n  const rawEventScopeKey = text(row.event_scope_key ?? row.eventScopeKey) || eventId;\n  return {",
  'la lectura de eventId');
audit = replaceRequired(audit,
  "    eventScopeKey: text(row.event_scope_key ?? row.eventScopeKey) || `${sourceKey}:${eventId}`",
  "    // La clave de evento solo es comparable dentro de la misma fuente.\n    eventScopeKey: `${sourceKey}::${rawEventScopeKey}`",
  'el scope de evento');
audit = replaceRequired(audit,
  "    const unscopedPlayerIds = [...new Set(bucket",
  "    const sourcePlayerMap = new Map<string, Set<number>>();\n    bucket.forEach((record) => {\n      if (record.kind !== 'result' || !record.playerId || !record.sourceKey || record.sourceKey === 'unknown') return;\n      const ids = sourcePlayerMap.get(record.sourceKey) || new Set<number>();\n      ids.add(record.playerId);\n      sourcePlayerMap.set(record.sourceKey, ids);\n    });\n    const playerIdsBySource = [...sourcePlayerMap.entries()]\n      .sort(([left], [right]) => left.localeCompare(right))\n      .map(([sourceKey, ids]) => ({ sourceKey, playerIds: [...ids].sort((a, b) => a - b) }));\n    const sameSourcePlayerConflicts = playerIdsBySource.filter((entry) => entry.playerIds.length > 1);\n    const unscopedPlayerIds = [...new Set(bucket",
  'la separación de Player ID por fuente');
audit = replaceRequired(audit,
  "    if (playerIds.length > 1) conflicts.push('MULTIPLE_PLAYER_IDS');",
  "    if (sameSourcePlayerConflicts.length) conflicts.push('MULTIPLE_PLAYER_IDS_SAME_SOURCE');\n    if (unscopedPlayerIds.length > 1) conflicts.push('MULTIPLE_UNSCOPED_PLAYER_IDS');",
  'el falso conflicto global de Player ID');
audit = replaceRequired(audit,
  "    return {\n      identityGroupId:",
  "    const confirmedMultiserver = steamGuids.length === 1\n      && playerIdsBySource.length > 1\n      && sameSourcePlayerConflicts.length === 0;\n    return {\n      identityGroupId:",
  'la clasificación multiserver');
audit = replaceRequired(audit,
  "      playerScopes,\n      unscopedPlayerIds,",
  "      playerScopes,\n      playerIdsBySource,\n      unscopedPlayerIds,\n      identityStatus: confirmedMultiserver ? 'CONFIRMED_MULTISERVER_IDENTITY' : conflicts.length ? 'REVIEW_REQUIRED' : 'CONFIRMED_IDENTITY',\n      confirmedMultiserver,",
  'los metadatos multiserver');
audit = replaceRequired(audit,
  "  const statisticsAtRisk = groups",
  "  const confirmedMultiserverIdentities = groups\n    .filter((group) => group.confirmedMultiserver)\n    .map((group) => ({ identityGroupId: group.identityGroupId, steamGuid: group.steamGuids[0], playerIdsBySource: group.playerIdsBySource }));\n  const statisticsAtRisk = groups",
  'el resumen multiserver');
audit = replaceRequired(audit,
  "    version: 'GC_PHASE4H1_1_IDENTITY_AUDIT_SOURCE_SAFE_V1',",
  "    version: 'GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1',",
  'la versión del auditor');
audit = replaceRequired(audit,
  "      conflicts: conflicts.length,\n      ambiguousGroups:",
  "      conflicts: conflicts.length,\n      confirmedMultiserverIdentities: confirmedMultiserverIdentities.length,\n      ambiguousGroups:",
  'el contador multiserver');
audit = replaceRequired(audit,
  "      playerIdScope: 'source_key + stracker_player_id',\n      unscopedPlayerIdCanMerge:",
  "      playerIdScope: 'source_key + stracker_player_id',\n      crossSourcePlayerIdsAreConflict: false,\n      sameSourceMultiplePlayerIdsAreConflict: true,\n      eventDuplicateScope: 'source_key + event_scope_key',\n      unscopedPlayerIdCanMerge:",
  'las reglas de identidad');
audit = replaceRequired(audit,
  "    conflicts,\n    ambiguousGroups,",
  "    conflicts,\n    confirmedMultiserverIdentities,\n    ambiguousGroups,",
  'la salida multiserver');

let preview = current.preview;
preview = replaceRequired(preview,
  '// GC_PHASE4H2_IDENTITY_PREVIEW_V1',
  '// GC_PHASE4H2_3_IDENTITY_PREVIEW_FALSE_POSITIVE_FIX_V1',
  'el marcador 4H.2');
preview = replaceRequired(preview,
  "function mysqlConfig() {",
  "function scopedEventKey(row: any) {\n  const sourceKey = cleanText(row?.source_key, 80) || 'unknown';\n  const eventKey = cleanText(row?.event_scope_key, 255) || cleanText(row?.event_id, 255) || 'unknown';\n  return `${sourceKey}::${eventKey}`;\n}\n\nfunction mysqlConfig() {",
  'el helper de eventos por fuente');
preview = replaceRequired(preview,
  "    group?.conflicts?.length ||\n    group?.driverKeys?.length > 1 ||\n    group?.profileIds?.length > 1 ||",
  "    group?.conflicts?.length ||\n    group?.profileIds?.length > 1 ||",
  'el filtro de revisión');
preview = replaceRequired(preview,
  "    const scope = String(row.event_scope_key || `${row.source_key}:${row.event_id}`);",
  "    const scope = scopedEventKey(row);",
  'el agrupador de duplicados del preview');
preview = replaceRequired(preview,
  "              eventScopeKey: String(row.event_scope_key || `${row.source_key}:${row.event_id}`),",
  "              eventScopeKey: scopedEventKey(row),",
  'el scope enviado a la interfaz');

let reviewPage = current.reviewPage;
reviewPage = replaceRequired(reviewPage,
  "      const conflictLabels:Record<string,string>={MULTIPLE_PLAYER_IDS:'Varios Player ID',MULTIPLE_STEAM_GUIDS:'Varios Steam',MULTIPLE_USER_LINKS:'Varias cuentas',MULTIPLE_PROFILES:'Varios perfiles',COUNTRY_MISMATCH:'Países distintos',TEAM_MISMATCH:'Equipos distintos',AVATAR_MISMATCH:'Avatares distintos',DUPLICATE_EVENT_STATISTICS:'Resultados duplicados'};",
  "      // GC_PHASE4H2_3_IDENTITY_REVIEW_FALSE_POSITIVE_FIX_V1\n      const conflictLabels:Record<string,string>={MULTIPLE_PLAYER_IDS_SAME_SOURCE:'Varios Player ID en el mismo servidor',MULTIPLE_UNSCOPED_PLAYER_IDS:'Varios Player ID sin servidor conocido',MULTIPLE_STEAM_GUIDS:'Varios Steam',MULTIPLE_USER_LINKS:'Varias cuentas',MULTIPLE_PROFILES:'Varios perfiles',COUNTRY_MISMATCH:'Países distintos',TEAM_MISMATCH:'Equipos distintos',AVATAR_MISMATCH:'Avatares distintos',DUPLICATE_EVENT_STATISTICS:'Resultados duplicados en el mismo servidor y evento'};",
  'las etiquetas de conflicto');
reviewPage = replaceRequired(reviewPage,
  "if((group.statistics?.duplicateEventScopes||[]).length)return {tone:'danger',title:'Revisión manual obligatoria',text:'Hay más de un resultado atribuido al piloto en el mismo evento.'};if((group.driverKeys||[]).length>1||(group.profileIds||[]).length>1)return {tone:'',title:'Posible duplicado',text:'Puede ser la misma persona, pero confirma los datos antes de consolidar.'};",
  "if((group.statistics?.duplicateEventScopes||[]).length)return {tone:'danger',title:'Revisión manual obligatoria',text:'Hay más de un resultado atribuido al piloto en el mismo evento y servidor.'};if((group.profileIds||[]).length>1||(group.userIds||[]).length>1)return {tone:'',title:'Posible duplicado',text:'Puede ser la misma persona, pero confirma los perfiles y cuentas antes de consolidar.'};",
  'la recomendación de la revisión');

let auditPage = current.auditPage;
auditPage = replaceRequired(auditPage,
  "      function visible(group:JsonRecord){const mode=els.filter.value;const attention=group.conflicts?.length||group.driverKeys?.length>1||group.profileIds?.length>1;if(mode==='all')return true;if(mode==='conflicts')return group.conflicts?.length>0;if(mode==='merge')return group.driverKeys?.length>1||group.profileIds?.length>1;return attention}",
  "      // GC_PHASE4H2_3_IDENTITY_AUDIT_FALSE_POSITIVE_FIX_V1\n      function visible(group:JsonRecord){const mode=els.filter.value;const attention=group.conflicts?.length||group.profileIds?.length>1||group.userIds?.length>1;if(mode==='all')return true;if(mode==='conflicts')return group.conflicts?.length>0;if(mode==='merge')return group.profileIds?.length>1||group.userIds?.length>1;return attention}",
  'el filtro del auditor');

save(files.audit, audit);
save(files.preview, preview);
save(files.reviewPage, reviewPage);
save(files.auditPage, auditPage);

console.log('');
console.log('[GC Phase 4H.2.3] Falsos positivos multiserver corregidos.');
console.log(`[GC Phase 4H.2.3] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4H.2.3] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('No se ha ejecutado SQL ni se ha escrito en MySQL.');
console.log('Siguiente: npm run quality && npm run build');
