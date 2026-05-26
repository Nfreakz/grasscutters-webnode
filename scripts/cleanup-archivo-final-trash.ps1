param(
  [switch]$DryRun,
  [switch]$KeepPreview
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Remove-TargetFile($Path) {
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    if ($DryRun) {
      Write-Host "[DRY] Borraria archivo: $Path" -ForegroundColor Yellow
    } else {
      Remove-Item -LiteralPath $Path -Force
      Write-Host "[OK] Archivo borrado: $Path" -ForegroundColor Green
    }
  }
}

function Remove-TargetDirIfEmpty($Path) {
  if (Test-Path -LiteralPath $Path -PathType Container) {
    $items = Get-ChildItem -LiteralPath $Path -Force
    if ($items.Count -eq 0) {
      if ($DryRun) {
        Write-Host "[DRY] Borraria carpeta vacia: $Path" -ForegroundColor Yellow
      } else {
        Remove-Item -LiteralPath $Path -Force
        Write-Host "[OK] Carpeta vacia borrada: $Path" -ForegroundColor Green
      }
    } else {
      Write-Host "[SKIP] Carpeta no vacia, no se toca: $Path" -ForegroundColor DarkYellow
    }
  }
}

function Remove-KnownExtractedFilesFolder() {
  $path = "files"
  if (!(Test-Path -LiteralPath $path -PathType Container)) { return }

  $knownMarkers = @(
    "files/src/components/archive/ArchiveDossierPage.astro",
    "files/src/pages/archivo/dossier-preview.astro",
    "files/src/pages/archivo-motorsport/_dossier-preview.astro",
    "files/scripts/import-archivo-csv.mjs",
    "files/scripts/cleanup-archivo-trash.ps1"
  )

  $hasMarker = $false
  foreach ($marker in $knownMarkers) {
    if (Test-Path -LiteralPath $marker) {
      $hasMarker = $true
      break
    }
  }

  if ($hasMarker) {
    if ($DryRun) {
      Write-Host "[DRY] Borraria carpeta extraida del ZIP: files/" -ForegroundColor Yellow
    } else {
      Remove-Item -LiteralPath $path -Recurse -Force
      Write-Host "[OK] Carpeta extraida del ZIP borrada: files/" -ForegroundColor Green
    }
  } else {
    Write-Host "[SKIP] Existe files/ pero no parece de estos packs. No se toca." -ForegroundColor DarkYellow
  }
}

Write-Host "Limpieza Archivo v14.x - GrassCutters" -ForegroundColor Green
if ($DryRun) {
  Write-Host "Modo prueba activado. No se borrara nada." -ForegroundColor Yellow
}
if ($KeepPreview) {
  Write-Host "KeepPreview activado. Se conserva src/pages/archivo/dossier-preview.astro" -ForegroundColor Yellow
}

Write-Step "Limpiando rutas equivocadas de archivo-motorsport"
$wrongPreviewFiles = @(
  "src/pages/archivo-motorsport/_dossier-preview.astro",
  "src/pages/archivo-motorsport/dossier-preview.astro",
  "src/pages/archivo-motorsport/index.astro",
  "src/pages/archivo-motorsport/[tipo]/index.astro",
  "src/pages/archivo-motorsport/[tipo]/[slug].astro"
)
foreach ($file in $wrongPreviewFiles) { Remove-TargetFile $file }

Remove-TargetDirIfEmpty "src/pages/archivo-motorsport/[tipo]"
Remove-TargetDirIfEmpty "src/pages/archivo-motorsport"
Remove-TargetDirIfEmpty "src/pages"

Write-Step "Limpiando previews temporales de Archivo"
Remove-TargetFile "src/pages/archivo/_dossier-preview.astro"
if (!$KeepPreview) {
  Remove-TargetFile "src/pages/archivo/dossier-preview.astro"
}

Write-Step "Limpiando scripts temporales/obsoletos de los packs anteriores"
$oldScripts = @(
  "scripts/cleanup-wrong-archivo-motorsport-preview.ps1",
  "scripts/cleanup-wrong-archivo-motorsport-preview.cmd",
  "scripts/cleanup-archivo-v14-wrong-routes.ps1",
  "scripts/cleanup-archivo-v14-wrong-routes.cmd",
  "scripts/cleanup-archivo-trash.ps1",
  "scripts/cleanup-archivo-trash.cmd",
  "scripts/cleanup-archivo-app-layout-trash.ps1",
  "scripts/cleanup-archivo-app-layout-trash.cmd"
)
foreach ($file in $oldScripts) { Remove-TargetFile $file }

Write-Step "Limpiando CSV/docs duplicados de los ZIP"
$duplicateFiles = @(
  "LEEME_LIMPIEZA_ARCHIVO_V14.md",
  "LEEME_IMPORTACION_GC_MUGELLO_GT2.txt",
  "docs/INSTRUCCIONES_ARCHIVO_DOSSIER.md",
  "docs/INSTRUCCIONES_ARCHIVO_V14_2.md",
  "csv/00_todo_mugello_gt2_motorsport_v2.csv",
  "csv/01_circuitos_motorsport_v2.csv",
  "csv/03_vehiculos_motorsport_v2.csv",
  "csv/archivo_motorsport_schema_v2.csv",
  "csv/archivo_motorsport_v3.csv",
  "csv/archivo_motorsport_schema_v3.csv"
)
foreach ($file in $duplicateFiles) { Remove-TargetFile $file }

Remove-TargetDirIfEmpty "docs"
Remove-TargetDirIfEmpty "csv"

Write-Step "Limpiando carpeta files/ si se extrajo el ZIP entero por error"
Remove-KnownExtractedFilesFolder

Write-Step "Comprobacion de archivos finales que deben conservarse"
$requiredFiles = @(
  "src/components/archive/ArchiveDossierPage.astro",
  "src/styles/archive-dossier.css",
  "src/lib/archive/archiveData.ts",
  "src/data/archive/items.json",
  "src/pages/archivo/index.astro",
  "src/pages/archivo/[tipo]/index.astro",
  "src/pages/archivo/[tipo]/[slug].astro",
  "scripts/import-archivo-csv.mjs",
  "scripts/import-archivo-csv.cmd",
  "_imports/archivo/archivo_motorsport_v3.csv"
)

foreach ($file in $requiredFiles) {
  if (Test-Path -LiteralPath $file) {
    Write-Host "[OK] Conservado: $file" -ForegroundColor Green
  } else {
    Write-Host "[WARN] No encontrado: $file" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Limpieza terminada." -ForegroundColor Green
Write-Host "Siguiente paso recomendado:" -ForegroundColor Cyan
Write-Host "  npm run build"
Write-Host ""
Write-Host "Para revisar antes de borrar, usa:" -ForegroundColor Cyan
Write-Host "  .\scripts\cleanup-archivo-final-trash.cmd -DryRun"
Write-Host ""
