# Student App Diagnostic Script
# This script helps diagnose common issues with the student app

Write-Host "=== Student App Diagnostic Tool ===" -ForegroundColor Cyan

# 1. Check if backend is running
Write-Host "`n1. Checking backend server status..." -ForegroundColor Yellow
try {
    $backendResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 5
    if ($backendResponse.StatusCode -eq 200) {
        Write-Host "✓ Backend server is running" -ForegroundColor Green
        $healthData = $backendResponse.Content | ConvertFrom-Json
        Write-Host "  Build: $($healthData.build)" -ForegroundColor Gray
        Write-Host "  Features:" -ForegroundColor Gray
        foreach ($feature in $healthData.features.PSObject.Properties) {
            $status = if ($feature.Value) { "✓" } else { "✗" }
            Write-Host "    $status $($feature.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ Backend server returned status code: $($backendResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Backend server is not running or not accessible" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# 2. Check if frontend is running
Write-Host "`n2. Checking frontend server status..." -ForegroundColor Yellow
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "✓ Frontend server is running" -ForegroundColor Green
    } else {
        Write-Host "✗ Frontend server returned status code: $($frontendResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Frontend server is not running or not accessible" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# 3. Check database connection
Write-Host "`n3. Checking PostgreSQL database..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    $dbTest = psql -h localhost -U postgres -d studentapp -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database connection successful" -ForegroundColor Green
    } else {
        Write-Host "✗ Database connection failed" -ForegroundColor Red
        Write-Host "  Error: $dbTest" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ PostgreSQL client not found or connection failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# 4. Check environment files
Write-Host "`n4. Checking environment configuration..." -ForegroundColor Yellow
$backendEnv = Test-Path "backend\.env"
if ($backendEnv) {
    Write-Host "✓ Backend .env file exists" -ForegroundColor Green
    $envContent = Get-Content "backend\.env" | Where-Object { $_ -match 'DATABASE_URL|JWT_SECRET|PORT' }
    Write-Host "  Key configuration:" -ForegroundColor Gray
    foreach ($line in $envContent) {
        if ($line -match '^(DATABASE_URL|JWT_SECRET|PORT)=') {
            $key, $value = $line -split '=', 2
            $displayValue = if ($key -eq 'DATABASE_URL') { 
                $value -replace ':[^:]+@', ':****@' 
            } elseif ($key -eq 'JWT_SECRET') { 
                '****' 
            } else { 
                $value 
            }
            Write-Host "    $key=$displayValue" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "✗ Backend .env file missing" -ForegroundColor Red
    Write-Host "  Run: copy backend\.env.example backend\.env" -ForegroundColor Gray
}

# 5. Check node modules
Write-Host "`n5. Checking dependencies..." -ForegroundColor Yellow
$backendModules = Test-Path "backend\node_modules"
$frontendModules = Test-Path "frontend\node_modules"

if ($backendModules) {
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Backend dependencies missing" -ForegroundColor Red
    Write-Host "  Run: cd backend; npm install" -ForegroundColor Gray
}

if ($frontendModules) {
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend dependencies missing" -ForegroundColor Red
    Write-Host "  Run: cd frontend; npm install" -ForegroundColor Gray
}

# 6. Check for common authentication issues
Write-Host "`n6. Checking authentication endpoints..." -ForegroundColor Yellow
try {
    $loginTest = Invoke-WebRequest -Uri "http://localhost:5000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"test@test.com","password":"test"}' -UseBasicParsing -TimeoutSec 5
    if ($loginTest.StatusCode -eq 401) {
        Write-Host "✓ Login endpoint is responding correctly (401 = invalid credentials expected)" -ForegroundColor Green
    } else {
        Write-Host "? Login endpoint returned status: $($loginTest.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    if ($_.Exception.Message -match '401') {
        Write-Host "✓ Login endpoint is responding correctly" -ForegroundColor Green
    } else {
        Write-Host "✗ Login endpoint error" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

# 7. Summary and recommendations
Write-Host "`n=== Diagnostic Summary ===" -ForegroundColor Cyan
Write-Host "`nCommon fixes for blank page after login:" -ForegroundColor Yellow
Write-Host "1. Ensure backend server is running: cd backend; npm run dev" -ForegroundColor White
Write-Host "2. Ensure database is accessible: psql -U postgres -d studentapp" -ForegroundColor White
Write-Host "3. Check browser console for JavaScript errors (F12)" -ForegroundColor White
Write-Host "4. Clear browser localStorage and cache" -ForegroundColor White
Write-Host "5. Verify frontend API URL configuration" -ForegroundColor White
Write-Host "6. Check backend logs for authentication errors" -ForegroundColor White

Write-Host "`nFor detailed setup instructions, see QUICKSTART.md" -ForegroundColor Cyan
