# Limpieza segura del preview creado en una ruta equivocada.
# Ejecutar desde la raíz del proyecto: G:\Web Node\grasscutters-webnode

$ErrorActionPreference = "Stop"

$wrongFiles = @(
  "src\pages\archivo-motorsport\_dossier-preview.astro",
  "src\pages\archivo-motorsport\dossier-preview.astro"
)

foreach ($file in $wrongFiles) {
  if (Test-Path $file) {
    Remove-Item $file -Force
    Write-Host "Eliminado: $file"
  } else {
    Write-Host "No existe, ok: $file"
  }
}

$wrongDir = "src\pages\archivo-motorsport"
if (Test-Path $wrongDir) {
  $items = Get-ChildItem $wrongDir -Force
  if ($items.Count -eq 0) {
    Remove-Item $wrongDir -Force
    Write-Host "Carpeta vacía eliminada: $wrongDir"
  } else {
    Write-Host "Carpeta no eliminada porque contiene otros archivos: $wrongDir"
  }
}

Write-Host "Limpieza terminada. La ruta correcta del preview es: src\pages\archivo\dossier-preview.astro"
