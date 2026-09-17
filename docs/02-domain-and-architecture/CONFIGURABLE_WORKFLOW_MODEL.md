# PATS Configurable Workflow Model

This document specifies the configurable workflow hierarchy in PATS, allowing administrators to author, sequence, and customize production stages without modifying application source code.

---

## 1. Architectural Principle: Data-Driven, Not Hardcoded

In traditional manufacturing tools, stages like "Injection", "Decoration", and "Assembly" are hardcoded TypeScript enums. In Bandai Namco operations:
- Different product lines utilize different processes (e.g. Gundam runners vs fully painted collectible figures).
- Sub-stages evolve frequently (e.g., introducing pad printing, automated sonic welding, or special UV coating).
- PATS implements a **fully data-driven, admin-configurable hierarchy**:

```text
WorkflowGroup (Linked vs Standalone)
    |
    +---> Stage (e.g., Injection, Decoration, Assembly)
            |
            +---> Sub-Stage (e.g., Full Spray, Tampo Printing, Quality Check)
                    |
                    +---> Station (Physical machine / booth on floor)
```

---

## 2. The Entity Hierarchy

### 2.1 `WorkflowGroup`
- Scoped per `Project`.
- Represents a high-level segment of the factory pipeline (e.g. "Main Line Production", "Warehouse").
- **Linkage Modes**:
  - `linked`: Workpieces automatically flow to the next group upon completion.
  - `standalone`: Scoped, tracked, and buffered independently with its own intake/dispatch rules (e.g. Warehouse staging).

### 2.2 `Stage`
- Top-level operational phase (Admin-authored with `displayOrder`).
- Default seeded stages:
  1. *Planning*
  2. *Injection / Molding*
  3. *Receiving / Labeling*
  4. *Decoration*
  5. *Assembly*
  6. *Warehouse*
- Seeded stages carry `isSystemSeed: true` to prevent accidental deletion, but names, sequencing, and rules are customizable.

### 2.3 `SubStage`
- Granular operational steps within a stage:
  - Decoration Sub-Stages: *Pre-wash*, *Primer Spray*, *Full Spray (FS)*, *Mask Spray (MS)*, *Pad Printing (T)*, *Baking*.
  - Assembly Sub-Stages: *Sub-assembly A*, *Sub-assembly B*, *Final Assembly*, *Packaging*.
- Configured with properties:
  - `hasQualityCheckpoint`: Requires QC inspector sign-off before batch release.
  - `isBuffer`: Designates a staging area for batch temperature cooling or paint drying.

### 2.4 Station
- Physical work cell mapped to one or more sub-stages.
- Equipped with barcode/QR scanners and digital operator terminals.
