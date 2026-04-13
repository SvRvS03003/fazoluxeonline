param(
  [string]$LauncherPath = "$env:LOCALAPPDATA\Programs\SR Monitor\Start SR Monitor Service Background.vbs",
  [string]$TaskName = "SRMonitorAutoStart"
)

$ResolvedLauncherPath = (Resolve-Path $LauncherPath).Path

$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$ResolvedLauncherPath`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Force

Write-Host "Auto-start task created:" $TaskName
Write-Host "Launcher:" $ResolvedLauncherPath
Write-Host "This task starts the background SR Monitor service at logon."
