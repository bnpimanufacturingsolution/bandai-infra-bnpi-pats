# Project Truth — Five-Device Full Credential Convergence

You are the owner-operator agent for:

`C:\Users\stari\bandai-infra`

Continue autonomously until the five verified Main Entrance panels converge for
user identity, fingerprints, faces, and supported cards, or until a row is
proved to require new physical enrollment rather than a software repair.

This is an implementation and physical-write job. Do not stop at a plan,
`Blocked:` label, code patch, capability probe, canary, queued job, or HTTP 200.

Follow `AGENTS.md`, WWG, `Agent-Meta-Prompt-Template.md`, and:

`docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`

## 1. Fixed physical scope

Include exactly:

| Device | ID | Physical target |
|---|---|---|
| Main Entrance Device B | `cmpxw13hx002h7zwso7dyedrn` | `10.184.37.20` |
| Main Entrance Device A | `cmrht5s2w00ei7zgsre8y3o5n` | `10.184.37.21` |
| Main Entrance Device F | `cmrim1zop05ik7zp4zgm2sm4k` | `10.184.37.25` |
| Main Entrance Device D | `cmripjwkw00ffl0013lfxcbxw` | `10.184.37.23` |
| Main Entrance Device E | `cmriu5ab102goi001x9o7nfct` | `10.184.37.24` |

Exclude:

- Main Entrance Device C `cmripjwbx00ewl001ihcke210`
- TEST A `cmrlgqsjv000oob01165tbd8n`
- TEST B `cmrv02vam004cnxekd57dsjh8`

Never broaden this scope from cached health, a tunnel response, or another
session.

## 2. Resume truth first

Before any new write, poll and reconcile current server job:

```text
jobId=40ba0751-5ea3-4ad9-a4fe-2247f2cefbd7
planId=9bbf6e49-3427-4703-8418-b29e383632d9
scopeHash=10e0cd26328ad0c8d86ed399b30d66a9eb5f40526dfc22beb4f25f6fc8a50b31
mode=credentials
modality=fingerprint
totalWrites=983
```

The job runs in the DEV K3s API inside the VM. SSH/browser is control and
monitoring only. Do not start another physical job, restart the API, or deploy
while it is processing. Preserve its durable snapshot, poll it to terminal,
then reread all five devices.

Treat old progress numbers in this prompt as stale. Read the live job.

## 3. Required multi-agent distribution

Use one root agent plus three subagents. All agents share evidence through
files and messages. The root agent is the only physical-write owner.

### Agent A — runtime and evidence watcher

Read-only:

- poll the active job and VM/K3s health;
- watch API, tunnel, SDK/listener, and GitOps logs;
- group failures by user, source, target, status, and named cause;
- verify the rollout guard keeps the same API pod while a job heartbeats;
- prepare pre/post matrices and browser evidence.

Agent A must never start a job, restart/deploy the API, or write a panel.

### Agent B — fingerprint and card convergence

Code/tests only until the root authorizes a canary:

- implement deterministic raw-template equality and superset resolution;
- implement credential-only card read/write;
- detect duplicate fingerprint/card owners before mutation;
- add physical reread and checksum/count proof;
- add device locks shared with every physical credential path;
- add regression tests for automatic and refused decisions.

### Agent C — face portability

Code/tests only until the root authorizes a canary:

- implement explicit face-custody classification;
- add source SDK template+picture export where supported;
- add capability-proven FaceDataRecord picture import where supported;
- add one serial face writer with physical reread/checksum proof;
- keep picture-only, template-only, HTML/XML, and count-only evidence distinct;
- add regression tests and a serial canary recipe.

### Root agent

- bootstrap WWG and publish Current-State Report;
- review all agent findings and diffs;
- integrate/test without overwriting unrelated work;
- freeze/review every physical-write scope and scope hash;
- start exactly one canary/job at a time;
- watch terminal state, retry safe subsets, reread all five;
- perform browser proof, truth sync, commit/push, and exact-SHA CI.

Agents may message each other, but no child agent may mutate runtime state.

## 4. Blocker taxonomy: recover first, block only with proof

A planner label is a diagnosis category, not permission to stop.

### `missing_raw_blob`

Required recovery sequence:

1. Read the exact source UserInfo and reported modality count.
2. Capture raw custody from the physical source:
   - fingerprint: every readable finger slot and checksum;
   - face with card: SDK template + picture;
   - face without card: validated face image plus target FaceDataRecord
     capability evidence.
3. Persist source, device ID, user ID, slot/kind, checksum, timestamp, and
   capture method without logging bytes/secrets.
4. Regenerate the plan.
5. If no device in the five-device fleet returns usable bytes after distinct
   source paths, classify `physical_reenrollment_required`; do not keep the
   vague `missing_raw_blob` label.

### `source_conflict`

Resolve from raw evidence:

- Identical checksum sets: sources are equivalent; select the deterministic
  canonical source and record all corroborating devices.
- Strict raw-template superset: select the proven superset when identity and
  slot ownership agree.
- Fingerprints in different unused slot IDs for the same verified person:
  build a reviewed union only when no target/device reports another owner.
- Same slot, different checksum; different face bytes; duplicate owner; or
  mismatched identity: this is a real biometric identity conflict. Do not
  guess. Emit `physical_identity_adjudication_required` naming both sources,
  checksums, and affected targets.

The UI must not say only “No source” when equality/superset checks were not run.

### `credential_only_card_not_supported`

Implement the missing path:

1. Read source card records for the exact person.
2. Prove card number ownership is unambiguous across the five.
3. Write only missing target card records through the supported SDK/ISAPI
   endpoint.
4. Reread the target card count/record.
5. Refuse duplicate card ownership or destructive replacement.

