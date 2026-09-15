---
type: principle-brief
status: active
mutability: high-friction
scope: product-ui
last_reviewed: 2026-08-17
---

# Shrink, Hide, Embody (SHE)

Operator doctrine for Project Truth admin/product UI. Source: John Maeda, *The Laws of Simplicity* — **SHE** = **Shrink**, **Hide**, **Embody**.

The operator remembered Shrink and Embody; the third word is **Hide**. When they say “Carpati UI”, “that clean design”, or “SHE”, use this brief.

## Why this exists

Dense Device Events / Sync / admin surfaces grow debug tiles, CUIDs, and always-open JSON. Operators need a small, trustworthy screen. Extra facts stay available without living on the first paint.

This is how to think. `DESIGN.md` is the visual system (Metropolis, Bandai red/orange, dividers). This principle decides **what earns a place** on the first screen.

## The three moves

| Move | Meaning | Do | Do not |
|---|---|---|---|
| **Shrink** | Make the surface feel smaller and lighter | Narrower modal, one list, fewer boxes, shorter labels | Four equal stat cards, nested cards, wide debug grids |
| **Hide** | Complexity exists, but not on first view | Closed accordion, progressive disclosure, details on demand | Always-open raw JSON, vendor action dumps, BNPI PATS CUIDs as tiles |
| **Embody** | What remains must feel complete and high quality | Person, event, time, result, terminal, device status | Hollow chrome; hiding so much that the operator cannot act |

## Icons and labels

Shrink does **not** mean strip icons or shorten buttons to icon-only.

- **Buttons:** icon **and** full label (`Device user`, `Employee record`). Never icon-only; never label-only when an icon exists in the set.
- **Fact rows:** small icon + label (Event, Time, Result, Source, Terminal, Address, Device status).
- **Disclosure:** accordion trigger has icon + **Raw payload**.
- Use the existing lucide set already imported on the page. Do not invent a second icon style.

If you only Shrink and Hide, the screen feels empty. If you only Embody, it becomes a warehouse. All three.

## When to pull this

- Device event details, Device user details, Sync logs, merge/review modals
- Any “make it clean” / “too much on screen” / “accordion that” request
- Adding a new field to an admin detail surface

## Worked example (2026-08-17)

Device event details:

1. **Shrink** — `max-w-lg`; one definition list; no four-card row; no Device payload grid.
2. **Hide** — Raw payload in a **closed** accordion.
3. **Embody** — Person, event, time, result, source, terminal, address, panel Device status.

Canonical surface: `bnpi-pats-app/app/routes/admin/devices/events.tsx` view-event modal.

## Agent checklist

Before shipping a detail UI:

- [ ] First screen answers who / what / when / result / where without scrolling a dump
- [ ] Debug, JSON, ids, and vendor internals are Hidden, not deleted
- [ ] Remaining labels are human (Check Out, Attendance tap), not only CUIDs
- [ ] Visual system still matches `DESIGN.md` (no new card language)
- [ ] Buttons and fact rows use icon **and** label (not icon-only, not stripped labels)

## Related

- Visual system: `DESIGN.md`
- Compact Grok reminder: `.grok/rules/06-shrink-hide-embody.md`
- Terminology: Shrink / Hide / Embody (SHE)
