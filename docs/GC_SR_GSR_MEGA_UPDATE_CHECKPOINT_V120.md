# GrassCutters · Mega Update SR/GSR · Checkpoint v120

Fecha checkpoint: 2026-06-06T21:27:28.824028+00:00

## Estado general

Este checkpoint consolida el Mega Update aplicado hasta v119.

El objetivo principal del Mega Update ha sido rehacer y blindar el sistema de SR/GSR sin subir todavía a Git ni deploy hasta validar en local.

## Decisiones de producto cerradas

### 1. Rating activo ACSM-only

Ahora mismo el rating activo debe vivir únicamente de carreras oficiales ACSM completadas.

Una carrera cuenta para SR/GSR si:

1. Existe en ACSM.
2. ACSM la marca como completada.
3. Tiene resultados válidos.
4. Se puede localizar la sesión Race correspondiente en sTracker.
5. No es Practice.
6. No es Qualy.

Las carreras sTracker no oficiales quedan preparadas para futuro, pero no deben tocar SR/GSR ahora.

Variable opcional solo para pruebas controladas:

```env
GC_ENABLE_MANUAL_STRACKER_RATINGS=true
```

Por defecto no debe estar activa.

### 2. Identidad estable por SteamID/GUID

La identidad del piloto debe ser:

1. `steam:<SteamGuid>`
2. `player:<PlayerId>` solo si no hay SteamID/GUID
3. `name:<alias>` solo como último recurso

El nombre visible es solo alias.

Esto corrige problemas tipo:

- dos pilotos llamados Neo,
- Fran apareciendo como Neo,
- cambios de nick,
- PlayerId local menos fiable que SteamID.

### 3. SR v2 basado en tiempo limpio

El SR ya no se basa principalmente en castigos planos por carrera.

La filosofía nueva:

> El SR mide cuánto tiempo conduces limpio frente a cuántos incidentes generas.

Usa:

- tiempo en pista,
- tiempo limpio,
- vueltas limpias,
- racha limpia,
- salidas/cuts,
- golpes coche,
- golpes entorno,
- carrera completada/no completada,
- penalizaciones oficiales si existen.

No usa tabla manual de circuitos, curvas ni layouts.

### 4. DNF y déficit no se suman

Regla cerrada:

> No se suman DNF y déficit de vueltas como doble castigo.

El déficit queda como dato informativo. La penalización de estado se calcula una sola vez por completion ratio / DNF.

### 5. GSR no se rediseña todavía

GSR mantiene el modelo actual, pero se hizo un fix quirúrgico:

- antes de calcular GSR se ordenan las filas por resultado real.

Orden:

1. posición real,
2. vueltas completadas,
3. tiempo total,
4. mejor vuelta,
5. nombre como desempate.

El rediseño GSR v2 queda pendiente para más adelante.

## Cambios principales implementados

### SR v2

- Modelo `gc-sr-v2-clean-time`.
- Bonificación por tiempo limpio.
- Penalización por incidentes por minuto.
- Caps de subida/bajada.
- Tolerancia a 1-2 roces leves.
- DNF/déficit sin doble castigo.
- Detalle visual más claro para el piloto.

### Matching ACSM ↔ sTracker

- Protección por confianza mínima.
- Si el match de un piloto es dudoso, la telemetría no se usa para SR.
- El GSR puede seguir con resultado oficial ACSM.
- SR queda congelado si no hay telemetría fiable.

Variable opcional:

```env
GC_SR_MIN_STRACKER_MATCH_CONFIDENCE=0.55
```

### Auditoría

`/api/gc/ratings/diagnostics` incluye:

- `diagnostics.megaAudit`
- `diagnostics.megaAudit.srEconomy`

Sirve para validar:

- ACSM-only,
- SteamID/GUID,
- sTracker linked,
- SR congelados,
- matches dudosos,
- economía SR.

## Estado esperado después de rebuild local

Ejemplo de estado sano:

```txt
megaAudit.ok: true
manualStrackerEventsInRating: []
warnings: []
steamKeyDrivers > 0
playerKeyDrivers: 0
nameKeyDrivers: 0
strackerLinkedResults > 0
frozenSrResults: 0
lowConfidenceResults: 0
```

Economía SR esperada con la carrera Mugello actual:

```txt
positive: 4
negative: 2
averageDeltaSr: aprox -0.063
totalDeltaSr: aprox -0.38
```

Esto indica un sistema bastante equilibrado con una sola carrera, aunque conviene observar 2-3 carreras más antes de retocar pesos.

