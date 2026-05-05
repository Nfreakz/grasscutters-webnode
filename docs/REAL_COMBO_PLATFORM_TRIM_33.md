# GC Deploy 33 - Real ComboId + landing Discord

## Objetivo

Cambiar el Combo Center para que deje de tratar cada pareja `TrackId + CarId` como un combo independiente.

En stracker, el combo real es:

```txt
Combos.ComboId
└─ TrackId
└─ ComboCars[]
   └─ CarId
```

Por tanto, un combo es un circuito con un paquete de coches. Si el mismo circuito se repite con otro paquete de coches, aparecerá como otro `ComboId`.

## Cambios

- `/combos` lista combos por `ComboId`.
- `/combos/[comboId]` abre la ficha del combo real.
- `/api/combos/stats` agrupa por `Session.ComboId`.
- `/api/combos/:comboId` devuelve la ficha real del combo.
- Se mantiene `/api/combos/:trackId/:carId` como legacy temporal.
- Hotlaps enlaza al combo real si la vuelta tiene `comboId`.
- Discord se quita del menú lateral de plataforma.
- La landing pública gana una sección Discord más visible.

## Archivos principales

```txt
src/server/index.ts
src/pages/combos.astro
src/pages/combos/[comboId].astro
src/pages/hotlaps.astro
src/layouts/AppLayout.astro
src/pages/index.astro
src/layouts/MarketingLayout.astro
src/styles/marketing.css
```

## Pruebas

```txt
/combos
/api/combos/stats
/combos/1
/api/combos/1
/hotlaps
/
```

