#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

retry() {
  local attempts="$1"
  local delay="$2"
  shift 2
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      echo "Attempt $attempt failed; retrying in ${delay}s: $*" >&2
      sleep "$delay"
    fi
  done
  return 1
}

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release unzip ufw open-iscsi docker.io docker-compose-v2

echo "infra:infra" | sudo chpasswd
sudo passwd -u infra || true
sudo install -d -m 0755 /etc/ssh/sshd_config.d
printf 'PasswordAuthentication yes\nKbdInteractiveAuthentication yes\n' | sudo tee /etc/ssh/sshd_config.d/90-project-truth-password-auth.conf >/dev/null
echo 'infra ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/90-infra >/dev/null
sudo chmod 0440 /etc/sudoers.d/90-infra

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

if [ -f /etc/default/grub ]; then
  sudo cp /etc/default/grub /etc/default/grub.project-truth-before-quiet-boot
  sudo sed -i \
    -e 's/^GRUB_TERMINAL=.*/GRUB_TERMINAL=gfxterm/' \
    -e 's/^GRUB_TERMINAL_INPUT=.*/GRUB_TERMINAL_INPUT=console/' \
    -e 's/^GRUB_TERMINAL_OUTPUT=.*/GRUB_TERMINAL_OUTPUT=gfxterm/' \
    -e 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"/' \
    -e 's/ console=ttyS[0-9],[0-9]\+n[0-9]//g' \
    -e 's/ console=ttyS[0-9]//g' \
    /etc/default/grub
  sudo tee /etc/default/grub.d/99-project-truth-quiet-boot.cfg >/dev/null <<'GRUBQUIET'
GRUB_TERMINAL=console
GRUB_TERMINAL_INPUT=console
GRUB_TERMINAL_OUTPUT=console
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"
GRUB_CMDLINE_LINUX=""
GRUBQUIET
  if command -v update-grub >/dev/null 2>&1; then
    sudo update-grub || true
  fi
fi

install_k3s() {
  curl -sfL --retry 5 --retry-delay 10 --retry-all-errors https://get.k3s.io |
    INSTALL_K3S_VERSION="v1.36.1+k3s1" INSTALL_K3S_EXEC="--write-kubeconfig-mode=644 --disable=traefik" sh -
}

retry 5 20 install_k3s

sudo kubectl create namespace argocd --dry-run=client -o yaml | sudo kubectl apply -f -
curl -sfL --retry 5 --retry-delay 10 --retry-all-errors \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml \
  -o /tmp/argocd-install.yaml
sudo kubectl apply --server-side -n argocd -f /tmp/argocd-install.yaml

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
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-progress.sh /usr/local/bin/project-truth-progress
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-monitor.sh /usr/local/bin/project-truth-monitor
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-env-start.sh /usr/local/bin/project-truth-hris-env-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-env-seed.sh /usr/local/bin/project-truth-hris-env-seed
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-dev-current-restore.sh /usr/local/bin/project-truth-hris-dev-current-restore
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-start.sh /usr/local/bin/project-truth-hris-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-status.sh /usr/local/bin/project-truth-hris-status
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-seed.sh /usr/local/bin/project-truth-hris-seed
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-lan-dhcp.sh /usr/local/bin/project-truth-lan-dhcp
sudo tee /etc/systemd/system/project-truth-lan-dhcp.service >/dev/null <<'LANDHCP'
[Unit]
Description=Project Truth first boot LAN DHCP
Before=network-online.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/project-truth-lan-dhcp
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
LANDHCP
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-hris.service /etc/systemd/system/project-truth-hris.service
sudo install -m 0644 /opt/project-truth/appliance/profile.d/project-truth-hris-help.sh /etc/profile.d/project-truth-hris-help.sh
sudo chmod 0644 /etc/profile.d/project-truth-hris-help.sh
sudo docker compose -f /opt/project-truth/appliance/docker-compose.yml build
sudo systemctl daemon-reload
sudo systemctl enable project-truth-lan-dhcp.service
sudo systemctl enable project-truth-hris.service

sudo systemctl enable ssh
sudo systemctl restart ssh || sudo systemctl restart sshd || true

sudo kubectl get nodes
sudo kubectl get pods -A
echo "Project Truth base image bootstrap complete. Argo CD will reconcile apps from GitOps after repo credentials/applications are configured."
