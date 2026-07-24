[CmdletBinding()]
param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$OutputDirectory = "",
    [switch]$IncludeDist,
    [switch]$IncludeRuntimeData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $ProjectRoot "_handoff"
}

$projectName = Split-Path $ProjectRoot -Leaf
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$zipName = "${projectName}_CODIGO_COMPLETO_${timestamp}.zip"
$zipPath = Join-Path $OutputDirectory $zipName
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "gc_handoff_$([guid]::NewGuid().ToString('N'))"
$stageProject = Join-Path $stageRoot $projectName

$excludedDirectoryNames = @(
    ".git", ".idea", ".vscode", ".astro", ".cache", ".parcel-cache",
    "node_modules", "coverage", "tmp", "temp", "logs", "_handoff",
    "playwright-report", "test-results"
)
if (-not $IncludeDist) {
    $excludedDirectoryNames += @("dist", "build", ".next", "out")
}

$excludedFileNames = @(
    ".env", ".env.local", ".env.production", ".env.development",
    ".env.test", ".npmrc", ".yarnrc", ".pnpmfile.cjs",
    "id_rsa", "id_ed25519", "known_hosts"
)

$excludedExtensions = @(
    ".log", ".tmp", ".temp", ".bak", ".swp", ".swo",
    ".pem", ".key", ".pfx", ".p12", ".crt", ".cer"
)
if (-not $IncludeRuntimeData) {
    $excludedExtensions += @(".db", ".db3", ".sqlite", ".sqlite3", ".dump")
}

function Test-ExcludedPath {
    param([System.IO.FileInfo]$File)

    $relative = $File.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")
    $parts = $relative -split '[\\/]'

    foreach ($part in $parts[0..([Math]::Max(0, $parts.Count - 2))]) {
        if ($excludedDirectoryNames -contains $part) { return $true }
    }

    if ($excludedFileNames -contains $File.Name) { return $true }
    if ($excludedExtensions -contains $File.Extension.ToLowerInvariant()) { return $true }
    if ($File.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $true }

    return $false
}

try {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    New-Item -ItemType Directory -Force -Path $stageProject | Out-Null

    $copied = New-Object System.Collections.Generic.List[object]
    $skipped = New-Object System.Collections.Generic.List[string]

    Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse -Force | ForEach-Object {
        $file = $_
        $relative = $file.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")

        if (Test-ExcludedPath -File $file) {
            $skipped.Add($relative)
            return
        }

        $destination = Join-Path $stageProject $relative
        $destinationParent = Split-Path $destination -Parent
        New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force

        $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
        $copied.Add([pscustomobject]@{
            Path   = $relative.Replace("\", "/")
            Bytes  = $file.Length
            SHA256 = $hash
        })
    }

    $manifest = [ordered]@{
        packageFormat       = 1
        createdAt           = (Get-Date).ToUniversalTime().ToString("o")
        projectName         = $projectName
        sourceRoot          = $ProjectRoot
        includeDist         = [bool]$IncludeDist
        includeRuntimeData  = [bool]$IncludeRuntimeData
        fileCount           = $copied.Count
        totalBytes          = ($copied | Measure-Object -Property Bytes -Sum).Sum
        files               = $copied | Sort-Object Path
        excludedPaths       = $skipped | Sort-Object
    }

    $manifestPath = Join-Path $stageProject "HANDOFF_MANIFEST.json"
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    $readmePath = Join-Path $stageProject "LEEME_HANDOFF.txt"
    @"
Paquete de continuidad de $projectName
Creado: $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss K"))

Incluye código fuente, configuración no secreta, scripts, migraciones,
documentación y archivos de dependencias.

Excluye por defecto:
- node_modules, .git, cachés, logs y resultados de pruebas
- dist/build (usar -IncludeDist para incluirlos)
- .env, certificados, claves y configuración privada de npm
- bases de datos y volcados (usar -IncludeRuntimeData solo si es imprescindible)

HANDOFF_MANIFEST.json contiene el inventario y SHA-256 de cada archivo.
Antes de compartir el ZIP, confirma que no hayas guardado contraseñas dentro
de archivos fuente con nombres no convencionales.
"@ | Set-Content -LiteralPath $readmePath -Encoding UTF8

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -LiteralPath $stageProject -DestinationPath $zipPath -CompressionLevel Optimal

    $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $zipSize = (Get-Item -LiteralPath $zipPath).Length

    Write-Host ""
    Write-Host "ZIP creado correctamente" -ForegroundColor Green
    Write-Host "Ruta:    $zipPath"
    Write-Host "Archivos: $($copied.Count)"
    Write-Host "Tamaño:   $([Math]::Round($zipSize / 1MB, 2)) MB"
    Write-Host "SHA-256:  $zipHash"
    Write-Host ""
    Write-Host "Envíame este ZIP para continuar con la fase 4I." -ForegroundColor Cyan
}
finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}
