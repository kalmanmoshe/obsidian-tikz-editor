param(
    [string]$VaultPath
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PSBoundParameters.ContainsKey('VaultPath')) {
    $configPath = Join-Path $projectRoot 'install.local.json'
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw 'Missing install.local.json. Copy install.local.example.json to install.local.json and set vaultPath, or pass -VaultPath.'
    }
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    } catch {
        throw "Could not read install.local.json as JSON: $($_.Exception.Message)"
    }
    if ($config.vaultPath -isnot [string] -or [string]::IsNullOrWhiteSpace($config.vaultPath)) {
        throw 'install.local.json must contain a nonempty vaultPath string.'
    }
    $VaultPath = $config.vaultPath
}
if ([string]::IsNullOrWhiteSpace($VaultPath)) {
    throw 'VaultPath must not be empty.'
}
if (-not [System.IO.Path]::IsPathRooted($VaultPath)) {
    $VaultPath = Join-Path $projectRoot $VaultPath
}
$VaultPath = [System.IO.Path]::GetFullPath($VaultPath)
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
    $manifestPath = Join-Path $destination 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath) {
        $existing = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        if ($existing.id -ne 'tikz-editor') { throw 'Existing manifest belongs to another plugin.' }
    } elseif (@(Get-ChildItem -Force -LiteralPath $destination).Count -gt 0) {
        throw 'Nonempty destination has no plugin manifest; inspect it before installing.'
    }
    $backup = Join-Path $projectRoot ('runtime-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($name in ($runtimeFiles + @('editor.js', 'editor.css'))) {
        $previous = Join-Path $destination $name
        if (Test-Path -LiteralPath $previous -PathType Leaf) {
            Copy-Item -LiteralPath $previous -Destination (Join-Path $backup $name)
        }
    }
    Write-Host "Previous runtime backed up to $backup"
} else {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
}
# Copy main.js last so development reloaders see a complete installation.
foreach ($name in @('manifest.json', 'styles.css', 'main.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Join-Path $destination $name) -Force
}
foreach ($name in @('editor.js', 'editor.css')) {
    $obsolete = Join-Path $destination $name
    if (Test-Path -LiteralPath $obsolete -PathType Leaf) { Remove-Item -LiteralPath $obsolete }
}
Write-Host "Installed main.js, styles.css, manifest and notices into $destination"
