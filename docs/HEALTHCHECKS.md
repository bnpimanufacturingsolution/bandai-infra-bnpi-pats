# Health Checks

Run the normal verifier:

```powershell
.\scripts\project-truth.ps1 verify -GuestIp <guest-lan-ip>
```

Run the persistent loop:

```powershell
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip> -MaxHours 8
```

The verifier checks:

```text
http://127.0.0.1:3001/health
http://127.0.0.1:3002/health
http://127.0.0.1:3000/health
http://<guest-lan-ip>:3001/health
http://<guest-lan-ip>:3002/health
http://<guest-lan-ip>:3000/health
ssh infra@<guest-lan-ip> "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes; sudo kubectl get pods -A; sudo kubectl get svc -A; sudo kubectl get applications -n argocd || true"
```

Logs are written under `.runtime/` and are not committed.
