# GC Hotlaps Primary v1.1 Metric Fix

Fecha: 2026-05-28  
Pack: `GC_Hotlaps_Primary_v1_1_Metric_Fix`

## Problema detectado

En `/hotlaps`, el bloque de combo activo mostraba:

```txt
1 piloto
```

mientras `/app` mostraba:

```txt
12 pilotos
```

## Causa

`/app` usa:

```txt
activeCombo.driversCount
```

desde Data Core.

Pero `/hotlaps` estaba mostrando `drivers.size` calculado sobre las filas visibles después de filtros, compactación y estado visual. Eso puede dar 1 aunque el combo activo tenga 12 pilotos reales.

## Solución

En `/hotlaps`:

- Se guarda `activeCombo.driversCount` desde `/api/gc/snapshot`.
- Se guarda `activeCombo.totalLaps`.
- Si la vista es “combo activo puro” sin filtros de búsqueda/piloto/coche, el contador de pilotos usa `activeCombo.driversCount`.
- Si hay filtros manuales, entonces sí usa pilotos visibles filtrados.

## Regla nueva

```txt
Pilotos del combo activo = activeCombo.driversCount
Pilotos visibles = resultado filtrado en tabla
```

No son el mismo dato.

## Cambios técnicos

Actualiza:

```txt
document.documentElement.dataset.gcHotlapsDataCoreVersion
```

a:

```txt
v1.1
```

y el badge pasa a:

```txt
Data Core primary v1.1
```

## Qué NO toca

```txt
Race Data Core server
/app
/combos
/pitwall
admin endpoints
legacy code
assets
```

## Aplicación

```powershell
node scripts/apply-gc-hotlaps-primary-v1-1-metric-fix.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/hotlaps
```

En consola:

```js
document.documentElement.dataset.gcHotlapsDataCoreVersion
```

Debe devolver:

```txt
v1.1
```

Comparar:

```txt
/app combo activo drivers
/hotlaps combo activo drivers
```

Deben coincidir cuando no hay filtros manuales activos.
