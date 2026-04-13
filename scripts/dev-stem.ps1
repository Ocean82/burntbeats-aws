# Stem service local setup aligned with CI/Docker (CPU PyTorch + locked deps).
# Run from repo root:  powershell -File scripts/dev-stem.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

python -m pip install --upgrade pip
python -m pip install -r stem_service/requirements.lock.txt `
    --extra-index-url https://download.pytorch.org/whl/cpu
python scripts/smoke_torchaudio_io.py
$env:STEM_ALLOW_MISSING_HTDEMUCS = "1"
python -m pytest stem_service/tests -q
