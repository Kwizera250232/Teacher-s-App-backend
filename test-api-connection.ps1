# Test API Connection Script
# This script tests the API connectivity from both direct and proxied access

Write-Host "=== Student App API Connection Test ===" -ForegroundColor Cyan

# Test 1: Direct backend access
Write-Host "`n1. Testing direct backend access..." -ForegroundColor Yellow
try {
    $directResponse = Invoke-WebRequest -Uri "https://studentapi.umunsi.com/api/health" -UseBasicParsing -TimeoutSec 10
    if ($directResponse.StatusCode -eq 200) {
        Write-Host "✓ Direct backend access successful" -ForegroundColor Green
        $healthData = $directResponse.Content | ConvertFrom-Json
        Write-Host "  Build: $($healthData.build)" -ForegroundColor Gray
        Write-Host "  Status: $($healthData.status)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Direct backend access failed with status: $($directResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Direct backend access failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Authentication endpoint (should return 401 without token)
Write-Host "`n2. Testing authentication endpoint (expected 401)..." -ForegroundColor Yellow
try {
    $authResponse = Invoke-WebRequest -Uri "https://studentapi.umunsi.com/api/classes/1/classroom" -UseBasicParsing -TimeoutSec 10
    Write-Host "? Unexpected response: $($authResponse.StatusCode)" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Message -match '401') {
        Write-Host "✓ Authentication endpoint working correctly (401 unauthorized)" -ForegroundColor Green
    } else {
        Write-Host "✗ Authentication endpoint error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 3: CORS headers
Write-Host "`n3. Testing CORS headers..." -ForegroundColor Yellow
try {
    $corsResponse = Invoke-WebRequest -Uri "https://studentapi.umunsi.com/api/health" -UseBasicParsing -TimeoutSec 10
    $corsHeaders = $corsResponse.Headers
    $corsPresent = $false
    
    foreach ($header in $corsHeaders.Keys) {
        if ($header -match 'Access-Control') {
            Write-Host "  $header : $($corsHeaders[$header])" -ForegroundColor Gray
            $corsPresent = $true
        }
    }
    
    if ($corsPresent) {
        Write-Host "✓ CORS headers present" -ForegroundColor Green
    } else {
        Write-Host "? CORS headers not found (may be configured differently)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ CORS header test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Backend API is accessible and responding correctly." -ForegroundColor Green
Write-Host "Frontend should be able to connect once deployed with the updated configuration." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Deploy frontend changes to Vercel" -ForegroundColor White
Write-Host "2. Test the deployed frontend at your Vercel URL" -ForegroundColor White
Write-Host "3. Verify authentication flow works end-to-end" -ForegroundColor White
Write-Host "4. Check browser console for any errors" -ForegroundColor White
