# GC Hotlaps Legacy Network Cut v1

Fecha: 2026-05-28  
Pack: `GC_Hotlaps_Legacy_Network_Cut_v1`

## Objetivo

Cortar la red legacy en `/hotlaps` sin borrar todavía scripts antiguos.

Ya está validado:

```txt
/hotlaps Data Core primary = primary
/hotlaps Data Core version = v1.1
```

Ahora evitamos que cualquier lógica vieja siga pegando a endpoints legacy.

## Qué intercepta solo en `/hotlaps`

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/pilots
/api/drivers
```

## Mapeo

```txt
/api/hotlaps
→ /api/gc/leaderboard?scope=activeCombo

/api/laps recent
→ /api/gc/recent-laps?scope=activeCombo

/api/laps oldest/asc
→ /api/gc/diagnostics

/api/combos/stats
→ /api/gc/combos?limit=1000&sort=recent

/api/pilots
→ derivado de /api/gc/recent-laps?scope=global

/api/drivers
→ derivado de /api/gc/recent-laps?scope=global
```

## Qué NO hace

No borra todavía:

```txt
scripts legacy
endpoints server legacy
fallback visual
```

## Estado expuesto

```js
window.GCHotlapsLegacyNetworkCut.status()
document.documentElement.dataset.gcHotlapsLegacyNetwork
document.documentElement.dataset.gcHotlapsDataCore
document.documentElement.dataset.gcHotlapsDataCoreVersion
```

Resultado esperado:

```txt
gcHotlapsDataCore = primary
gcHotlapsDataCoreVersion = v1.1
gcHotlapsLegacyNetwork = cut-v1
```

## Aplicación

```powershell
node scripts/apply-gc-hotlaps-legacy-network-cut-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/hotlaps
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcHotlapsDataCore,
  version: document.documentElement.dataset.gcHotlapsDataCoreVersion,
  legacyNetwork: window.GCHotlapsLegacyNetworkCut?.status?.()
})
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

## Próximo paso

Si `/hotlaps` queda limpio:

```txt
/combos Legacy Network Cut
```
