# GC Admin Local Audit v1

Fecha: 2026-05-29T12:52:00.259Z

Root: G:\Web Node\grasscutters-webnode

## Resumen

| Total | OK | Fallos | Alta | Media | Baja |
|---:|---:|---:|---:|---:|---:|
| 67 | 66 | 1 | 0 | 1 | 0 |

## Prioridad media

- **Paginación · src/pages/admin/archivo.astro sin gc-admin-pagination.js**: Evitar doble paginación

## Detalle por grupo

### Archivos

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | info | src/pages/admin.astro | Existe |
| OK | info | src/components/AdminSubnav.astro | Existe |
| OK | info | src/pages/admin/usuarios.astro | Existe |
| OK | info | src/pages/admin/noticias.astro | Existe |
| OK | info | src/pages/admin/noticias/importar.astro | Existe |
| OK | info | src/pages/admin/noticias/imagenes.astro | Existe |
| OK | info | src/pages/admin/archivo.astro | Existe |
| OK | info | src/pages/admin/archivo/importar.astro | Existe |
| OK | info | src/pages/admin/archivo/imagen-url.astro | Existe |
| OK | info | src/server/index.ts | Existe |
| OK | info | src/server/news-routes.ts | Existe |
| OK | info | src/server/motorsport-archive-unified-admin-routes.ts | Existe |

### Navegación admin

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | medium | AdminSubnav agrupado | Busca clase gc-admin-subnav-v2 |
| OK | medium | Grupo Base | Debe existir grupo Base |
| OK | medium | Grupo Contenido | Debe existir grupo Contenido |
| OK | medium | Grupo Herramientas | Debe existir grupo Herramientas |
| OK | medium | Subnav enlace /admin/noticias | /admin/noticias |
| OK | medium | Subnav enlace /admin/noticias/importar | /admin/noticias/importar |
| OK | medium | Subnav enlace /admin/noticias/imagenes | /admin/noticias/imagenes |
| OK | medium | Subnav enlace /admin/archivo | /admin/archivo |
| OK | medium | Subnav enlace /admin/archivo/importar | /admin/archivo/importar |
| OK | medium | Subnav enlace /admin/archivo/imagen-url | /admin/archivo/imagen-url |

### Home admin

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | medium | Hub v1 aplicado | Busca clase del hub |
| OK | medium | Enlace Noticias | /admin/noticias |
| OK | medium | Enlace Archivo | /admin/archivo |
| OK | medium | ACSM sync conservado | Sync combo |
| OK | medium | Status admin conservado | /api/admin/status |

### Archivo backend

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | high | Router recibe requireAdmin | Busca RequireAdmin |
| OK | high | Middleware protege unified | Protección admin |
| OK | high | PATCH media acepta url | Edición real de URL |
| OK | medium | CSV aliases presentes | Alias importador Archivo |
| OK | medium | seoTitle importable | Campos SEO Archivo |
| OK | medium | datos_sim_racing importable | Campo datos_sim_racing |
| OK | high | index pasa requireAdmin al router Archivo | Registro router |

### Noticias backend

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | high | Persiste imageSource | imageSource |
| OK | high | Persiste imageAuthor | imageAuthor |
| OK | high | Persiste imageLicense | imageLicense |
| OK | high | Persiste imageSourceUrl | imageSourceUrl |
| OK | high | Persiste tags | tags |
| OK | high | Persiste seoTitle | seoTitle |
| OK | high | Persiste seoDescription | seoDescription |
| OK | high | Admin protegido con requireAdmin | Rutas admin news |
| OK | medium | Upload news existe | Endpoint image-upload |

### Usuarios backend

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | high | app.get('/api/admin/users' | app.get('/api/admin/users' |
| OK | high | app.post('/api/admin/users/:id/role' | app.post('/api/admin/users/:id/role' |
| OK | high | app.post('/api/admin/users/:id/revoke-sessions' | app.post('/api/admin/users/:id/revoke-sessions' |
| OK | high | app.post('/api/admin/users/:id/password' | app.post('/api/admin/users/:id/password' |
| OK | high | app.get('/api/admin/unlinked-pilots' | app.get('/api/admin/unlinked-pilots' |
| OK | medium | Bloque users endpoints v1 | Anchor patch usuarios backend |
| OK | high | Protege último admin | No quitar último admin |

### Usuarios frontend

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | info | No usa tryUserAction | No debe haber llamadas alternativas |
| OK | high | Usa endpoint role directo | Role endpoint |
| OK | high | Usa endpoint revoke directo | Revoke endpoint |
| OK | high | Usa endpoint password directo | Password endpoint |
| OK | info | Sin gc-admin-pagination.js | Evitar doble paginación |

### Noticias frontend

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | medium | Importador existe | Página importar noticias |
| OK | medium | Biblioteca imágenes existe | Página imágenes noticias |
| OK | medium | Categorías correctas | Categorías newsroom |
| OK | medium | No enlace público para drafts en gestor | Draft public links fix |
| OK | medium | No enlace público para drafts en imágenes | Draft public links fix imágenes |

### Paginación

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| FAIL | medium | src/pages/admin/archivo.astro sin gc-admin-pagination.js | Evitar doble paginación |
| OK | info | src/pages/admin/noticias.astro sin gc-admin-pagination.js | Evitar doble paginación |
| OK | info | src/pages/admin/noticias/imagenes.astro sin gc-admin-pagination.js | Evitar doble paginación |
| OK | info | src/pages/admin/archivo/imagen-url.astro sin gc-admin-pagination.js | Evitar doble paginación |
| OK | info | src/pages/admin/usuarios.astro sin gc-admin-pagination.js | Evitar doble paginación |

### Endpoints admin

| Estado | Severidad | Check | Detalle |
|---|---|---|---|
| OK | info | Existe página endpoints | src/pages/admin/endpoints.astro |
| OK | low | No usa lista demasiado antigua | Revisar manualmente si sale warning |

## Siguiente acción recomendada

Resolver los checks medios o confirmar que son avisos aceptables.

