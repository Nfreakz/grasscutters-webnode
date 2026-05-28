# GC Combo Canonical Public Filter v1

Fecha: 2026-05-28  
Pack: `GC_Combo_Canonical_Public_Filter_v1`

## Objetivo

Aplicar la lógica acordada para `/combos`:

```txt
Agrupar variantes de circuito bajo un combo canónico
Elegir como variante principal la que más vueltas válidas tiene
Mostrar solo coches de esa variante principal con al menos 5 vueltas
No alterar datos globales de la web
```

## Alcance

Este cambio afecta solo a:

```txt
/api/gc/combos
/api/gc/combos/:comboId
/api/combos/stats
/api/combos/:comboId
```

No afecta a:

```txt
/api/gc/diagnostics
/api/gc/recent-laps
/api/gc/leaderboard
/api/pilots
/api/drivers
/pilotos
/app global totals
/hotlaps
```

## Lógica nueva

### 1. Agrupación canónica

Agrupa variantes parecidas de circuito:

```txt
mx_mugello
rt_mugello_gp
ks_mugello
```

bajo:

```txt
Mugello
```

También aplica a casos como:

```txt
rt_zolder
nrs_zolder_2017online

phillip_island
phillip_island_2013
```

## 2. Variante principal

Para cada grupo canónico, selecciona la variante principal por:

```txt
1. más vueltas válidas
2. si empata, más vueltas totales
3. si empata, actividad más reciente
```

Futuro:

```txt
adminOverride
official
validLaps
totalLaps
lastSeen
```

## 3. Coches públicos del combo

Los coches visibles del combo salen únicamente de la variante principal.

Regla:

```txt
publicComboCars = coches de mainVariant con totalLaps >= 5
```

El mínimo se puede cambiar con:

```txt
GC_COMBO_MIN_PUBLIC_CAR_LAPS=5
```

## 4. Coches ocultos por pocas vueltas

Si un coche tiene menos de 5 vueltas en la variante principal, no se muestra como coche del combo público, pero queda registrado:

```txt
hiddenLowLapCars
mainVariantAllCars
allCars
```

## Respuesta nueva

Cada combo incluye:

```txt
canonicalKey
canonicalTrackName
mainVariant
variants
variantsCount
cars
publicComboCars
mainVariantAllCars
hiddenLowLapCars
allCars
summary
leaderboard
recentLaps
publicPolicy
```

## Importante

Los totales de `summary.totalLaps`, `summary.validLaps`, `leaderboard` y `recentLaps` usan la variante principal.

Los totales canónicos completos quedan en:

```txt
summary.canonicalTotalLaps
summary.canonicalValidLaps
summary.canonicalDriversCount
```

## Aplicación

```powershell
node scripts/apply-gc-combo-canonical-public-filter-v1.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/gc/combos?limit=100&sort=recent
http://localhost:4321/api/gc/combos/47
http://localhost:4321/api/combos/stats?limit=100&sort=recent
http://localhost:4321/api/combos/47
```

Comprobar:

```txt
comboCore = gc-combo-canonical-public-filter-v1
policy.minPublicCarLaps = 5
items[].variantsCount
items[].mainVariant
items[].publicComboCars
items[].hiddenLowLapCars
```

## Prueba visual

```txt
http://localhost:4321/combos
http://localhost:4321/combos/47
```

Resultado esperado:

```txt
menos duplicados de Zolder / Phillip Island / Mugello
coches de prueba con menos de 5 vueltas ocultos en combos
resto de datos globales sin cambios
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```
