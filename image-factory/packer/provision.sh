#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release unzip ufw open-iscsi docker.io docker-compose-v2

sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw --force enable
sudo systemctl enable docker
sudo systemctl start docker

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode=644 --disable=traefik" sh -

sudo kubectl create namespace argocd --dry-run=client -o yaml | sudo kubectl apply -f -
sudo kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

sudo tee /usr/local/bin/project-truth-status >/dev/null <<'STATUS'
#!/usr/bin/env bash
set -euo pipefail
echo "Project Truth node status"
hostname
ip -br addr
docker ps 2>/dev/null || true
docker compose -f /opt/project-truth/appliance/docker-compose.yml config >/dev/null
sudo kubectl get nodes
sudo kubectl get pods -A
sudo kubectl get svc -A
sudo kubectl get applications -n argocd || true
STATUS

sudo chmod 0755 /usr/local/bin/project-truth-status
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-start.sh /usr/local/bin/project-truth-hris-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-status.sh /usr/local/bin/project-truth-hris-status
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-hris.service /etc/systemd/system/project-truth-hris.service
sudo tee /etc/profile.d/project-truth-hris-help.sh >/dev/null <<'HELP'
#!/usr/bin/env bash
lan_ip="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth/ { split($4, a, "/"); print a[1]; exit }')"
echo
echo "Project Truth HRIS is available at:"
if [ -n "$lan_ip" ]; then
  echo "  App: http://${lan_ip}:3000"
  echo "  API Health: http://${lan_ip}:3001/health"
else
  echo "  LAN IP: NOT DETECTED"
  echo "  Reason: no active non-loopback IPv4 address found"
  echo "  Next check: verify VM adapter is bridged/external and DHCP is enabled"
fi
echo
echo "Run:"
echo "  project-truth-hris-status"
echo
HELP
sudo chmod 0644 /etc/profile.d/project-truth-hris-help.sh
sudo docker compose -f /opt/project-truth/appliance/docker-compose.yml build
sudo systemctl daemon-reload
sudo systemctl enable project-truth-hris.service

sudo systemctl enable ssh
sudo systemctl restart ssh || sudo systemctl restart sshd || true

sudo kubectl get nodes
sudo kubectl get pods -A
echo "Project Truth base image bootstrap complete. Argo CD will reconcile apps from GitOps after repo credentials/applications are configured."
