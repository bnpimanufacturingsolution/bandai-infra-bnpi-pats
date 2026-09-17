# PATS Line Operations & Execution

This guide describes the day-to-day scanning, tracking, and validation interactions performed by line operators and quality inspectors on the factory floor.

---

## 1. Workstation Scanning Journey

When a batch of parts arrives at a workstation:

1. **Intake Scan**: The operator scans the Batch QR card with the handheld scanner.
2. **Instant Verification**:
   - The screen validates that the batch's Part is authorized for this station.
   - If valid, the station unlocks, showing part photos, quantity in batch, and target cycle time.
   - If invalid, an alarm sounds, the screen flashes red, and the station is locked until cleared.
3. **Processing**: Operator performs the task (e.g. molding, spray painting, assembling).
4. **Completion Scan & Quality Check**:
   - Operator records completed quantity and any rejected/scrap pieces.
   - For QC checkpoint sub-stages, a certified inspector scans their badge to endorse the batch.
5. **Next Stage Dispatch**: The travel card is updated, and the tote is forwarded to the next workstation or transit buffer.

---

## 2. Handling Quality Rejections & Scrap

- Rejected parts are logged with failure reason codes (e.g., Short Shot, Sink Mark, Paint Bleed, Scratch, Foreign Particle).
- The active good quantity (`currentQuantity`) is automatically adjusted in the database.
- If total scrap exceeds the pre-set threshold (e.g., 2%), an automated notification alerts the line supervisor.
