# GC App Data Core Primary v1

Fecha: 2026-05-28  
Pack: `GC_App_Data_Core_Primary_v1`

## Objetivo

Convertir `/app` en consumidor primario de Data Core.

Fase segura:

```txt
Data Core pinta la verdad final.
Legacy sigue presente como fallback.
No se borra lógica antigua todavía.
```

## Endpoints usados

```txt
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/leaderboard?scope=activeCombo&limit=20
/api/gc/recent-laps?scope=activeCombo&limit=12
```

## Qué mejora respecto al bridge anterior

- Data Core se ejecuta al cargar la página.
- Hace una segunda pasada tras `load`.
- Refresca cada 30 segundos.
- Añade indicador visible `Data Core primary`.
- Expone estado en:

```js
document.documentElement.dataset.gcAppDataCore
document.documentElement.dataset.gcAppDataCoreVersion
window.GCAppDataCorePrimary
window.GCAppDataCorePrimaryReload()
```

## Resultado esperado

```js
document.documentElement.dataset.gcAppDataCore
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
No reduce aún todas las llamadas de red.
No toca home, /pitwall, /hotlaps ni /combos.

## Aplicación

```powershell
node scripts/apply-gc-app-data-core-primary-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/app
```

Luego:

```txt
/admin/endpoints
```

Ejecutar críticos. Debe seguir:

```txt
fails = 0
```

## Próximo paso

Cuando `/app` esté estable online:

1. Crear `GC_App_Legacy_Removal_v1`.
2. Eliminar llamadas antiguas que ya no hacen falta.
3. Mantener fallback mínimo o quitarlo.
