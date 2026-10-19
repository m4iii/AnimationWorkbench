$ErrorActionPreference = 'Stop'
$workbenchPidFile = Join-Path $PSScriptRoot '.runtime/service.pid'
if (!(Test-Path -LiteralPath $workbenchPidFile)) { return }
$workbenchServiceId = [int](Get-Content -LiteralPath $workbenchPidFile)
$workbenchService = Get-CimInstance Win32_Process -Filter "ProcessId = $workbenchServiceId"
$workbenchServerPath = Join-Path $PSScriptRoot 'server.py'
if ($workbenchService -and $workbenchService.CommandLine.Contains($workbenchServerPath)) {
    taskkill /PID $workbenchServiceId /T /F
}
