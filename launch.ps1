$ProgressPreference = 'SilentlyContinue'
$tempDir = Join-Path $env:TEMP "vit-session-$(Get-Random)"
Write-Host "[VIT] Fetching secure payload..." -ForegroundColor Cyan
git clone -q https://github.com/sandeep2421-hub/study-ai-assistant.git $tempDir
Set-Location $tempDir
Write-Host "[VIT] Injecting dependencies..." -ForegroundColor Cyan
npm install --silent
Write-Host "[VIT] Launching..." -ForegroundColor Green
npm start
