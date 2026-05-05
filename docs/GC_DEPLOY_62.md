# GC Deploy 62 - Header auth cleanup

Corrige el estado de login en header público e interno:

- En páginas públicas ya no deben verse a la vez `Conectado` y `Login`.
- En plataforma interna se muestra `Conectado` y el botón cambia a nombre de usuario / perfil.
- El script busca cualquier enlace del header que apunte a `/login` y lo convierte a `/perfil` cuando hay sesión.
