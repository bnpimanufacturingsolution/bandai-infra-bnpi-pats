#!/usr/bin/env bash
lan_ip="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }')"

echo
echo "Project Truth HRIS appliance"
if [ -n "$lan_ip" ]; then
  echo "  App: http://${lan_ip}:3000"
  echo "  Login: http://${lan_ip}:3000/auth/login"
  echo "  API Health: http://${lan_ip}:3001/health"
  echo "  Dev: http://${lan_ip}:3100/auth/login  API: http://${lan_ip}:3101/health"
  echo "  UAT: http://${lan_ip}:3200/auth/login  API: http://${lan_ip}:3201/health"
else
  echo "  LAN IP: NOT DETECTED"
  echo "  Repair: project-truth-lan-dhcp"
fi
echo
echo "Run:"
echo "  project-truth-progress --watch"
echo "  project-truth-status"
echo "  project-truth-monitor"
echo "  project-truth-hris-status"
echo "  project-truth-hris-env-start dev|uat|prod|all"
echo "  project-truth-hris-env-seed dev|uat|prod|all"
echo "  project-truth-lan-dhcp"
echo
