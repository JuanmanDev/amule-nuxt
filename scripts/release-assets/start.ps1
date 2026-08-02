# Starts the bundled Nitro server on Windows. The production build does not read
# .env by itself, so this script loads it into the process environment first.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (Test-Path .env) {
    foreach ($line in Get-Content .env) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $split = $trimmed.IndexOf('=')
        if ($split -lt 1) { continue }
        $name = $trimmed.Substring(0, $split).Trim()
        $value = $trimmed.Substring($split + 1).Trim().Trim('"')
        Set-Item -Path "env:$name" -Value $value
    }
} else {
    Write-Warning 'No .env found; falling back to the current environment.'
}

if (-not $env:AMULE_EC_PASSWORD) {
    Write-Warning 'AMULE_EC_PASSWORD is not set: every External Connection call will be refused.'
}

if (-not $env:NODE_ENV) { $env:NODE_ENV = 'production' }
if (-not $env:NUXT_PORT) { $env:NUXT_PORT = '3000' }
# Nitro reads PORT; keep it in step with NUXT_PORT so both spellings work.
if (-not $env:PORT) { $env:PORT = $env:NUXT_PORT }

# Live updates listen on their own port, and the browser is told which one through
# the public runtime config. That value is baked at build time, so WS_PORT alone
# would move the listener and leave clients dialling 3001; NUXT_PUBLIC_WS_PORT is
# what Nitro reads at runtime, so it follows WS_PORT here.
if (-not $env:WS_PORT) { $env:WS_PORT = '3001' }
if (-not $env:NUXT_PUBLIC_WS_PORT) { $env:NUXT_PUBLIC_WS_PORT = $env:WS_PORT }

Write-Host "aMule Nuxt listening on http://0.0.0.0:$($env:PORT), live updates on $($env:WS_PORT)"
node .output/server/index.mjs
