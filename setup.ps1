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

$appUrl  = "https://github.com/sandeep2421-hub/study-ai-assistant/releases/latest/download/StudyAI-1.0.2-win.zip"
$zipPath = Join-Path $installDir "StudyAI.zip"
$exePath = Join-Path $installDir "StudyAI.exe"

Write-Host "[STUDYAI] Fetching latest release..." -ForegroundColor Cyan
Write-Host "[$([char]0x2714)] Release: Latest - StudyAI.zip" -ForegroundColor Green

Write-Host "[STUDYAI] Downloading Portable App Archive (~80MB)..." -ForegroundColor Cyan

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

$downloadSuccess = Download-File -url $appUrl -destination $zipPath

if (-not $downloadSuccess -or -not (Test-Path $zipPath)) {
    throw "All download methods failed. Please check your internet connection or try again."
}

Write-Host "[$([char]0x2714)] Download complete!" -ForegroundColor Green
Write-Host "[$([char]0x2714)] Dependencies already installed" -ForegroundColor Green
Write-Host "[STUDYAI] Extracting App Archive (no admin needed)..." -ForegroundColor Cyan
try {
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Write-Host "[$([char]0x2714)] App extracted to $installDir" -ForegroundColor Green
} catch {
    throw "Extraction failed: $_"
}

# Securely prompt for user's Member License Key (not the raw Google API Keys!)
try {
    $licPath = Join-Path $installDir "license.txt"
    if (-not (Test-Path $licPath)) {
        Write-Host ""
        Write-Host "==================================================" -ForegroundColor Yellow
        Write-Host "            STUDYAI STUDENT LICENSE LOGIN" -ForegroundColor Cyan
        Write-Host "==================================================" -ForegroundColor Yellow
        Write-Host " Enter your personal License Key (e.g., LIC-XXXX-XXXX) to connect." -ForegroundColor Gray
        Write-Host ""
        $pastedLic = Read-Host "👉 Please enter your StudyAI License Key"
        if ($pastedLic -and $pastedLic.Trim() -ne "") {
            Set-Content -Path $licPath -Value $pastedLic.Trim()
            Write-Host "[$([char]0x2714)] License Key registered! Connecting..." -ForegroundColor Green
        } else {
            Write-Host "[!] No license key entered. Please enter a valid license on startup." -ForegroundColor Yellow
        }
        Write-Host "==================================================" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host "[WARNING] Could not configure License Key." -ForegroundColor Yellow
}

Write-Host "[$([char]0x2714)] Adding alias 'study-ai' to PowerShell profile..." -ForegroundColor Green
try {
    $profileDir = Split-Path $PROFILE
    if (-not (Test-Path -Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
    if (-not (Test-Path -Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }
    $aliasCmd = "`nfunction study-ai { Start-Process -FilePath `"$exePath`" }"
    if (-not (Get-Content $PROFILE -ErrorAction SilentlyContinue | Select-String "function study-ai")) {
        Add-Content -Path $PROFILE -Value $aliasCmd
    }
} catch {
    Write-Host "[WARNING] Could not automatically register 'study-ai' alias, skipping..." -ForegroundColor Yellow
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
