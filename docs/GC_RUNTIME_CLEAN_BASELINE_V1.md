# GC Runtime Clean Baseline v1

Fecha: 2026-05-28

## Objetivo

Registrar qué runtime temporal ya fue retirado tras convertir legacy server endpoints en aliases Data Core.

## Runtime temporal eliminado

| Página | Runtime eliminado | Estado |
|---|---|---|
| /app | GCAppLegacyGovernor | eliminado |
| /app | GCAppLegacyNetworkCut | eliminado |
| /hotlaps | GCHotlapsLegacyNetworkCut | eliminado |
| /combos | GCCombosLegacyNetworkCut | eliminado |
| /combos/:comboId | GCComboDetailLegacyNetworkCut | eliminado |

## Runtime limpio esperado

| Página | Marker |
|---|---|
| /app | gcAppRuntime = data-core-primary-clean-v1 |
| /hotlaps | gcHotlapsRuntime = data-core-primary-clean-v1 |
| /combos | gcCombosRuntime = data-core-primary-clean-v1 |
| /combos/:comboId | gcComboDetailRuntime = data-core-primary-clean-v1 |

## Runtime Data Core esperado

| Página | Marker Data Core |
|---|---|
| /app | gcAppDataCore = primary |
| /hotlaps | gcHotlapsDataCore = primary |
| /combos | gcCombosDataCore = primary |
| /combos/:comboId | gcComboDetailDataCore = primary |

## Imagen de circuito

| Página | Marker |
|---|---|
| /combos | GCTrackImages.version = v1.1 |
| /combos/:comboId | gcComboDetailTrackImage = hardened-v1 |

## Comandos de revisión rápida

```js
// /app
window.GCAppRuntimeStatus?.()

// /hotlaps
window.GCHotlapsRuntimeStatus?.()

// /combos
window.GCCombosRuntimeStatus?.()

// /combos/:comboId
window.GCComboDetailRuntimeStatus?.()
```

## Auditoría estática

Ejecutar:

```powershell
node scripts/audit-gc-data-core-runtime-v1.cjs
```

Debe terminar con:

```txt
ok: true
fails: 0
```
