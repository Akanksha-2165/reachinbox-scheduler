$ErrorActionPreference = "Stop"
Set-Location -Path "$PSScriptRoot\backend"
powershell -ExecutionPolicy Bypass -File ".\test-block2.ps1"
