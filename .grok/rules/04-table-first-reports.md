# Table-first reports and recommendations (always on)

Auto-loaded from `.grok/rules/`. Complements residual detail (`03-residual-count-detail.md`).

## Hard rule

When the operator asks for a **report**, **status**, **recommendation**, **what happened**, **progress**, or **is it done**:

1. Lead with **tables**, not long paragraphs.
2. Prefer **one idea per row** so a human can scan in seconds.
3. Do **not** only say “completed / fixed / done” without a table that shows:
   - what was wrong
   - what is true now
   - what still open
   - what they will see in the UI (or why not yet)

## Required shapes

### Status / progress
| Item | Before | Now | Care? | Next |
|---|---|---|---|---|

### Recommendation
| Pri | Action | Why | Owner (agent/you) |
|---|---|---|---|

### Residual / count
| Bucket | Count | What it is | Blocker | Next |
|---|---:|---|---|---|

### Done vs not done
| Claim | Status | Evidence | UI still shows |
|---|---|---|---|

## Forbidden

- Wall of prose with the answer buried at the end.
- “All green / completed” without naming what is still on DEV vs only in git.
- Recommendations as a bullet novel — use a priority table.

## Residual counts

Still obey `.grok/rules/03-residual-count-detail.md` (buckets + rows). Present that as tables first.
