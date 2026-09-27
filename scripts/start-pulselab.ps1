[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$projectDirectory = Split-Path -Parent $PSScriptRoot
$hostAddress = '127.0.0.1'
$port = 1420
$url = "http://$hostAddress`:$port/"

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
  Write-Error 'npm.cmd was not found. Install Node.js first.'
  exit 1
}

$viteCommand = Join-Path $projectDirectory 'node_modules\.bin\vite.cmd'
if (-not (Test-Path -LiteralPath $viteCommand)) {
  Write-Error 'Project dependencies are missing. Run npm install in the project directory first.'
  exit 1
}

$existingListener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($null -eq $existingListener) {
  Start-Process `
    -FilePath $npmCommand.Source `
    -ArgumentList @('run', 'dev', '--', '--host', $hostAddress, '--port', $port) `
    -WorkingDirectory $projectDirectory `
    -WindowStyle Normal | Out-Null
}

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # The development server may still be starting.
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-Error "PulseLab did not start within 60 seconds. Check the development server window."
  exit 1
}

Start-Process -FilePath $url | Out-Null
Write-Host "PulseLab started: $url"
