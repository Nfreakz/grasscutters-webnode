# GC UI Data Contract Audit Report v1

Fecha: 2026-05-28T11:43:35.732Z

## Resumen

| Métrica | Valor |
|---|---:|
| Errores | 39 |
| Warnings | 93 |
| Info | 22 |
| Archivos escaneados | 136 |
| Endpoint hits | 160 |
| Scripts temporales apply-gc | 28 |

## Contratos autoritarios

| Área | Fuente correcta |
|---|---|
| global_server_totals | /api/gc/diagnostics |
| public_combo_card | /api/gc/combos?limit=1&sort=recent, /api/gc/combos |
| hotlaps_ranking | /api/gc/leaderboard |
| pilot_directory | /api/pilots, /api/drivers, /api/gc/pilots/:playerId/profile |
| session_identity | /api/gc/identity/me, /api/admin/status |

## Issues

| Severidad | Categoría | Archivo | Línea | Mensaje |
|---|---|---|---:|---|
| error | wrong-global-source | scripts/apply-gc-app-data-core-bridge-v1.cjs | 1 | Esta página parece usar /api/gc/snapshot para métricas globales sin /api/gc/diagnostics. Riesgo de contadores capados tipo 500. |
| error | wrong-global-source | scripts/apply-gc-app-data-core-primary-v1.cjs | 1 | Esta página parece usar /api/gc/snapshot para métricas globales sin /api/gc/diagnostics. Riesgo de contadores capados tipo 500. |
| error | old-renderer-marker | scripts/apply-gc-app-data-core-primary-v1.cjs | 14 | Marcador/renderer antiguo detectado: GC_APP_DATA_CORE_PRIMARY_V1_START |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 25 | Marcador/renderer antiguo detectado: GC_APP_DATA_CORE_PRIMARY_V1_START |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 34 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 80 | Marcador/renderer antiguo detectado: Legacy Governor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 131 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 158 | Marcador/renderer antiguo detectado: Legacy Governor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 192 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 199 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 200 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 201 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 213 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 218 | Marcador/renderer antiguo detectado: Legacy Governor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 274 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 277 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/apply-gc-app-legacy-governor-v1.cjs | 283 | Marcador/renderer antiguo detectado: Legacy Governor |
| error | old-renderer-marker | scripts/audit-gc-data-core-runtime-v1.cjs | 15 | Marcador/renderer antiguo detectado: GC_APP_DATA_CORE_PRIMARY_V1_START |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 131 | Marcador/renderer antiguo detectado: GC_APP_DATA_CORE_PRIMARY_V1_START |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 132 | Marcador/renderer antiguo detectado: GC_APP_POSTPAINT_DIAGNOSTICS_FIX_V1_7_START |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 133 | Marcador/renderer antiguo detectado: GC_APP_GLOBAL_DIAGNOSTICS_LAPS_FIX_V1_6_MARKER |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 134 | Marcador/renderer antiguo detectado: [GC /app v6.3 panel fix] |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 135 | Marcador/renderer antiguo detectado: function loadDashboard() |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 136 | Marcador/renderer antiguo detectado: renderMetrics({ pilotsData |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 137 | Marcador/renderer antiguo detectado: renderCombo(combosData |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 139 | Marcador/renderer antiguo detectado: Legacy Governor |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 140 | Marcador/renderer antiguo detectado: Legacy Network Cut |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 141 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 142 | Marcador/renderer antiguo detectado: GCAppLegacyNetworkCut |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 143 | Marcador/renderer antiguo detectado: GCHotlapsLegacyNetworkCut |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 144 | Marcador/renderer antiguo detectado: GCCombosLegacyNetworkCut |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 145 | Marcador/renderer antiguo detectado: GCComboDetailLegacyNetworkCut |
| error | old-renderer-marker | scripts/audit-gc-ui-data-contracts-v1.cjs | 285 | Marcador/renderer antiguo detectado: [GC /app v6.3 panel fix] |
| error | old-renderer-marker | src/pages/app.astro | 1263 | Marcador/renderer antiguo detectado: GCAppLegacyGovernor |
| error | old-renderer-marker | src/pages/app.astro | 1264 | Marcador/renderer antiguo detectado: GCAppLegacyNetworkCut |
| error | old-renderer-marker | src/pages/app.astro | 1281 | Marcador/renderer antiguo detectado: GC_APP_GLOBAL_DIAGNOSTICS_LAPS_FIX_V1_6_MARKER |
| error | old-renderer-marker | src/pages/combos.astro | 2273 | Marcador/renderer antiguo detectado: GCCombosLegacyNetworkCut |
| error | old-renderer-marker | src/pages/combos/[comboId].astro | 1139 | Marcador/renderer antiguo detectado: GCComboDetailLegacyNetworkCut |
| error | old-renderer-marker | src/pages/hotlaps.astro | 1414 | Marcador/renderer antiguo detectado: GCHotlapsLegacyNetworkCut |
| warn | temporary-script | scripts/apply-gc-admin-endpoint-lab-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-admin-lab-combo-detail-coverage-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-app-data-core-bridge-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-app-data-core-primary-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-app-legacy-governor-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | scripts/apply-gc-app-legacy-governor-v1.cjs | 37 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-app-legacy-governor-v1.cjs | 38 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-app-legacy-governor-v1.cjs | 39 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-app-legacy-governor-v1.cjs | 39 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-app-legacy-governor-v1.cjs | 40 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | temporary-script | scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-archive-core-skeleton-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-championship-core-skeleton-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 4 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 440 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 447 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | temporary-script | scripts/apply-gc-combo-detail-image-after-datacore-fix-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-combos-data-core-bridge-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-combos-data-core-primary-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-data-core-display-names-guard-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-data-core-lab-fixes-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-data-core-names-pipeline-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-data-core-v1-1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 42 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 42 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 42 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 42 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 42 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 237 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 238 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 239 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 239 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 240 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 452 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 453 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 455 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 455 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 456 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-data-core-v1-1.cjs | 457 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | temporary-script | scripts/apply-gc-hotlaps-data-core-bridge-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | scripts/apply-gc-hotlaps-data-core-bridge-v1.cjs | 5 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | temporary-script | scripts/apply-gc-hotlaps-data-core-primary-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-hotlaps-primary-v1-1-metric-fix.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-identity-profile-core-v1-1-fix.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-identity-profile-core-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-legacy-removal-plan-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 76 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 77 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 78 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 78 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 79 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 80 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 223 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 224 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 225 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 225 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 226 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 227 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 363 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 364 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 365 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 365 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 366 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | scripts/apply-gc-legacy-removal-plan-v1.cjs | 367 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | temporary-script | scripts/apply-gc-pitwall-preview-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-race-data-core-diagnostics-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-stracker-cache-guard-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-track-image-404-guard-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-track-image-client-guard-v1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | temporary-script | scripts/apply-gc-track-image-fuzzy-resolver-v1-1.cjs | 1 | Script temporal apply-gc todavía presente. Borrarlo antes de commit. |
| warn | legacy-endpoint-ui | src/components/PaletteCursor.astro | 690 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/components/PaletteCursor.astro | 690 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/components/PaletteCursor.astro | 691 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/components/PaletteCursor.astro | 692 | UI/cliente usa endpoint legacy /api/laps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/acsm/loading-card.svg.ts | 609 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/acsm/loading-card.svg.ts | 609 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/acsm/loading-card.svg.ts | 610 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos.astro | 1741 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos.astro | 1741 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos.astro | 1749 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos.astro | 1749 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos/[comboId].astro | 1040 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/combos/[trackId]/[carId].astro | 83 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/hotlaps.astro | 870 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/hotlaps.astro | 895 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/index.astro | 1907 | UI/cliente usa endpoint legacy /api/combos/stats. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/index.astro | 1907 | UI/cliente usa endpoint legacy /api/combos/. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/index.astro | 1962 | UI/cliente usa endpoint legacy /api/stats/overview. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/index.astro | 1963 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/pages/pilotos.astro | 922 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/server/routes/api.ts | 46 | UI/cliente usa endpoint legacy /api/stracker/status. Revisar si debe migrar a endpoint canónico. |
| warn | legacy-endpoint-ui | src/server/routes/api.ts | 61 | UI/cliente usa endpoint legacy /api/hotlaps. Revisar si debe migrar a endpoint canónico. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcMetricLaps se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcQuickRefs se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcMetricDrivers se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcMetricCombos se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcMetricLastActivity se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcQuickDb se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcQuickDbMeta se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboTrack se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboHint se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboLaps se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboDrivers se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboFamily se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcComboCars se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcAppComboChip se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcTopDriverName se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcTopDriverTime se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcTopDriverMeta se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-data-core-bridge-v1.cjs, scripts/apply-gc-app-data-core-primary-v1.cjs, src/pages/app.astro | 0 | El ID gcTopDriverAvatar se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs, src/pages/app.astro | 0 | El ID gcAppSessionState se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs, src/pages/app.astro | 0 | El ID gcAppSessionUser se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs, src/pages/app.astro | 0 | El ID gcAppSessionRole se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |
| info | dom-writer-cross-file | scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs, src/pages/app.astro | 0 | El ID gcAppSessionPilot se escribe desde varios archivos. Puede ser correcto si son páginas distintas, pero revisar si comparten layout. |

## Legacy endpoint hits

| Endpoint | Archivo | Línea | Nota |
|---|---|---:|---|
| /api/hotlaps | scripts/apply-gc-app-legacy-governor-v1.cjs | 37 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | scripts/apply-gc-app-legacy-governor-v1.cjs | 38 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | scripts/apply-gc-app-legacy-governor-v1.cjs | 39 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | scripts/apply-gc-app-legacy-governor-v1.cjs | 39 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | scripts/apply-gc-app-legacy-governor-v1.cjs | 40 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/combos/ | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 4 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 440 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-combo-detail-data-core-primary-v1.cjs | 447 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/hotlaps | scripts/apply-gc-data-core-v1-1.cjs | 42 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/apply-gc-data-core-v1-1.cjs | 237 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/apply-gc-data-core-v1-1.cjs | 452 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | scripts/apply-gc-data-core-v1-1.cjs | 42 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | scripts/apply-gc-data-core-v1-1.cjs | 238 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | scripts/apply-gc-data-core-v1-1.cjs | 453 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | scripts/apply-gc-data-core-v1-1.cjs | 42 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | scripts/apply-gc-data-core-v1-1.cjs | 239 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | scripts/apply-gc-data-core-v1-1.cjs | 455 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | scripts/apply-gc-data-core-v1-1.cjs | 42 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-data-core-v1-1.cjs | 239 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-data-core-v1-1.cjs | 455 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-data-core-v1-1.cjs | 456 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | scripts/apply-gc-data-core-v1-1.cjs | 42 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | scripts/apply-gc-data-core-v1-1.cjs | 240 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | scripts/apply-gc-data-core-v1-1.cjs | 457 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/hotlaps | scripts/apply-gc-hotlaps-data-core-bridge-v1.cjs | 5 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 76 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 223 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 363 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 77 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 224 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | scripts/apply-gc-legacy-removal-plan-v1.cjs | 364 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | scripts/apply-gc-legacy-removal-plan-v1.cjs | 78 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | scripts/apply-gc-legacy-removal-plan-v1.cjs | 225 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | scripts/apply-gc-legacy-removal-plan-v1.cjs | 365 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 78 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 80 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 225 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 227 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 365 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/apply-gc-legacy-removal-plan-v1.cjs | 367 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | scripts/apply-gc-legacy-removal-plan-v1.cjs | 79 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | scripts/apply-gc-legacy-removal-plan-v1.cjs | 226 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | scripts/apply-gc-legacy-removal-plan-v1.cjs | 366 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/hotlaps | scripts/audit-gc-data-core-runtime-v1.cjs | 66 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | scripts/audit-gc-data-core-runtime-v1.cjs | 67 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | scripts/audit-gc-data-core-runtime-v1.cjs | 68 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | scripts/audit-gc-data-core-runtime-v1.cjs | 68 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/audit-gc-data-core-runtime-v1.cjs | 69 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | scripts/audit-gc-data-core-runtime-v1.cjs | 72 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/hotlaps | scripts/audit-gc-ui-data-contracts-v1.cjs | 86 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/audit-gc-ui-data-contracts-v1.cjs | 105 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | scripts/audit-gc-ui-data-contracts-v1.cjs | 122 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | scripts/audit-gc-ui-data-contracts-v1.cjs | 85 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | scripts/audit-gc-ui-data-contracts-v1.cjs | 123 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | scripts/audit-gc-ui-data-contracts-v1.cjs | 97 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | scripts/audit-gc-ui-data-contracts-v1.cjs | 124 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | scripts/audit-gc-ui-data-contracts-v1.cjs | 97 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/audit-gc-ui-data-contracts-v1.cjs | 124 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/audit-gc-ui-data-contracts-v1.cjs | 125 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | scripts/audit-gc-ui-data-contracts-v1.cjs | 264 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | scripts/audit-gc-ui-data-contracts-v1.cjs | 87 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | scripts/audit-gc-ui-data-contracts-v1.cjs | 126 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stracker/status | scripts/audit-gc-ui-data-contracts-v1.cjs | 127 | legacy status only; UI should prefer /api/gc/diagnostics or cache/status |
| /api/hotlaps | src/components/PaletteCursor.astro | 691 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | src/components/PaletteCursor.astro | 692 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | src/components/PaletteCursor.astro | 690 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/components/PaletteCursor.astro | 690 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/hotlaps | src/pages/acsm/loading-card.svg.ts | 610 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/combos/stats | src/pages/acsm/loading-card.svg.ts | 609 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/pages/acsm/loading-card.svg.ts | 609 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/hotlaps | src/pages/admin/endpoints.astro | 324 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | src/pages/admin/endpoints.astro | 325 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | src/pages/admin/endpoints.astro | 326 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/pages/admin/endpoints.astro | 326 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/pages/admin/endpoints.astro | 328 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | src/pages/admin/endpoints.astro | 327 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/combos/stats | src/pages/combos.astro | 1741 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/pages/combos.astro | 1749 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/pages/combos.astro | 1741 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/pages/combos.astro | 1749 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/pages/combos/[comboId].astro | 1040 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/pages/combos/[trackId]/[carId].astro | 83 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/hotlaps | src/pages/hotlaps.astro | 870 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/pages/hotlaps.astro | 895 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/pages/index.astro | 1963 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/combos/stats | src/pages/index.astro | 1907 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/pages/index.astro | 1907 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | src/pages/index.astro | 1962 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/hotlaps | src/pages/pilotos.astro | 922 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 1779 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 2032 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 8442 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 8465 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 8474 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 8479 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 8482 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 9059 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 9968 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 10163 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 11939 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/hotlaps | src/server/index.ts | 11944 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/laps | src/server/index.ts | 2033 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 8488 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 8523 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 8532 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 8537 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 8540 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 9097 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 9968 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/laps | src/server/index.ts | 10164 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/recent-laps or diagnostics |
| /api/combos/stats | src/server/index.ts | 8340 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8355 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8371 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8377 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8546 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8576 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8587 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8592 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 8595 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 9730 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 9968 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/stats | src/server/index.ts | 10165 | legacy alias only; UI should prefer /api/gc/combos |
| /api/combos/ | src/server/index.ts | 8340 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8355 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8371 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8377 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8386 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8401 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8413 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8427 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8433 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8546 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8576 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8587 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8592 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8595 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8601 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8623 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8637 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8648 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8653 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 8655 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 9730 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 9777 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 9814 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 9835 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 9968 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/combos/ | src/server/index.ts | 10165 | legacy alias only; UI should prefer /api/gc/combos/:comboId |
| /api/stats/overview | src/server/index.ts | 2041 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9005 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9028 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9045 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9050 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9051 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9916 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 9968 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stats/overview | src/server/index.ts | 10166 | legacy alias only; UI should prefer /api/gc/diagnostics |
| /api/stracker/status | src/server/index.ts | 6856 | legacy status only; UI should prefer /api/gc/diagnostics or cache/status |
| /api/hotlaps | src/server/routes/api.ts | 61 | only if legacy alias compatibility is intentional; UI should prefer /api/gc/leaderboard |
| /api/stracker/status | src/server/routes/api.ts | 46 | legacy status only; UI should prefer /api/gc/diagnostics or cache/status |

## Próximo paso

No subir todavía. Preparar un pack de corrección global usando este informe.