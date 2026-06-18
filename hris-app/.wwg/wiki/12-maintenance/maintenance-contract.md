# Maintenance Contract

Status: ACTIVE

## Contract

Agents must keep canonical wiki truth, generated workspace context, governance recommendations, and current task state aligned.

## Required Flow

1. Read the WWG files in `AGENTS.md` order before meaningful changes.
2. Classify the task mode and risk level.
3. Gather source evidence before changing truth.
4. Update canonical wiki files when product, domain, architecture, UX, governance, or operational truth changes.
5. Keep inferred, confirmed, stale, conflicting, and needs-confirmation labels explicit.
6. Run `wwg refresh-context` after wiki changes that affect agent orientation.
7. Run `wwg brief` after major context changes.
8. Run `wwg validate` and check `wwg status` before close-out when governance readiness matters.

## High-Risk Handling

Pause for approval before production deployment, credential changes, destructive operations, migrations, auth/authorization weakening, payroll/billing changes, employee-data deletion, or public legal/compliance changes.

## Reporting

Close-out reports must state:

- What changed.
- What was validated.
- Which truth/context/governance surfaces were updated.
- What remains inferred or unconfirmed.
- Whether recommendations were added.

