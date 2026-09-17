# PATS Planning Desk

The **Planning Desk** is the primary workspace for production planners to author manufacturing projects, define parts lists, establish routing rules, and release production orders to the factory floor.

---

## 1. Planning Desk Capabilities

1. **Project Setup & Master Configuration**:
   - Create project records tied to specific product lines (e.g. "Gundam HG 1/144 Aerial").
   - Define production target volumes and lot quantities.
2. **Parts List Authoring**:
   - Upload or configure individual parts list entries.
   - For each part, specify required production stages (e.g., Molding -> Receiving -> Mask Spray -> Pad Printing -> Assembly -> Packaging).
   - Flag optional stages or quality inspection gates.
3. **Release to Execution**:
   - Freezes the Parts List configuration.
   - Generates production `Lot` and scannable `Batch` QR travel cards ready for floor injection molding.
4. **Live Floor Oversight**:
   - Real-time sankey diagram and WIP volume meters showing parts distributed across stages.
   - Immediate visibility into active **Routing Violations** requiring planner intervention.
