# GC Hotlaps Data Core Primary v1

Fecha: 2026-05-28  
Pack: `GC_Hotlaps_Data_Core_Primary_v1`

## Objetivo

Convertir `/hotlaps` en consumidor primario de Race Data Core.

Fase segura:

```txt
Data Core pinta la tabla final.
Legacy sigue presente como fallback.
No se borra lógica antigua todavía.
```

## Endpoints usados

```txt
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/leaderboard?scope=activeCombo&limit=1000
```

## Qué mejora respecto al bridge anterior

- Data Core se ejecuta al cargar.
- Hace una segunda pasada tras `load`.
- Refresca cada 30 segundos.
- Añade indicador visible `Data Core primary`.
- Mantiene filtros de piloto/coche/circuito/valid/sort.
- Mantiene links a perfil público y combo.
- Expone estado:

```js
document.documentElement.dataset.gcHotlapsDataCore
document.documentElement.dataset.gcHotlapsDataCoreVersion
window.GCHotlapsDataCorePrimary
window.GCHotlapsDataCorePrimaryReload()
```

## Resultado esperado

```js
document.documentElement.dataset.gcHotlapsDataCore
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
No toca Race Data Core server.
No toca `/app`, `/combos`, `/pitwall` ni home.

## Aplicación

```powershell
node scripts/apply-gc-hotlaps-data-core-primary-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/hotlaps
```

En consola:

```js
document.documentElement.dataset.gcHotlapsDataCore
```

Luego validar:

```txt
/admin/endpoints
```

Ejecutar críticos. Debe seguir con:

```txt
fails = 0
```

## Próximo paso

Cuando `/hotlaps` esté estable online:

1. Convertir `/combos` en Data Core primary.
2. Luego preparar eliminación de legacy por páginas.
