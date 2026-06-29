# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| flow | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| package | app/package-lock.json, app/package.json | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| target | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| truth | package/name, README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| architecture | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| autopilot | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| branch | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| cli | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| current | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| dockerfile | app/Dockerfile | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| documents | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| format | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| fresh | package/name | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| goal | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| hyper | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| flow | Flow | None detected | MEDIUM | README heading |
| package | Package | None detected | MEDIUM | app/package-lock.json, app/package.json |
| target | Target | None detected | MEDIUM | README heading |
| truth | Truth | None detected | MEDIUM | package/name, README heading |
| architecture | Architecture | None detected | MEDIUM | README heading |
| autopilot | Autopilot | None detected | MEDIUM | README heading |
| branch | Branch | None detected | MEDIUM | README heading |
| cli | Cli | None detected | MEDIUM | README heading |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| None confirmed | No direct conflict detected by lightweight audit | Confirm inferred terms before large renames |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
