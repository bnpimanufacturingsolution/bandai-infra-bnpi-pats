# Shrink, Hide, Embody (always on for UI)

Operator design doctrine. Full brief: `.wwg/wiki/principles/shrink-hide-embody.md`

When changing admin/product UI (especially Device Events details, Sync logs, dense modals):

1. **Shrink** — smaller, lighter. Fewer boxes. No four-card metric grids.
2. **Hide** — keep power in closed disclosure (accordion default **closed**). Raw JSON, CUIDs, vendor dumps are not first-paint.
3. **Embody** — what stays must be enough to act: person, event, time, result, terminal, device status.

**Icons + labels:** Shrink does not strip chrome. Buttons get icon and full label. Fact rows get a small lucide icon plus the word. No icon-only. No label-only when the page already has the icon.

The forgotten third word is **Hide**. “Carpati UI” / “that clean design” = this.
