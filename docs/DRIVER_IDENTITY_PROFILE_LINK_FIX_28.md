# GC deploy 28 - Driver identity + profile linking fix

## Corrige

- Los overrides de pilotos ya no se aplican por nombre cuando existe PlayerId o SteamGuid.
- Si dos pilotos se llaman igual, por ejemplo Neo y Neo, se pueden editar por separado usando su PlayerId/SteamGuid.
- El perfil ya no manda al login cuando una cuenta está autenticada pero sin piloto vinculado.
- El perfil muestra un selector de pilotos y permite vincular desde la propia página.
- En admin, la tabla de nombres muestra ID + código/GUID para distinguir duplicados.

## Nota

Si existía un override antiguo creado solo por nombre para un piloto duplicado, dejará de aplicarse a vueltas que tengan PlayerId/SteamGuid. Crea el alias desde la fila concreta del catálogo para que quede guardado como `driver:<PlayerId>`.
