#!/usr/bin/env bash
lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
if [ -z "$lan_ip" ]; then
  lan_ip="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }')"
fi

echo
echo "Project Truth HRIS appliance"
if [ -n "$lan_ip" ]; then
  echo "  LAN IP: ${lan_ip}"
  echo
  echo "  Open from host browser:"
  echo "  PROD login: http://${lan_ip}:3000/auth/login"
  echo "  PROD API:   http://${lan_ip}:3001/health"
  echo "  DEV login:  http://${lan_ip}:3100/auth/login"
  echo "  DEV API:    http://${lan_ip}:3101/health"
  echo "  UAT login:  http://${lan_ip}:3200/auth/login"
  echo "  UAT API:    http://${lan_ip}:3201/health"
  echo
  echo "  Observability:"
  echo "  Grafana: http://${lan_ip}:53000"
  echo "  Prometheus: http://${lan_ip}:9091"
  echo "  Loki: http://${lan_ip}:3110"
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
echo "  project-truth-lan-summary"
echo "  project-truth-hris-env-start dev|uat|prod|all"
echo "  project-truth-hris-env-seed dev|uat|prod|all"
echo "  project-truth-lan-dhcp"
echo
echo "Startup URL log:"
echo "  /var/log/project-truth-network-summary.log"
echo
