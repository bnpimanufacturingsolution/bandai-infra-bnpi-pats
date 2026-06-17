# WWG Validate Report

## Summary

Overall status: FAIL

critical: 0, high: 21, medium: 0, low: 19, info: 11

## Command

`wwg validate --target C:\Users\uzaro\Documents\Projects\BANDA HRIS\hris-app`

## Repository Type Detected

wwg-native-project

## Checks Run

- PASS JSON schemas parse and compile - 1 finding(s)
- PASS YAML manifests parse - 1 finding(s)
- PASS wwg.project.yaml registry validates when present - 1 finding(s)
- FAIL Skill Registry and Skill Manifest validate when present - 40 finding(s)
- PASS Profile skill recommendation metadata validates when present - 1 finding(s)
- PASS Required WWG directories exist - 1 finding(s)
- FAIL WWG operating loop files are present and actionable - 1 finding(s)
- PASS Principles folder and Principle Brief frontmatter are valid - 1 finding(s)
- PASS UI/UX principle pack expectations are profile-aware - 0 finding(s)
- PASS Generated marker pairs are balanced - 1 finding(s)
- PASS Markdown files are readable and non-empty - 1 finding(s)
- PASS Report policy indexes and ignore rules are advisory-clean - 1 finding(s)
- PASS Markdown contract quality report generated - 1 finding(s)

## Findings

- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. business.business-brief has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. business.decision-memo has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. business.sop-writing has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. creative.pitch-deck has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. creative.storytelling has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. public.public-discovery-maintenance has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. public.public-surface-update has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.bug-fix has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.feature-implementation has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.runtime-infrastructure has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.web.component-architecture has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.web.react-patterns has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. software.web.rendering-strategy has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.change-classifier has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.context-skill-maintenance has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.drift-detector has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.regression-guardrail-maintenance has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.task-router has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate uses a non-WWG candidate status. core.truth-loop has status (missing). Recommendation: Use candidate, recommended, eligible, restricted, disabled, reference-only, or candidate-only.
- HIGH runtime-skill-candidates-schema-invalid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate contract does not match schemas/runtime-skill-candidates.schema.json. data must have required property 'generatedAt'
data must have required property 'workspacePath'
data must have required property 'source'
data must have required property 'candidateOwner'
data must have required property 'artifactType'
data must have required property 'warnings'
data must have required property 'auditTrail'
data/candidates/0 must have required property 'skillId'
data/candidates/0 must have required property 'skillName'
data/candidates/0 must have required property 'status'
data/candidates/0 must have required property 'description'
data/candidates/0 must have required property 'tags'
data/candidates/0 must have required property 'recommendedUses'
data/candidates/0 must have required property 'restrictions'
data/candidates/0 must have required property 'requiredPermissions'
data/candidates/0 must have required property 'evidenceRequirements'
data/candidates/0 must have required property 'sourceFiles'
data/candidates/0 must have required property 'notes'
data/candidates/1 must have required property 'skillId'
data/candidates/1 must have required property 'skillName'
data/candidates/1 must have required property 'status'
data/candidates/1 must have required property 'description'
data/candidates/1 must have required property 'tags'
data/candidates/1 must have required property 'recommendedUses'
data/candidates/1 must have required property 'restrictions'
data/candidates/1 must have required property 'requiredPermissions'
data/candidates/1 must have required property 'evidenceRequirements'
data/candidates/1 must have required property 'sourceFiles'
data/candidates/1 must have required property 'notes'
data/candidates/2 must have required property 'skillId'
data/candidates/2 must have required property 'skillName'
data/candidates/2 must have required property 'status'
data/candidates/2 must have required property 'description'
data/candidates/2 must have required property 'tags'
data/candidates/2 must have required property 'recommendedUses'
data/candidates/2 must have required property 'restrictions'
data/candidates/2 must have required property 'requiredPermissions'
data/candidates/2 must have required property 'evidenceRequirements'
data/candidates/2 must have required property 'sourceFiles'
data/candidates/2 must have required property 'notes'
data/candidates/3 must have required property 'skillId'
data/candidates/3 must have required property 'skillName'
data/candidates/3 must have required property 'status'
data/candidates/3 must have required property 'description'
data/candidates/3 must have required property 'tags'
data/candidates/3 must have required property 'recommendedUses'
data/candidates/3 must have required property 'restrictions'
data/candidates/3 must have required property 'requiredPermissions'
data/candidates/3 must have required property 'evidenceRequirements'
data/candidates/3 must have required property 'sourceFiles'
data/candidates/3 must have required property 'notes'
data/candidates/4 must have required property 'skillId'
data/candidates/4 must have required property 'skillName'
data/candidates/4 must have required property 'status'
data/candidates/4 must have required property 'description'
data/candidates/4 must have required property 'tags'
data/candidates/4 must have required property 'recommendedUses'
data/candidates/4 must have required property 'restrictions'
data/candidates/4 must have required property 'requiredPermissions'
data/candidates/4 must have required property 'evidenceRequirements'
data/candidates/4 must have required property 'sourceFiles'
data/candidates/4 must have required property 'notes'
data/candidates/5 must have required property 'skillId'
data/candidates/5 must have required property 'skillName'
data/candidates/5 must have required property 'status'
data/candidates/5 must have required property 'description'
data/candidates/5 must have required property 'tags'
data/candidates/5 must have required property 'recommendedUses'
data/candidates/5 must have required property 'restrictions'
data/candidates/5 must have required property 'requiredPermissions'
data/candidates/5 must have required property 'evidenceRequirements'
data/candidates/5 must have required property 'sourceFiles'
data/candidates/5 must have required property 'notes'
data/candidates/6 must have required property 'skillId'
data/candidates/6 must have required property 'skillName'
data/candidates/6 must have required property 'status'
data/candidates/6 must have required property 'description'
data/candidates/6 must have required property 'tags'
data/candidates/6 must have required property 'recommendedUses'
data/candidates/6 must have required property 'restrictions'
data/candidates/6 must have required property 'requiredPermissions'
data/candidates/6 must have required property 'evidenceRequirements'
data/candidates/6 must have required property 'sourceFiles'
data/candidates/6 must have required property 'notes'
data/candidates/7 must have required property 'skillId'
data/candidates/7 must have required property 'skillName'
data/candidates/7 must have required property 'status'
data/candidates/7 must have required property 'description'
data/candidates/7 must have required property 'tags'
data/candidates/7 must have required property 'recommendedUses'
data/candidates/7 must have required property 'restrictions'
data/candidates/7 must have required property 'requiredPermissions'
data/candidates/7 must have required property 'evidenceRequirements'
data/candidates/7 must have required property 'sourceFiles'
data/candidates/7 must have required property 'notes'
data/candidates/8 must have required property 'skillId'
data/candidates/8 must have required property 'skillName'
data/candidates/8 must have required property 'status'
data/candidates/8 must have required property 'description'
data/candidates/8 must have required property 'tags'
data/candidates/8 must have required property 'recommendedUses'
data/candidates/8 must have required property 'restrictions'
data/candidates/8 must have required property 'requiredPermissions'
data/candidates/8 must have required property 'evidenceRequirements'
data/candidates/8 must have required property 'sourceFiles'
data/candidates/8 must have required property 'notes'
data/candidates/9 must have required property 'skillId'
data/candidates/9 must have required property 'skillName'
data/candidates/9 must have required property 'status'
data/candidates/9 must have required property 'description'
data/candidates/9 must have required property 'tags'
data/candidates/9 must have required property 'recommendedUses'
data/candidates/9 must have required property 'restrictions'
data/candidates/9 must have required property 'requiredPermissions'
data/candidates/9 must have required property 'evidenceRequirements'
data/candidates/9 must have required property 'sourceFiles'
data/candidates/9 must have required property 'notes'
data/candidates/10 must have required property 'skillId'
data/candidates/10 must have required property 'skillName'
data/candidates/10 must have required property 'status'
data/candidates/10 must have required property 'description'
data/candidates/10 must have required property 'tags'
data/candidates/10 must have required property 'recommendedUses'
data/candidates/10 must have required property 'restrictions'
data/candidates/10 must have required property 'requiredPermissions'
data/candidates/10 must have required property 'evidenceRequirements'
data/candidates/10 must have required property 'sourceFiles'
data/candidates/10 must have required property 'notes'
data/candidates/11 must have required property 'skillId'
data/candidates/11 must have required property 'skillName'
data/candidates/11 must have required property 'status'
data/candidates/11 must have required property 'description'
data/candidates/11 must have required property 'tags'
data/candidates/11 must have required property 'recommendedUses'
data/candidates/11 must have required property 'restrictions'
data/candidates/11 must have required property 'requiredPermissions'
data/candidates/11 must have required property 'evidenceRequirements'
data/candidates/11 must have required property 'sourceFiles'
data/candidates/11 must have required property 'notes'
data/candidates/12 must have required property 'skillId'
data/candidates/12 must have required property 'skillName'
data/candidates/12 must have required property 'status'
data/candidates/12 must have required property 'description'
data/candidates/12 must have required property 'tags'
data/candidates/12 must have required property 'recommendedUses'
data/candidates/12 must have required property 'restrictions'
data/candidates/12 must have required property 'requiredPermissions'
data/candidates/12 must have required property 'evidenceRequirements'
data/candidates/12 must have required property 'sourceFiles'
data/candidates/12 must have required property 'notes'
data/candidates/13 must have required property 'skillId'
data/candidates/13 must have required property 'skillName'
data/candidates/13 must have required property 'status'
data/candidates/13 must have required property 'description'
data/candidates/13 must have required property 'tags'
data/candidates/13 must have required property 'recommendedUses'
data/candidates/13 must have required property 'restrictions'
data/candidates/13 must have required property 'requiredPermissions'
data/candidates/13 must have required property 'evidenceRequirements'
data/candidates/13 must have required property 'sourceFiles'
data/candidates/13 must have required property 'notes'
data/candidates/14 must have required property 'skillId'
data/candidates/14 must have required property 'skillName'
data/candidates/14 must have required property 'status'
data/candidates/14 must have required property 'description'
data/candidates/14 must have required property 'tags'
data/candidates/14 must have required property 'recommendedUses'
data/candidates/14 must have required property 'restrictions'
data/candidates/14 must have required property 'requiredPermissions'
data/candidates/14 must have required property 'evidenceRequirements'
data/candidates/14 must have required property 'sourceFiles'
data/candidates/14 must have required property 'notes'
data/candidates/15 must have required property 'skillId'
data/candidates/15 must have required property 'skillName'
data/candidates/15 must have required property 'status'
data/candidates/15 must have required property 'description'
data/candidates/15 must have required property 'tags'
data/candidates/15 must have required property 'recommendedUses'
data/candidates/15 must have required property 'restrictions'
data/candidates/15 must have required property 'requiredPermissions'
data/candidates/15 must have required property 'evidenceRequirements'
data/candidates/15 must have required property 'sourceFiles'
data/candidates/15 must have required property 'notes'
data/candidates/16 must have required property 'skillId'
data/candidates/16 must have required property 'skillName'
data/candidates/16 must have required property 'status'
data/candidates/16 must have required property 'description'
data/candidates/16 must have required property 'tags'
data/candidates/16 must have required property 'recommendedUses'
data/candidates/16 must have required property 'restrictions'
data/candidates/16 must have required property 'requiredPermissions'
data/candidates/16 must have required property 'evidenceRequirements'
data/candidates/16 must have required property 'sourceFiles'
data/candidates/16 must have required property 'notes'
data/candidates/17 must have required property 'skillId'
data/candidates/17 must have required property 'skillName'
data/candidates/17 must have required property 'status'
data/candidates/17 must have required property 'description'
data/candidates/17 must have required property 'tags'
data/candidates/17 must have required property 'recommendedUses'
data/candidates/17 must have required property 'restrictions'
data/candidates/17 must have required property 'requiredPermissions'
data/candidates/17 must have required property 'evidenceRequirements'
data/candidates/17 must have required property 'sourceFiles'
data/candidates/17 must have required property 'notes'
data/candidates/18 must have required property 'skillId'
data/candidates/18 must have required property 'skillName'
data/candidates/18 must have required property 'status'
data/candidates/18 must have required property 'description'
data/candidates/18 must have required property 'tags'
data/candidates/18 must have required property 'recommendedUses'
data/candidates/18 must have required property 'restrictions'
data/candidates/18 must have required property 'requiredPermissions'
data/candidates/18 must have required property 'evidenceRequirements'
data/candidates/18 must have required property 'sourceFiles'
data/candidates/18 must have required property 'notes' Recommendation: Update the candidate artifact to remain candidate-only and Vorter-owned.
- HIGH wwg-report-truth-sync-fields-missing (reports/context-skill-quality.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. business.business-brief is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. business.decision-memo is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. business.sop-writing is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. creative.pitch-deck is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. creative.storytelling is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. public.public-discovery-maintenance is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. public.public-surface-update is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.bug-fix is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.feature-implementation is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.runtime-infrastructure is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.web.component-architecture is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.web.react-patterns is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. software.web.rendering-strategy is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.change-classifier is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.context-skill-maintenance is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.drift-detector is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.regression-guardrail-maintenance is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.task-router is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry. core.truth-loop is not present in the loaded Skill Registry. This remains warning-level while the record is candidate-only: WWG did not activate the skill, and Vorter owns any future runtime activation decision. Recommendation: Keep unknown IDs candidate-only unless they are intentionally added to the local registry; fail only if an unknown candidate claims active, approved, loaded, routed, or executed status.
- INFO ambiguous-report-classification: evidence=confirmed risk=low Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO generated-markers-balanced: Generated marker pairs are balanced where present.
- INFO json-schemas-parse: Parsed and compiled 0 JSON schema file(s).
- INFO markdown-contract-quality-report-generated (reports/context-skill-quality.md): evidence=confirmed Markdown contract quality report completed with 133 warning(s) and 89 suggestion(s). Advisory Markdown quality findings are recorded in the quality report and do not change validate status by default. Recommendation: Review `.wwg/reports/context-skill-quality.md` during focused documentation remediation.
- INFO markdown-readable: Markdown files are non-empty and readable.
- INFO profile-skill-recommendations-valid: evidence=confirmed Validated skill recommendation metadata for 0 profile file(s). Recommendation: Keep profile skill recommendations advisory until manifest generation and runtime activation are implemented.
- INFO project-registry-valid (.wwg/config/wwg.project.yaml): WWG project registry parses and matches the registry schema.
- INFO required-directories-present: Required directories exist for wwg-native-project.
- INFO skill-manifest-valid (.wwg/config/skill-manifest.yaml): evidence=confirmed Skill Manifest validates against schemas/skill-manifest.schema.json. Recommendation: Preferred future canonical Skill Manifest path is .wwg/config/skill-manifest.yaml.
- INFO wwg-principles-valid: Principles folder and lightweight Principle Brief checks passed.
- INFO yaml-files-parse: Parsed 2 YAML file(s).

## Findings by User Action

### Blocking, Must Fix
These findings can invalidate core WWG readiness and need direct repair.
Next: Fix these findings directly, then rerun `wwg validate`.
- HIGH runtime-skill-candidates-schema-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate contract does not match schemas/runtime-skill-candidates.schema.json.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.
- HIGH runtime-skill-candidate-status-invalid (.wwg/reports/runtime-skill-candidates.json): Runtime Skill Candidate uses a non-WWG candidate status.

### Review Required
These findings touch project meaning, governance, principles, or selected profile expectations.
Next command: `wwg audit --upgrade-candidates`
- HIGH wwg-report-truth-sync-fields-missing (reports/context-skill-quality.md): Report claims readiness or completion without required WWG truth synchronization fields.

### Candidate-only Warning
These warnings describe candidate handoff metadata only. WWG did not activate runtime skills.
Next: No action required unless adopting runtime skills through Vorter.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): Candidate-only Runtime Skill Candidate id is unknown to the loaded Skill Registry.

