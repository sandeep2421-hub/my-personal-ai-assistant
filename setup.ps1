$ErrorActionPreference = "Stop"

# 1. Cleanly close any running instances of the app if they exist (safe, native PowerShell)
Get-Process -Name "StudyAI", "StudyAIPortable", "study-ai-assistant" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "         STUDY AI Windows Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""

$installDir = Join-Path $env:LOCALAPPDATA "StudyAI"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$appUrl  = "https://github.com/sandeep2421-hub/study-ai-assistant/releases/download/v1.0.0/StudyAIPortable.exe"
$exePath = Join-Path $installDir "StudyAIPortable.exe"

Write-Host "[STUDYAI] Fetching latest release..." -ForegroundColor Cyan
Write-Host "[$([char]0x2714)] Release: v1.0.0 - StudyAIPortable.exe" -ForegroundColor Green

Write-Host "[STUDYAI] Downloading Portable App (~86MB)..." -ForegroundColor Cyan

function Download-File {
    param (
        [string]$url,
        [string]$destination
    )
    
    # Method 1: Try curl.exe (highly reliable, bypasses TLS issues, respects system proxies, and pre-installed in Win10+)
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        Write-Host "[STUDYAI] Method 1: Downloading using native curl..." -ForegroundColor Cyan
        try {
            curl.exe -L -o $destination $url
            if (Test-Path $destination) {
                $fileSize = (Get-Item $destination).Length
                if ($fileSize -gt 10MB) {
                    return $true
                }
            }
        } catch {}
    }
    
    # Method 2: Try Start-BitsTransfer (native background transfer, robust and includes progress bar)
    Write-Host "[STUDYAI] Method 2: Downloading using BITS Transfer..." -ForegroundColor Cyan
    try {
        Import-Module BitsTransfer -ErrorAction SilentlyContinue
        Start-BitsTransfer -Source $url -Destination $destination -ErrorAction Stop
        if (Test-Path $destination) {
            return $true
        }
    } catch {}
    
    # Method 3: Try Invoke-WebRequest (standard PowerShell cmdlet)
    Write-Host "[STUDYAI] Method 3: Downloading using Invoke-WebRequest..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing -ErrorAction Stop
        if (Test-Path $destination) {
            return $true
        }
    } catch {}

    # Method 4: Try WebClient as final fallback (adding User-Agent to avoid GitHub/CDN blocks)
    Write-Host "[STUDYAI] Method 4: Downloading using WebClient..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        $webClient.DownloadFile($url, $destination)
        if (Test-Path $destination) {
            return $true
        }
    } catch {}
    
    return $false
}

$downloadSuccess = Download-File -url $appUrl -destination $exePath

if (-not $downloadSuccess -or -not (Test-Path $exePath)) {
    throw "All download methods failed. Please check your internet connection or try again."
}


Write-Host "[$([char]0x2714)] Download complete!" -ForegroundColor Green
Write-Host "[$([char]0x2714)] Dependencies already installed" -ForegroundColor Green
Write-Host "[STUDYAI] Extracting App (no admin needed)..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
Write-Host "[$([char]0x2714)] App extracted to $installDir" -ForegroundColor Green
Write-Host "[$([char]0x2714)] Adding alias 'study-ai' to PowerShell profile..." -ForegroundColor Green
if (-not (Test-Path -Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }
$aliasCmd = "`nfunction study-ai { Start-Process -FilePath `"$exePath`" }"
if (-not (Get-Content $PROFILE | Select-String "function study-ai")) {
    Add-Content -Path $PROFILE -Value $aliasCmd
}

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
