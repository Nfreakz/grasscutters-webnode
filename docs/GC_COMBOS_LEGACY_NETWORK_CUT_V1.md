# GC Combos Legacy Network Cut v1

Fecha: 2026-05-28  
Pack: `GC_Combos_Legacy_Network_Cut_v1`

## Objetivo

Cortar la red legacy en `/combos` sin borrar todavía scripts antiguos.

Ya está validado:

```txt
/combos Data Core primary = primary
GCTrackImages fuzzy resolver = v1.1
```

Ahora evitamos que cualquier lógica vieja siga pegando a endpoints legacy.

## Qué intercepta solo en `/combos`

```txt
/api/combos/stats
/api/combos/:comboId
/api/hotlaps
/api/laps
/api/pilots
/api/drivers
/api/stats/overview
```

## Mapeo

```txt
/api/combos/stats
→ /api/gc/combos?limit=1000&sort=recent

/api/combos/:comboId
→ /api/gc/combos/:comboId

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

## Qué NO hace

No borra todavía:

```txt
scripts legacy
endpoints server legacy
fallback visual
fuzzy resolver de imágenes
```

## Estado expuesto

```js
window.GCCombosLegacyNetworkCut.status()
document.documentElement.dataset.gcCombosLegacyNetwork
document.documentElement.dataset.gcCombosDataCore
document.documentElement.dataset.gcCombosDataCoreVersion
GCTrackImages.version
```

Resultado esperado:

```txt
gcCombosDataCore = primary
gcCombosDataCoreVersion = v1
gcCombosLegacyNetwork = cut-v1
GCTrackImages.version = v1.1
```

## Aplicación

```powershell
node scripts/apply-gc-combos-legacy-network-cut-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcCombosDataCore,
  version: document.documentElement.dataset.gcCombosDataCoreVersion,
  images: window.GCTrackImages?.version,
  legacyNetwork: window.GCCombosLegacyNetworkCut?.status?.()
})
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

## Próximo paso

Si `/combos` queda limpio:

```txt
/combos/:comboId Legacy Network Cut
```

o pasar a eliminar scripts legacy reales si ya no hay llamadas.
