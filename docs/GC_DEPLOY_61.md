# GC Deploy 61 - Header auth state

- El botón Login cambia al nombre del usuario cuando hay sesión activa.
- El enlace pasa a `/perfil`.
- Muestra una etiqueta compacta “Conectado”.
- Se aplica tanto al header público como al panel interno.
- Usa `/api/auth/status` con `credentials: include` y soporta varias formas de respuesta.
