# Student App Local Development Setup Script
# This script helps configure the environment for local development

Write-Host "=== Student App Local Development Setup ===" -ForegroundColor Cyan

# Check if PostgreSQL is installed
Write-Host "`n1. Checking PostgreSQL installation..." -ForegroundColor Yellow
$pgInstalled = Get-Command psql -ErrorAction SilentlyContinue
if (-not $pgInstalled) {
    Write-Host "PostgreSQL is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install PostgreSQL 16 from https://www.postgresql.org/download/" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "PostgreSQL found: $($pgInstalled.Source)" -ForegroundColor Green
}

# Check if backend .env exists
Write-Host "`n2. Checking backend environment configuration..." -ForegroundColor Yellow
$backendEnvPath = "backend\.env"
if (-not (Test-Path $backendEnvPath)) {
    Write-Host "Creating backend .env file from .env.example..." -ForegroundColor Yellow
    Copy-Item "backend\.env.example" $backendEnvPath
    
    # Update with safe defaults for local development
    $envContent = Get-Content $backendEnvPath -Raw
    $envContent = $envContent -replace 'postgresql://postgres:your_password@localhost:5432/studentapp', 'postgresql://postgres:postgres@localhost:5432/studentapp'
    $envContent = $envContent -replace 'your_super_secret_jwt_key_change_this_in_production', 'dev_secret_key_12345678901234567890'
    $envContent = $envContent -replace 'EXPOSE_RESET_CODE=false', 'EXPOSE_RESET_CODE=true'
    $envContent = $envContent -replace 'SCHOOL_MAIL_ENABLED=true', 'SCHOOL_MAIL_ENABLED=false'
    $envContent = $envContent -replace 'your_google_gemini_api_key_here', ''
    Set-Content $backendEnvPath $envContent
    Write-Host "Backend .env file created with local development defaults." -ForegroundColor Green
} else {
    Write-Host "Backend .env file already exists." -ForegroundColor Green
}

# Check if database exists
Write-Host "`n3. Checking PostgreSQL database..." -ForegroundColor Yellow
$envVars = Get-Content $backendEnvPath | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
    $key, $value = $_ -split '=', 2
    [PSCustomObject]@{ Key = $key; Value = $value }
}

$databaseUrl = ($envVars | Where-Object { $_.Key -eq 'DATABASE_URL' }).Value
if ($databaseUrl) {
    Write-Host "Database URL configured: $databaseUrl" -ForegroundColor Green
} else {
    Write-Host "DATABASE_URL not found in .env file" -ForegroundColor Red
}

# Test database connection
Write-Host "`n4. Testing database connection..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    $testResult = psql -h localhost -U postgres -d postgres -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database connection successful!" -ForegroundColor Green
    } else {
        Write-Host "Database connection failed. Please check PostgreSQL service." -ForegroundColor Red
    }
} catch {
    Write-Host "Error testing database connection: $_" -ForegroundColor Red
}

# Create database if it doesn't exist
Write-Host "`n5. Creating studentapp database if it doesn't exist..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    $createResult = psql -h localhost -U postgres -d postgres -c "CREATE DATABASE studentapp;" 2>&1
    if ($LASTEXITCODE -eq 0 -or $createResult -match "already exists") {
        Write-Host "Database 'studentapp' is ready." -ForegroundColor Green
    } else {
        Write-Host "Note: $createResult" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error creating database: $_" -ForegroundColor Red
}

# Initialize database schema
Write-Host "`n6. Initializing database schema..." -ForegroundColor Yellow
Write-Host "Run the following command to initialize the database:" -ForegroundColor Cyan
Write-Host "cd backend; npm run init-db" -ForegroundColor White

# Install dependencies
Write-Host "`n7. Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

Write-Host "`n8. Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "`nTo start the application:" -ForegroundColor Cyan
Write-Host "1. Start PostgreSQL service" -ForegroundColor White
Write-Host "2. Initialize database: cd backend; npm run init-db" -ForegroundColor White
Write-Host "3. Start backend: cd backend; npm run dev" -ForegroundColor White
Write-Host "4. Start frontend: cd frontend; npm run dev" -ForegroundColor White
Write-Host "5. Open browser to http://localhost:3000" -ForegroundColor White
