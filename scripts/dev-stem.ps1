# Stem service local setup aligned with CI/Docker (uv workspace + CPU PyTorch).
# Run from repo root:  powershell -File scripts/dev-stem.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (Get-Command uv -ErrorAction SilentlyContinue) {
  uv lock --check
  uv sync --frozen --package burntbeats-stem --no-install-project
  uv run python scripts/smoke_torchaudio_io.py
  $env:STEM_ALLOW_MISSING_HTDEMUCS = "1"
  uv run pytest stem_service/tests -q
} else {
  Write-Error "uv is required. Install from https://docs.astral.sh/uv/getting-started/installation/"
  exit 1
}
