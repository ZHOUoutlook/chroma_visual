param(
    [string]$TaskName = "ChromaDbBackup",
    [string]$At = "03:00",
    [string]$Source = "",
    [string]$BackupRoot = "",
    [int]$Port = 1212,
    [int]$RetentionDays = 7
)

$ErrorActionPreference = "Stop"

$defaultRoot = "E:\" + (-join ([char[]](0x5927, 0x6a21, 0x578b)))
if (-not $Source) {
    $Source = Join-Path $defaultRoot "v_db"
}
if (-not $BackupRoot) {
    $BackupRoot = $defaultRoot
}

$scriptPath = Join-Path $PSScriptRoot "backup-chroma.ps1"
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Source `"$Source`" -BackupRoot `"$BackupRoot`" -Port $Port -RetentionDays $RetentionDays"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -Daily -At $At

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Daily Chroma database backup" -Force | Out-Null
Write-Output "Scheduled task '$TaskName' registered. It runs daily at $At."
