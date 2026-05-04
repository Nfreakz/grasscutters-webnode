# Paquete 24 - Fix admin + filtros de nombres

## Problemas corregidos

- Al promocionar una cuenta a admin con `ADMIN_SETUP_SECRET`, si era la cuenta actual o no había sesión activa, ahora se crea cookie de sesión admin automáticamente.
- El mensaje de bootstrap deja claro si tienes que iniciar sesión con otra cuenta.
- Los endpoints de guardado/borrado de filtros de nombres aceptan sesión admin y, como respaldo técnico, el setup secret en el body/header.
- El panel admin añade un formulario de alias manual para crear alias de coche, circuito o piloto aunque no aparezca en el catálogo.

## Rutas afectadas

- POST `/api/admin/bootstrap`
- POST `/api/admin/name-filters`
- POST `/api/admin/name-filters/delete`

## Notas

Para editar desde la tabla, la cuenta con la que estás navegando debe ser admin. Si promocionas otro email, debes entrar con ese email. Si promocionas tu propia sesión o usas bootstrap sin sesión, la cookie admin se activa sola.
