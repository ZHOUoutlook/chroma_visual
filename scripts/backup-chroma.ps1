param(
    [string]$Source = "",
    [string]$BackupRoot = "",
    [int]$Port = 1212,
    [int]$GraceSeconds = 5,
    [int]$RetentionDays = 0
)

$ErrorActionPreference = "Stop"

$defaultRoot = "E:\" + (-join ([char[]](0x5927, 0x6a21, 0x578b)))
if (-not $Source) {
    $Source = Join-Path $defaultRoot "v_db"
}
if (-not $BackupRoot) {
    $BackupRoot = $defaultRoot
}

if (-not (Test-Path -LiteralPath $Source)) {
    throw "Chroma source path does not exist: $Source"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$sourceName = Split-Path -Path $Source -Leaf
$dest = Join-Path $BackupRoot "${sourceName}_backup_$timestamp"
$shutdownUrl = "http://localhost:$Port/api/v2/pre-flight-checks"

Write-Output "Stopping Chroma on port $Port..."
try {
    curl.exe -s -X POST $shutdownUrl | Out-Null
} catch {
    Write-Warning "Chroma shutdown request failed or Chroma was not running: $($_.Exception.Message)"
}

Start-Sleep -Seconds $GraceSeconds

Write-Output "Backing up $Source to $dest..."
Copy-Item -LiteralPath $Source -Destination $dest -Recurse -Force
Write-Output "Backup saved to $dest"

if ($RetentionDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter "${sourceName}_backup_*" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Recurse -Force
}

Write-Output "Restarting Chroma..."
Start-Process -FilePath "chroma" -ArgumentList @("run", "--path", $Source, "--port", $Port) -WindowStyle Hidden
