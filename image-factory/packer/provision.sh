#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
PROJECT_TRUTH_IMAGE_TARGET="${PROJECT_TRUTH_IMAGE_TARGET:-appliance}"
echo "$PROJECT_TRUTH_IMAGE_TARGET" | sudo tee /etc/project-truth-image-target >/dev/null

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
sudo apt-get install -y ca-certificates curl git gnupg lsb-release unzip ufw open-iscsi rsync ansible docker.io docker-compose-v2

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi

  arch="$(dpkg --print-architecture 2>/dev/null || true)"
  case "$arch" in
    amd64)
      package_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
      ;;
    arm64)
      package_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
      ;;
    *)
      echo "cloudflared automatic install skipped for architecture: ${arch:-unknown}" >&2
      return 0
      ;;
  esac

  tmp_deb="/tmp/cloudflared-${arch}.deb"
  if curl -fsSL --retry 3 --retry-delay 5 "$package_url" -o "$tmp_deb"; then
    sudo dpkg -i "$tmp_deb" >/dev/null 2>&1 || sudo apt-get install -f -y
    sudo rm -f "$tmp_deb" >/dev/null 2>&1 || true
  else
    echo "cloudflared download failed; project-truth-os-sync will retry on the VM" >&2
  fi
}

install_cloudflared
sudo install -d -m 0755 /etc/project-truth
printf 'EXPERIMENTAL_TRY_CLOUDFLARE=false\n' | sudo tee /etc/project-truth/experimental.env >/dev/null
sudo chmod 0644 /etc/project-truth/experimental.env

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
sudo ufw allow 38080/tcp
sudo ufw allow 53000/tcp
sudo ufw allow 9091/tcp
sudo ufw allow 3110/tcp
sudo ufw allow 9093/tcp
sudo ufw allow 9115/tcp
sudo ufw allow 9110/tcp
sudo ufw allow 8088/tcp
sudo ufw --force enable
sudo systemctl enable docker
sudo systemctl start docker

if [ -f /etc/default/grub ]; then
  sudo cp /etc/default/grub /etc/default/grub.project-truth-before-quiet-boot
  if [ "$PROJECT_TRUTH_IMAGE_TARGET" = "googlecompute" ]; then
    sudo sed -i \
      -e 's/^GRUB_TERMINAL=.*/GRUB_TERMINAL=console/' \
      -e 's/^GRUB_TERMINAL_INPUT=.*/GRUB_TERMINAL_INPUT=console/' \
      -e 's/^GRUB_TERMINAL_OUTPUT=.*/GRUB_TERMINAL_OUTPUT=console/' \
      -e 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT=""/' \
      -e 's/^GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX="console=tty0 console=ttyS0,38400n8"/' \
      /etc/default/grub
    sudo tee /etc/default/grub.d/99-project-truth-gcp-visible-boot.cfg >/dev/null <<'GRUBGCP'
GRUB_TERMINAL=console
GRUB_TERMINAL_INPUT=console
GRUB_TERMINAL_OUTPUT=console
GRUB_CMDLINE_LINUX_DEFAULT=""
GRUB_CMDLINE_LINUX="console=tty0 console=ttyS0,38400n8"
GRUBGCP
  else
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
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash loglevel=3 systemd.show_status=false rd.systemd.show_status=false udev.log_level=3"
GRUB_CMDLINE_LINUX="loglevel=3 systemd.show_status=false rd.systemd.show_status=false udev.log_level=3"
GRUBQUIET
  fi
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
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-hris-observability-start.sh /usr/local/bin/project-truth-hris-observability-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-db-access.sh /usr/local/bin/project-truth-db-access
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-lan-config.sh /usr/local/bin/project-truth-lan-config
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-lan-summary.sh /usr/local/bin/project-truth-lan-summary
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-clean-console.sh /usr/local/bin/project-truth-clean-console
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-console-session-hook.sh /usr/local/bin/project-truth-console-session-hook
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-trycloudflare-start.sh /usr/local/bin/project-truth-trycloudflare-start
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-ansible-pull.sh /usr/local/bin/project-truth-ansible-pull
sudo install -m 0755 /opt/project-truth/appliance/bin/project-truth-os-sync.sh /usr/local/bin/project-truth-os-sync
sudo tee /etc/sysctl.d/99-project-truth-console.conf >/dev/null <<'SYSCTL'
kernel.printk = 3 4 1 3
SYSCTL
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/99-project-truth-console.conf >/dev/null <<'JOURNALD'
[Journal]
ForwardToConsole=no
MaxLevelConsole=notice
JOURNALD
sudo tee /etc/systemd/system/project-truth-lan-config.service >/dev/null <<'LANDHCP'
[Unit]
Description=Project Truth first boot LAN config
Before=network-online.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/project-truth-lan-config
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
LANDHCP
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-lan-summary.service /etc/systemd/system/project-truth-lan-summary.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-clean-console.service /etc/systemd/system/project-truth-clean-console.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-hris.service /etc/systemd/system/project-truth-hris.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-trycloudflare.service /etc/systemd/system/project-truth-trycloudflare.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-ansible-pull.service /etc/systemd/system/project-truth-ansible-pull.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-ansible-pull.timer /etc/systemd/system/project-truth-ansible-pull.timer
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-os-sync.service /etc/systemd/system/project-truth-os-sync.service
sudo install -m 0644 /opt/project-truth/appliance/systemd/project-truth-os-sync.timer /etc/systemd/system/project-truth-os-sync.timer
sudo install -m 0644 /opt/project-truth/appliance/profile.d/project-truth-hris-help.sh /etc/profile.d/project-truth-hris-help.sh
sudo chmod 0644 /etc/profile.d/project-truth-hris-help.sh
pam_line='session optional pam_exec.so quiet /usr/local/bin/project-truth-console-session-hook'
if [ -f /etc/pam.d/login ] && ! grep -Fq "$pam_line" /etc/pam.d/login; then
  {
    echo
    echo '# Refresh Project Truth console LAN summary on tty1 login/logout.'
    echo "$pam_line"
  } | sudo tee -a /etc/pam.d/login >/dev/null
