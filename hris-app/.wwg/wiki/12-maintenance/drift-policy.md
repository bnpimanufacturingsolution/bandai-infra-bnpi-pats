# Drift Policy

Status: ACTIVE

## Drift Definition

Drift exists when code, docs, configuration, wiki truth, generated context, governance reports, or README/package identity disagree in a way that could mislead an agent or human maintainer.

## Current Known Drift

- README and package name still describe `react-app-template`.
- WWG product name is inferred as `hris-app`; final product name needs confirmation.
- Backend API repository is confirmed at `../hris-api`; backend API behavior remains canonical there, not in this frontend repository.
- Payroll, permission matrix, leave policy, retention policy, and Firebase credential handling remain unconfirmed.

## Drift Severity

- RED: Contradiction affects security, credentials, production deployment, payroll/billing, data deletion, legal/compliance notices, or employee privacy.
- ORANGE: Contradiction affects product identity, role names, domain rules, user workflows, or release/recommendation text.
- YELLOW: Context is incomplete, generic, stale, or inferred but still usable with caution.
- GREEN: Context and evidence align, and uncertainty is explicitly labeled.

## Required Response

- RED: stop and ask for explicit approval or owner decision.
- ORANGE: pause, document the conflict, and propose reconciliation before implementation.
- YELLOW: proceed only with labels and close-out notes.
- GREEN: proceed normally with verification appropriate to risk.

## Refresh Rule

After resolving drift in canonical wiki files, run `wwg refresh-context` and inspect the generated context sections before relying on them.

