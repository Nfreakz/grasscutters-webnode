# GC Combo Detail Image After Data Core Fix v1

Fecha: 2026-05-28  
Pack: `GC_Combo_Detail_Image_After_DataCore_Fix_v1`

## Problema

Después de activar Data Core primary en la ficha:

```txt
/combos/:comboId
```

la imagen del circuito volvió a no cargar.

## Causa probable

La ficha seguía cargando el helper antiguo:

```txt
/js/gc-track-images.js
```

Ese helper podía pisar o interferir con:

```txt
/js/gc-track-image.js
```

que es el fuzzy resolver nuevo.

Además, la imagen se renderizaba en un momento frágil del ciclo:

```txt
fetch combo
renderTrackImage
scripts externos todavía pueden no haber terminado
```

## Qué hace este fix

1. Elimina de la ficha dinámica:

```txt
<script is:inline src="/js/gc-track-images.js"></script>
```

2. Mantiene/añade:

```txt
<script is:inline src="/js/gc-track-image.js"></script>
```

3. Reemplaza `renderTrackImage()` por una versión endurecida:

```txt
GCTrackImages.load()
GCTrackImages.bestAsset(trackName)
GCTrackImages.candidates(trackName)
GCTrackImages.placeholderUrl(trackName)
fallback SVG local
```

4. Llama a la imagen tres veces de forma controlada:

```txt
al renderizar datos
+450 ms
+1500 ms
```

Esto evita que falle por orden de carga.

5. No oculta la imagen salvo que no haya ni track ni nodo de imagen.

## Qué NO toca

```txt
/api/gc/combos/:comboId
Data Core
leaderboard
recent laps
/combos cards
/hotlaps
/app
assets reales
```

## Aplicación

```powershell
node scripts/apply-gc-combo-detail-image-after-datacore-fix-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos/47
```

Hard refresh:

```txt
Ctrl + F5
```

Consola:

```js
document.documentElement.dataset.gcComboDetailTrackImage
document.getElementById('comboTrackImage')?.dataset
document.getElementById('comboTrackImage')?.src
```

Resultado esperado:

```txt
hardened-v1
data-gc-track-image-source = fuzzy / placeholder / local-placeholder
```

Si hay imagen real compatible:

```txt
data-gc-track-image-source = fuzzy
data-gc-track-image-file = ...
```

Si no hay imagen real compatible:

```txt
se muestra placeholder SVG
```

pero la figura no debería desaparecer.
