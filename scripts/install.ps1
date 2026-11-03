param(
    [string]$VaultPath = 'C:\Users\Owner\Desktop\school'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $VaultPath '.obsidian') -PathType Container)) {
    throw "Obsidian vault configuration not found: $VaultPath"
}
$runtimeFiles = @('main.js', 'manifest.json', 'styles.css')
foreach ($name in $runtimeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $name) -PathType Leaf)) {
        throw "Missing $name. Run npm run build first."
    }
}
$destination = Join-Path $VaultPath '.obsidian\plugins\tikz-editor'
if (Test-Path -LiteralPath $destination) {
    Write-Host "Existing installation contents (other files are preserved):"
    Get-ChildItem -Force -LiteralPath $destination | Select-Object Name, Length | Out-Host
    $manifestPath = Join-Path $destination 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath) {
        $existing = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        if ($existing.id -ne 'tikz-editor') { throw 'Existing manifest belongs to another plugin.' }
    } elseif (@(Get-ChildItem -Force -LiteralPath $destination).Count -gt 0) {
        throw 'Nonempty destination has no plugin manifest; inspect it before installing.'
    }
} else {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
}
foreach ($name in $runtimeFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Join-Path $destination $name) -Force
}
Write-Host "Installed runtime files into $destination"
