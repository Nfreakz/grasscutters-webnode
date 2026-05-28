# GC Race Data Core Diagnostics v1

Fecha: 2026-05-28  
Pack: `GC_Race_Data_Core_Diagnostics_v1`

## Objetivo

Añadir un endpoint seguro para comprobar si Race Data Core está sano antes de seguir limpiando UI o lógica legacy.

## Endpoint añadido

```txt
GET /api/gc/diagnostics
```

## Qué revisa

```txt
Stracker existe
Stracker es SQLite válido
Stracker tiene tamaño/fecha
Display names están cargados
Pipeline rawName → autoName → displayName está documentado
Vueltas leídas
Vueltas válidas/no válidas
Pilotos/coches/circuitos únicos
Combos generados
Último combo detectado por Stracker
Endpoints canónicos disponibles
Warnings no críticos
```

## Qué NO expone

No debe exponer:

```txt
resolvedPath
rutas absolutas internas
credenciales
variables de entorno sensibles
tokens
emails de usuarios
sesiones
```

El endpoint está pensado para poder usarse como diagnóstico seguro.

## Separación de dominios

Este endpoint pertenece a:

```txt
Race Data Core = Stracker
```

No incluye ACSM. ACSM queda para:

```txt
Championship Core
```

No incluye archivo motorsport. Archivo queda para:

```txt
Archive Core
```

## Ejemplo de respuesta

```json
{
  "ok": true,
  "source": "gc-race-data-core",
  "health": "ok_with_warnings",
  "stracker": {
    "exists": true,
    "validSQLite": true,
    "sizeMb": 42.8,
    "modifiedAt": "..."
  },
  "displayNames": {
    "loaded": true,
    "total": 15,
    "enabled": 15,
    "pipeline": {
      "order": ["rawName", "autoName", "displayName"]
    }
  },
  "raceData": {
    "readable": true,
    "lapsCount": 5000,
    "validLapsCount": 4200,
    "driversCount": 120,
    "carsCount": 18,
    "tracksCount": 7,
    "combosCount": 28,
    "activeCombosCount": 12,
    "latestCombo": {}
  },
  "warnings": []
}
```

## Aplicación

```powershell
node scripts/apply-gc-race-data-core-diagnostics-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/api/gc/diagnostics
```

## Interpretación rápida

### OK

```txt
ok: true
health: ok
```

Todo correcto.

### OK con warnings

```txt
ok: true
health: ok_with_warnings
```

Funciona, pero conviene revisar. Ejemplos:

```txt
no display-name overrides enabled
latest lap date not detected
```

### Degraded

```txt
ok: false
health: degraded
```

Normalmente falta Stracker o no es SQLite válido.

### Error

```txt
ok: false
health: error
```

Ha fallado la lectura o alguna función interna.

## Próximo paso recomendado

Después de validar este endpoint:

1. Revisar si `/api/admin/stracker/sync` invalida correctamente la caché.
2. Crear `Stracker Sync Cache Guard`.
3. Crear `Championship Core Skeleton` separado para ACSM.
