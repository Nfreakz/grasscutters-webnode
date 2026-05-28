# GC Combos Data Core Primary v1

Fecha: 2026-05-28  
Pack: `GC_Combos_Data_Core_Primary_v1`

## Objetivo

Convertir `/combos` en consumidor primario de Race Data Core.

Fase segura:

```txt
Data Core pinta la vista final.
Legacy sigue presente como fallback.
No se borra lógica antigua todavía.
```

## Endpoint usado

```txt
/api/gc/combos?limit=1000&sort=recent
```

## Qué mejora respecto al bridge anterior

- Data Core se ejecuta al cargar.
- Hace una segunda pasada tras `load`.
- Refresca cada 45 segundos.
- Añade indicador visible `Data Core primary`.
- Usa `activeCombo` del endpoint para el bloque destacado.
- Mantiene filtros de búsqueda, actividad, orden y cargar más.
- Mantiene imágenes de circuito mediante `GCTrackImages` si está disponible.

## Estado expuesto

```js
document.documentElement.dataset.gcCombosDataCore
document.documentElement.dataset.gcCombosDataCoreVersion
window.GCCombosDataCorePrimary
window.GCCombosDataCorePrimaryReload()
```

## Resultado esperado

```js
document.documentElement.dataset.gcCombosDataCore
```

Debe devolver:

```txt
primary
```

Si falla Data Core:

```txt
fallback
primary-stale
```

## Qué NO hace todavía

No elimina el script legacy.
No toca `/app`, `/hotlaps`, `/pitwall` ni home.
No cambia endpoints server.
No cambia assets.

## Aplicación

```powershell
node scripts/apply-gc-combos-data-core-primary-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos
```

En consola:

```js
document.documentElement.dataset.gcCombosDataCore
```

Luego validar:

```txt
/admin/endpoints
```

Ejecutar críticos. Debe seguir:

```txt
fails = 0
```

## Próximo paso

Cuando `/combos` esté estable:

1. Revisar `/pitwall` como base del rediseño público.
2. Preparar limpieza legacy por páginas.
3. Preparar MD final de arquitectura.
