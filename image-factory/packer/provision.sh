#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release unzip ufw open-iscsi docker.io docker-compose-v2

sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 3100/tcp
sudo ufw allow 3101/tcp
sudo ufw allow 3200/tcp
sudo ufw allow 3201/tcp
sudo ufw --force enable
sudo systemctl enable docker
sudo systemctl start docker

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode=644 --disable=traefik" sh -

sudo kubectl create namespace argocd --dry-run=client -o yaml | sudo kubectl apply -f -
sudo kubectl apply --server-side -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

sudo tee /usr/local/bin/project-truth-firstboot-k3s-cleanup >/dev/null <<'CLEANUP'
#!/usr/bin/env bash
set -euo pipefail

marker="/var/lib/project-truth/firstboot-k3s-cleanup.done"
mkdir -p "$(dirname "$marker")"
if [ -f "$marker" ]; then
  exit 0
fi

current_node="$(hostname)"
for _ in $(seq 1 60); do
  if kubectl get node "$current_node" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

kubectl get pods -A -o wide --no-headers 2>/dev/null |
  awk -v current="$current_node" '$8 != "" && $8 != current { print $1, $2 }' |
  while read -r namespace pod; do
    kubectl delete pod -n "$namespace" "$pod" --ignore-not-found=true --wait=false || true
  done

kubectl get nodes -o name 2>/dev/null |
  sed 's#^node/##' |
  while read -r node; do
    if [ -n "$node" ] && [ "$node" != "$current_node" ]; then
      kubectl delete node "$node" --ignore-not-found=true || true
    fi
  done

touch "$marker"
CLEANUP
sudo chmod 0755 /usr/local/bin/project-truth-firstboot-k3s-cleanup
sudo tee /etc/systemd/system/project-truth-firstboot-k3s-cleanup.service >/dev/null <<'CLEANUPSERVICE'
[Unit]
Description=Project Truth first boot K3s clone cleanup
After=k3s.service
Wants=k3s.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/project-truth-firstboot-k3s-cleanup
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
CLEANUPSERVICE
sudo systemctl enable project-truth-firstboot-k3s-cleanup.service
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-status.sh /usr/local/bin/project-truth-status
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-monitor.sh /usr/local/bin/project-truth-monitor
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-env-start.sh /usr/local/bin/project-truth-hris-env-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-env-seed.sh /usr/local/bin/project-truth-hris-env-seed
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-start.sh /usr/local/bin/project-truth-hris-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-status.sh /usr/local/bin/project-truth-hris-status
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-seed.sh /usr/local/bin/project-truth-hris-seed
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-lan-dhcp.sh /usr/local/bin/project-truth-lan-dhcp
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-hris.service /etc/systemd/system/project-truth-hris.service
sudo install -m 0644 /opt/project-truth/appliance/profile.d/project-truth-hris-help.sh /etc/profile.d/project-truth-hris-help.sh
sudo chmod 0644 /etc/profile.d/project-truth-hris-help.sh
sudo docker compose -f /opt/project-truth/appliance/docker-compose.yml build
sudo systemctl daemon-reload
sudo systemctl enable project-truth-hris.service

sudo systemctl enable ssh
sudo systemctl restart ssh || sudo systemctl restart sshd || true

sudo kubectl get nodes
sudo kubectl get pods -A
echo "Project Truth base image bootstrap complete. Argo CD will reconcile apps from GitOps after repo credentials/applications are configured."
