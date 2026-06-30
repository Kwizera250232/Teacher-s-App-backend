# Alumni Module Deployment Script
# Runs from c:\STUDENT APP

Write-Host "=== Starting Alumni Module Deployment ===" -ForegroundColor Cyan

# ── Push Backend ───────────────────────────────────────────────
Write-Host "`n[1/4] Pushing backend..." -ForegroundColor Yellow
Set-Location "c:\STUDENT APP\backend"
# Uses git credential manager or SSH key for auth
$backendPush = git push origin main --force 2>&1
Write-Output $backendPush

# ── Push Frontend ──────────────────────────────────────────────
Write-Host "`n[2/4] Pushing frontend..." -ForegroundColor Yellow
Set-Location "c:\STUDENT APP\frontend"
# Uses git credential manager or SSH key for auth
$frontendPush = git push origin main --force 2>&1
Write-Output $frontendPush

# ── Deploy Backend to VPS ────────────────────────────────────
Write-Host "`n[3/4] Deploying to VPS (93.127.186.217)..." -ForegroundColor Yellow
$sshKey = 'SHA256:jafLu/607LIapzqHK0/Do9DwZgh1QAHI0EgqLxCENPY'
$sshCmd = 'cd /var/www/umunsi-backend && git pull origin main --force && npm install && pm2 restart umunsi-backend'

# Use plink for SSH (PuTTY)
$plink = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plink) {
    $vpsPassword = $env:VPS_PASSWORD
    if (-not $vpsPassword) { Write-Host "ERROR: Set VPS_PASSWORD env var"; exit 1 }
    $vpsDeploy = & $plink -batch -hostkey $sshKey -ssh root@93.127.186.217 -pw $vpsPassword $sshCmd 2>&1
    Write-Output $vpsDeploy
} else {
    Write-Host "PuTTY not found at default path. Trying ssh..." -ForegroundColor Red
    # Fallback: try ssh with key-based auth (if key is set up)
    # For now, print warning
    Write-Host "WARNING: Could not find PuTTY plink.exe. Please install PuTTY or run manually:" -ForegroundColor Red
    Write-Host "ssh root@93.127.186.217 'cd /var/www/umunsi-backend && git pull && npm install && pm2 restart umunsi-backend'" -ForegroundColor Yellow
}

# ── Deploy Frontend to Vercel ─────────────────────────────────
Write-Host "`n[4/4] Deploying frontend to Vercel..." -ForegroundColor Yellow
Set-Location "c:\STUDENT APP\frontend"
$vercelToken = $env:VERCEL_TOKEN
if (-not $vercelToken) { Write-Host "ERROR: Set VERCEL_TOKEN env var"; exit 1 }
$vercelDeploy = npx vercel --prod --yes --token $vercelToken 2>&1
Write-Output $vercelDeploy

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Read-Host "Press Enter to exit"
