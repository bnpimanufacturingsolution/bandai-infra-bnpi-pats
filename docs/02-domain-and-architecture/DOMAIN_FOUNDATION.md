# PATS Domain Foundation

This document defines the canonical domain entities and bounded contexts of the **Production and Assembly Tracking System**.

---

## 1. Bounded Contexts

```text
+-------------------------------------------------------------------------------+
| Planning Definition Context                                                   |
|   - Project: High-level manufacturing project scope                           |
|   - ProductSpecification: Bill of materials & technical tolerances            |
|   - PartsList: Master source of truth for routing rules                       |
|   - Part: Individual toy part/component entity                               |
|   - Lot: Production order allocation volume                                   |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Execution & Routing Context                                                   |
|   - Batch: Barcode/QR-traceable physical unit of parts                        |
|   - Station: Floor workstation / production line cell                         |
|   - StageEvent: Arrival, processing start, completion, hold                   |
|   - RoutingViolation: Enforced deviation record against PartsList             |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Inventory & Movement Context                                                  |
|   - InventoryTransaction: Formal Issuance & Receiving records                 |
|   - VarianceRule: Hybrid percent/floor quantity tolerance rule                |
|   - WarehouseStock: Final packaged finished goods inventory                   |
+-------------------------------------------------------------------------------+
```

---

## 2. Core Entities

### 2.1 Planning Entities
- **`Project`**: Root scope for a manufacturing run (e.g. "Dragon Ball Son Goku SSJ4 Figure").
- **`Part`**: The physical part identity (e.g. `PART-001` Head Front, `PART-002` Torso Armor).
- **`PartsList`**: Links parts to ordered stage steps:
  - `partId`: Foreign key to `Part`.
  - `stages`: Ordered list of `Stage` and `SubStage` references.
  - `isOptional`: Flags whether a stage can be bypassed (e.g. optional clear-coat).

### 2.2 Execution Entities
- **`Lot`**: Grouping of production batches created for a project order.
- **`Batch`**:
  - `batchCode`: Scannable Barcode/QR identifier (e.g. `BTC-2026-0705-0012`).
  - `partId`: The part contained in the batch.
  - `currentQuantity`: Active count of good parts.
  - `rejectedQuantity`: Scrapped/defective parts identified at QA checkpoints.
  - `currentStageId`: Active location of the batch.
  - `status`: `IN_QUEUE`, `IN_PROCESS`, `ON_HOLD`, `COMPLETED`, `ROUTING_VIOLATION`.
- **`Station`**: Physical workstation on the factory floor mapped to specific equipment and operators.
- **`RoutingViolation`**:
  - `batchId`: Batch attempting unauthorized entry.
  - `attemptedStationId`: Station where scan occurred.
  - `expectedStageId`: Required next stage according to `PartsList`.
  - `timestamp`: Time of scan.
  - `resolvedBy`: Supervisor who acknowledged and cleared the violation.
