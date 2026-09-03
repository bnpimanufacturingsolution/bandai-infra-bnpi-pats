#!/bin/sh
set -e

echo "=== Initializing Grafana PostgreSQL database ==="
echo "Grafana UI state (dashboards, datasources, users, alerts) will be saved in PostgreSQL 'grafana' database."
echo "This ensures all changes persist across container restarts."
