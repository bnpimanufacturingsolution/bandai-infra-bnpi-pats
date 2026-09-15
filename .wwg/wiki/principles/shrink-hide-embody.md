---
type: principle-brief
status: active
mutability: high-friction
scope: product-ui
last_reviewed: 2026-09-15
---

# Shrink, Hide, Embody (SHE)

Operator doctrine for Project Truth admin/product UI. Source: John Maeda, *The Laws of Simplicity* — **SHE** = **Shrink**, **Hide**, **Embody**.

The operator remembered Shrink and Embody; the third word is **Hide**. When they say “Carpati UI”, “that clean design”, or “SHE”, use this brief.

## Why this exists

Dense admin surfaces grow debug tiles, CUIDs, and always-open JSON. Operators need a small, trustworthy screen. Extra facts stay available without living on the first paint.

This is how to think. `DESIGN.md` is the visual system (Metropolis, Bandai red/orange, dividers). This principle decides **what earns a place** on the first screen.

## The three moves

| Move | Meaning | Do | Do not |
|---|---|---|---|
| **Shrink** | Make the surface feel smaller and lighter | Narrower modal, one list, fewer boxes, shorter labels | Four equal stat cards, nested cards, wide debug grids |
| **Hide** | Complexity exists, but not on first view | Closed accordion, progressive disclosure, details on demand | Always-open raw JSON, vendor action dumps, BNPI PATS CUIDs as tiles |
| **Embody** | What remains must feel complete and high quality | Person, record, time, result, status | Hollow chrome; hiding so much that the operator cannot act |

## Icons and labels

Shrink does **not** mean strip icons or shorten buttons to icon-only.

- **Buttons:** icon **and** full label (`Employee record`). Never icon-only; never label-only when an icon exists in the set.
- **Fact rows:** small icon + label (Name, Time, Result, Source, Status).
- **Disclosure:** accordion trigger has icon + **Raw payload**.
- Use the existing lucide set already imported on the page. Do not invent a second icon style.

If you only Shrink and Hide, the screen feels empty. If you only Embody, it becomes a warehouse. All three.

## When to pull this

- Admin detail modals and record panels (employee, timesheet, payroll)
- Any “make it clean” / “too much on screen” / “accordion that” request
- Adding a new field to an admin detail surface

## Worked example (2026-08-17, historical — device lane retired 2026-09-15)

Retired Device event details modal:

1. **Shrink** — `max-w-lg`; one definition list; no four-card row; no payload grid.
2. **Hide** — Raw payload in a **closed** accordion.
3. **Embody** — Person, event, time, result, source.

Apply the same three moves to current admin detail modals.

## Agent checklist

Before shipping a detail UI:

- [ ] First screen answers who / what / when / result / where without scrolling a dump
- [ ] Debug, JSON, ids, and vendor internals are Hidden, not deleted
- [ ] Remaining labels are human (employee name, approval status), not only CUIDs
- [ ] Visual system still matches `DESIGN.md` (no new card language)
- [ ] Buttons and fact rows use icon **and** label (not icon-only, not stripped labels)

## Related

- Visual system: `DESIGN.md`
- Compact Grok reminder: `.grok/rules/06-shrink-hide-embody.md`
- Terminology: Shrink / Hide / Embody (SHE)
