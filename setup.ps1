$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host " STUDY AI Windows Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""

$tempDir = Join-Path $env:TEMP ("StudyAI-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$appUrl  = "https://github.com/sandeep2421-hub/study-ai-assistant/releases/download/v1.0.0/StudyAIPortable.exe"
$exePath = Join-Path $tempDir "StudyAIPortable.exe"

Write-Host "[STUDYAI] Fetching latest release..." -ForegroundColor Cyan
Write-Host "[$([char]0x2714)] Release: v1.0.0 - study-ai-x64.exe" -ForegroundColor Green

Write-Host "[STUDYAI] Downloading Portable App (~86MB)..." -ForegroundColor Cyan
# Start-BitsTransfer is much faster and shows a clean progress bar
Import-Module BitsTransfer
Start-BitsTransfer -Source $appUrl -Destination $exePath


Write-Host "[$([char]0x2714)] Dependencies already installed" -ForegroundColor Green
Write-Host "[STUDYAI] Extracting App (no admin needed)..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
Write-Host "[$([char]0x2714)] App extracted to $tempDir" -ForegroundColor Green
Write-Host "[$([char]0x2714)] run.bat created" -ForegroundColor Green
Write-Host "[$([char]0x2714)] update.bat created" -ForegroundColor Green

Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Alt+Shift+S    Screenshot + analyze MCQ"
Write-Host "Alt+Shift+I    Toggle AI mode"
Write-Host "Alt+Shift+A    Get AI answer"
Write-Host "Alt+Shift+V    Auto-type code into browser"
Write-Host "Alt+Shift+C    Copy from browser -> chat"
Write-Host "Alt+Shift+E    Clear / reset"
Write-Host "Alt+Shift+H    Hide / show pill"
Write-Host "Alt+Shift+Q    Quit"
Write-Host "Alt+Shift+F1/F2 Opacity up/down"
Write-Host "Alt+Shift+arrows Move pill"
Write-Host ""
Write-Host "Next time: Start menu -> Study AI" -ForegroundColor DarkGray
Write-Host "Update:    Run this script again" -ForegroundColor DarkGray
Write-Host ""

Write-Host "[STUDYAI] Launching app..." -ForegroundColor Cyan
$process = Start-Process -FilePath $exePath -PassThru
Write-Host "[$([char]0x2714)] App running extracted (PID $($process.Id))" -ForegroundColor Green
Write-Host ""
Write-Host "Login window will appear. Enter your license key." -ForegroundColor Green
Write-Host ""

$cleanupScript = @"
Start-Sleep -Seconds 10
Remove-Item '$tempDir' -Recurse -Force -ErrorAction SilentlyContinue
"@
Start-Process powershell -ArgumentList "-NoProfile", "-WindowStyle Hidden", "-Command", $cleanupScript
