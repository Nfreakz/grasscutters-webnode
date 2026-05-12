# Archivo Motorsport · CSV semicolon/import fix v8.3.1

## Problema detectado

El CSV `06_glosario_motorsport.csv` usa punto y coma:

```txt
id;slug;nombre;categoria;descripcion_corta;descripcion_larga
```

El importador v8.3 esperaba coma, por eso importaba filas como:

```txt
glossary 10
```

También la columna `categoria` del glosario no debe ser la categoría principal del Archivo, sino un dato rápido de la ficha.

## Qué corrige

- Detecta delimitador automáticamente:
  - `;`
  - `,`
  - tabulador
- Usa `nombre` como título.
- Usa `descripcion_corta` como resumen.
- Usa `descripcion_larga` como cuerpo.
- Si el archivo es de glosario, mantiene categoría principal `glosario`.
- Convierte `categoria` en fact, por ejemplo:
  - Categoría: Técnica
  - Categoría: Dinámica
- Evita IDs numéricos globales:
  - `1` pasa a `glosario-1`
  - `2` pasa a `glosario-2`

## Instalación

```bash
node scripts/patch-archivo-csv-semicolon-v831.mjs
npm run build
```

Luego commit/push/redeploy.

## Para reimportar este CSV

Como ya tienes 11 fichas mal importadas, primero borra esas fichas `glossary 1`, `glossary 2`, etc. desde `/admin/archivo`.

Después importa el CSV otra vez:

```txt
Solo probar: marcado
Publicar directamente: desmarcado
Actualizar existentes: desmarcado
```

La prueba debería enseñar títulos como:

```txt
Apex
Drafting
Sobreviraje
Subviraje
```

Después importas de verdad desmarcando `Solo probar`.

## Si ya importaste las buenas y quieres actualizar

Usa:

```txt
Solo probar: desmarcado
Publicar directamente: desmarcado
Actualizar existentes: marcado
```
