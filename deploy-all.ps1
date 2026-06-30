# Alumni Module - Full Deployment Script
# Run: powershell -ExecutionPolicy Bypass -File "deploy-all.ps1"

$ErrorActionPreference = "Stop"

Write-Host "`n======================================"
Write-Host "  ALUMNI MODULE FULL DEPLOYMENT"
Write-Host "======================================`n"

# ── 1. Push Backend to GitHub ─────────────────────────────────
Write-Host "[1/4] Pushing BACKEND to GitHub..." -ForegroundColor Cyan
Set-Location "c:\STUDENT APP\backend"

try {
    # Uses git credential manager or SSH key for auth
    $push1 = git push origin main --force 2>&1
    if ($push1 -match "Everything up-to-date|done|Enumerating") {
        Write-Host "     BACKEND PUSHED" -ForegroundColor Green
    } else {
        Write-Host "     Output: $push1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "     Backend push error: $_" -ForegroundColor Red
}

# ── 2. Push Frontend to GitHub ─────────────────────────────────
Write-Host "`n[2/4] Pushing FRONTEND to GitHub..." -ForegroundColor Cyan
Set-Location "c:\STUDENT APP\frontend"

try {
    # Uses git credential manager or SSH key for auth
    $push2 = git push origin main --force 2>&1
    if ($push2 -match "Everything up-to-date|done|Enumerating") {
        Write-Host "     FRONTEND PUSHED" -ForegroundColor Green
    } else {
        Write-Host "     Output: $push2" -ForegroundColor Yellow
    }
} catch {
    Write-Host "     Frontend push error: $_" -ForegroundColor Red
}

# ── 3. Deploy Backend to VPS (via SSH) ─────────────────────────
Write-Host "`n[3/4] Deploying BACKEND to VPS (93.127.186.217)..." -ForegroundColor Cyan

$plinkPath = "C:\Program Files\PuTTY\plink.exe"
$sshHostKey = "SHA256:jafLu/607LIapzqHK0/Do9DwZgh1QAHI0EgqLxCENPY"
$vpsCommand = 'cd /var/www/umunsi-backend && git pull origin main --force && npm install && pm2 restart umunsi-backend'

try {
    if (Test-Path $plinkPath) {
        $vpsPassword = $env:VPS_PASSWORD
        if (-not $vpsPassword) { Write-Host "ERROR: Set VPS_PASSWORD env var"; exit 1 }
        $vpsOutput = & $plinkPath -batch -hostkey $sshHostKey -ssh root@93.127.186.217 -pw $vpsPassword $vpsCommand 2>&1
        Write-Host "     VPS Output:" -ForegroundColor Yellow
        $vpsOutput | ForEach-Object { Write-Host "       $_" }
        Write-Host "     VPS DEPLOYED" -ForegroundColor Green
    } else {
        Write-Host "     WARNING: PuTTY plink.exe not found at '$plinkPath'" -ForegroundColor Red
        Write-Host "     Install PuTTY or run this SSH command manually:" -ForegroundColor Yellow
        Write-Host "     ssh root@93.127.186.217 '$vpsCommand'" -ForegroundColor White
    }
} catch {
    Write-Host "     VPS deploy error: $_" -ForegroundColor Red
}

# ── 4. Deploy Frontend to Vercel ─────────────────────────────
Write-Host "`n[4/4] Deploying FRONTEND to Vercel..." -ForegroundColor Cyan
Set-Location "c:\STUDENT APP\frontend"

try {
    $vercelToken = $env:VERCEL_TOKEN
    if (-not $vercelToken) { Write-Host "ERROR: Set VERCEL_TOKEN env var"; exit 1 }
    $vercelOutput = npx vercel --prod --yes --token $vercelToken 2>&1
    Write-Host "     Vercel Output:" -ForegroundColor Yellow
    $vercelOutput | ForEach-Object { Write-Host "       $_" }
    Write-Host "     VERCEL DEPLOYED" -ForegroundColor Green
} catch {
    Write-Host "     Vercel deploy error: $_" -ForegroundColor Red
}

Write-Host "`n======================================"
Write-Host "  DEPLOYMENT ATTEMPT COMPLETE"
Write-Host "======================================`n"
Write-Host "Check outputs above for any errors."
Write-Host "`nNEXT: Build your new features?"
