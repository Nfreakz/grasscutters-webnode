# GC Identity/Profile Core v1

Fecha: 2026-05-28  
Pack: `GC_Identity_Profile_Core_v1`

## Objetivo

Centralizar identidad web y perfil público de piloto.

Separación:

```txt
Race Data Core        = vueltas, hotlaps, combos, leaderboard desde Stracker
Identity/Profile Core = usuario web, piloto vinculado, avatar, perfil público
```

Este core puede leer Stracker para construir el perfil del piloto, pero no decide rankings globales ni combo activo.

## Endpoints añadidos

```txt
GET /api/gc/identity/me
GET /api/gc/identity/status
GET /api/gc/pilots/:playerId/profile
```

## `/api/gc/identity/me`

Devuelve el usuario logueado y, si tiene piloto vinculado, su perfil de carrera resumido.

Si no hay sesión:

```json
{
  "ok": true,
  "authenticated": false,
  "user": null,
  "linkedPilot": null
}
```

Si hay sesión:

```json
{
  "ok": true,
  "authenticated": true,
  "user": {},
  "linkedPilot": {}
}
```

## `/api/gc/pilots/:playerId/profile`

Perfil público del piloto:

```json
{
  "playerId": 123,
  "linkedUser": {
    "id": "...",
    "displayName": "...",
    "role": "pilot"
  },
  "pilot": {
    "driverName": "Neo RS",
    "avatarUrl": "/api/pilot-avatar/123",
    "socialImageUrl": "/api/pilot-social-image/123.png",
    "stats": {},
    "bestLap": {},
    "latestLap": {},
    "tracks": [],
    "cars": [],
    "recentLaps": []
  }
}
```

## `/api/gc/identity/status`

Diagnóstico seguro:

```json
{
  "users": {
    "total": 0,
    "linked": 0,
    "unlinked": 0,
    "admins": 0,
    "activeSessions": 0
  }
}
```

## Qué respeta

- `pilotLink` de usuarios.
- Nombres visibles corregidos por admin.
- Limpieza automática de coches/circuitos.
- Avatar público existente.
- Social image existente.
- Stracker como fuente de vueltas del piloto.

## Qué NO toca

```txt
/api/gc/leaderboard
/api/gc/active-combo
/api/gc/recent-laps
/api/gc/combos
Race Data Core rankings
Championship Core
Archive Core
UI pública
admin UI
assets
```

## Aplicación

```powershell
node scripts/apply-gc-identity-profile-core-v1.cjs
npm run build
npm run dev
```

## Pruebas

```txt
http://localhost:4321/api/gc/identity/status
http://localhost:4321/api/gc/identity/me
http://localhost:4321/api/gc/pilots/1/profile
```

Cambia `1` por un `PlayerId` real.

## Próximo paso

Después de validar:

1. Crear `Calendar Core Public Snapshot`, o
2. Empezar a limpiar lógica legacy de `/app`, `/hotlaps` y `/combos`, ahora que los cores están separados.
