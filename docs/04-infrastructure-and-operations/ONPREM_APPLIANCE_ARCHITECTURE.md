# PATS On-Premises Appliance Architecture

This document describes the on-premises virtual appliance runtime for Bandai Namco Philippines.

---

## 1. Physical Host & Appliance Topology

- **Host Machine**: Windows workstation running Microsoft Hyper-V.
- **Appliance**: Dedicated Linux (Ubuntu) virtual machine (`project-truth-local-vhdx-proof`).
- **Static LAN IP**: `10.184.37.19`.
- **Runtime Engine**: K3s lightweight Kubernetes cluster running inside the VM.
- **GitOps Deployment**: ArgoCD automatically synchronizes container deployments from the `develop` branch of the Git repository.

---

## 2. Ports and Services

| Environment | Web Application | REST API | PostgreSQL |
|---|---|---|---|
| **Production** | `http://10.184.37.19:3000` | `http://10.184.37.19:3001` | Port `15432` |
| **Development** | `http://10.184.37.19:3100` | `http://10.184.37.19:3101` | Port `15433` |
| **UAT** | `http://10.184.37.19:3200` | `http://10.184.37.19:3201` | Port `15434` |

Public and remote access is securely provided through the VM-managed Cloudflare Named Tunnel (`cloudflared-bnpi-pats.service`).
