# GC Combos Response Normalizer v1.4

Fecha: 2026-05-28  
Pack: `GC_Combos_Response_Normalizer_v1_4`

## Problema

Después del fix anterior, el Endpoint Lab sigue mostrando:

```txt
combos-core
/api/gc/combos?limit=100&sort=recent
warning: totalCombos vacío
```

El endpoint funciona, no hay fails, pero el JSON no expone el campo `totalCombos` donde el Lab lo espera.

## Causa probable

Hay varias rutas/bloques históricos para combos y el parche anterior no tocó el handler que realmente está respondiendo en local.

## Solución robusta

Añadir un middleware exacto para:

```txt
/api/gc/combos
```

que normaliza el payload justo antes de `res.json()`.

Añade si faltan:

```txt
totalCombos
publicCombos
rawCombos
totalMatched
count
normalizedBy
```

## Qué NO cambia

```txt
agrupación canónica
min drivers
min laps por coche
Zolder merge
combo detail
legacy aliases
/hotlaps
/pilotos
/app
```

Solo completa la respuesta JSON de `/api/gc/combos`.

## Aplicación

```powershell
node scripts/apply-gc-combos-response-normalizer-v1-4.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/gc/combos?limit=100&sort=recent
```

Debe aparecer:

```txt
totalCombos
publicCombos
rawCombos
normalizedBy: ["gc-combos-response-normalizer-v1.4"]
```

## Validación Lab

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
```

Resultado esperado:

```txt
fails = 0
```

El warning de `combos-core → totalCombos vacío` debería desaparecer.

Pueden quedar los 2 warnings de Archive Core si no está configurado:

```txt
GC_ARCHIVE_CORE_SOURCE_URL not configured
```
