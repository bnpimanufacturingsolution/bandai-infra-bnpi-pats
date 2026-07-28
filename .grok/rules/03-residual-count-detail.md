# Residual count detail (always on)

Auto-loaded from `.grok/rules/`. Complements root `AGENTS.md` anti-hallucination.

## Hard rule: never report a bare residual number

When the operator or UI shows a residual count (`decision=16`, `unique_fp=9`,
`face_ready=16`, `card ops=20`, `Needs review N`, gap burn deltas, etc.), agents
**must not** stop at the headline integer.

Every residual count answer **must** include:

1. **Exact decomposition** — bucket table (what the N is made of).
2. **Per-row or per-bucket samples** — vendor id / person / field / device A vs B values when N is small (≤30), else top buckets + 5–10 representative rows.
3. **Where the UI label came from** — plan field path (e.g. `plan.users[].conflicts`, `credentialWrites`, chip filter in `enroll.tsx`).
4. **Blocker class per bucket** — one of:
   - `code_defect` (planner/UI double-count, missing writer, fake 409, not-implemented path)
   - `export_gap` (count reported, raw custody not harvested — agent-owned)
   - `apply_path` (choices exist but job/overlay not applied — agent-owned)
   - `physical_boundary` (true dual-owner / empty panel after proven export — rare)
   - `optional_product` (e.g. card not required for site — do not treat as merge blocker)
5. **Next step per bucket** — concrete agent action, not “operator should review.”
6. **Honesty** — prefer “AI/code gate inflated residual” over “device blocked” when logs/code prove a software gate.

## Forbidden

- “decision 16, not burnable” with no row breakdown.
- Collapsing card count gaps into “Needs decision” without saying they are credential residual.
- Treating `missing_raw_blob` as physical enroll before proving export/capture was attempted.
- Recommendation text without naming the rule/source that generated it.

## Required shape (copy this skeleton)

```text
### Residual: <label> = <N>

| Bucket | Count | What it is | Blocker class | Next step |
|---|---:|---|---|---|

### Per-row (or sample)
| vendorId | person | fields | A vs B | Why in residual | Next |

### UI/API source
- Chip/filter: ...
- Plan path: ...
- Recommendation string built by: ...
```

## Merge device users — known mapping (update when code changes)

| UI | Usually means |
|---|---|
| **DECISION chip / Needs decision** | `users[].conflicts` length > 0 (profile fields after decision-fields fix; previously also card/fp/face counts) |
| **Needs review** row badge | Any non-ready issue row for that unique ID (conflicts **or** credential count gaps) |
| **FINGER / FACE chip = 0** | No unique residual gap people for that modality in plan (not “no enrollments”) |
| **Recommendation** | Rule-built in `enroll.tsx` from richest source / issue rows — not an LLM |
| **card missing_raw_blob** | Count present without stored cardNo — export/capture gap until proven empty CardInfo |

## Product default (card)

Card is **optional** for merge green unless the site uses badge swipe as primary.
Do not make card the default “must resolve decision.” Keep card under credential residual.

## Proof

When claiming a residual closed or explained, cite planId + evidence path under
`.runtime/` or `/tmp/` with the row table, or mark `NEEDS_CONFIRMATION`.
