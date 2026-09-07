# Daily FREE-tier quota check — run manually or via opencode /free-quota
# Keeps you on 100% free: warns if any paid model/provider slips in
param([int]$Days = 1)

Write-Host "=== FREE-TIER QUOTA CHECK (opencode/*-free only) ===" -ForegroundColor Cyan
Write-Host "Config: enabled_providers=[opencode], model=muse-spark-1.3-free, small=ling-3.0-flash-fin-free" -ForegroundColor DarkGray

Write-Host "`n--- Today (1 day) ---" -ForegroundColor Yellow
opencode stats --days 1
Write-Host "`n--- Week (7 days) ---" -ForegroundColor Yellow
opencode stats --days 7

Write-Host "`n--- Top models ---" -ForegroundColor Yellow
opencode stats --models 10 2>&1 | Select-Object -First 30

Write-Host "`n--- Config audit (must all end in -free) ---" -ForegroundColor Yellow
$cfg = opencode debug config 2>&1 | Out-String
$models = $cfg | Select-String '"model":' | ForEach-Object { $_.Line.Trim() }
$models | ForEach-Object { Write-Host $_ }
$nonFree = $models | Where-Object { $_ -notmatch "-free" -and $_ -notmatch "small_model" }
if ($nonFree) {
  Write-Host "`n[WARN] OFF FREE TIER - found non-free model:" -ForegroundColor Red
  $nonFree | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
} else {
  Write-Host "`n[OK] All models are -free - 100% FREE tier" -ForegroundColor Green
}

if ($cfg -match 'enabled_providers' -and $cfg -match 'opencode') {
  Write-Host "[OK] Provider lock: enabled_providers=[opencode] (blocks paid fallbacks)" -ForegroundColor Green
} else {
  Write-Host "[WARN] Provider lock missing - add enabled_providers:[opencode] to stay free" -ForegroundColor Yellow
}

Write-Host "`nTip: /free-quota in opencode or run .\scripts\check-free-quota.ps1 daily" -ForegroundColor DarkGray
