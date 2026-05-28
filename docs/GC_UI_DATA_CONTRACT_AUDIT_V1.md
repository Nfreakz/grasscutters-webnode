# GC UI Data Contract Audit v1

Fecha: 2026-05-28  
Pack: `GC_UI_Data_Contract_Audit_v1`

## Objetivo

Parar los parches por síntomas y auditar toda la web para detectar:

```txt
endpoints legacy usados en UI
snapshot usado para métricas globales
combos visibles pintados sin /api/gc/combos
renderers antiguos todavía vivos
IDs del DOM escritos por varios scripts
scripts temporales apply-gc pendientes
marcadores requeridos ausentes
```

## Contratos de datos que queremos cerrar

### Global server totals

Fuente correcta:

```txt
/api/gc/diagnostics
```

No usar para totales globales:

```txt
/api/gc/snapshot
/api/gc/recent-laps
/api/laps
/api/hotlaps
/api/stats/overview
```

### Combo público visible

Fuente correcta:

```txt
/api/gc/combos?limit=1&sort=recent
```

No usar para combo público:

```txt
/api/gc/snapshot
/api/gc/active-combo
/api/combos/stats
```

### Hotlaps

Fuente correcta:

```txt
/api/gc/leaderboard
```

### Sesión / cuenta / rol / piloto

Fuente correcta:

```txt
/api/gc/identity/me
/api/admin/status
```

## Aplicación

```powershell
node scripts/audit-gc-ui-data-contracts-v1.cjs
```

## Salidas

```txt
docs/GC_UI_DATA_CONTRACT_AUDIT_REPORT_V1.json
docs/GC_UI_DATA_CONTRACT_AUDIT_REPORT_V1.md
```

## Cómo interpretar

Si termina con exit code 2:

```txt
hay errores críticos
no subir todavía
```

Si termina con `ok: true`:

```txt
no hay errores críticos
revisar warnings antes de commit
```

## Importante

Este script no modifica nada. Solo audita.

Después de ejecutar, pega aquí el resumen o el JSON/MD y hacemos un único pack de corrección global.
