# GC UI Data Contract Global Cleanup v2

Fecha: 2026-05-28  
Pack: `GC_UI_Data_Contract_Global_Cleanup_v2`

## Motivo

La auditoría v1 detectó:

```txt
39 errores
93 warnings
160 endpoint hits
28 scripts temporales apply-gc
```

y confirmó que el problema ya no estaba en el backend, sino en UI/cliente:

```txt
renderers viejos
scripts temporales
endpoints legacy usados por páginas públicas
home usando endpoints antiguos
marcadores de network cut todavía presentes
```

## Qué corrige este pack

### 1. Limpieza de scripts temporales

Borra:

```txt
scripts/apply-gc-*.cjs
```

excepto el script que se está ejecutando.

También borra audits v1 obsoletos:

```txt
scripts/audit-gc-ui-data-contracts-v1.cjs
scripts/audit-gc-data-core-runtime-v1.cjs
```

porque ya daban falsos positivos sobre sus propias listas de marcadores.

### 2. Limpieza de marcadores antiguos

En páginas reales elimina o neutraliza:

```txt
GCAppLegacyGovernor
GCAppLegacyNetworkCut
GCHotlapsLegacyNetworkCut
GCCombosLegacyNetworkCut
GCComboDetailLegacyNetworkCut
GC_APP_GLOBAL_DIAGNOSTICS_LAPS_FIX_V1_6_MARKER
GC_APP_DATA_CORE_PRIMARY_V1
GC_APP_POSTPAINT_DIAGNOSTICS_FIX_V1_7
```

Mantiene el single renderer bueno:

```txt
GC_APP_SINGLE_RENDERER_V1_8
GC_APP_LEGACY_RENDERER_REMOVED_V1_9
renderSession()
```

### 3. Migración de endpoints en UI pública

Migra en páginas/componentes públicos:

```txt
/api/combos/stats -> /api/gc/combos
/api/combos/:id    -> /api/gc/combos/:id
/api/hotlaps       -> /api/gc/leaderboard
/api/laps          -> /api/gc/recent-laps
/api/stats/overview -> /api/gc/diagnostics
```

No toca el Endpoint Lab, porque ahí los legacy endpoints deben seguir existiendo para test.

### 4. Home metrics

Reemplaza `gcLoadLandingMetrics()` para que lea únicamente:

```txt
/api/gc/diagnostics
```

y pinte:

```txt
Hotlaps = validLapsCount
Pilotos = driversCount
Vueltas totales = lapsCount
```

### 5. /app servidor online

Añade lectura de:

```txt
raceData.oldestLapAt
```

para pintar:

```txt
Servidor online = X días
desde <fecha>
```

### 6. Auditoría v2

Crea:

```txt
scripts/audit-gc-ui-data-contracts-v2.cjs
```

y genera:

```txt
docs/GC_UI_DATA_CONTRACT_AUDIT_REPORT_V2.json
docs/GC_UI_DATA_CONTRACT_AUDIT_REPORT_V2.md
```

## Aplicación

```powershell
node scripts/apply-gc-ui-data-contract-global-cleanup-v2.cjs
npm run build
npm run dev
```

## Validación

```powershell
node scripts/audit-gc-ui-data-contracts-v2.cjs
```

Luego:

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
```

Aceptable:

```txt
fails = 0
```

## Revisión visual

```txt
/
/app
/hotlaps
/combos
/combos/36
/pilotos
```

En home:

```txt
Hotlaps ya no debe ser 11 si hay miles de vueltas válidas
Pilotos ya no debe ser 1
Vueltas totales debe seguir en 11.789 aprox.
```

En `/app`:

```txt
Vueltas servidor = 11.789 aprox.
Servidor online = días reales
Cuenta/Rol/Piloto rellenos
```

## Antes de commit

Borrar el script temporal actual:

```powershell
del scripts\apply-gc-ui-data-contract-global-cleanup-v2.cjs
```

Luego:

```powershell
git status
git add .
git commit -m "Clean UI data contracts and remove legacy renderers"
git push origin main
```
