# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth,
active Workspace tasks, or commitments until reviewed and promoted.

## Proposed

### Review and retire stopped HRIS Cloud SQL instances after backup

- Status: Proposed
- Evidence: 2026-07-02 GCP cost cleanup found `hris-api-dev-pg`, `hris-api-uat-pg`, and `hris-api-prod-pg` stopped in `hris-492904`, each configured with 10 GB PD SSD storage.
- Recommendation: Confirm whether these databases contain needed HRIS data, export/back up any required state, then delete obsolete instances to remove retained Cloud SQL storage cost.
- Boundary: Do not delete databases without confirmed backup/retention decision.
