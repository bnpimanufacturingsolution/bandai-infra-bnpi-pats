#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release unzip ufw open-iscsi

sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 3002/tcp
sudo ufw --force enable

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
sudo kubectl get nodes
sudo kubectl get pods -A
sudo kubectl get svc -A
sudo kubectl get applications -n argocd || true
STATUS

sudo chmod 0755 /usr/local/bin/project-truth-status

sudo systemctl enable ssh
sudo systemctl restart ssh || sudo systemctl restart sshd || true

sudo kubectl get nodes
sudo kubectl get pods -A
echo "Project Truth base image bootstrap complete. Argo CD will reconcile apps from GitOps after repo credentials/applications are configured."
