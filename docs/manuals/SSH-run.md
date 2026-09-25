SSH ACCOUNT 
user: infra
pass: bandai-infra


Open PowerShell as Administrator and run:
Set-Service -Name sshd -StartupType Automatic

Start-Service sshd

Verify SSH is listening:
Get-Service sshd
Test-NetConnection -ComputerName 127.0.0.1 -Port 22

You should see:
sshd  Running
TcpTestSucceeded : True
Then configure the Cloudflare public hostname with:
Service: ssh://localhost:22
Connect from another computer using:
ssh WINDOWS_USERNAME@YOUR-SSH-HOSTNAME
You do not need to expose port 22 through your router.