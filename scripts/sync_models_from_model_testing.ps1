# Sync Demucs shards, SCNet ONNX, prebuilt Demucs-family ONNX/ORT (from __model_testing),
# and a short WAV sample into burntbeats-aws\models. Safe to re-run.
# Requires: PowerShell 5+
#
# Demucs ONNX *export* / vendor reference: models\demucs.onnx-main (sevagh/demucs.onnx) —
# NOT synced by this script; keep that checkout separate (e.g. D:\burntbeats-aws\models\demucs.onnx-main).
#
# This script copies *artifact* .onnx/.ort from __model_testing into models\models_by_type\onnx|ort
# (see stem_service resolve_models_root_file). That is weight storage, not the demucs.onnx-main tree.

$ErrorActionPreference = "Stop"
$SrcRoot = "D:\__model_testing\models"
$DstRoot = Join-Path (Split-Path $PSScriptRoot -Parent) "models"
if (-not (Test-Path $DstRoot)) { New-Item -ItemType Directory -Force -Path $DstRoot | Out-Null }
$DstRoot = (Resolve-Path $DstRoot).Path
$Th = Join-Path $SrcRoot "models_by_type\th"
$Onnx = Join-Path $SrcRoot "models_by_type\onnx"
$OrtSrc = Join-Path $SrcRoot "models_by_type\ort"
$DmSrc = Join-Path $SrcRoot "Demucs_Models"
$DmDst = Join-Path $DstRoot "Demucs_Models"
$V3 = Join-Path $SrcRoot "Demucs_Models\v3_v4_repo"
$DstOnnx = Join-Path $DstRoot "models_by_type\onnx"
$DstOrt = Join-Path $DstRoot "models_by_type\ort"

if (-not (Test-Path $SrcRoot)) {
    Write-Error "Source not found: $SrcRoot"
}

function Test-DemucsOnnxOrtFile {
    param([System.IO.FileInfo]$File)
    $n = $File.Name
    $e = $File.Extension.ToLower()
    if ($e -eq ".onnx") { return $true }
    if ($n.ToLower().EndsWith(".onnx.data")) { return $true }
    if ($e -eq ".ort") { return $true }
    if ($n -like "*.required_operators_and_types.config") { return $true }
    if ($n -like "*.required_operators_and_types.with_runtime_opt.config") { return $true }
    return $false
}

function Copy-DemucsOnnxOrtIntoTyped {
    param(
        [string]$SourceDir,
        [string]$Label
    )
    if (-not (Test-Path $SourceDir)) { return }
    Get-ChildItem -Path $SourceDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        if (-not (Test-DemucsOnnxOrtFile $_)) { return }
        $destParent = if ($_.Extension.ToLower() -eq ".ort" -or
            $_.Name -like "*.required_operators_and_types.config" -or
            $_.Name -like "*.required_operators_and_types.with_runtime_opt.config") {
            $DstOrt
        }
        elseif ($_.Name.ToLower().EndsWith(".onnx.data") -or $_.Extension.ToLower() -eq ".onnx") {
            $DstOnnx
        }
        else { $DstOnnx }
        $dest = Join-Path $destParent $_.Name
        if (Test-Path $dest) {
            $existing = Get-Item $dest
            if ($existing.Length -ne $_.Length) {
                Write-Warning "[$Label] Overwriting $($_.Name) (size $($existing.Length) -> $($_.Length))"
            }
        }
        Copy-Item $_.FullName $dest -Force
    }
}

New-Item -ItemType Directory -Force -Path $DmDst | Out-Null
New-Item -ItemType Directory -Force -Path $DstOnnx, $DstOrt | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DstRoot "samples") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DstRoot "scnet.onnx") | Out-Null

# Demucs ONNX / ORT: copy from global models_by_type first, then Demucs_Models overwrites (your testing tree wins).
Copy-DemucsOnnxOrtIntoTyped -SourceDir $Onnx -Label "models_by_type/onnx"
Copy-DemucsOnnxOrtIntoTyped -SourceDir $OrtSrc -Label "models_by_type/ort"
if (Test-Path $DmSrc) {
    Copy-DemucsOnnxOrtIntoTyped -SourceDir $DmSrc -Label "Demucs_Models"
} else {
    Write-Warning "Optional source not found: $DmSrc"
}

New-Item -ItemType Directory -Force -Path (Join-Path $DmDst "speed_4stem_rank27") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DmDst "speed_4stem_rank28") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DmDst "quality_4stem_rank1") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DmDst "quality_4stem_rank2") | Out-Null

# UVR / demucs stock YAMLs
if (Test-Path $V3) {
    Copy-Item (Join-Path $V3 "*.yaml") -Destination $DmDst -Force
}

# htdemucs_ft four shards (base names only - do not mix with __suffix variants in this folder)
$ftBase = @(
    "f7e0c4bc-ba3fe64a.th",
    "d12395a8-e57c48e6.th",
    "92cfc3b6-ef3bcb9c.th",
    "04573f0d-f3cf25b2.th"
)
foreach ($f in $ftBase) {
    $p = Join-Path $Th $f
    if (-not (Test-Path $p)) { Write-Warning "Missing $p"; continue }
    Copy-Item $p (Join-Path $DmDst $f) -Force
}

