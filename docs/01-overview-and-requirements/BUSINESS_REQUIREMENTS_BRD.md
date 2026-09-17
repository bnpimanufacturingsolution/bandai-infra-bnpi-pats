# Business Requirements Document (BRD)
## Production and Assembly Tracking System (PATS)
### Bandai Namco Philippines Inc.

---

## 1. Purpose & Business Objective
This document defines the business need, scope, and operational rules for the **Production and Assembly Tracking System (PATS)** at Bandai Namco Philippines Inc. (BNPI).

### Business Objectives
- Give production planners real-time, line-level visibility into WIP part locations.
- Enforce routing rules declared in the **Parts List** to eliminate misrouting.
- Track inventory movements via formal **Receiving** and **Issuance** transactions.
- Maintain batch-level traceability through Barcode/QR tags from molding to warehouse.
- Ensure the production workflow model (stages, packaging, optional processes) is configurable rather than hardcoded.

---

## 2. In-Scope vs Out-of-Scope

### In Scope
- WIP tracking across all manufacturing stages:
  1. **Planning** (Parts list definition, lot sizing, routing declarations)
  2. **Injection / Molding** (Raw resin molding into component parts)
  3. **Receiving & Labeling** (Floor receiving, barcode/QR generation)
  4. **Decoration** (Spray painting, pad printing, tampo printing, sub-stages)
  5. **Assembly** (Sub-assembly, final figure assembly, inspection)
  6. **Warehouse** (Packaging, lot boxing, final receiving/issuance)
- Parts List-driven routing enforcement and violation alerting.
- Inventory tracking by quantity linked to QR-identified batches.
- Planner dashboard for real-time stage progress and bottleneck analysis.
- Floor workstation scanning UI for operators and line leaders.
- Configurable variance rules (e.g. ±5% quantity tolerance).

### Out of Scope
- Raw material procurement and resin supply chain accounting.
- Financial ledgers, invoicing, and sales accounting (handled by corporate ERP).
- Human resources, attendance, timekeeping, and payroll (handled by BNPI HRIS).

---

## 3. Business Entities Summary

| Entity | Description |
|---|---|
| **Project** | A manufacturing project for a product line (e.g., specific anime figure line), containing product specs, parts list, and required production volume. |
| **Part** | Individual molded or fabricated component (e.g. Head, Torso, Left Arm, Weapon) tracked through its unique lifecycle. |
| **Parts List** | The **Source of Truth** for production routing; declares which stages each part must visit, optional stages, and required sequences. |
| **Lot** | A planned production volume for a project, broken down into manageable batches. |
| **Batch** | The physical container/tote of parts with an associated QR/Barcode batch card, scanned at each workstation. |
| **Station** | The physical workstation or machine on the factory floor (e.g., Molding Machine #4, Spray Booth #2, Assembly Line 1). |
| **Routing Violation** | An auditable event triggered when a part/batch arrives at an unauthorized or out-of-sequence station. |
