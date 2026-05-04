# Parche 25a - Diagnóstico MySQL

Este parche añade una ruta segura de diagnóstico:

```txt
/api/mysql/status
```

La ruta no muestra contraseñas. Solo confirma si las variables están configuradas, si conecta a MySQL y si las tablas de app existen.

También cambia `gc_settings.setting_value` de `JSON` a `LONGTEXT` para evitar problemas con versiones de MariaDB/MySQL que tratan JSON de forma diferente.

## Lectura rápida de errores comunes

- `ER_ACCESS_DENIED_ERROR`: usuario o password incorrectos, o usuario sin permisos sobre la base.
- `ECONNREFUSED`: host/puerto incorrecto.
- `ER_BAD_DB_ERROR`: nombre de base de datos incorrecto.
- `ERR_MODULE_NOT_FOUND` con `mysql2`: falta ejecutar `npm install` o redeploy con package.json actualizado.

