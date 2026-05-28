# GC Combo Detail Primary Clean Runtime v1

Fecha: 2026-05-28  
Pack: `GC_Combo_Detail_Primary_Clean_Runtime_v1`

## Contexto

Ya se limpiaron:

```txt
/app
/hotlaps
/combos
```

También se validó:

```txt
legacy server aliases verdes
/api/pilots y /api/drivers con estadísticas completas
/pilotos restaurado
```

Ahora toca limpiar la ficha dinámica:

```txt
/combos/:comboId
```

## Objetivo

Eliminar el runtime temporal:

```txt
GCComboDetailLegacyNetworkCut
```

sin tocar:

```txt
Combo Detail Data Core Primary
renderTrackImage endurecido
GCTrackImages fuzzy resolver
legacy server aliases
```

## Qué elimina

Bloque marcado:

```txt
GC_COMBO_DETAIL_LEGACY_NETWORK_CUT_V1
```

## Qué mantiene

```txt
/api/gc/combos/:comboId como fuente primaria
/api/combos/:comboId como alias legacy centralizado en servidor
gcComboDetailDataCore
gcComboDetailTrackImage = hardened-v1
GCTrackImages.version = v1.1
```

## Qué añade

Marcador limpio:

```js
document.documentElement.dataset.gcComboDetailRuntime
window.GCComboDetailRuntimeStatus()
```

Valor esperado:

```txt
data-core-primary-clean-v1
```

## Por qué es seguro ahora

Aunque la ficha o algún bloque viejo pidiera:

```txt
/api/combos/:comboId
```

ese endpoint ya no usa lógica antigua; ahora responde desde Data Core mediante:

```txt
source = gc-data-core-legacy-server-alias
```

## Aplicación

```powershell
node scripts/apply-gc-combo-detail-primary-clean-runtime-v1.cjs
npm run build
npm run dev
```

## Prueba

Abrir una ficha real:

```txt
http://localhost:4321/combos/47
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcComboDetailDataCore,
  version: document.documentElement.dataset.gcComboDetailDataCoreVersion,
  trackImage: document.documentElement.dataset.gcComboDetailTrackImage,
  runtime: document.documentElement.dataset.gcComboDetailRuntime,
  images: window.GCTrackImages?.version,
  status: window.GCComboDetailRuntimeStatus?.()
})
```

Resultado esperado:

```txt
dataCore = primary
version = v1
trackImage = hardened-v1
runtime = data-core-primary-clean-v1
images = v1.1
legacyNetworkCut = false
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```

## Próximo paso

Cuando esto quede verde, el bloque principal Race Data Core queda limpio:

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

Siguiente fase recomendada:

```txt
Data Core final audit + MD de arquitectura actual
```

antes de empezar rediseño visual fuerte.
