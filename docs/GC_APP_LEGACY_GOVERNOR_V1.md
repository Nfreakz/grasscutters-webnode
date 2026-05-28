# GC App Legacy Governor v1

Fecha: 2026-05-28  
Pack: `GC_App_Legacy_Governor_v1`

## Objetivo

Primera fase real de retirada legacy en `/app`, sin borrar código todavía.

## Por qué no borrar aún

`/app` tiene mucha lógica acumulada. Borrar scripts legacy de golpe puede romper:

```txt
sesión
botones
fondos de circuito
tabla reciente
fallbacks
```

Así que esta fase mete un **governor**:

```txt
legacy puede existir
pero Data Core pinta al final
```

## Qué hace

### 1. Detecta llamadas legacy desde `/app`

Vigila:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/stats/overview
/api/drivers
/api/pilots
```

### 2. No bloquea esas llamadas todavía

Por seguridad, no devuelve respuestas falsas ni corta fetch.

### 3. Cuando detecta una llamada legacy

Si Data Core está en modo:

```txt
primary
primary-stale
```

lanza:

```js
window.GCAppDataCorePrimaryReload()
```

para que Data Core repinte después del legacy.

### 4. Expone diagnóstico

En consola:

```js
window.GCAppLegacyGovernor.status()
document.documentElement.dataset.gcAppLegacy
document.documentElement.dataset.gcAppLegacyPhase
```

Valores esperados:

```txt
gcAppLegacyPhase = phase-1-governor
gcAppLegacy = governed-v1 / legacy-call-detected / governor-ready
```

### 5. Añade badge visual

```txt
Legacy quiet
Legacy governed
```

## Qué NO toca

```txt
endpoints server
imágenes
GCTrackImages
ACSM
Archive
/hotlaps
/combos
/combos/:comboId
```

## Aplicación

```powershell
node scripts/apply-gc-app-legacy-governor-v1.cjs
npm run build
npm run dev
```

## Prueba

Abrir:

```txt
http://localhost:4321/app
```

Consola:

```js
document.documentElement.dataset.gcAppDataCore
document.documentElement.dataset.gcAppLegacyPhase
window.GCAppLegacyGovernor.status()
```

Resultado esperado:

```txt
primary
phase-1-governor
```

El status mostrará si todavía hay llamadas legacy vivas.

## Validación obligatoria

Después:

```txt
/admin/endpoints
Ejecutar críticos
```

Debe seguir:

```txt
fails = 0
```

## Cuándo pasar a Phase 2

Cuando online veamos que:

```txt
/app sigue en primary
no hay errores de consola
Endpoint Lab = 0 fails
LegacyGovernor muestra qué llamadas legacy quedan
```

Entonces sí podemos preparar un pack de eliminación real de scripts legacy.
