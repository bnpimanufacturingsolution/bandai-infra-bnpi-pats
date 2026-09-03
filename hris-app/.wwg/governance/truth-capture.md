# Truth Capture

This file helps agents detect when new truth has been introduced.

## Existing Project Adoption Rule

For existing projects, code/docs/config are evidence of current reality, not automatically final truth.

Adoption should:
- capture observed reality
- infer initial truth
- mark uncertainty
- identify conflicts
- create open questions
- avoid changing source code unless requested

New truth may come from user prompts, uploaded assets, code investigation, bug reproduction, tests, logs, design decisions, naming decisions, architecture decisions, security/payment/auth decisions, UX standards, and operational discoveries.

## Required Result

- New truth detected: YES / NO
- Wiki updated: YES / NO / N/A
- Evidence status used: CONFIRMED / INFERRED / NEEDS_CONFIRMATION / CONFLICTING / STALE
- Notes:
  - Record evidence before promoting inferred truth to confirmed canonical truth.

Requirement evolution is allowed when documented and accepted. Project Truth must not be silently overwritten.
