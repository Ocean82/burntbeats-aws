# Remove the duplicate "scripts" folder (the one with invisible char, shows as "scripts" with a square).
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/remove-duplicate-scripts-folder.ps1
$root = (Get-Item $PSScriptRoot).Parent.FullName
$duplicate = Get-ChildItem -LiteralPath $root -Directory | Where-Object {
    $_.Name -like "scripts*" -and $_.Name -ne "scripts"
}
if (-not $duplicate) {
    Write-Host "No duplicate 'scripts*' folder found."
    exit 0
}
foreach ($dir in $duplicate) {
    Write-Host "Removing duplicate folder: $($dir.FullName)"
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force
    Write-Host "Done."
}
