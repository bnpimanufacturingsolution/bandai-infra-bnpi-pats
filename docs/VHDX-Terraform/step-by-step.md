VHDX -> Terraform -> URL, in order:

1. Preflight:
   .\scripts\project-truth.ps1 doctor

   .\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx

   README.md:43-52.

2. Terraform host layer:

   .\scripts\project-truth.ps1 terraform-plan
   .\scripts\project-truth.ps1 terraform-apply -Apply

   Plan = scripts/terraform-plan.ps1:12-17, apply gate = scripts/terraform-apply.ps1:9-19. Creates switch ProjectTruth-External, VM bnpi-pats, attaches VHDX. Vars: terraform-hyperv/terraform.tfvars:1-12.

3. Get GuestIP + wait:
   Get IP from Hyper-V KVP / Get-VMNetworkAdapter, then:

   .\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>

   Requires GuestIp: scripts/watch-until-healthy.ps1:13-18. 
   Polls scripts/verify-host-health.ps1:28-34:

   127.0.0.1:3000/auth/login, :3001/health
   127.0.0.1:3100/auth/login, :3101/health
   127.0.0.1:3200/auth/login, :3201/health

- LAN http://<guest-lan-ip>:3000,3001,3100,3101,3200,3201

4. Argo inside VM:
   ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@<guest-lan-ip>

   sudo kubectl get applications -n argocd

   Finish line is K3s/Argo synced, not host Docker. Expect PROD 3000/3001, DEV 3100/3101, UAT 3200/3201.

5. Public subdomains:
   Fresh image has no tunnel creds. From host:

   .\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic

   Tunnel bnpi-pats 12e89b6a-dabb-4897-9925-08ce9213b983, 
   ingress cloudflared-bnpi-pats.yml:53-66.

   Front-end result:
   PROD https://bnpipats.tech/auth/login, https://app.bnpipats.tech/auth/login
   DEV https://dev.bnpipats.tech/auth/login
   UAT https://uat.bnpipats.tech/auth/login
   API https://api.bnpipats.tech/health, https://dev-api.bnpipats.tech/health, https://uat-api.bnpipats.tech/health

   Ignore emp/dev-emp/uat-emp — retired.


=============

1. prod: 
bnpipats.tech	
Published application
http://localhost:3000

Using defaults

-

2. prod: 
www.bnpipats.tech	
Published application
http://localhost:3000

Using defaults

-

3. develop:
dev.bnpipats.tech	
Published application
https://localhost:3100

Using defaults

-

4. uat:
uat.bnpipats.tech	
Published application
https://localhost:3300

Using defaults

