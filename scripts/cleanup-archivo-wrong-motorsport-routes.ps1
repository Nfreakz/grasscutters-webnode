$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "Cleaning wrong archivo-motorsport preview routes..."
$files = @(
  "src/pages/archivo-motorsport/_dossier-preview.astro",
  "src/pages/archivo-motorsport/dossier-preview.astro"
)
foreach ($file in $files) {
  if (Test-Path $file) { Remove-Item $file -Force }
}
if (Test-Path "src/pages/archivo-motorsport") {
  try { Remove-Item "src/pages/archivo-motorsport" -Force } catch {}
}
Write-Host "Done."