### Info
Passing or informational validation evidence.
Next: No command required.
- INFO json-schemas-parse: Parsed and compiled 0 JSON schema file(s).
- INFO yaml-files-parse: Parsed 2 YAML file(s).
- INFO project-registry-valid (.wwg/config/wwg.project.yaml): WWG project registry parses and matches the registry schema.
- INFO skill-manifest-valid (.wwg/config/skill-manifest.yaml): Skill Manifest validates against schemas/skill-manifest.schema.json.
- INFO profile-skill-recommendations-valid: Validated skill recommendation metadata for 0 profile file(s).
- INFO required-directories-present: Required directories exist for wwg-native-project.
- INFO wwg-principles-valid: Principles folder and lightweight Principle Brief checks passed.
- INFO generated-markers-balanced: Generated marker pairs are balanced where present.
- INFO markdown-readable: Markdown files are non-empty and readable.
- INFO ambiguous-report-classification: Some report-like files need human classification.
- INFO markdown-contract-quality-report-generated (reports/context-skill-quality.md): Markdown contract quality report completed with 133 warning(s) and 89 suggestion(s).

## Validation Results

PASS: 11
WARN: 0
FAIL: 2

## Principle Review

- Principles reviewed:
  - Principles folder and Principle Brief frontmatter checks.
- Principles updated:
  - None by validation.
- Candidate principle changes:
  - None by validation.
- Principle drift concerns:
  - Review principle findings above.

## WWG Truth Synchronization

- Task mode: validation
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: HIGH
- Canonical files changed:
  - None by validation.
- Implementation discoveries synced:
  - None.
- Remaining stale context:
  - Review findings above.

## Recommended Next Steps

- Blocking, Must Fix: 20
- Review Required: 1 -> wwg audit --upgrade-candidates
- Candidate-only Warning: 19
