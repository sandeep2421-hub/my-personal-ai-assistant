# ╔══════════════════════════════════════════════════════════╗
# ║          Study AI Assistant – Lab Setup Script           ║
# ║  Run with:  irm <URL>/setup.ps1 | iex                   ║
# ╚══════════════════════════════════════════════════════════╝

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   📚  Study AI Assistant  |  Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ── Prompt for license key ────────────────────────────────────────────────────
$licenseKey = Read-Host "🔑 Enter your license key (given by admin)"

if (-not $licenseKey) {
    Write-Host "❌ No license key entered. Exiting." -ForegroundColor Red
    exit 1
}

# ── Create unique temp directory ──────────────────────────────────────────────
$tempDir = Join-Path $env:TEMP ("StudyAI-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "📁 Temp folder: $tempDir" -ForegroundColor Gray

# ── Download the portable app ─────────────────────────────────────────────────
# ADMIN: Replace this URL with your actual download link for StudyAIPortable.exe
$appUrl = "https://github.com/sandeep2421-hub/study-ai-assistant/releases/download/v1.0.0/StudyAIPortable.exe"
$exePath = Join-Path $tempDir "StudyAIPortable.exe"

Write-Host ""
Write-Host "⬇️  Downloading Study AI Assistant..." -ForegroundColor Yellow

try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($appUrl, $exePath)
    Write-Host "✅ Download complete." -ForegroundColor Green
} catch {
    Write-Host "❌ Download failed: $_" -ForegroundColor Red
    Write-Host "   Ask your admin for the correct download link." -ForegroundColor Gray
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

# ── Launch the app ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🚀 Launching Study AI Assistant..." -ForegroundColor Green
Start-Process -FilePath $exePath -ArgumentList "--license=$licenseKey"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   ✅ App is running!" -ForegroundColor Green
Write-Host ""
Write-Host "   Hotkeys (all use Alt + Shift + KEY):" -ForegroundColor White
Write-Host "   S = Screenshot (auto-answer in MCQ mode)" -ForegroundColor White
Write-Host "   I = Toggle MCQ / AI mode" -ForegroundColor White
Write-Host "   A = Send to AI (AI mode)" -ForegroundColor White
Write-Host "   V = Auto-type AI code" -ForegroundColor White
Write-Host "   H = Hide / Show overlay" -ForegroundColor White
Write-Host "   Q = Quit (cleans up temp files)" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ── Schedule cleanup on process exit (best-effort) ───────────────────────────
Start-Sleep -Seconds 8

# Register cleanup to run when PowerShell exits
$cleanupScript = @"
Start-Sleep -Seconds 3
Remove-Item '$tempDir' -Recurse -Force -ErrorAction SilentlyContinue
"@

Start-Process powershell -ArgumentList "-NoProfile", "-WindowStyle Hidden", "-Command", $cleanupScript
