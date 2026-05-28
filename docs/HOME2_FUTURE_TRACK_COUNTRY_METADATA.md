# Nota futura · Automatización de país / bandera por circuito

Estado: pendiente para fase posterior.

## Decisión temporal

De momento no se implementa un sistema completo de país por circuito en base de datos.

## Solución recomendada futura

Crear una fuente única de metadata de circuito:

```txt
public/data/track-metadata.json
```

o más adelante una tabla SQL:

```txt
tracks_metadata
```

Campos recomendados:

```txt
slug
display_name
ac_track_id
country_code
country_name
distance_km
hero_image
map_image
aliases
```

## Flujo ideal

```txt
combo activo → trackName/canonicalTrackName → slug normalizado → metadata → bandera/mapa/imagen/distancia
```

## Fallback actual

La página `/home2` usa inferencia básica por nombre de circuito para algunos casos conocidos, pero esto debe migrarse a metadata mantenible.
