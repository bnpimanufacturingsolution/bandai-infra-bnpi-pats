$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body (@{
    email = 'admin@bandai.local'
    password = 'password123'
    appCode = 'hris'
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($login.data.token)" }
try {
    $stop = Invoke-RestMethod -Method Post 'http://localhost:3001/api/payrollPeriod/cmpxw13bf001h7zwsyy6k976f/generate-timesheet/stop' -Headers $headers
    $stop | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_"
}
