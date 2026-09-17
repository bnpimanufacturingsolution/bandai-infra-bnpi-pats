# Bandai PATS Documentation

Welcome to the official documentation for **BNPI PATS** (**Production and Assembly Tracking System**) for **Bandai Namco Philippines Inc.**

PATS is the Manufacturing Execution System (MES) engineered to track Work-in-Progress (WIP) parts, enforce Parts List routing rules, record batch QR/barcode station events, and manage inter-stage inventory across Bandai Namco manufacturing operations.

> **System Scope Note:**
> Payroll, statutory compliance (SSS/PhilHealth/Pag-IBIG/BIR), employee 201 filing, and HR timekeeping are managed under **HRIS**. 
> **PATS** focuses exclusively on **factory floor production tracking, WIP routing, workstations, and inventory management**.

---

## Documentation Structure

### [01. Overview & Requirements](01-overview-and-requirements/)
- [PATS System Overview](01-overview-and-requirements/PATS_SYSTEM_OVERVIEW.md) — Product mission, goals, MES scope, and HRIS vs PATS boundary.
- [Business Requirements Document (BRD)](01-overview-and-requirements/BUSINESS_REQUIREMENTS_BRD.md) — Business objectives, factory floor challenges, in-scope/out-of-scope boundaries.
- [Product Requirements Document (PRD)](01-overview-and-requirements/PRODUCT_REQUIREMENTS_PRD.md) — Routing rules, batch lifecycle, QR scanning, and inventory tolerances.

### [02. Domain & Architecture](02-domain-and-architecture/)
- [Domain Foundation](02-domain-and-architecture/DOMAIN_FOUNDATION.md) — Core entities: `Project`, `ProductSpecification`, `PartsList`, `Part`, `Lot`, `Batch`, `Station`.
- [Configurable Workflow Model](02-domain-and-architecture/CONFIGURABLE_WORKFLOW_MODEL.md) — Data-driven Stage & Sub-Stage hierarchy, WorkflowGroups, linked vs standalone modes.
- [Routing & Variance Engine](02-domain-and-architecture/ROUTING_AND_VARIANCE_ENGINE.md) — Route verification algorithms, violation detection, and ±5% quantity tolerance engine.

### [03. User Journeys & Workstations](03-user-journeys-and-workstations/)
- [Planning Desk](03-user-journeys-and-workstations/PLANNING_DESK.md) — Project setup, parts list routing authoring, and order release to floor execution.
- [Line Setup & Station Configuration](03-user-journeys-and-workstations/LINE_SETUP_AND_STATIONS.md) — Workstations, floor line layouts, and operator assignments.
- [Line Operations & Execution](03-user-journeys-and-workstations/LINE_OPERATIONS_AND_EXECUTION.md) — Floor scanning workflows, instant route validation, and quality rejection handling.
- [Warehouse & Inventory Operations](03-user-journeys-and-workstations/WAREHOUSE_AND_INVENTORY.md) — Inter-stage issuance and receiving transfers, variance checks, and finished goods packaging.

### [04. Infrastructure & Operations](04-infrastructure-and-operations/)
- [On-Premises Appliance Architecture](04-infrastructure-and-operations/ONPREM_APPLIANCE_ARCHITECTURE.md) — Hyper-V VM, K3s, Docker, and static LAN configuration (`10.184.37.19`).
- [On-Premises Manual Deployment Guide & Runbook](04-infrastructure-and-operations/ONPREM_MANUAL_DEPLOYMENT_GUIDE.md) — Comprehensive step-by-step manual commands for deploying, updating, and operating PATS on the appliance.
- [Cloudflare Named Tunnel Runbook](CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md) — Secure, zero-inbound-port tunneling for remote and public access.
- [GitOps Client Environment Scaling](GITOPS_CLIENT_ENV_SCALING.md) — ArgoCD multi-environment deployment runbook.
- [Local Development Setup](04-infrastructure-and-operations/LOCAL_DEV_SETUP.md) — Setting up, building, and running PATS locally.

### Manuals & Documentation Downloads
- [BNPI PATS User Manual (Word Document)](manuals/BNPI-PATS-User-Manual.docx) — Step-by-step user guide with interface captures.
- [BNPI PATS On-Premises Deployment Manual (Word Document)](manuals/BNPI-PATS-OnPrem-Deployment-Manual.docx) — Full manual deployment runbook in DOCX format (also at [BNPI-PATS-OnPrem-Deployment-Manual.docx](BNPI-PATS-OnPrem-Deployment-Manual.docx)).

