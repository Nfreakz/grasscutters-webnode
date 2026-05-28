# GC Legacy Removal Plan v1 Pack

Este pack fija un punto verde antes de empezar a retirar legacy.

## Estado validado

```txt
Endpoint Lab
total: 25
ok: 23
warnings: 2
fails: 0
```

Warnings aceptados:

```txt
Archive Core sin GC_ARCHIVE_CORE_SOURCE_URL
```

## Uso

```powershell
node scripts/apply-gc-legacy-removal-plan-v1.cjs
```

Después:

```powershell
git add docs/GC_RACE_DATA_CORE_GREEN_BASELINE_V1.md docs/GC_LEGACY_REMOVAL_PLAN_V1.md README_GC_LEGACY_REMOVAL_PLAN_V1.md
git commit -m "Document Data Core green baseline and legacy removal plan"
```