### `target_write_unsupported`

Replace the generic label with a capability-specific result:

- `sdk_face_template_writer`
- `fdlib_picture_import`
- `fingerprint_raw_writer`
- `card_record_writer`
- `device_firmware_unsupported`

Probe current capabilities per physical target. Implement a supported writer
before marking the row actionable. If firmware exposes no safe writer, save the
exact capability response and label `device_firmware_unsupported`.

## 5. Face architecture

Face custody must have one of these explicit kinds:

```text
sdk_template_and_picture
fdlib_picture
picture_only_not_writable
template_only_not_writable
missing
```

Do not treat a generic JPEG or legacy encrypted flag as a portable template.

Preferred writer:

1. `sdk_template_and_picture`
   - source export uses the existing SDK face+template read;
   - target uses `NET_DVR_SET_FACE_AND_TEMPLATE`;
   - sensitive payload travels through a mode-0600 file/spec or stdin, never a
     CLI argument or log.
2. `fdlib_picture`
   - require current target capability proving face-image import;
   - use the official FaceDataRecord contract;
   - host/provide the image only through a bounded authenticated internal
     mechanism reachable by the target;
   - delete temporary custody after verification.

Acquire device locks in sorted device-ID order. Face concurrency starts at one.
Do not inherit fingerprint worker concurrency until separate multi-target face
canaries prove it.

First canary candidate: vendor user `13`, Main B source to one current zero-face
target, but only after a fresh plan confirms the same evidence.

Face canary success requires:

- source and target identities match the reviewed vendor user;
- target `numOfFace` changes `0 → 1`;
- target face bytes can be reread through the same physical lane;
- source/target template+picture or image checksum matches;
- target fingerprint/card/user fields remain unchanged;
- fresh five-device plan removes exactly that face gap.

## 6. Durable job architecture

Closing the operator laptop must not stop a server job.

- Keep execution in VM-local DEV K3s.
- Use a durable queue/worker or resumable lease, not only an API-process
  promise.
- Add one organization-level physical-write lease and ordered per-device
  leases shared by merge, biometric recovery, card, fingerprint, and face.
- Store owner, scope hash, heartbeat, stage, source, target, attempts, result,
  and resume cursor.
- Keep API replicas at one until cross-process locks are proven.
- Defer GitOps rollouts while any fresh physical-device job heartbeat exists.
- After a pod restart, resume a safe pending operation or mark only that
  operation interrupted; never lose or replay verified successes.

## 7. Automatic decision contract

“Use recommended sources” may automatically select only when:

- device identity and vendor user ID agree;
- current full reads succeeded;
- raw custody is readable and checksum-classified;
- equality or strict-superset logic yields one safe source;
- no duplicate biometric/card owner exists;
- target capability and writer are proven.

Otherwise the job must name the exact physical action required. Do not present
recoverable software work as a permanent blocker, and do not convert real
identity ambiguity into an automatic guess.

## 8. UI truth

The live job UI must show:

- planned operations by modality;
- physical attempts;
- `Physically retained (reread)`;
- fingerprint retained;
- face retained;
- card retained;
- already matched;
- safe no-write / needs attention;
- current user/source/target/stage;
- backend heartbeat and server execution location;
- gap counts at plan start;
- gap counts after terminal five-device reread;
- delta by modality and by device;
- each unresolved row’s named software, firmware, or physical boundary.

Do not decrement a gap from an accepted HTTP/SDK response. Decrement only after
physical reread.

## 9. Execution sequence

1. Mandatory WWG bootstrap and Current-State Report.
2. Poll current fingerprint job to terminal.
3. Reread all five; save before/after fingerprint gaps and failures.
4. Run missing-custody recovery and checksum/equality classification.
5. Implement/test card path.
6. Implement/test face classifier and writers.
7. Run capability probes without mutation.
8. Review one serial card canary if needed.
9. Review one serial face canary.
10. Execute canary; reread/checksum; repair.
11. Expand by modality in bounded waves.
12. Fresh full five-device plan after every wave.
13. Retry only fresh safe failed subsets.
14. Exact browser journey, close/reopen/reload, API restart persistence proof.
15. Listener and Saved Events proof.
16. WWG truth sync.
17. Commit/push `develop`.
18. Exact-SHA GitHub Actions green.

## 10. Exit gate

- [ ] Current fingerprint job watched to terminal and reconciled.
- [ ] Exactly five devices remain the only physical scope.
- [ ] No Main C or TEST write occurred.
- [ ] Every fingerprint gap is closed or named
      `physical_identity_adjudication_required` /
      `physical_reenrollment_required` with raw evidence.
- [ ] Every face gap is closed or named
      `device_firmware_unsupported` /
      `physical_identity_adjudication_required` /
      `physical_reenrollment_required` with current capability/source proof.
- [ ] Credential-only card writes are implemented and reread-proven.
- [ ] Source equality/superset decisions are automatic and tested.
- [ ] Duplicate-owner conflicts never overwrite.
- [ ] Server jobs survive operator laptop disconnect.
- [ ] Jobs are protected from rollouts and overlapping physical writers.
- [ ] UI shows physical retained counts and post-reread gap deltas.
- [ ] Listener and Saved Events remain healthy.
- [ ] Focused API/frontend/C++ tests and browser proof pass.
- [ ] WWG/handoff documents the new truth and remaining physical boundaries.
- [ ] Changes are committed and pushed to `develop`.
- [ ] Exact-SHA CI is green.

`FULFILLED` is allowed only when every technically recoverable row has converged
and every remainder has current proof that software cannot safely create the
missing biometric/card truth. A generic planner blocker, queued job, code-only
writer, or HTTP 200 is not completion.

