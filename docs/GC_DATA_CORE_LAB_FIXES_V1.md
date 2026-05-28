# GC Data Core Lab Fixes v1

Fecha: 2026-05-28  
Pack: `GC_Data_Core_Lab_Fixes_v1`

## Problemas detectados por `/admin/endpoints`

Informe:

```txt
total: 22
ok: 18
warnings: 3
fails: 1
```

Fallos relevantes:

```txt
/api/gc/names/preview?limit=30 -> 404
/api/gc/recent-laps?scope=activeCombo&limit=30 -> 200 pero sin items
```

Warnings normales:

```txt
Archive Core sin GC_ARCHIVE_CORE_SOURCE_URL
```

## Qué corrige

### 1. Añade `/api/gc/names/preview`

Si el pack de Names Pipeline no quedó instalado o el endpoint no existe, este pack lo añade.

Devuelve:

```txt
rawName
autoName
displayName
hasOverride
```

para:

```txt
driver
car
track
```

### 2. Sobrescribe `/api/gc/recent-laps`

Añade una ruta con el mismo path antes de la legacy Data Core route para que Express use la versión corregida.

Nueva lógica:

```txt
scope=activeCombo
→ detectar activeCombo desde buildComboStatsFromLaps
→ filtrar por comboId si existe
→ si no, filtrar por track + coches
→ ordenar por timestamp descendente
→ devolver vueltas recientes
```

Si el filtro activeCombo devuelve 0, usa fallback global y emite warning, en vez de devolver tabla vacía.

## Archivos modificados

```txt
src/server/index.ts
```

## Qué NO toca

```txt
UI pública
/admin/endpoints
Race leaderboard
combos
app
hotlaps
pitwall
assets
```

## Aplicación

```powershell
node scripts/apply-gc-data-core-lab-fixes-v1.cjs
npm run build
npm run dev
```

## Pruebas directas

```txt
http://localhost:4321/api/gc/names/preview?limit=30
http://localhost:4321/api/gc/recent-laps?scope=activeCombo&limit=30
```

## Prueba en lab

Abrir:

```txt
http://localhost:4321/admin/endpoints
```

Ejecutar:

```txt
Ejecutar críticos
```

Resultado esperado:

```txt
names-preview = ok
recent-laps = ok o warning solo si fallback global
fails = 0
```