fi
for service in hris-api-db-init hris-api hris-app; do
  sudo docker compose -f /opt/project-truth/appliance/docker-compose.yml build "$service"
done
sudo systemctl daemon-reload
if [ "$PROJECT_TRUTH_IMAGE_TARGET" != "googlecompute" ]; then
  sudo systemctl enable project-truth-lan-config.service
fi
sudo systemctl enable project-truth-lan-summary.service
sudo systemctl enable project-truth-clean-console.service
sudo systemctl enable project-truth-hris.service
sudo systemctl disable --now project-truth-trycloudflare.service >/dev/null 2>&1 || true
sudo systemctl enable project-truth-ansible-pull.timer

if [ "$PROJECT_TRUTH_IMAGE_TARGET" = "googlecompute" ]; then
  sudo rm -f /etc/cloud/cloud-init.disabled || true
  sudo cloud-init clean --logs || true
else
  # Exported VirtualBox/Hyper-V clients do not need cloud metadata and should
  # not pause or print datasource errors while booting on a LAN appliance host.
  sudo touch /etc/cloud/cloud-init.disabled || true
  sudo cloud-init clean --logs || true
fi

sudo tee /usr/local/bin/project-truth-firstboot-identity >/dev/null <<'IDENTITY'
#!/usr/bin/env bash
set -euo pipefail

image_target="appliance"
if [ -r /etc/project-truth-image-target ]; then
  image_target="$(cat /etc/project-truth-image-target)"
fi

if [ ! -s /etc/machine-id ]; then
  systemd-machine-id-setup >/dev/null 2>&1 || true
fi

if ! ls /etc/ssh/ssh_host_*_key >/dev/null 2>&1; then
  ssh-keygen -A >/dev/null 2>&1 || true
fi

if [ "$image_target" != "googlecompute" ] && command -v project-truth-lan-config >/dev/null 2>&1; then
  project-truth-lan-config >/dev/null 2>&1 || true
fi

if command -v project-truth-lan-summary >/dev/null 2>&1; then
  project-truth-lan-summary --quiet >/dev/null 2>&1 || true
fi
IDENTITY
sudo chmod 0755 /usr/local/bin/project-truth-firstboot-identity
sudo tee /etc/systemd/system/project-truth-firstboot-identity.service >/dev/null <<'IDENTITYSERVICE'
[Unit]
Description=Project Truth first boot identity and LAN refresh
DefaultDependencies=no
After=local-fs.target
Before=network-pre.target ssh.service sshd.service project-truth-lan-config.service project-truth-lan-summary.service
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/project-truth-firstboot-identity
RemainAfterExit=yes

[Install]
WantedBy=sysinit.target
IDENTITYSERVICE
sudo systemctl enable project-truth-firstboot-identity.service

sudo tee /usr/local/bin/project-truth-generalize-image >/dev/null <<'GENERALIZE'
#!/usr/bin/env bash
set -euo pipefail

rm -f /etc/ssh/ssh_host_*_key /etc/ssh/ssh_host_*_key.pub
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id
ln -s /etc/machine-id /var/lib/dbus/machine-id

if [ "${PROJECT_TRUTH_IMAGE_TARGET:-appliance}" = "googlecompute" ]; then
  rm -f /etc/cloud/cloud-init.disabled
  cloud-init clean --logs || true
else
  rm -rf /var/lib/cloud/instances /var/lib/cloud/instance /var/lib/cloud/data
  rm -f /var/log/cloud-init.log /var/log/cloud-init-output.log
  rm -f /etc/netplan/50-cloud-init.yaml
fi

rm -f /etc/issue /etc/motd
rm -rf /run/project-truth
rm -f /var/log/project-truth-network-summary.log
rm -f /var/lib/project-truth/firstboot-k3s-cleanup.done

journalctl --rotate >/dev/null 2>&1 || true
journalctl --vacuum-time=1s >/dev/null 2>&1 || true
find /var/log -type f -name '*.log' -exec truncate -s 0 {} + 2>/dev/null || true
GENERALIZE
sudo chmod 0755 /usr/local/bin/project-truth-generalize-image

sudo systemctl enable ssh
sudo systemctl restart ssh || sudo systemctl restart sshd || true

sudo kubectl get nodes
sudo kubectl get pods -A
sudo PROJECT_TRUTH_IMAGE_TARGET="$PROJECT_TRUTH_IMAGE_TARGET" project-truth-generalize-image
echo "Project Truth base image bootstrap complete. Argo CD will reconcile apps from GitOps after repo credentials/applications are configured."