## Validación local obligatoria

Después de sobrescribir archivos:

```bash
npm run build
```

Luego rebuild:

```js
fetch('/api/gc/ratings/recalculate?mode=rebuild', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin'
})
  .then(r => r.json())
  .then(console.log);
```

Comprobar:

```txt
/api/gc/ratings/diagnostics
/ratings
/campeonato
/campeonato/ronda/49fc89e1-7a28-42e0-8c09-158d321085fa
```

## Checklist antes de Git/deploy

### Build

- [ ] `npm run build` pasa.
- [ ] Solo queda warning conocido de `direct eval` en `src/server/index.ts`.
- [ ] No hay errores de TypeScript/esbuild.

### Diagnostics

- [ ] `diagnostics.megaAudit.ok === true`
- [ ] `manualStrackerEventsInRating` vacío.
- [ ] `warnings` vacío.
- [ ] `steamKeyDrivers` mayor que 0.
- [ ] `playerKeyDrivers === 0` o justificado.
- [ ] `nameKeyDrivers === 0` o justificado.
- [ ] `strackerLinkedResults > 0`.
- [ ] `frozenSrResults === 0` salvo caso justificado.
- [ ] `lowConfidenceResults === 0` salvo caso justificado.

### SR economy

- [ ] `averageDeltaSr` no se dispara.
- [ ] No hay ganancias > +1.5.
- [ ] No hay pérdidas < -8 salvo DSQ/carnicería.
- [ ] `biggestGains` solo muestra positivos.
- [ ] `biggestLosses` solo muestra negativos.

### UI

- [ ] `/ratings` carga SR/GSR.
- [ ] `/campeonato` carga clasificación.
- [ ] El detalle de ronda carga.
- [ ] El detalle SR muestra:
  - tiempo en pista,
  - tiempo limpio,
  - vueltas limpias,
  - racha limpia,
  - bonus SR,
  - penalizaciones,
  - ΔSR,
  - SR final.
- [ ] No muestra:
  - `gc-sr-v2...`,
  - `gc-ratings-v1`,
  - cap positivo,
  - cap aplicado,
  - estado técnico,
  - vuelta inválida informativa.

## Rollback local

Antes de rebuild o deploy, hacer copia de:

```txt
data/gc-ratings/rating-store.json
```

Ejemplo:

```txt
data/gc-ratings/rating-store.backup-before-mega-update.json
```

Si algo falla:

1. Restaurar el JSON.
2. Volver a la última carpeta/ZIP estable.
3. Ejecutar build.
4. No hacer rebuild hasta revisar.

## Archivos principales tocados en el Mega Update

- `src/server/gc-ratings/srModel.ts`
- `src/server/gc-ratings/ratingService.ts`
- `src/server/gc-ratings/strackerReader.ts`
- `src/server/gc-ratings/acsmMatcher.ts`
- `src/pages/campeonato/ronda/[eventId].astro`

## Pendiente para más adelante

### GSR v2

Ideas guardadas para futuro:

- factor por tamaño de parrilla,
- factor por tipo de carrera,
- confianza/provisional,
- límites de ganancia/pérdida,
- evitar subida fuerte de GSR en carrera muy sucia.

### Carreras no oficiales

Ahora están preparadas, pero no activas para rating.

Pendiente futuro:

- decidir si algunas carreras comunidad pueden contar SR/GSR,
- factor reducido,
- revisión manual obligatoria,
- separación clara en UI.

### Ajustes SR futuros

No tocar todavía hasta tener más carreras.

Posibles ajustes futuros:

- bajar cap positivo si demasiada gente sube +1.4 frecuentemente,
- ajustar penalización de contactos si queda demasiado blanda/dura,
- ajustar bonus por tiempo limpio tras 2-3 carreras reales.

## Regla de oro

No tocar más pesos del SR hasta tener varias carreras ACSM procesadas con este modelo.

Primero validar estabilidad, identidad y lectura.


## Añadido en v121 · preDeployStatus

`/api/gc/ratings/diagnostics` añade:

```txt
diagnostics.preDeployStatus
```

Sirve como resumen rápido antes de Git/deploy.

Estados posibles:

```txt
ready   → Listo para Git/deploy
review  → No hay bloqueos, pero hay warnings a revisar
blocked → Hay bloqueos que no deberían subirse
```

Checklist rápido:

```txt
preDeployStatus.ready === true
preDeployStatus.status === "ready"
preDeployStatus.blockers.length === 0
preDeployStatus.warnings.length === 0
```
