# Platform shell polish 19

Este paquete revisa y pule el diseño del shell anterior.

Cambios principales:

- Rail lateral más útil: navegación numerada, sistema visible y estado de sync.
- Topbar más sólida: estado Live, foco accesible y menú móvil con backdrop.
- Home más fuerte: strips de arquitectura, métricas con subtítulos y tabla mejorada.
- Hotlaps más usable: contador de cargadas/visibles, filtro de válidas, limpiar filtros y HTML escapado.
- Pilotos con búsqueda local y estado de carga.
- Tracker con checklist de rutas y diagnóstico más visual.
- Login y perfil con estructura más clara.
- Discord y herramientas ya no quedan vacías: tienen slabs, timeline y roadmap.
- CSS reescrito en bloques legibles, con estados hover, focus y responsive mejorado.

Archivos tocados:

- src/layouts/AppLayout.astro
- src/components/ThemeSwitcher.astro
- src/styles/global.css
- src/pages/index.astro
- src/pages/hotlaps.astro
- src/pages/login.astro
- src/pages/perfil.astro
- src/pages/tracker.astro
- src/pages/pilotos.astro
- src/pages/discord.astro
- src/pages/herramientas.astro
