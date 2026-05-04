# Parche 16A: layout fix

El paquete 16 cambió colores y tokens, pero parte del HTML existente tenía nombres de clases anteriores o directamente elementos sin clase.
Este parche hace el CSS más compatible:

- estilos para `body > header` aunque no tenga clase
- estilos para `header nav a` aunque no tengan clase
- botones genéricos y botones de tema anteriores
- cards genéricas en `article`, `.gc-card`, `.panel`, `.stat-card`, `.module-card`
- conserva todas las paletas anteriores: Grass, Ocean, Violet, Amber, Crimson y Mono

Si todavía se ve alguna zona plana, el siguiente paso ya no es más CSS global: será tocar las páginas Astro una por una para darles composición propia.
