# Archivo Motorsport · admin import y MySQL save fix v8.2

## Qué arregla

- Permite importar CSV desde la web en `/admin/archivo/importar`.
- Añade rutas MySQL robustas para crear, editar y listar fichas.
- Evita depender de terminal para importar contenido.
- Mantiene modo prueba por defecto.

## Ruta nueva

```txt
/admin/archivo/importar
```

## API nueva

```txt
POST /api/admin/archive/import-csv-web
```

También refuerza:

```txt
GET   /api/admin/archive/items
GET   /api/admin/archive/items/:id
POST  /api/admin/archive/items
PATCH /api/admin/archive/items/:id
PUT   /api/admin/archive/items/:id
```

## Instalación

```bash
node scripts/patch-archivo-admin-mysql-import-v82.mjs
npm run build
```

Luego commit/push y redeploy.

## Uso en Hostinger

1. Entra en `/admin/archivo/importar`.
2. Selecciona uno o varios CSV.
3. Deja marcado `Solo probar, no escribir`.
4. Pulsa `Importar CSV`.
5. Si el resumen es correcto, desmarca `Solo probar, no escribir`.
6. Importa de verdad.
7. Revisa en `/admin/archivo`.

## Columnas reconocidas

```txt
id
slug
nombre / titulo / title / name
resumen / summary / descripcion_corta
body / descripcion / descripcion_larga / texto
categoria / category
status / estado
imagen_1_url
imagen_1_alt
imagen_1_fuente
imagen_1_fuente_url
imagen_1_autor
imagen_1_licencia
```

También soporta `imagen_2_*` hasta `imagen_5_*`.

## Recomendación

Importa primero como borrador. Luego revisa y publica desde el admin.
