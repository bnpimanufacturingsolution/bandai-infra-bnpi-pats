# BNPI PATS System Overview

## 1. Product Identity

**BNPI PATS** stands for **Production and Assembly Tracking System** for **Bandai Namco Philippines Inc.**

It is a specialized **Manufacturing Execution System (MES)** engineered to track Work-in-Progress (WIP) parts and assemblies across the Bandai Namco manufacturing floor.

---

## 2. Product Boundary: PATS vs HRIS

> [!IMPORTANT]
> **System Boundary Definition:**
> - **HRIS (Human Resource Information System)**: Manages employee personnel masterlists, daily biometric timekeeping, leaves, disciplinary actions, statutory contributions (SSS, PhilHealth, Pag-IBIG), withholding tax (BIR 2316), and semi-monthly payroll computations.
> - **PATS (Production and Assembly Tracking System)**: Operates strictly on the **factory production floor**. It tracks physical toy parts, injection molding lots, decoration sub-stages, assembly lines, warehouse inventory movements, QR/barcode batches, and Parts List routing rule enforcement.

PATS is **not** an ERP (it does not track raw material purchasing or financial ledgers) and **not** an HRIS (it does not process payroll or employee statutory deductions).

---

## 3. Business Problem Solved by PATS

On the manufacturing floor of Bandai Namco Philippines:
1. **Routing Complexity**: Hundreds of distinct parts (e.g., Gundam / Dragon Ball figure components: heads, limbs, torsos, accessories) follow unique, part-specific production routes. Some require injection molding only; others require multi-color spray decoration, pad printing, and sub-assembly.
2. **Lack of Real-Time Visibility**: Floor planners historically lacked real-time visibility into where specific lots and batches were located.
3. **Misrouting Risks**: Without automated route validation, parts could arrive at incorrect workstations (e.g. assembly before decoration), leading to defect rates and lost production time.
4. **Traceability**: Regulatory and quality standards require granular batch traceability from mold injection through warehouse packaging via Barcode/QR codes.

---

## 4. Core Capabilities of PATS

- **Parts List-Driven Routing Enforcement**: The Parts List defines the required sequence of stages for each individual part. Any deviation triggers an immediate **Routing Violation Alert**.
- **Real-Time WIP Tracking**: Planners and line leaders can see the exact location, quantity, and processing stage of every part in production.
- **Batch-Level QR/Barcode Traceability**: Physical containers travel with traceable QR/Barcode batch cards scanned at every station.
- **Configurable Workflow Hierarchy**: Stages, sub-stages, and workflow groups (e.g., Main Production vs Warehouse) are fully configurable by administrators without code changes.
- **Inventory Movement Tracking**: Strict Receiving and Issuance controls with configurable tolerance/variance thresholds (e.g., ±5%).
