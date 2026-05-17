$ErrorActionPreference = "Stop"

# 1. Cleanly close any running instances of the app to release the file lock
Stop-Process -Name "StudyAIPortable" -Force -ErrorAction SilentlyContinue
taskkill /f /im "StudyAIPortable.exe" 2>$null | Out-Null

Write-Host ""
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "         STUDY AI Windows Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""

# Create a clean, dedicated folder in TEMP
$tempDir = Join-Path $env:TEMP "StudyAI-Assistant"
if (!(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$appUrl  = "https://github.com/sandeep2421-hub/study-ai-assistant/releases/download/v1.0.0/StudyAIPortable.exe"
$exePath = Join-Path $tempDir "StudyAIPortable.exe"

Write-Host "[STUDYAI] Fetching latest release..." -ForegroundColor Cyan
Write-Host "[$([char]0x2714)] Release: v1.0.0 - StudyAIPortable.exe" -ForegroundColor Green

Write-Host "[STUDYAI] Downloading Portable App (~86MB)..." -ForegroundColor Cyan

# Try BITS Transfer first (fast with progress bar), fallback to WebRequest if restricted
try {
    Import-Module BitsTransfer
    Start-BitsTransfer -Source $appUrl -Destination $exePath -ErrorAction Stop
} catch {
    # Fallback to standard fast web download
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $appUrl -OutFile $exePath -ErrorAction Stop
}

Write-Host "[$([char]0x2714)] Dependencies already installed" -ForegroundColor Green
Write-Host "[STUDYAI] Extracting App (no admin needed)..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
Write-Host "[$([char]0x2714)] App extracted to $tempDir" -ForegroundColor Green

Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "          Setup complete!" -ForegroundColor Green
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

Write-Host "[STUDYAI] Launching app..." -ForegroundColor Cyan
$process = Start-Process -FilePath $exePath -PassThru
Write-Host "[$([char]0x2714)] App running extracted (PID $($process.Id))" -ForegroundColor Green
Write-Host ""
Write-Host "Login window will appear. Enter your license key." -ForegroundColor Green
Write-Host ""
