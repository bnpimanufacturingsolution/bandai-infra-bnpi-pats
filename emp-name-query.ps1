$lb = @{email='admin@bandai.local';password='password123';appCode='bnpi-pats'} | ConvertTo-Json -Compress
$lg = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $lb
$tk = $lg.data.token
$hd = @{Authorization="Bearer $tk"}
$r = Invoke-RestMethod -Method Get 'http://localhost:3001/api/employee?limit=2&filters=employeeCode%3Ain%3A[01581]' -Headers $hd -ContentType 'application/json'
Write-Output ($r | ConvertTo-Json -Depth 5)
