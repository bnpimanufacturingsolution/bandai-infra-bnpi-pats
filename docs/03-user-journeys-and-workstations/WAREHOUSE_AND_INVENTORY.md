# PATS Warehouse & Inventory Operations

The Warehouse workspace governs the movement of parts between production buffers and the finished goods warehouse.

---

## 1. Inter-Stage Transfer Controls

Whenever parts move across major department boundaries:

1. **Issuance Generation**:
   - Outgoing department prepares the batch and creates an **Issuance Transaction** in PATS.
   - The batch is flagged as `IN_TRANSIT`.
2. **Receiving Verification**:
   - Destination warehouse or next stage scans the batch card upon arrival.
   - Physical pieces are counted/weighed and compared to the issued quantity.
   - Variance tolerance rules (±5%) are validated.
3. **Acknowledgment**: The transaction is marked `COMPLETED`, updating the localized inventory count.

---

## 2. Final Packaging & Finished Goods Staging

- When assembled units complete the final assembly line, they enter the packaging workstation.
- Batches are bundled into finished product cartons and assigned master shipping barcodes.
- The completed project order is logged into the final finished goods registry, providing full traceability back to original molding lots and spray operator batches.
