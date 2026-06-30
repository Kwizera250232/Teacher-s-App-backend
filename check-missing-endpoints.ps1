# Check Missing API Endpoints
# This script helps identify which endpoints are returning 404

Write-Host "=== Checking for Missing API Endpoints ===" -ForegroundColor Cyan

$endpoints = @(
    "/api/health",
    "/api/auth/me",
    "/api/classes/my",
    "/api/parent/hub",
    "/api/classes/1/classroom",
    "/api/composition-status/mine",
    "/api/achievements/displayed",
    "/api/class-moments/feed"
)

$missingEndpoints = @()

foreach ($endpoint in $endpoints) {
    Write-Host "Testing $endpoint..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "https://studentapi.umunsi.com$endpoint" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "  OK (200)" -ForegroundColor Green
        } elseif ($response.StatusCode -eq 401) {
            Write-Host "  OK (401 unauthorized)" -ForegroundColor Green
        } else {
            Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        if ($_.Exception.Message -match '404') {
            Write-Host "  MISSING (404)" -ForegroundColor Red
            $missingEndpoints += $endpoint
        } elseif ($_.Exception.Message -match '401') {
            Write-Host "  OK (401 unauthorized)" -ForegroundColor Green
        } else {
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan

if ($missingEndpoints.Count -gt 0) {
    Write-Host "Missing Endpoints:" -ForegroundColor Red
    foreach ($endpoint in $missingEndpoints) {
        Write-Host "  - $endpoint" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Update backend VPS to latest main branch" -ForegroundColor Yellow
    Write-Host "See UPDATE-BACKEND.md for instructions" -ForegroundColor Yellow
} else {
    Write-Host "All endpoints are available" -ForegroundColor Green
}
