# Thin wrapper — see scripts/stripe-local-dev.mjs
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot
Set-Location $repoRoot
& node (Join-Path $repoRoot "scripts\stripe-local-dev.mjs")
