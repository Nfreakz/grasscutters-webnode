# GC Pre Git Deploy Checklist v1

Fecha: 2026-05-28  
Estado: preparado para commit y subida web

## Limpieza aplicada

Ejecutar:

```powershell
node scripts/cleanup-gc-pre-git-deploy-v1.cjs
```

Esto elimina scripts temporales de aplicación:

```txt
scripts/apply-gc-*.cjs
```

Mantiene:

```txt
scripts/audit-gc-data-core-runtime-v1.cjs
docs/GC_DATA_CORE_FINAL_AUDIT_V1.md
docs/GC_DATA_CORE_ENDPOINTS_MAP_V1.md
docs/GC_RUNTIME_CLEAN_BASELINE_V1.md
```

También genera:

```txt
docs/GC_PRE_GIT_DEPLOY_CLEANUP_REPORT_V1.json
```

## Validación obligatoria antes de commit

```powershell
node scripts/audit-gc-data-core-runtime-v1.cjs
npm run build
```

Luego abrir local:

```txt
http://localhost:4321/admin/endpoints
```

Ejecutar:

```txt
Ejecutar críticos
Probar legacy aliases
```

Resultado esperado:

```txt
fails = 0
```

## Revisión visual mínima

Abrir:

```txt
/app
/hotlaps
/combos
/combos/36
/pilotos
/admin/endpoints
```

Comprobar:

```txt
/combos no muestra combos con 1 piloto
Zolder no aparece duplicado con 5 vueltas
/coches del combo solo muestra coches con >= 5 vueltas
/pilotos sigue mostrando vueltas reales
/hotlaps sigue mostrando ranking
```

## Commit recomendado

```powershell
git status
git add src docs scripts public package.json package-lock.json
git commit -m "Stabilize Race Data Core and canonical combo logic"
git push origin main
```

Si `git add src docs scripts public package.json package-lock.json` da error porque algún archivo no existe, usar:

```powershell
git add .
```

pero revisando antes con:

```powershell
git status
```

## Deploy web

Después del push:

1. Entrar en el panel donde esté conectada la web.
2. Lanzar redeploy desde la rama `main`.
3. Revisar logs de build.
4. Abrir `/admin/endpoints` online.
5. Ejecutar críticos y legacy aliases online.
6. Revisar `/combos`, `/combos/36`, `/pilotos`, `/hotlaps`.

## Punto importante

No borrar todavía endpoints legacy del servidor.

Estado actual correcto:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/combos/:comboId
/api/pilots
/api/drivers
/api/stats/overview
```

siguen vivos, pero deben responder con:

```txt
source = gc-data-core-legacy-server-alias
```

## Base estable actual

La web queda preparada para empezar rediseño visual sobre:

```txt
Race Data Core centralizado
Display Names centralizado
Identity Core separado
Championship Core separado de Stracker
Combo Canonical Public Filter activo
Endpoint Lab como banco de pruebas
```
