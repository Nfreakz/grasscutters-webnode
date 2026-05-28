# GC Combo Public Min Drivers + Zolder Merge v1.2

Fecha: 2026-05-28  
Pack: `GC_Combo_Public_Min_Drivers_Zolder_Merge_v1_2`

## Problemas detectados

En `/combos` seguían apareciendo:

```txt
combos con 1 solo piloto
dos Zolder separados:
- Zolder con 1257 vueltas
- Nrms Zolder Zolder2017online con 5 vueltas
```

## Nueva regla pública

Un combo solo debe aparecer en `/combos` si la variante principal tiene:

```txt
driversCount >= 2
totalLaps > 0
```

Valor configurable:

```txt
GC_COMBO_MIN_PUBLIC_DRIVERS=2
```

## Qué NO cambia

Los datos siguen existiendo en Stracker/Data Core.

Este filtro NO afecta a:

```txt
/pilotos
/api/pilots
/api/drivers
/api/gc/diagnostics
/api/gc/recent-laps
/api/gc/leaderboard
/hotlaps
/app global totals
```

Solo afecta al listado público de combos:

```txt
/api/gc/combos
/api/combos/stats
/combos
```

Las fichas directas pueden seguir respondiendo si se entra por URL, para no perder diagnóstico.

## Mejora de agrupación

Añade alias/normalización para fusionar mejor variantes como:

```txt
rt_zolder
nrms_zolder
zolder2017online
zolder_2017_online
circuit_zolder
terlaemen
```

bajo:

```txt
Zolder
```

También mejora:

```txt
Phillip Island / Phillip Island 2013
Mugello / rt_mugello_gp / mx_mugello
Hockenheim / VHE Hockenheim
Sebring
Spa
Brands Hatch
```

## Aplicación

```powershell
node scripts/apply-gc-combo-public-min-drivers-zolder-merge-v1-2.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/gc/combos?limit=100&sort=recent
```

Comprobar:

```txt
No deberían salir combos con driversCount = 1
Zolder debería quedar agrupado si las variantes entran en los aliases
policy.minPublicDrivers = 2
```

## Prueba visual

```txt
http://localhost:4321/combos
```

Resultado esperado:

```txt
Desaparecen combos de 1 piloto
Desaparece el Zolder de 5 vueltas como card independiente
Zolder principal mantiene sus vueltas y coches válidos
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```
