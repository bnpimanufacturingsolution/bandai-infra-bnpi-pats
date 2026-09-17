# PATS Routing & Variance Engine

This document details the algorithms and validation protocols governing route enforcement, violation handling, and inventory variance thresholds in PATS.

---

## 1. Routing Enforcement Engine

Whenever a batch QR is scanned at a workstation, the PATS engine executes the following verification pipeline:

```text
Operator scans Batch QR Code at Station
                   |
                   v
Lookup Station -> Determine assigned Stage & SubStage
                   |
                   v
Fetch Batch -> Retrieve current Part ID and Stage History
                   |
                   v
Query PartsList for Part ID -> Resolve authorized Next Steps
                   |
         +---------+---------+
         |                   |
         v                   v
     [VALID]             [INVALID]
         |                   |
         v                   v
Allow Processing       TRIGGER ROUTING VIOLATION:
Update StageEvent      1. Lock workstation action
                       2. Display high-contrast red warning
                       3. Persist RoutingViolation record
                       4. Broadcast alert to Planner Desk
```

### 1.1 Types of Routing Violations
- **Stage Skipping**: Arriving at Assembly when Decoration has not been recorded.
- **Unauthorized Stage Arrival**: Arriving at a Spray booth when the part is molded in final colored plastic and requires no paint.
- **Premature Rework Entry**: Re-entering an earlier stage without authorized engineering change documentation.

---

## 2. Inventory Variance & Tolerance Engine

### 2.1 Variance Formula
When batches transition between stages via Issuance and Receiving:

$$\text{Variance \%} = \frac{|\text{Received Quantity} - \text{Issued Quantity}|}{\text{Issued Quantity}} \times 100$$

### 2.2 Tolerance Levels (`VarianceRule`)
1. **Normal Operating Range (Within ±5%)**:
   - Small scrap, runner trimming, or handling discrepancies within the configurable ±5% threshold are flagged as normal production shrinkage and automatically reconciled.
2. **Discrepancy Alarm (> ±5% Variance)**:
   - If variance exceeds the threshold, the system triggers an **Inventory Variance Hold**.
   - Requires physical recount and supervisor override before parts can be accepted into the receiving stage.
