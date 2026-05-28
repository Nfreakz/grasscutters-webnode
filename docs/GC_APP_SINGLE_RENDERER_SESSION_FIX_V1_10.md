# GC App Single Renderer Session Fix v1.10

Fecha: 2026-05-28  
Pack: `GC_App_Single_Renderer_Session_Fix_v1_10`

## Problema

Después de eliminar el renderer legacy de `/app`, la caja de sesión muestra:

```txt
Cuenta: ---
Rol: ---
Piloto: ---
```

## Causa

El renderer viejo también llamaba a endpoints de sesión/auth y rellenaba:

```txt
gcAppSessionState
gcAppSessionUser
gcAppSessionRole
gcAppSessionPilot
```

Al dejar un único renderer limpio, faltaba reintroducir esa parte en el renderer nuevo.

## Solución

Añadir al `GC_APP_SINGLE_RENDERER_V1_8` la lectura de:

```txt
/api/gc/identity/me
/api/admin/status
```

y una función:

```txt
renderSession(identityData, adminData)
```

## Qué corrige

```txt
Sesión
Cuenta
Rol
Piloto
```

## Qué NO toca

```txt
datos de carrera
diagnostics
combos
hotlaps
pilotos
backend
legacy aliases
```

## Aplicación

```powershell
node scripts/apply-gc-app-single-renderer-session-fix-v1-10.cjs
npm run build
npm run dev
```

## Resultado esperado

En `/app`:

```txt
Sesión: Conectado
Cuenta: Admin Local / Neo
Rol: admin
Piloto: Neo
```

según lo que devuelvan `/api/gc/identity/me` y `/api/admin/status`.

## Prueba consola

```js
({
  sessionRenderer: document.documentElement.dataset.gcAppSessionRenderer,
  sessionFix: document.documentElement.dataset.gcAppSessionFix,
  primary: window.GCAppDataCorePrimary
})
```

Esperado:

```txt
sessionRenderer = v1.10
sessionFix = v1.10
primary.identity o primary.admin con datos
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```

## Antes de commit

Eliminar el script temporal:

```powershell
del scripts\apply-gc-app-single-renderer-session-fix-v1-10.cjs
```
