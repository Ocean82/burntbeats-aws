# Detect duplicate "scripts" folder (e.g. scripts vs scripts with invisible Unicode).
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/detect-duplicate-scripts.ps1
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -like "*script*" } | ForEach-Object {
    $name = $_.Name
    $hex = ($name.ToCharArray() | ForEach-Object { [int]$_ | ForEach-Object { "{0:x4}" -f $_ }) -join " "
    $len = $name.Length
    [PSCustomObject]@{ Path = $_.FullName; Name = $name; Length = $len; CodePoints = $hex }
} | Format-Table -AutoSize
Write-Host "If two 'scripts' appear, compare CodePoints. Invisible chars: 200c (ZWNJ), 200b (ZWSP), feff (BOM)."
Write-Host "Remove the duplicate: Remove-Item -LiteralPath 'FULL_PATH_TO_DUPLICATE' -Recurse -Force"
