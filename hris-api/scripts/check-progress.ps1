$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body (@{
    email = 'admin@bandai.local'
    password = 'password123'
    appCode = 'hris'
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($login.data.token)" }
try {
    $prog = Invoke-RestMethod -Method Get 'http://localhost:3001/api/payroll-periods/cmpxw13bf001h7zwsyy6k976f/progress' -Headers $headers
    $prog | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_"
}
