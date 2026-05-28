# GC Combo Detail Data Core Primary v1

Fecha: 2026-05-28  
Pack: `GC_Combo_Detail_Data_Core_Primary_v1`

## Objetivo

Cerrar la ficha dinámica de combo como Data Core primary.

Ya teníamos:

```txt
/app      → Data Core primary
/hotlaps  → Data Core primary
/combos   → Data Core primary
```

Pero la ficha:

```txt
/combos/:comboId
```

todavía leía:

```txt
/api/combos/:comboId
```

que es legacy.

## Qué añade

Nuevo endpoint canónico:

```txt
GET /api/gc/combos/:comboId
```

## Qué modifica

La página:

```txt
src/pages/combos/[comboId].astro
```

ahora intenta primero:

```txt
/api/gc/combos/:comboId
```

y solo si falla cae a:

```txt
/api/combos/:comboId
```

## Respuesta del endpoint

```json
{
  "ok": true,
  "source": "gc-data-core",
  "item": {
    "comboId": 47,
    "track": {},
    "trackName": "Mugello",
    "cars": [],
    "summary": {},
    "leaderboard": [],
    "recentLaps": []
  }
}
```

## Qué calcula

Desde Race Data Core / Stracker:

```txt
combo
track
cars
summary
totalLaps
validLaps
driversCount
bestLap
bestLapTime
best10Average
maxSpeedKmh
lastSeenAt
leaderboard
recentLaps
```

## Qué mantiene

El formato de `item` es compatible con la ficha actual para no rediseñar nada todavía.

## Estado expuesto

En la ficha:

```js
document.documentElement.dataset.gcComboDetailDataCore
document.documentElement.dataset.gcComboDetailDataCoreVersion
```

Valores esperados:

```txt
primary
legacy-fallback
```

## Qué NO toca

```txt
UI visual de ficha
fuzzy resolver de imágenes
/combos cards
/hotlaps
/app
/pitwall
assets
```

## Aplicación

```powershell
node scripts/apply-gc-combo-detail-data-core-primary-v1.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/gc/combos/47
```

## Prueba de página

```txt
http://localhost:4321/combos/47
```

En consola:

```js
document.documentElement.dataset.gcComboDetailDataCore
document.documentElement.dataset.gcComboDetailDataCoreVersion
```

Resultado esperado:

```txt
primary
v1
```

Si sale:

```txt
legacy-fallback
```

significa que el endpoint nuevo no ha encontrado el combo o ha fallado y la página ha caído al sistema viejo.

## Próximo paso

Cuando esto esté en `primary`, tendremos los bloques principales de Race Data Core ya alineados:

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

Entonces podemos preparar:

```txt
Legacy Removal Plan
```

sin romper nada.
