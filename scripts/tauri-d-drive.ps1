[CmdletBinding()]
param(
    [ValidateSet('info', 'dev', 'build')]
    [string]$Action = 'build',

    [ValidateSet('all', 'nsis', 'msi')]
    [string]$Bundle = 'all',

    [switch]$DebugBuild,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$buildRoot = if ($env:GITTDCR_BUILD_ROOT) {
    [System.IO.Path]::GetFullPath($env:GITTDCR_BUILD_ROOT)
} else {
    'D:\GITTDCR-Build'
}

if (-not (Test-Path -LiteralPath ([System.IO.Path]::GetPathRoot($buildRoot)))) {
    throw "Build drive is unavailable: $buildRoot"
}

$cargoHome = Join-Path $buildRoot 'cargo-home'
$cargoTarget = Join-Path $buildRoot 'cargo-target'
$npmCache = Join-Path $buildRoot 'npm-cache'
$tempRoot = Join-Path $buildRoot 'temp'
$localAppData = Join-Path $buildRoot 'localappdata'
$artifactRoot = Join-Path $buildRoot 'artifacts'

@(
    $buildRoot,
    $cargoHome,
    $cargoTarget,
    $npmCache,
    $tempRoot,
    $localAppData,
    $artifactRoot
) | ForEach-Object {
    New-Item -ItemType Directory -Path $_ -Force | Out-Null
}

# Keep Rust registries, compiled targets, npm downloads, temporary files and
# Tauri bundler tool downloads off the source drive.
$env:CARGO_HOME = $cargoHome
$env:CARGO_TARGET_DIR = $cargoTarget
$env:npm_config_cache = $npmCache
$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:LOCALAPPDATA = $localAppData

function Get-BuildSourceId {
    $sourceRoots = @(
        (Join-Path $repoRoot 'src'),
        (Join-Path $repoRoot 'src-tauri'),
        (Join-Path $repoRoot 'scripts')
    )
    $topLevelFiles = @(
        'package.json',
        'package-lock.json',
        'index.html',
        'vite.config.js',
        'tsconfig.json',
        'vitest.config.ts',
        'eslint.config.js'
    ) | ForEach-Object { Join-Path $repoRoot $_ }
    $files = @(
        $sourceRoots | ForEach-Object {
            if (Test-Path -LiteralPath $_) {
                Get-ChildItem -LiteralPath $_ -Recurse -File
            }
        }
        $topLevelFiles | ForEach-Object {
            if (Test-Path -LiteralPath $_) {
                Get-Item -LiteralPath $_
            }
        }
    ) | Sort-Object FullName -Unique

    $hasher = [System.Security.Cryptography.IncrementalHash]::CreateHash(
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )
    try {
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
            $hasher.AppendData([System.Text.Encoding]::UTF8.GetBytes($relativePath + "`0"))
            $hasher.AppendData([System.IO.File]::ReadAllBytes($file.FullName))
            $hasher.AppendData([byte[]](0))
        }
        $sourceHash = ([BitConverter]::ToString($hasher.GetHashAndReset())).Replace('-', '').ToLowerInvariant()
    } finally {
        $hasher.Dispose()
    }

    $gitHead = (& git -C $repoRoot rev-parse --short=12 HEAD 2>$null).Trim()
    $isDirty = [bool](& git -C $repoRoot status --porcelain=v1 2>$null)
    if ($gitHead) {
        if ($isDirty) {
            return "$gitHead-dirty-$($sourceHash.Substring(0, 12))"
        }
        return $gitHead
    }
    return "source-$($sourceHash.Substring(0, 16))"
}

if (-not $env:VITE_BUILD_COMMIT) {
    $env:VITE_BUILD_COMMIT = Get-BuildSourceId
}

function Import-MsvcEnvironment {
    $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) {
        throw 'Visual Studio Build Tools were not found. Install MSVC x64/x86 and Windows SDK first.'
    }

    $installationPath = (& $vswhere `
        -latest `
        -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath).Trim()
    if (-not $installationPath) {
        throw 'MSVC x64/x86 component is not installed.'
    }

    $vsDevCmd = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
    if (-not (Test-Path -LiteralPath $vsDevCmd)) {
        throw "VsDevCmd.bat is missing: $vsDevCmd"
    }

    Push-Location (Split-Path -Parent $vsDevCmd)
    try {
        $environmentLines = & $env:ComSpec /d /c 'call VsDevCmd.bat -arch=x64 -host_arch=x64 >nul && set'
        if ($LASTEXITCODE -ne 0) {
            throw "VsDevCmd.bat exited with code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }

    foreach ($line in $environmentLines) {
        if ($line -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
    }

    $linker = Get-Command link.exe -ErrorAction SilentlyContinue
    $compiler = Get-Command cl.exe -ErrorAction SilentlyContinue
    if (-not $linker -or -not $compiler) {
        throw 'MSVC environment loaded, but cl.exe/link.exe are unavailable.'
    }

    Write-Host "MSVC installation: $installationPath"
    Write-Host "MSVC compiler:     $($compiler.Source)"
    Write-Host "MSVC linker:       $($linker.Source)"
}

function Get-Sha256Hex([string]$path) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }
}

Import-MsvcEnvironment

$tauriCli = Join-Path $repoRoot 'node_modules\.bin\tauri.cmd'
if (-not (Test-Path -LiteralPath $tauriCli)) {
    throw 'Local Tauri CLI is missing. Run npm install once, then retry.'
}

Write-Host "Repository:        $repoRoot"
Write-Host "CARGO_HOME:        $cargoHome"
Write-Host "CARGO_TARGET_DIR:  $cargoTarget"
Write-Host "npm cache:         $npmCache"
Write-Host "TEMP/TMP:          $tempRoot"
Write-Host "Bundler cache:     $localAppData"
Write-Host "Build source ID:   $env:VITE_BUILD_COMMIT"

$arguments = @($Action)
if ($Action -eq 'build') {
    if ($Bundle -ne 'all') {
        $arguments += @('--bundles', $Bundle)
    }
    if ($DebugBuild) {
        $arguments += '--debug'
    }
}
if ($TauriArgs) {
    $arguments += $TauriArgs
}

Push-Location $repoRoot
try {
    & $tauriCli @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri CLI exited with code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

if ($Action -eq 'build') {
    $profile = if ($DebugBuild) { 'debug' } else { 'release' }
    $bundleRoot = Join-Path $cargoTarget "$profile\bundle"
    if (Test-Path -LiteralPath $bundleRoot) {
        $package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
        $versionArtifacts = Join-Path $artifactRoot $package.version
        New-Item -ItemType Directory -Path $versionArtifacts -Force | Out-Null

        $versionPattern = "_$([regex]::Escape([string]$package.version))_"
        $installers = Get-ChildItem -LiteralPath $bundleRoot -Recurse -File |
            Where-Object {
                $_.Extension -in @('.msi', '.exe') -and $_.Name -match $versionPattern
            }
        if (-not $installers) {
            throw "No MSI or NSIS installer matched package version $($package.version)."
        }
        foreach ($installer in $installers) {
            Copy-Item -LiteralPath $installer.FullName -Destination $versionArtifacts -Force
        }

        Write-Host "Bundle output:      $bundleRoot"
        Write-Host "Release artifacts:  $versionArtifacts"
        Get-ChildItem -LiteralPath $versionArtifacts -File |
            ForEach-Object {
                Write-Host ("SHA-256 {0}  {1}" -f (Get-Sha256Hex $_.FullName), $_.FullName)
            }
    }
}
