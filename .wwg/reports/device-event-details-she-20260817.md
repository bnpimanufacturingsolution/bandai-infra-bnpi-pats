# Device event details — SHE cleanup (2026-08-17)

Status: `IMPLEMENTED_LOCAL` (this commit). Operator asked to push.

## Doctrine

**Shrink, Hide, Embody** (John Maeda SHE). Forgotten third word: **Hide**.

| Path | Role |
|---|---|
| `.wwg/wiki/principles/shrink-hide-embody.md` | Full principle |
| `.grok/rules/06-shrink-hide-embody.md` | Always-on for UI |
| `DESIGN.md` | Visual + icon/label |
| Terminology | **Shrink, Hide, Embody (SHE)** |

## Modal now

| SHE | What shipped |
|---|---|
| Shrink | `max-w-lg`; one definition list; Device payload grid removed |
| Hide | Raw payload accordion, **closed** by default |
| Embody | Person, event, time, result, source, terminal, address, device status |
| Icons + labels | Buttons: icon + **Device user** / **Employee record**. Rows: lucide + word. Accordion: Braces + **Raw payload** |

Canonical: `bnpi-pats-app/app/routes/admin/devices/events.tsx` `action=view-event`.

## Proof

- Playwright: accordion `data-state=closed`, JSON hidden, click opens (`.runtime/device-event-dup-20260817/accordion-proof/`).
- Contract test asserts closed accordion (`type="single" collapsible`, no `defaultValue="raw-payload"`).

## Do not regress

- Do not restore the Device payload CUID/vendor tile grid.
- Do not open Raw payload by default.
- Do not strip icons when cleaning a screen.
