[CmdletBinding()]
param(
    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $PSScriptRoot 'dist'
}

# Keep an explicit allowlist so repository and local files never enter the ZIP.
$files = @(
    'manifest.json'
    'settings.js'
    'content.js'
    'popup.html'
    'popup.js'
    'icons/icon16.png'
    'icons/icon48.png'
    'icons/icon128.png'
)

foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
        throw "Required extension file not found: $file"
    }
}

$output = New-Item -ItemType Directory -Path $OutputDirectory -Force
$archivePath = Join-Path $output.FullName 'primetime-plus.zip'
$stagingPath = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())

try {
    New-Item -ItemType Directory -Path $stagingPath | Out-Null
    foreach ($file in $files) {
        $destination = Join-Path $stagingPath $file
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination
    }

    Compress-Archive -Path (Join-Path $stagingPath '*') -DestinationPath $archivePath -CompressionLevel Optimal -Force
    Write-Output $archivePath
}
finally {
    if (Test-Path -LiteralPath $stagingPath) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
}