# Quality preset yamls (same bag as htdemucs_ft; segment comes from yaml or Demucs default)
$ftYaml = Join-Path $DmDst "htdemucs_ft.yaml"
if (Test-Path $ftYaml) {
    Copy-Item $ftYaml (Join-Path $DmDst "04573f0d-f3cf25b2__29d4388e.yaml") -Force
    Copy-Item $ftYaml (Join-Path $DmDst "04573f0d-f3cf25b2__2aad324b.yaml") -Force
} else {
    Write-Warning "htdemucs_ft.yaml not found under $DmDst - run again after v3_v4_repo copy"
}

# Speed rank 27 / 28: destination filenames MUST match DEMUCS_SPEED_4STEM_CHECKPOINTS in
# stem_service/config.py (short names, no __7ae9d6de suffix). One .th per folder.
$p27 = Join-Path $Th "d12395a8-e57c48e6.th"
if (-not (Test-Path $p27)) { $p27 = Join-Path $Th "d12395a8-e57c48e6__7ae9d6de.th" }
$p28 = Join-Path $Th "cfa93e08-61801ae1.th"
if (-not (Test-Path $p28)) { $p28 = Join-Path $Th "cfa93e08-61801ae1__7ae9d6de.th" }
if (Test-Path $p27) {
    Copy-Item $p27 (Join-Path $DmDst "speed_4stem_rank27\d12395a8-e57c48e6.th") -Force
} else { Write-Warning "Missing d12395a8-e57c48e6.th (or __7ae9d6de variant) under $Th" }
if (Test-Path $p28) {
    Copy-Item $p28 (Join-Path $DmDst "speed_4stem_rank28\cfa93e08-61801ae1.th") -Force
} else { Write-Warning "Missing cfa93e08-61801ae1.th (or __7ae9d6de variant) under $Th" }

# Quality rank 1 / 2: DEMUCS_QUALITY_4STEM_CHECKPOINTS (exact destination names for stem_service.config).
# Source: $Th = D:\__model_testing\models\models_by_type\th
# Rank1 MUST be ``04573f0d-f3cf25b2__29d4388e.th`` — do *not* fall back to ``04573f0d-f3cf25b2.th``:
# that short name is the htdemucs_ft bag shard copied above to Demucs_Models root; it matches the
# __2aad324b-ranked variant on disk, not rank #1. A previous fallback here produced byte-identical
# rank1/rank2 folders and mislabeled weights.
$pQ1 = Join-Path $Th "04573f0d-f3cf25b2__29d4388e.th"
$pQ2 = Join-Path $Th "04573f0d-f3cf25b2__2aad324b.th"
$q1Dest = Join-Path $DmDst "quality_4stem_rank1\04573f0d-f3cf25b2__29d4388e.th"
$q2Dest = Join-Path $DmDst "quality_4stem_rank2\04573f0d-f3cf25b2__2aad324b.th"
if (Test-Path $pQ1) {
    Copy-Item $pQ1 $q1Dest -Force
} else {
    Write-Warning "Missing $pQ1 — cannot populate quality_4stem_rank1. Add the true __29d4388e variant to ``__model_testing`` (do not substitute 04573f0d-f3cf25b2.th)."
}
if (Test-Path $pQ2) {
    Copy-Item $pQ2 $q2Dest -Force
} else { Write-Warning "Missing $pQ2" }
if ((Test-Path $q1Dest) -and (Test-Path $q2Dest)) {
    $h1 = (Get-FileHash $q1Dest -Algorithm SHA256).Hash
    $h2 = (Get-FileHash $q2Dest -Algorithm SHA256).Hash
    if ($h1 -eq $h2) {
        Write-Warning "quality_4stem_rank1 and quality_4stem_rank2 checkpoints are byte-identical — rank1 should be __29d4388e, rank2 __2aad324b; replace $pQ1 with the correct file."
    }
}

# SCNet ONNX: stem_service resolves models/scnet_models/scnet.onnx first, then models/scnet.onnx/scnet.onnx
$scnetSrc = Join-Path $Onnx "scnet.onnx"
if (Test-Path $scnetSrc) {
    Copy-Item $scnetSrc (Join-Path $DstRoot "scnet.onnx\scnet.onnx") -Force
} else {
    Write-Warning "Missing $scnetSrc"
}

$scnetFp16 = Join-Path $Onnx "scnet_base_fp16.onnx"
if (Test-Path $scnetFp16) {
    Copy-Item $scnetFp16 (Join-Path $DstRoot "scnet_base_fp16.onnx") -Force
}

# Shared benchmark clip for SCNet / Demucs smoke tests
$wav = Join-Path $SrcRoot "__benchmark_audio_30s.wav"
if (Test-Path $wav) {
    Copy-Item $wav (Join-Path $DstRoot "samples\benchmark_30s.wav") -Force
} else {
    Write-Warning "Missing $wav"
}

Write-Host "Done. Destination: $DstRoot"
Write-Host "Next: python scripts/check_models.py"
Write-Host "      python scripts/test_scnet_sample.py"
