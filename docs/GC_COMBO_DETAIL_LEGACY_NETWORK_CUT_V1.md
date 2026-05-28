# GC Combo Detail Legacy Network Cut v1

Fecha: 2026-05-28  
Pack: `GC_Combo_Detail_Legacy_Network_Cut_v1`

## Objetivo

Cortar llamadas legacy en la ficha:

```txt
/combos/:comboId
```

sin romper el fallback real.

## Detalle importante

La ficha ya hace:

```txt
1. /api/gc/combos/:comboId
2. si falla, /api/combos/:comboId
```

Ese fallback es útil durante transición.

Por eso este pack **no bloquea** `/api/combos/:comboId` si Data Core todavía no ha marcado:

```txt
gcComboDetailDataCore = primary
```

Solo después de estar en primary, cualquier llamada legacy secundaria se aliasa a Data Core.

## Qué intercepta en `/combos/:comboId`

```txt
/api/combos/:comboId
/api/combos/stats
/api/hotlaps
/api/laps
/api/pilots
/api/drivers
/api/stats/overview
```

## Mapeo

```txt
/api/combos/:comboId
→ /api/gc/combos/:comboId

/api/combos/stats
→ /api/gc/combos?limit=1000&sort=recent

/api/hotlaps
→ /api/gc/leaderboard?scope=activeCombo

/api/laps recent
→ /api/gc/recent-laps?scope=global

/api/laps oldest/asc
→ /api/gc/diagnostics

/api/pilots
→ derivado de /api/gc/recent-laps?scope=global

/api/drivers
→ derivado de /api/gc/recent-laps?scope=global

/api/stats/overview
→ derivado de /api/gc/diagnostics
```

## Qué NO toca

```txt
/api/gc/combos/:comboId
renderTrackImage()
GCTrackImages
fuzzy resolver
assets
/app
/hotlaps
/combos
server endpoints
```

## Estado expuesto

```js
window.GCComboDetailLegacyNetworkCut.status()
document.documentElement.dataset.gcComboDetailLegacyNetwork
document.documentElement.dataset.gcComboDetailDataCore
document.documentElement.dataset.gcComboDetailTrackImage
```

Resultado esperado:

```txt
dataCore = primary
trackImage = hardened-v1
legacyNetwork = cut-v1 / cut-ready
```

## Aplicación

```powershell
node scripts/apply-gc-combo-detail-legacy-network-cut-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos/47
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcComboDetailDataCore,
  version: document.documentElement.dataset.gcComboDetailDataCoreVersion,
  trackImage: document.documentElement.dataset.gcComboDetailTrackImage,
  images: window.GCTrackImages?.version,
  legacyNetwork: window.GCComboDetailLegacyNetworkCut?.status?.()
})
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

## Próximo paso

Si queda correcto, ya estarán cubiertas:

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

Entonces podemos pasar a una fase de eliminación de scripts legacy reales, empezando por `/app`.
