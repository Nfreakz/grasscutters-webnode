# GC Hotlaps Primary Clean Runtime v1

Fecha: 2026-05-28  
Pack: `GC_Hotlaps_Primary_Clean_Runtime_v1`

## Contexto

Ya se validó:

```txt
/app limpio
/api/pilots y /api/drivers con estadísticas completas
legacy aliases verdes
/pilotos restaurado
```

Por tanto el corte temporal de red en `/hotlaps` ya no es necesario:

```txt
GCHotlapsLegacyNetworkCut
```

## Objetivo

Limpiar runtime temporal de `/hotlaps`.

No elimina Hotlaps Data Core Primary.

No toca endpoints.

No toca imágenes.

No toca otras páginas.

## Qué elimina

Bloque marcado:

```txt
GC_HOTLAPS_LEGACY_NETWORK_CUT_V1
```

## Qué mantiene

```txt
GC_HOTLAPS_DATA_CORE_PRIMARY_V1
document.documentElement.dataset.gcHotlapsDataCore = primary
document.documentElement.dataset.gcHotlapsDataCoreVersion = v1.1
legacy server aliases
```

## Qué añade

Marcador limpio:

```js
document.documentElement.dataset.gcHotlapsRuntime
window.GCHotlapsRuntimeStatus()
```

Valor esperado:

```txt
data-core-primary-clean-v1
```

## Por qué es seguro ahora

Porque los endpoints legacy del servidor ya están centralizados:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/pilots
/api/drivers
```

Si algún script antiguo llama a `/api/hotlaps`, ya recibirá Data Core desde servidor.

## Aplicación

```powershell
node scripts/apply-gc-hotlaps-primary-clean-runtime-v1.cjs
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
  runtime: document.documentElement.dataset.gcHotlapsRuntime,
  status: window.GCHotlapsRuntimeStatus?.()
})
```

Resultado esperado:

```txt
dataCore = primary
version = v1.1
runtime = data-core-primary-clean-v1
legacyNetworkCut = false
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```

## Próximo paso

Si `/hotlaps` queda limpio:

```txt
/combos Primary Clean Runtime
```

y después:

```txt
/combos/:comboId Primary Clean Runtime
```
