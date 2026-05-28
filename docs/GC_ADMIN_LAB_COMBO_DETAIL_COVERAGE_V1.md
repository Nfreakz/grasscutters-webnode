# GC Admin Lab Combo Detail Coverage v1

Fecha: 2026-05-28  
Pack: `GC_Admin_Lab_Combo_Detail_Coverage_v1`

## Objetivo

Actualizar `/admin/endpoints` para que también pruebe la ficha de combo Data Core y el sistema de imágenes de circuito.

Después de añadir:

```txt
/api/gc/combos/:comboId
```

el Lab todavía no lo cubría.

## Qué añade en `/admin/endpoints`

### Nuevo input

```txt
ComboId para ficha
```

Valor por defecto:

```txt
47
```

### Nuevos endpoints probados

```txt
/api/gc/combos/:comboId
/api/gc/assets/tracks
/gc-track-images-manifest.json
```

### Nuevos validadores

Para `/api/gc/combos/:comboId` comprueba:

```txt
item existe
summary existe
leaderboard es array
recentLaps es array
trackName existe
source = gc-data-core
totalLaps > 0
```

Para imágenes comprueba:

```txt
items array
si no hay imágenes reales, warning
manifest disponible
```

## Por qué es importante

Ya hemos visto que los problemas no siempre son HTTP 500:

```txt
endpoint OK pero nombres desconocidos
endpoint OK pero recent laps vacío
endpoint OK pero imagen no aparece
```

El Lab debe controlar esos puntos antes de limpiar legacy.

## Archivos modificados

```txt
src/pages/admin/endpoints.astro
```

## Qué NO toca

```txt
Data Core server
combos detail page
imágenes reales
/app
/hotlaps
/combos
endpoints existentes
```

## Aplicación

```powershell
node scripts/apply-gc-admin-lab-combo-detail-coverage-v1.cjs
npm run build
npm run dev
```

## Prueba

Abre:

```txt
http://localhost:4321/admin/endpoints
```

Ejecuta:

```txt
Ejecutar críticos
```

Debe incluir ahora:

```txt
Combo detail Data Core
```

Y debería salir:

```txt
OK
```

Si falla, copia informe y revisamos `/api/gc/combos/:comboId`.
