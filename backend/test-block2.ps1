# ==============================================================================
# test-block2.ps1 - Block 2 Verification Test Script
# Tests:
#   (a) hourlyLimit=2, 5 recipients -> 2 sent, 3 pushed to next hour as "scheduled", none "failed"
#   (b) scheduling the same email twice does not send twice (idempotency)
# ==============================================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "Starting Block 2 Verification Suite..." -ForegroundColor Cyan
npx tsx scripts/verify-block2.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAll Block 2 tests passed successfully!" -ForegroundColor Green
} else {
    Write-Error "Block 2 tests failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}
