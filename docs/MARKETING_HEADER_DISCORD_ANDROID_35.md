# Pack 35 - Marketing header, Discord y Android público

## Objetivo

Separar mejor la zona pública de la plataforma interna.

## Cambios

- Header público actualizado.
- Enlaces públicos actuales: Inicio, Comunidad, Datos, Discord, App Android, Login y Plataforma.
- Discord queda como página pública en `/discord`.
- App Android queda como página pública en `/app-android`.
- Landing añade bloques claros para Discord y Android.
- Control panel no añade enlaces de Discord ni Android.
- Topbar interna queda centrada en módulos de plataforma: Landing, Hotlaps, Combos, Pilotos, Perfil y Admin.

## Variables opcionales

```env
PUBLIC_DISCORD_INVITE_URL=https://discord.gg/tu-invitacion
PUBLIC_ANDROID_APK_URL=https://tu-url/grasscutters-android.apk
```

Si no se configura `PUBLIC_ANDROID_APK_URL`, la página de Android apunta a:

```txt
/downloads/grasscutters-android.apk
```

Para usar esta ruta, coloca el APK en:

```txt
public/downloads/grasscutters-android.apk
```
