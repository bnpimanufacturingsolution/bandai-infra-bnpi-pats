# Product Requirements Document (PRD)
## Production and Assembly Tracking System (PATS)
### Bandai Namco Philippines Inc.

---

## 1. Functional Requirements

### 1.1 Parts List & Routing Engine
- **Per-Part Routing**: Each part within a project has an independently defined route.
- **Route Validation**:
  - When an operator scans a batch QR code at any Station, PATS immediately queries the `PartsList` for that Part.
  - If the station's assigned Stage is not the next authorized step, the system:
    1. Rejects the operation with a high-visibility visual and audio warning.
    2. Records a `RoutingViolation` audit entry in the database.
    3. Broadcasts an alert to the Planner Desk and Section Supervisor.
- **Authorized Mid-Production Route Modifications**: Authorized production engineers can insert or skip sub-stages (e.g., adding an extra bake or touch-up step) with signed change remarks.

### 1.2 Batch & QR Lifecycle
- **Batch Creation**: Batches are spawned when molded parts emerge from the Injection stage.
- **Batch Card Generation**: The system generates print-ready QR/Barcode batch travel cards containing:
  - Batch ID & Lot Number.
  - Project Code & Part Number / Part Name.
  - Initial Quantity.
  - Required Routing Stages Sequence.
- **Batch Splitting & Merging**: Operators can split a large batch into smaller sub-batches (e.g. for parallel decoration lines) while maintaining parent-child lineage and total quantity integrity.

### 1.3 Inventory & Tolerance Rules
- **Receiving & Issuance**: Moving batches between departments (e.g., Injection -> Decoration -> Assembly -> Warehouse) requires formal Issuance at the source and Receiving at the destination.
- **Variance Calculation**:
  $$\text{Variance \%} = \frac{|\text{Received Qty} - \text{Issued Qty}|}{\text{Issued Qty}} \times 100$$
- **Tolerance Threshold**: Default threshold is ±5%. Any variance exceeding the threshold flags a mandatory discrepancy review before the batch can be released into the next stage.
