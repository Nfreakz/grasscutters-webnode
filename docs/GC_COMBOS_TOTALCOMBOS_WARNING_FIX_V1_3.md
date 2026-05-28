# GC Combos totalCombos Warning Fix v1.3

Fecha: 2026-05-28  
Pack: `GC_Combos_totalCombos_Warning_Fix_v1_3`

## Problema

Endpoint Lab muestra:

```txt
fails = 0
warnings = 3
```

Warning real nuevo:

```txt
combos-core
/api/gc/combos?limit=100&sort=recent
totalCombos vacío
```

Los otros dos warnings son Archive Core sin fuente pública, ya esperados.

## Causa

Tras el filtro canónico, `/api/gc/combos` devuelve:

```txt
count
totalMatched
items
```

pero el Endpoint Lab espera también:

```txt
totalCombos
```

## Solución

Añade a `/api/gc/combos`:

```txt
totalCombos
publicCombos
rawCombos
```

No cambia la lógica de combos.

## Qué NO toca

```txt
agrupación canónica
min drivers
min laps por coche
/hotlaps
/pilotos
/app
legacy aliases
archive
```

## Aplicación

```powershell
node scripts/apply-gc-combos-totalcombos-warning-fix-v1-3.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/api/gc/combos?limit=100&sort=recent
```

Comprobar:

```txt
totalCombos > 0
publicCombos > 0
rawCombos > 0
```

Luego:

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
```

Resultado esperado:

```txt
fails = 0
```

El warning de `combos-core` debería desaparecer. Los warnings de Archive pueden seguir si `GC_ARCHIVE_CORE_SOURCE_URL` no está configurado.
