# WWG Agent Handoff

## 2026-07-22 - Merge listener truth and TEST A/B boundary

- Status: `PARTIALLY_FULFILLED_WITH_REAL_DEVICE_BOUNDARY`.
- Task mode: mixed live runtime recovery, listener-status UX hardening, and merge-plan evidence.
- Runtime truth: API and frontend were both recovered locally; admin login works; DEV DB forward `127.0.0.1:55435` is open; `.20/.21/.22/.23` tunnels remained active; Cloudflare was not disabled.
- Merge job truth: original job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is not pollable after API restart. Completion was not invented.
- Valid current reread for the four production LAN devices `.20/.21/.22/.23`: `unionUsers=698`, `sourceRows=2759`, `dedupedDeviceRecords=2759`, `conflicts=862`, `missing=33`, `missingHrisLinks=47`, `plannedWrites=2094`, `errorCount=0`.
- Current six-device reread remains invalid for final counts: after adding host-local forwards for TEST A/B, the plan still had TEST A and TEST B `fetch failed` plus one Main Entrance Device A `Unauthorized` sample. Its counts are diagnostic only.
- TEST A/B boundary: Windows and VM physical probes cannot reliably reach TEST A/B on normal HTTP/SDK ports; TEST A clean SDK retry still gives login `lastError=9`. TEST B isolated employee `9` peer copy succeeded earlier with two fingerprint templates and no face bytes, but TEST B cannot be treated as generally six-device-reread healthy.
- UI repair: listener modal now waits `15s` for VM status and separates HRIS post failures from SDK login failures. Browser proof shows `0 receiving / 1 armed / 1 login failed`, Main B armed, TEST A login failed, and `HRIS callback post failed after reading 10.184.37.20` instead of false Main B SDK-login blame.
- Evidence:
  - Browser listener modal: `.runtime/merge-users-final-run-20260722-042955/browser-listener-modal-live-20260722-145705/`.
  - Valid four-device plan: `.runtime/merge-users-final-run-20260722-042955/fresh-four-device-plan-current-20260722-144103/`.
  - Invalid six-device diagnostic plan: `.runtime/merge-users-final-run-20260722-042955/fresh-six-device-plan-after-host-forward-20260722-143756/`.
  - TEST A/B host-local forward proof: `.runtime/merge-users-final-run-20260722-042955/testab-host-local-forward-20260722-143736/`.
- Validation: API typecheck passed; Hikvision biometric sync contract passed (`16` passing); Device Users UI contract passed; targeted ESLint for `events.tsx` and `enroll.tsx` exited `0` with existing warnings only; `git diff --check` had CRLF warnings only.
- Boundary: do not claim all `852` unique IDs or the current six-device diagnostic unique IDs are fully synced; do not claim fingerprint/face bytes are fixed from counts; do not start a blind six-device retry until TEST A/B HTTP reread and TEST A SDK login are repaired or explicitly excluded.
- Recommendation capture: No new recommendations were identified.

## 2026-07-22 - Main Entrance A-F (.20-.25) six-device tunnel repair

- Status: `COMPLETE_LOCAL_AND_K3S_DEV_HEALTH_PROOF`.
- Task mode: live runtime reachability + tunnel bootstrap repair (no product code change required).
- Root cause: K3s DEV Device rows for Main Entrance A-F already pointed at `10.184.37.20-.25` with credentials; VM TCP `80/443/8000` was OK for all six. Windows host cannot reach those IPs directly. Local health only saw four devices because the live SSH tunnel and `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` stopped at `.23` (ports for `.24/.25` were closed).
- Repair: restarted `scripts/start-hikvision-remote-device-tunnel.ps1` with DeviceIps `.20-.25`; all 18 local forwards TcpOk; env map updated in `hris-api/.env.development.local`.
- Local API health (`localhost:3001`): A-F all `online` via `env_tunnel_map` (E=.24, F=.25 included).
- K3s DEV LAN API (`10.184.37.19:3101`): A-F all `online` via `resolved_runtime_endpoint`.
- psql (K3s DEV): A=`10.184.37.21`, B=`.20`, C=`.22`, D=`.23`, E=`.24`, F=`.25`; all have access username+password keys.
- Boundary: TEST A/B (`192.168.254.109/.110`) remain a separate reverse-bridge lane; not part of this six-device tunnel map. Cloudflare tunnel left active.
- Evidence root: `.runtime/device-a-f-reach-20260722-143906/`.
- Bootstrap: `npm run dev` ensure path already defaults to six IPs in `ensure-hikvision-remote-device-tunnel.cjs`; re-run tunnel script if a stale four-device tunnel is still bound.
## 2026-07-22 - Merge Users Overnight Loop Terminal Evidence

- Status: `PARTIALLY_FULFILLED_WITH_REAL_DEVICE_BOUNDARY`.
- Task mode: mixed live runtime ownership, backend merge-job repair, admin UX hardening, and evidence handoff.
- Runtime truth: local API is healthy after restart, admin login works, DEV DB forward remains `127.0.0.1:55435`, and the `.20/.21/.22/.23` Hikvision tunnels remain active. Cloudflare was not disabled. The optional TEST A/B listener/bridge helper still reports a recoverable 502/SSH issue, but API/DB/four-device tunnels are healthy.
- Job truth: fast retry job `8498a8cf-81a8-42b1-b836-6f77ca9323ca` reached `processedWrites=2813/2813` before reread/finalize failed with `Cannot read properties of undefined (reading 'counts')`. The last honest processing poll showed `successfulWrites=366` and `failedWrites=2447`; the terminal failed payload collapsed failed writes and must not be used as copy-row truth.
- Fresh backend truth after restart: the six-device merge plan returned `852` unique IDs, `3715` source/device records, `needsDecisionIds=0`, `4260` all planned writes, `1235` conflicts, `1397` missing, and `51` missing HRIS links. This proves the original selected Needs-decision scope was consumed/resolved, but it does not prove all six devices are synced.
- Fresh four-device truth for the VM-reachable `.20/.21/.22/.23` devices returned `687` unique IDs, `2748` source/device records, `needsDecisionIds=0`, `2061` all planned writes, `952` conflicts, `0` missing, and `47` missing HRIS links. This narrows the remaining device-record missing issue to TEST A/B participation in the six-device scope, but the four-device conflicts/link gaps still need reviewed handling.
- Backend repaired: reread finalization now accepts the actual plan shape instead of crashing on `counts`; failed jobs preserve latest processed/success/failed counts; progress/list responses expose grouped copy failure summaries; VM manual-copy SDK preflight/spec generation bypasses the Windows-local tunnel map and uses physical saved endpoints for VM-side copy.
- Failure pattern: capped progress evidence deduped `213` copy-error events, led by D to C (`35`), D to A (`33`), and D to TEST B (`31`). Root samples included timeout circuit skips and `VM cannot reach 127.0.0.1:18003 before SDK login`, which the resolver patch addresses for `.20-.23`.
- VM SDK reachability proof: `ssh project-truth-hris` showed `.20/.21/.22/.23:8000` OK, while TEST A/B `192.168.254.109/.110:8000` failed. A blind six-device retry is not safe.
- UI proof: Playwright with a stubbed failed job response verified the modal shows locked scope, `569` selected unique IDs, `2,845` peer copy attempts, grouped copy failures by path, no editable review controls, and no `Preview only` wording while a job exists.
- Validation: API typecheck passed; `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` passed (`16` passing); Device Users UI contract passed; targeted `enroll.tsx` ESLint had `0` errors with existing warnings only.
- Evidence root: `.runtime/merge-users-final-run-20260722-042955/`.
- Important boundary: do not claim all `852` unique IDs are fully synced; do not claim fingerprint/face bytes are fixed from counts; do not retry the six-device job blindly until TEST A/B VM SDK reachability or a scoped non-TEST remaining plan is explicitly reviewed.

## 2026-07-22 - Merge users unique-row frontend drift repair

- Status: `COMPLETE_LOCAL_API_AND_STATIC_UI_PROOF`.
- Task mode: Focused admin UX truth repair.
- User symptom repaired:
  - In Merge device users, clicking `Needs decision` showed repeated selectable rows for the same vendor user ID because the frontend rendered raw issue rows. This contradicted the Project Truth requirement that selectable merge rows are one unique device/vendor person ID.
- Implementation:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now renders `mergeList=issues` from `sdkMergeReviewRows`, which are unique-ID rows, while resolving filter/device scope through the underlying issue rows.
  - Filter chips and per-device impact counts use unique user-key counts (`sdkMergeUniqueIssueCount`, `sdkMergeUniqueIssueDeviceCount`) instead of `sdkMergeRows.length`.
  - The raw conflict/credential issue rows remain available through the per-row `Review sources` drilldown.
  - The stale/dead `sdkMergePreviewOnly` gate was replaced by a `Review selected merge` confirmation modal. The first modal is planning/review; the second modal is the final real-write confirmation.
- API proof:
  - Evidence root: `.runtime/merge-users-review-confirm-20260722-032110/`.
  - Non-mutating admin merge plan returned 4 selected Hikvision devices, 687 unique IDs, 2,748 device ID records, 0 duplicate unique keys, 0 blocking read errors, and 2,061 potential device writes.
- Validation:
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-merge.helper.spec.ts`: 12 passing.
  - `npx eslint app/routes/admin/devices/enroll.tsx --max-warnings=999`: 0 errors, existing warnings only.
  - `git diff --check -- hris-app/app/routes/admin/devices/enroll.tsx hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts`: no whitespace errors; CRLF warnings only.
  - App-wide frontend typecheck still fails on unrelated existing drift across guide/calendar/examples/leave/TimesheetsTab and other non-device files.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center Needs link click rows

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Focused admin UX regression repair.
- User symptom repaired:
  - In Sync Center > Device Users, clicking the `Needs link` count for Device C opened an empty table even though the metric showed 46 rows requiring employee links.
- Implementation:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now sets `deviceUserStatus=UNMATCHED` when the `open` / `Needs link` view is selected from the metric cards.
  - The source-scoped Device Users optimization is limited to `shown` and `source` views, so `open` and `linked` views use saved HRIS `DeviceUser` truth.
  - `hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts` guards the routing/filter contract.
- API proof:
  - Evidence root: `.runtime/sync-center-needs-link-click-20260721-133728/`.
  - Admin `GET /api/device/cmripjwbx00ewl001ihcke210/users?limit=50&status=UNMATCHED` returned `rowCount=46`, `summary.unmatched=46`, and sample rows all had `status=UNMATCHED`.
- Browser proof:
  - Evidence root: `.runtime/sync-center-needs-link-click-browser-20260721T053934Z/`.
  - Headless Playwright clicked Device C `Needs link: 46`, verified final URL `deviceUserView=open&deviceUserStatus=UNMATCHED`, saw the network request with `status=UNMATCHED`, and confirmed the table showed `1 - 8 of 46` with no `No device users found for this view.` empty state.
- Validation:
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `git diff --check`: passed with CRLF normalization warnings only.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Device-user link employee picker and padded-ID proof

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Mixed admin UX regression repair and device-user/employee matching proof.
- User symptom repaired:
  - In the Link device user modal, the employee dropdown did not visibly open from inside the modal and could not reliably search the full employee list for expected padded employee codes such as vendor `989` -> employee `00989`.
- Implementation:
  - `hris-app/app/components/ui/popover.tsx` now renders popover portals above the custom modal shell/backdrop.
  - `hris-app/app/routes/admin/devices/enroll.tsx` uses the async `EmployeePickerSelect` for manual device-user linking instead of a preloaded 1000-row `SearchableSelect`.
  - `hris-app/app/components/molecules/employee/EmployeePickerSelect.tsx` includes `deviceEmpId` in requested fields and shows it in option metadata.
  - `hris-api/tests/device-user-sync.helper.spec.ts` now explicitly covers padded employee-code fallback for `21 -> 00021` and `989 -> 00989`.
- API proof:
  - Evidence root: `.runtime/device-user-link-selector-20260721-123032/`.
  - `employee-picker-search-proof.json`: admin search for `21` returned `00021` / `deviceEmpId=21`; search for `989` returned `00989` / `deviceEmpId=989`.
  - `device-user-padded-link-dryrun-proof.json`: saved DeviceUser rows on the current four Hikvision devices show vendor `21` linked to employee `00021` and vendor `989` linked to employee `00989`.
- Browser proof:
  - Evidence root: `.runtime/device-user-link-selector-playwright-20260721-043453/`.
  - Playwright opened Device Users for vendor `989`, opened the Link device user modal, opened the employee picker above the modal, typed `989`, and verified `00989` was visible. Screenshot: `link-modal-employee-picker-989.png`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-sync.helper.spec.ts`: `11` passing.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `npx tsc --noEmit --pretty false --incremental false --listFiles false` in `hris-api`: passed.
  - `git diff --check`: passed.
  - Frontend broad `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails on unrelated existing `TimesheetsTab.test.tsx` React Query mock drift already tracked by `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Hikvision faceURL 404 raw-custody sanitization

- Status: `COMPLETE_LOCAL_BROWSER_PROOF`.
- Task mode: Bug fix with backend custody safety and admin UX repair.
- User symptom repaired:
  - Device-user sync status for Main Entrance Device C showed raw Hikvision `404 -- Not Found` HTML from `/LOCALS/pic/enrlFace/...` in Recent missing raw / missing raw summaries, making it look like HRIS broke or like "no face" had been proven.
- Implementation:
  - `hris-api/helper/device-user-raw-fingerprint.helper.ts` classifies Hikvision faceURL binary responses before base64 conversion. HTML 404 becomes `face_image_not_found_on_device`, XML/401 becomes `face_image_unauthorized`, empty/tiny responses remain `face_binary_empty`, and other non-image HTML/XML/text responses become `face_binary_not_image`.
  - Non-image faceURL bodies are never stored as `rawFace`; the sync records short diagnostic reason/status/path evidence and continues other raw-custody tasks.
  - `hris-api/app/device/device.controller.ts` sanitizes live and persisted device-user sync failure reasons, aggregate `biometricFailureReasons`, result summaries, and failure logs.
  - `hris-app/app/routes/admin/devices/enroll.tsx` renders friendly reason labels and sanitizes legacy persisted aggregate messages before display.
- Runtime proof:
  - Evidence root: `.runtime/hikvision-face-404-sanitize-20260721-121324/`.
  - Current Device C job `1e7d9de2-7be8-460d-a031-d9fb3b0735b1` was reopened in the Sync Center status modal.
  - Final browser proof file: `browser-device-c-status-modal-after-summary-sanitize.json`.
  - Proof result: modal contained `Face image not found on device`; did not contain `<!DOCTYPE html>`, `<html>`, `Access Error: 404`, or `can't locate document`; run state was completed with `262` captured raw payloads and `270` missing raw reads still shown as review/repair items.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-raw-fingerprint.helper.spec.ts tests/hikvision-biometric-sync-contract.spec.ts`: `24` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` in `hris-app`: `1` passing.
  - `git diff --check`: no whitespace errors; CRLF normalization warnings only.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Device-user merge unique-ID truth repair

- Status: `COMPLETE_LOCAL_API_PROOF_WITH_BROWSER_WARNING`.
- Task mode: Mixed backend correctness and admin UX truth repair.
- User symptom repaired:
  - The merge modal said `Unique IDs` while showing duplicate selectable rows such as `21, 21, 32, 32`, which made the merge count feel dishonest and made it unclear which row an admin should select.
- Implementation:
  - `hris-api/helper/device-user-merge.helper.ts` now groups merge rows by strict device/vendor person ID from live selected-device reads. Same `vendorUserId` always collapses to one merge row; saved HRIS manual employee links no longer collapse two different vendor IDs into one "unique ID" choice.
  - Duplicate source rows for the same device/user ID are collapsed before unique-ID counting, keeping the richest source row and reporting duplicate source evidence on the plan.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now uses `Device ID records` for per-device/read rows, reports the unique list count as IDs, and shows duplicate-collapse copy only when the plan reports collapsed duplicates.
  - Frontend response types and focused contract tests were updated for `sourceRows`, `dedupedDeviceRecords`, and `duplicateSourceRows`.
- Runtime/API proof:
  - Evidence root: `.runtime/merge-strict-device-id-truth-20260721-113511/`.
  - API restarted successfully; final listener PID `9228`, `/health` status `healthy`.
  - Non-mutating admin `POST /api/device/hikvision/sdk-users/merge/plan` for the current four Hikvision target devices returned `uniqueDeviceIdCount=687`, `apiCountUnionUsers=687`, `sourceRowsFromDevice=2748`, `dedupedDeviceRecords=2748`, `duplicateSourceRows=0`, `hasDuplicateUniqueIdsShown=false`, and zero groups with more than one vendor ID.
- Validation:
  - Backend merge helper: `12` passing.
  - Backend typecheck: passed.
- Warning:
  - Browser automation could not complete login because the current `5175` frontend dev server rendered no login inputs in headless DOM for `/auth/login`; debug artifacts are in the same evidence directory. The merge endpoint proof is still valid and non-mutating.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center dry-run planner scope correction

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Mixed admin UX truth repair, backend dry-run safety, and regression proof.
- User symptom repaired:
  - The status/review experience still made the sync feel like it was starting with a broad `Reading source users` step, and the earlier review panel could disagree with the actual job planner on raw-gap counts.
- Implementation:
  - `hris-api/app/device/device.controller.ts` now supports non-mutating `dryRun=true` on `POST /api/device/users/sync-jobs`; the response includes `willCreateJob=false`, `jobId=null`, `decisionMatrix`, and an `executionPlan`.
  - The job status lookup marks persisted `processing` jobs stale after API restart, preventing old saved statuses from masquerading as active workers.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now uses the dry-run sync-job planner for `Review sync`, shows the same matrix counts the job will use, and uses scoped missing-work copy when source reread is skipped.
  - `hris-app/app/services/devices.service.ts` now types dry-run sync-job responses.
- API proof:
  - Evidence root: `.runtime/sync-center-dry-run-scope-20260721-112157/`.
  - `api-device-user-sync-dry-run-plan-final.json`: admin `admin@bandai.local` / `hris`, payload `{ mode: "needs_attention_only", deviceIds: ["cmpxw13hx002h7zwso7dyedrn"], dryRun: true }`, mutation `none_dry_run`, `7.586s`.
  - Result: `mode=dry_run`, `willCreateJob=false`, `jobId=null`, `selectedFastPlan=needs_attention_only`, `sourceReadRequired=false`, `sourceReadSkipped=true`.
  - Matrix counts: `missing_device_user_record=0`, `missing_employee_link=49`, `missing_raw_fingerprint_blob=106`, `missing_raw_face_blob=65`, `already_present=741`, `stale_count_only_or_live_no_data=0`, `unsupported_by_sync=0`.
  - Execution steps skip full source-user reread, process missing links only, capture missing fingerprint/face raw bytes only, and skip already-present rows.
- Browser proof:
  - `browser-sync-center-scoped-review-final.json` and `browser-sync-center-scoped-review-final.png`.
  - Browser verified `What Sync can fix`, `Missing employee links=49`, `Missing fingerprint raw blobs=106`, `Missing face raw blobs=65`, `Already present=741`, `Fastest valid plan: needs_attention_only`, `Saved-state first`, and absence of `Reading source device users`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-biometric-sync-contract.spec.ts`: `15` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: `1` passing.
  - Frontend repo-wide `npx tsc --noEmit --pretty false` still fails on unrelated existing app-wide type drift outside this Device Users surface.
- Warning:
  - The fast plan may still perform live raw-capture reads for the 106 fingerprint and 65 face candidate rows. It should not reread every source user first and should not process the 741 already-present rows by default.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center missing-record decision matrix handoff

- Status: `COMPLETE_LOCAL_PROOF`.
- Task mode: Mixed admin UX/performance feature and backend fast-path repair.
- Code changed:
  - `hris-api/app/device/device.controller.ts`: added Device Users sync decision matrix buckets, preview payload, job persistence fields, selected fast plan, source-read skip logic, and saved-state raw-custody skip.
  - `hris-app/app/services/devices.service.ts`: exposed matrix/job-stage types to the UI.
  - `hris-app/app/routes/admin/devices/enroll.tsx`: changed default job mode to `needs_attention_only`, added `What Sync can fix` bucket summary/filter view, selected plan display, and truthful stage copy.
  - Focused backend/frontend contract tests updated.
- API proof:
  - `.runtime/sync-center-decision-matrix-20260721-110520/api-sync-preview-decision-matrix-final.json`.
  - Main Entrance Device B (`cmpxw13hx002h7zwso7dyedrn`, `10.184.37.20`) returned `selectedFastPlan=needs_attention_only`, `sourceReadRequired=false`, `missing_employee_link=49`, `already_present=638`, and zero missing raw blobs in `3.818s`.
- Browser proof:
  - `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.json`.
  - `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.png`.
  - Browser verified `What Sync can fix`, all seven bucket/filter labels, `Fastest valid plan`, `Building missing-record matrix`, and absence of old `Reading source device users` wording.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-biometric-sync-contract.spec.ts`: `15` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: `1` passing.
  - `git diff --check`: no whitespace errors; CRLF normalization warnings only.
- Warning:
  - Frontend broad `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails outside touched device scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, already tracked by `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Four Hikvision devices online/armed handoff

- Task mode: Mixed live runtime repair, native listener regression repair, and evidence closeout.
- Evidence directory: `.runtime/hikvision-four-device-online-20260721-064751/`.
- Final runtime state:
  - Direct Windows-to-VM LAN SSH and TCP to `10.184.37.19` timed out, so the verified path used `ssh project-truth-hris`.
  - VM `cloudflared-bnpi-hris.service` stayed active and K3s stayed Ready.
  - VM direct device probes passed for all four target devices on TCP `80`, `443`, and SDK `8000`.
  - Host API reverse `VM 127.0.0.1:53001 -> Windows 127.0.0.1:3001` was restored and returned `/health`.
  - Managed `project-truth-hikvision-hot-reload-listener.service` is active again; temporary per-device listener units used during recovery were stopped.
- Final four-device truth:
  - `10.184.37.20` / Main Entrance Device B / `cmpxw13hx002h7zwso7dyedrn`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.21` / Main Entrance Device A / `cmrht5s2w00ei7zgsre8y3o5n`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.22` / Main Entrance Device C / `cmripjwbx00ewl001ihcke210`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.23` / Main Entrance Device D / `cmripjwkw00ffl0013lfxcbxw`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
- Key evidence files:
  - `phase3-local-api-target-devices.json`: saved HRIS config rows for `.20`-`.23`.
  - `phase4-vm-device-network-fixed.txt`: VM TCP proof to all four devices on `80/443/8000`.
  - `phase6-vm-53001-after-simple-reverse.txt`: callback reverse `/health` proof.
  - `phase7-aggregate-per-device-log-proof.txt`: per-device login/arm/receive/callback log proof.
  - `phase10-final-api-health-listener-readiness.json` and `phase10-final-four-device-table.json`: final API health/listener/readiness proof.
  - `phase10-devices-page-findings.json` and `phase10-devices-page.png`: browser proof for `/admin/configuration/devices`.
- Code/runtime repair:
  - The deployed native listener source includes the session-vector race fix already present in the worktree: session mutex, safer callback host-to-device lookup, reserved session storage, and worker startup after initial arming.
  - This fixed source was copied to the VM listener source/work tree and rebuilt by the managed wrapper.
- Validation:
  - VM native C++ build passed with the Hikvision SDK.
  - Focused backend contract passed: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` (`14` passing).
  - Focused listener-status helper passed: `hris-api/tests/hikvision-listener-status.helper.spec.ts` (`10` passing).
  - Broad `npm --prefix hris-api test -- ...` accidentally expanded to the full suite and failed on unrelated existing suite drift plus stale compose DB `10.184.37.19:15433`; use the focused rerun artifacts for this task.
- Remaining warning:
  - `scripts/ensure-device-live-path.ps1` failed to start the API reverse bridge because `Start-Process -ArgumentList` received an object array. The reverse was started manually and proven; recommendation `REC-20260721-HIKVISION-API-REVERSE-ENSURE-BUG` captures durable hardening.

## 2026-07-20 - Device Events saved view fast/truthful listener UX handoff

- Task mode: Mixed admin UX/performance regression repair.
- User symptom repaired:
  - `/admin/configuration/devices/events?view=saved` felt stale/slow because saved ledger truth, device health, listener armed state, and live receiving proof were collapsed in the UI.
  - Armed-but-quiet listener proof now reads as `Ready for tap proof`, not `Live path needs proof` or `not checked for a long time`.
- Implementation:
  - `hris-api/app/device/device.controller.ts`:
    - `GET /api/device/:id/health?quick=true` now uses bounded TCP reachability (`tcpReachability`) and skips slow Hikvision system-time/source-count reads.
    - Hikvision listener status prefers direct LAN SSH first, uses one bounded VM read, and caches status briefly for readiness/listener consumers.
  - `hris-api/helper/device-live-readiness.helper.ts` and `hris-app/app/lib/device-live-readiness-shared.ts`:
    - Armed-but-quiet/no-fresh-tap state is yellow `Ready for tap proof`; DB ok + armed listener is safe to tap but not safe to enroll until fresh receiving/post proof exists.
  - `hris-app/app/routes/admin/devices/events.tsx`:
    - Saved ledger render is independent of background listener/proof checks.
    - Added separate quick device-health summary with copy: `Reachability is separate from listener armed state and tap proof.`
  - Frontend device service/hooks now pass `quick=true` and short client timeouts for saved-view health summaries.
- Runtime proof:
  - Evidence dir: `.runtime/device-events-stale-fast-20260720-211150/`.
  - API timing summary:
    - saved rows `2.629s`, saved facets `1.924s`, exact device list `0.561s`.
    - listener status cached repeat exposed `cache.hit=true`, TTL `5000ms`.
    - quick health server durations for sampled devices: `1327ms`, `1214ms`, `1ms`, `0ms`; all used `provenBy=tcpReachability`.
  - Browser proof:
    - `.runtime/device-events-stale-fast-20260720-211150/browser/playwright-settled-clean-result.json`.
    - Settled page showed saved rows for the current saved-ledger filter.
    - Clean follow-up proof showed the new health strip as `4 online / 0 degraded / 3 offline` followed by `/` and the reachability separation copy.
    - Page text included `Ready for tap proof` and saved rows.
    - Page text did not include `Live path needs proof` or `not checked for a long time`.
- Validation:
  - Backend typecheck passed: `npx tsc --noEmit --pretty false --incremental false --listFiles false`.
  - Backend focused tests passed: `25` passing for listener-status helper, readiness, listener fast-path, and quick-health contracts.
  - Frontend focused contract passed: `12` passing for `app/lib/device-events-page-contract.test.ts`.
  - Frontend `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails on unrelated existing `app/routes/employee/dashboard/TimesheetsTab.test.tsx` `UseQueryResult` fixture drift.
- Worktree note:
  - `hris-api/tests/device-log-sync-targeted.contract.spec.ts` had pre-existing unrelated edits and was not changed for this repair.
- Recommendation capture: No new recommendations were identified.

## 2026-07-20 - Remote local-dev Hikvision tunnel handoff

- Task mode: Focused local-dev runtime access repair.
- Implemented:
  - `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` now lets local `hris-api` route Hikvision HTTP/ISAPI and SDK probes through localhost SSH forwards while preserving the saved device address shown in HRIS.
  - `scripts/start-hikvision-remote-device-tunnel.ps1` starts forwards for Main Entrance Device A `10.184.37.21` on HTTP `80`, HTTPS `443`, and SDK `8000`, and writes the ignored local API env override into `hris-api/.env.development.local`.
  - `hris-api/scripts/ensure-bnpi-db-access.cjs` preserves that tunnel-map env line when it regenerates local DB overrides.
- Runtime proof:
  - Tunnel proof saved to `.runtime/hikvision-remote-device-tunnel-last.json`: PID `17684`, TCP OK on `127.0.0.1:10080`, `127.0.0.1:10443`, and `127.0.0.1:18000`.
  - Local API health proof saved to `.runtime/remote-device-tunnel-proof-20260720-161455/device-a-health-with-tunnel-map.json`: Main Entrance Device A returned `summary.status=online`, `device.address=10.184.37.21`, `baseUrl=https://127.0.0.1:10443`, `network.source=env_tunnel_map`, and `deviceApi.provenBy=systemTime`.
  - Browser proof saved to `.runtime/remote-device-browser-proof-20260720082234/summary.json`: `localhost:5175/admin/configuration/devices` showed Main Entrance Device A and `Online`; device health API responses were HTTP 200.
- Validation:
  - Focused backend tests passed: `6` passing for `device health helper` and `hikvision client endpoint resolution`.
  - `hris-api` `npx tsc --noEmit --pretty false` passed.
- Boundary:
  - `ssh project-truth-hris` from the current network reset through Cloudflare edge during this session. The helper therefore used direct LAN fallback `infra@10.184.37.19` for proof. Far-away usage depends on Cloudflare Access SSH being reachable from that network.
- Recommendation capture: No new recommendations were identified.

## 2026-07-20 - TEST A zero-missing recovery boundary handoff

- Task mode: Agent-owned live biometric recovery attempt, truth classification, and UI clarity repair.
- Evidence: `.runtime/test-a-zero-missing-raw-recovery-20260720-113320/`.
- Runtime/API evidence:
  - Local API was restarted with `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=1` and health saved in `api-health-after-concurrency1-restart.json`.
  - Raw-only job `48f654ff-8ed0-4ccb-8470-8f51d9654dbb` completed for TEST A: `136` missing credentials processed, `0` captured, `938` cached, `136` failed.
  - Failure reasons remained explicit: `no_face_on_device` and `no_fingerprint_data_from_device`.
- SQL evidence:
  - `raw-sql-before.json` and `raw-sql-after.json` match after recovery.
  - Current custody remains `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only.
  - Fingerprint custody remains `718` inventory slots / `628` raw stored / `91` raw missing; face custody remains `356` inventory / `311` raw stored / `45` raw missing.
- Direct live capture evidence:
  - `direct-capture-samples-summary.json` covers visible/prior rows `83`, `839`, `984`, `1008`, `1076`, and `1143`.
  - All six fingerprint captures returned HTTP `422`, `status: "error"`, `no_fingerprint_data_from_device`.
  - All six face captures returned HTTP `422`, `status: "error"`, `no_face_on_device`.
- Device probe evidence:
  - `deep-isapi-fingerprint-probe-summary.json` proves control user `1004` still returns bytes through the same read path (`13` hits across probe shapes).
  - Missing users `8`, `83`, and `984` returned `0` hits across `54` probe attempts each, so no parser/probe code bug was proven for the remaining rows.
- Code/UI changes:
  - No new raw blob recovery code was justified by the live evidence.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now distinguishes inventory counts from raw stored bytes in the sync review modal and states that no blobs are fabricated.
- Validation:
  - Backend focused tests already passed with the no-data contract fix: `20` passing.
  - Backend `tsc --noEmit --pretty false` passed.
  - Targeted frontend ESLint on `enroll.tsx` passed with existing warnings only.
  - Frontend `typecheck:test` remains blocked by unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture type drift.
  - Same-environment Playwright saved `playwright-modal-copy-proof.png`, `playwright-modal-copy-proof.txt`, `playwright-modal-copy-network.json`, and `playwright-modal-copy-summary.json`; the summary confirms the modal shows `inventory vs raw`, `inventory enrolled`, `raw no-data/missing`, and `no blobs are fabricated`.
- Remaining boundary: zero missing raw blobs cannot be truthfully reached from the current panel reads. The remaining missing values are stale/count-only inventory claims unless the physical panel is re-enrolled/refreshed or a different verified device-side export path returns actual raw bytes.

## 2026-07-20 - TEST A missing raw root-cause follow-up handoff

- Task mode: Focused biometric custody root-cause repair and API contract truth repair.
- Evidence: `.runtime/test-a-missing-raw-root-cause-20260720-111215/`.
- Raw SQL proof:
  - TEST A `cmrlgqsjv000oob01165tbd8n` remains the scoped Hikvision device.
  - Active DB table is `public."Device"` plus `device_users`; SQL artifacts include `raw-sql-classification.sql`, `raw-sql-01-test-a-device.json`, `raw-sql-02-device-user-classification.json`, `raw-sql-03-sample-rows.json`, and `raw-sql-04-aggregate.json`.
  - Current aggregate: `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only. Fingerprint custody is `718` reported slots / `628` stored raw templates / `91` missing; face custody is `356` reported / `311` raw / `45` missing.
- Direct API/device proof:
  - Login actor: `admin@bandai.local` / `hris` admin.
  - Modal/source endpoints were captured: `/api/device/sync-preview?deviceId=cmrlgqsjv000oob01165tbd8n` and `/api/device/cmrlgqsjv000oob01165tbd8n/users`.
  - Sample rows `83`, `839`, `984`, `1008`, `1076`, and `1143` all returned live raw capture no-data: fingerprints `no_fingerprint_data_from_device`, faces `no_face_on_device`.
  - Root-cause classification: stale/count-only inventory claims with true live raw no-data for sampled rows; no parser, merge, or probe bug was proven for these rows.
- Code bug repaired:
  - Manual raw fingerprint/face capture endpoints previously returned HTTP `422` with `buildSuccessResponse`, causing `status: "success"` on no-data and sometimes very large stale metadata bodies.
  - `hris-api/app/device/device.controller.ts` now returns compact `buildErrorResponse` bodies with `capture.reason` on no-data and keeps success envelopes only for actual raw capture success.
  - Regression coverage added in `hris-api/tests/hikvision-biometric-sync-contract.spec.ts`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-raw-fingerprint.helper.spec.ts tests/hikvision-biometric-sync-contract.spec.ts`: `20` passing.
  - `npx tsc --noEmit --pretty false`: passed.
  - Same-environment Playwright against `http://127.0.0.1:5175` saved `playwright-sync-center-device-users.png`, `playwright-page-text.txt`, `playwright-network.json`, `playwright-api-results.json`, and `playwright-summary.json`. Browser-side authenticated capture calls all returned HTTP `422` / `status: "error"` with exact no-data reasons.
- Remaining boundary:
  - This pass repaired `0` raw blobs. It fixed the no-data API contract and classified the requested six rows. The other `40` rows with missing raw were not directly captured in this pass and remain SQL-evidenced missing rows unless/until sampled by direct device calls.

## 2026-07-20 - TEST A raw biometric repair loop handoff

- Task mode: Mixed biometric custody repair + UI truth repair + live TEST A proof.
- TEST A: `cmrlgqsjv000oob01165tbd8n` (`192.168.254.102:443`, Hikvision), identified through API/DB evidence.
- Implementation truth:
  - Raw fingerprint sync now counts template slots, not just users.
  - `FingerPrintUpload` bulk can under-return templates; helper now probes per-finger when stored raw count is below `UserInfo.numOfFP`, then merges existing and newly fetched raw templates.
  - Raw-only job status completes with needs-attention semantics when `missing_raw_blob` remains; it does not hard-fail a device just because some rows have real no-data responses.
  - UI copy now says raw custody, current modality/vendor user, recent missing rows, and finished-with-missing review instead of stale `0%`/encrypted-envelope text.
- Live evidence in `.runtime/test-a-raw-repair-loop-20260720-103434/`:
  - Initial preview: source `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `325`, fingerprint missing `393`, face reported `356`, face raw `311`, face missing `45`.
  - Job `bbccf2b6-75be-4e78-a7fa-e1a683149c02`: `266` captured, reduced fingerprint missing to `120`.
  - Job `834d6273-74d8-416f-aecf-8fd92430a062` with local `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=2`: `29` captured, removed transient `Unauthorized` class, final fingerprint raw `627`, missing `91`.
  - Remaining sample repair for users `1008`, `1076`, `1143` returned exact HTTP `422` bodies: `no_fingerprint_data_from_device` and `no_face_on_device`.
- UI evidence:
  - `browser-review-sync-dialog.png/.txt`: review modal shows `718 enrolled Â· 627 raw Â· 91 missing_raw_blob` and `356 enrolled Â· 311 raw Â· 45 missing_raw_blob`.
  - `browser-details-1004.png/.txt`: repaired user shows `2 of 2 stored` and raw face stored.
  - `browser-details-1008-search-open.png/.txt`: remaining no-data user shows `2 missing_raw_blob`, raw repair buttons, and count-only missing face truth.
- Validation:
  - Backend biometric sync + raw helper tests: 19 passing.
  - Controller/router/helper import check: passed.
  - Frontend device-user UI contract: passed.
  - Backend `tsc --noEmit`: passed.
  - Frontend targeted ESLint on touched files: warnings only, no errors.
  - Frontend `typecheck:test` still fails on unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture type drift.

## Purpose

This file is the generic WWG Agent Handoff for a chosen implementation agent working from WWG project truth. The Codex compatibility artifact is written separately at `.wwg/reports/wwg-handoff-to-codex.md`.

This handoff applies to any implementation agent. `.wwg/reports/wwg-handoff-to-codex.md` remains a Codex compatibility artifact while Codex-specific flows require it.

Shared handoff logic is owned by `src/core/agent-handoff.ts`; `src/core/codex-handoff.ts` is a compatibility wrapper.

## Required Read Order

1. `.wwg/wiki/project-truth.md`
2. `.wwg/wiki/terminology.md`
3. `.wwg/wiki/principles/README.md`
4. Relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning
5. `.wwg/workspace/current-task.md`
6. `.wwg/workspace/context/project-context.md`
7. `.wwg/governance/drift-guard.md`
8. `.wwg/governance/quality-gates.md`
9. Root `AGENTS.md`
10. Relevant source, tests, templates, and docs

## Summary

Your WWG project is ready for a chosen implementation agent to continue from project truth, Workspace context, and Governance checks.

## Scenario

Validation Failure Handoff

## Current State

- The latest WWG validation report indicates blockers or required follow-up.
- Overall status: FAIL
- PASS Required WWG directories exist - 1 finding(s)
- FAIL WWG operating loop files are present and actionable - 2 finding(s)
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-adoption-plan.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-existing-audit-report.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.

## Next Actions

1. Fix top validation blockers before implementation or release work.
2. Prioritize generated report contract findings, truth-sync field failures, then missing test/regression findings.
3. Regenerate or repair WWG-owned generated reports through the responsible WWG command.
4. Rerun validation and test-check after each focused fix.

## Commands To Run

```bash
wwg doctor --apply
wwg validate
wwg test-check --format plain
wwg reconcile --format plain --json
# Run repo-specific validation from package.json, for example:
npm run build
npm test
npm run lint
```

## Candidate / Truth Review

- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.
- If validation reports truth-sync field failures, update the report generator or explicit report classification instead of weakening validation broadly.
- Do not rewrite `.wwg/wiki` semantic truth to mask generated-report contract failures.
- Review reconciliation candidates only after validation blockers are understood.

## Boundaries

- Do not approve, apply, or promote high-risk truth candidates automatically.
- Do not rewrite `.wwg/wiki` semantic truth during a governance-only pass.
- Do not treat Vorter runtime evidence as accepted WWG truth.
- Do not mutate `.vorter` unless the task is explicitly Vorter-owned.
- Do not mutate application source files during report-only, validation-only, upgrade-review, or governance-only passes.
- Reports and candidates are evidence; `.wwg/wiki` remains canonical truth.

## Commit Readiness

- Do not commit release or upgrade completion while `wwg validate` fails.
- `wwg validate` passes or has only documented acceptable warnings.
- `wwg test-check` has no unexplained blocker.
- Repo-specific build, tests, lint, smoke, or package checks pass.
- Boundary diff is reviewed for `.wwg/wiki`, `.vorter`, generated reports, and source changes.
- High-risk candidates are reviewed but not automatically applied.

## Stop Conditions

- `wwg validate` fails.
- High-risk truth candidates exist and have not been reviewed.
- Unexpected `.wwg/wiki` changes appear.
- Unexpected `.vorter` changes appear.
- Source code changes appear during a governance-only pass.
- Package dry-run is unsafe.
- Tests fail.

## Report Location

- .wwg/reports/wwg-validate-report.md

## WWG Readiness

Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.

### Must Have

- [x] WWG workspace present (present)
  - Evidence: `.wwg`
- [x] Project config present (present)
  - Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
  - Evidence: `.wwg/wiki/project-truth.md`
- [x] Terminology present (present)
  - Evidence: `.wwg/wiki/terminology.md`
- [x] Principles README present (present)
  - Evidence: `.wwg/wiki/principles/README.md`
- [x] Workspace current task present (present)
  - Evidence: `.wwg/workspace/current-task.md`
- [x] Governance drift guard present (present)
  - Evidence: `.wwg/governance/drift-guard.md`
- [ ] Recommendation Registry present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [ ] Test enforcement governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/test-enforcement.md`
- [ ] Regression guardrail governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/regression-guardrail-catalog.md`
- [x] Validation report present (present)
  - Evidence: `.wwg/reports/wwg-validate-report.md`
- [x] Audit report present (present)
  - Evidence: `.wwg/reports/wwg-audit-report.md`
- [x] Agent handoff present (present)
  - Evidence: `.wwg/reports/wwg-agent-handoff.md`, `.wwg/reports/wwg-handoff-to-codex.md`
- [x] Adoption regression baseline present (present)
  - Evidence: `.wwg/governance/regression-manifest.md`, `.wwg/governance/regression-manifest.json`

### Other Features

- [ ] Changelog missing (missing)
  - Reason: Package, product, or git history signals make release memory relevant.
  - Agent action: Prepare or review release narrative before treating changelog wording as final.
  - CLI support: `wwg changelog generate --from-git --weekly --dry-run`
  - Evidence: `CHANGELOG.md`
- [ ] Infrastructure readiness not checked (available)
  - Reason: Build, deploy, env, or infrastructure indicators were detected.
  - Agent action: Inspect infrastructure readiness before deployment-related work.
  - CLI support: `wwg infra check`
  - Evidence: `.env.example`, `.github/workflows`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Current version, optional candidate review (available)
  - Reason: Workspace is current. Optional semantic/candidate review artifacts exist; run only if adopting candidate surfaces.
  - Agent action: Treat candidate/review artifacts as optional review surfaces unless the user asks to promote them.
  - CLI support: `wwg audit --upgrade-candidates`
  - Evidence: `.wwg/reports/generated-project-upgrade-review.md`

### Recommended Next

- [ ] Complete Must Have readiness first (available)
  - Reason: 3 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Target Folder

C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

## GitHub Repository

Not published.

## Selected Profiles

- None.

## Governed Skill State

- Skill manifest: not present
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Runtime Skill Candidates

WWG generated runtime skill candidates only. WWG did not activate these skills. Vorter is responsible for runtime activation, task-level context loading, tool routing, permissions, and token budgeting. HomeDesk is responsible for user visibility, approval, disabling, and override controls.

- Status: not generated
- Reason: Skill Manifest is not present.
- Activation owner: Vorter

## Project Summary

- Project: TBD
- Summary: TBD
- Status: TBD

## Key Decisions

- Use Wiki truth as the source of planning and implementation context.
- Use Workspace context, prompts, and skills as generated agent operating material.
- Use Governance checks for validation, release, evidence, and approval gates.
- Keep secrets out of Wiki truth, reports, Workspace, and commits.

## Users and Roles

TBD

## MVP Features

TBD

## Pages / Screens

TBD

## Architecture and Hosting Preferences

TBD

## Design Preferences

TBD

## Sources and References

No source index or source report was available.

Accessible external-chat files, screenshots, docs, and images should be registered through WWG source intake so they land under `.wwg/wiki/01-sources/raw/uploads/`. If a chat-only reference is not accessible as a file or upload, add a raw source note documenting the missing artifact.

Keep raw originals in `.wwg/wiki/01-sources/raw`; use `.wwg/wiki/01-sources/processed` only for later cleaned extracts or summaries.

## Infrastructure Readiness

Not checked yet.

## Governance Level and Approval Gates

Level: TBD. Approval gates should follow AGENTS.md and governance checklists.

## Current Native Structure

- Canonical WWG metadata lives under `.wwg/`: `.wwg/config`, `.wwg/wiki`, `.wwg/workspace`, `.wwg/governance`, and `.wwg/reports`.
- `.wwg/config/wwg.project.yaml` is the canonical native registry.
- Root `wwg.project.yaml` is a legacy compatibility mirror/fallback when present.
- `.wwg/reports/` is canonical for generated WWG reports.
- Root `reports/` may remain for historical, release, package, external-upload, or human-facing reports.
- Config fallback/mirror status: canonical config present; no root fallback detected.

## Truth Loop

Implementation changes must reconcile code, project truth, terminology, principles, Workspace context, Governance checks, templates, tests, generated outputs, and reports when relevant.

## Principle Review

- Principles reviewed:
  - No principle-impacting changes detected.
- Principles updated:
  - None.
- Candidate principle changes:
  - None.
- Principle drift concerns:
  - None.

No principle-impacting changes detected.

## Truth Loop Review

- Project truth updated: N/A
- Terminology updated: N/A
- Principles updated: N/A
- Governance updated: N/A
- Workspace updated: N/A
- Templates/tests updated: N/A
- Reports updated:
  - .wwg/reports/wwg-agent-handoff.md
  - .wwg/reports/wwg-agent-handoff.json
  - .wwg/reports/wwg-handoff-to-codex.md
  - .wwg/reports/wwg-handoff-to-codex.json
  - .wwg/reports/runtime-skill-candidates.json
  - .wwg/reports/runtime-skill-candidates.md

No truth-loop-impacting changes detected.

## Native Structure Review

- `.wwg/config/wwg.project.yaml` present: yes
- `.wwg/reports/` present: yes
- Legacy root metadata folders present: none
- Config fallback/mirror status: canonical config present; no root fallback detected

## Maintenance Awareness

- Maintenance review recommended: yes
- Reason: Current audit or handoff inputs contain maintenance drift signals.
- Suggested command: `wwg maintain --target <path>`

## Recommendation Capture

Review whether this task revealed useful future work outside the approved scope.
If yes, add or update `.wwg/governance/recommendation-registry.md`.
If no, state that no new recommendations were identified.

Recommendations are candidate work only. They are not project truth, active work, or commitments until reviewed and promoted.

## WWG Truth Synchronization

- Task mode: TBD
- New truth detected: YES / NO
- Wiki updated: YES / NO / N/A
- Workspace updated: YES / NO
- Governance review completed: YES / NO
- Drift status: NONE / LOW / MEDIUM / HIGH
- Canonical files changed:
  - TBD
- Implementation discoveries synced:
  - TBD
- Remaining stale context:
  - TBD

Reports cannot override `.wwg/wiki/project-truth.md`. If this handoff or another report conflicts with project truth, update the stale report or leave a drift finding.

## Open Questions

- Missing planning input: .wwg/wiki/02-project/project-brief.md.
- Missing planning input: .wwg/wiki/03-requirements/functional-requirements.md.
- Missing planning input: .wwg/wiki/05-architecture/deployment-model.md.
- Missing planning input: .wwg/wiki/07-ux/screens.md.
- Missing planning input: .wwg/wiki/11-synthesis/open-questions.md.
- Missing planning input: .wwg/wiki/11-synthesis/planning-summary.md.

## Generated WWG Files

- .wwg/config/wwg.project.yaml
- .wwg/governance
- .wwg/governance/drift-guard.md
- .wwg/reports/adoption-audit.md
- .wwg/reports/adoption-regression-report.json
- .wwg/reports/adoption-regression-report.md
- .wwg/reports/readme-validation.md
- .wwg/reports/wwg-adoption-plan.md
- .wwg/reports/wwg-adoption-report.md
- .wwg/reports/wwg-audit-report.md
- .wwg/reports/wwg-doctor-report.md
- .wwg/reports/wwg-upgrade-history.md
- .wwg/reports/wwg-upgrade-report.md
- .wwg/reports/wwg-validate-report.md
- .wwg/wiki
- .wwg/wiki/principles/README.md
- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/workspace
- .wwg/workspace/current-task.md
- AGENTS.md
- reports/wwg-adoption-plan.json
- reports/wwg-adoption-report.json
- reports/wwg-existing-audit-report.json

## Missing Inputs

- .wwg/config/intake.answers.yaml
- .wwg/config/skill-manifest.yaml
- .wwg/reports/truth-reconciliation-candidates.json
- .wwg/reports/truth-reconciliation-candidates.md
- .wwg/reports/wwg-infra-check-report.md
- .wwg/reports/wwg-sources-report.md
- .wwg/reports/wwg-upgrade-plan.md
- .wwg/wiki/01-sources/source-index.json
- .wwg/wiki/01-sources/source-index.md
- .wwg/wiki/02-project/project-brief.md
- .wwg/wiki/03-requirements/functional-requirements.md
- .wwg/wiki/05-architecture/deployment-model.md
- .wwg/wiki/07-ux/design-preferences.md
- .wwg/wiki/07-ux/screens.md
- .wwg/wiki/11-synthesis/open-questions.md
- .wwg/wiki/11-synthesis/planning-summary.md
- intake answers

## Validation Result

- Report: .wwg/reports/wwg-validate-report.md

## Audit Result

- Report: .wwg/reports/wwg-audit-report.md

## Recommended First Agent Prompt

```txt
Read AGENTS.md and .wwg/reports/wwg-agent-handoff.md. Follow the WWG operating loop, then continue from the WWG plan and begin implementation with your chosen implementation agent.
```

## Implementation Log

Use `.wwg/reports/agent-implementation-log.md` for implementation notes across agents. Treat `.wwg/reports/codex-implementation-log.md` as a legacy name and prefer renaming or avoiding it in new work.

## Suggested First Implementation Tasks

```txt id="starter-tasks"
1. Read WWG project context and confirm assumptions.
2. Review open questions before building.
3. Create the initial app architecture plan.
4. Implement the first MVP page/screen.
5. Add tests and update WWG context after implementation.
```

# 2026-07-20 DeviceUser Raw Biometric Export/Import Handoff

- Status: `PARTIAL_COMPLETE_WITH_EVIDENCED_MISSING_RAW_BLOBS` for TEST A raw biometric custody. No biometric blobs were fabricated from counts.
- Current proven TEST A export/package truth:
  - DeviceUser rows: 394 total, 338 linked, 56 unlinked.
  - Fingerprint rows: 361 reported, 316 rows with raw blobs; latest package import preview carries 628 raw fingerprint templates. Earlier repair preview proved 718 enrolled fingerprint template slots, so the latest package is still short by 90 template slots against that reference.
  - Face rows: 356 reported, 311 raw face blobs, 45 missing face blobs.
  - Package status: `partial_missing_requested_raw_blobs`; 46 rows carry the reason `Reported biometric enrollment exists but no evidenced raw blob is stored`.
- Recovery loop run by agent:
  - Checked prior all-device sync first. Existing all-Hikvision job `6c7e3e4c-f722-4b00-a57c-81e06ab709d4` was still `processing` and repeatedly failing Main Entrance Device B fetches.
  - Ran TEST A biometrics-only job `e692290a-1d4f-4965-887f-c107bd473992`: completed, no new captures, cached 938 existing custody entries, 136 failed/missing checks.
  - Retried TEST A biometrics-only job `8d3a48df-a85e-44e2-abd3-3120d21e046f`: completed with the same no-new-capture result.
- Export/import journey proof:
  - Real CSV, Excel, and Package JSON browser downloads were saved and parsed. Headers are HR-friendly, no duplicate columns were found, no encrypted/passphrase wording remains in this modal journey, and CSV/XLSX preserve multi-fingerprint values as `FPn("...");FPn("...")`.
  - Package JSON preview of the full 22,968,896-byte file succeeded non-mutating with 394 matches, 0 conflicts, and 55 missing HRIS employees. Execute without typed confirmation was rejected with HTTP 400.
  - CSV subset import preview proved the modal shows preview-first copy and package-data status without mutation.
- Code truth changed:
  - API request body limit now uses `HRIS_API_BODY_LIMIT || "75mb"` and the security config is aligned at 75 MB so real package JSON import preview is accepted.
  - Import parsing accepts FP-pattern cells, JSON array/object cells, and semicolon/comma separated raw fingerprint templates, preserving all templates in rawPackage import.
  - Export/import modal loading copy is HR-friendly and operational.
- Validation:
  - Backend focused contracts: 25 passing.
  - Frontend focused UI contract: 1 passing.
  - Backend typecheck: passed.
  - Frontend targeted ESLint: 0 errors, existing warnings only.
  - Full frontend typecheck still fails outside this scope in pre-existing app/type drift such as `LoginDebug.tsx`, calendar/guide imports, leave route imports, `TimesheetsTab.test.tsx`, and other unrelated files.
- Evidence root: `.runtime/device-user-raw-export-proof-20260720-110129/`.
- Recommendations recorded: `REC-20260720-HIKVISION-RAW-SYNC-STALE-JOB-CANCEL` and `REC-20260720-HIKVISION-RAW-SYNC-DEVICE-PREFLIGHT`.

# 2026-07-21 Overnight Hikvision Listener Self-Repair Handoff

- Status: `GREEN_WITH_BOUNDARY`. Runtime is software-green and truthful UI state settled to `Ready for tap proof`; physical fresh-tap evidence remains the only boundary for changing quiet armed devices to `receiving`.
- Direct LAN SSH to `infra@10.184.37.19` timed out from the Windows host; fallback `ssh project-truth-hris` worked and was used for runtime proof. The VM kept `cloudflared-bnpi-hris.service` active/running, PID `1842402`.
- Listener recovery: VM reverse/API ports were restored/proven on `127.0.0.1:53001`, `59000`, and `59443`; `project-truth-hikvision-hot-reload-listener.service` is active/running, PID `2912473`, with no `bad_alloc`, `length_error`, `Aborted`, or wrapper `Usage:` crashes after the patched restart window.
- C++ runtime repair deployed on the VM: the active work tree and `/opt/project-truth/vendor/hikvision-linux/hikvision_biometric_service.cpp` contain the session-list mutex/callback source-device copy fix, and the rebuilt binary hash is recorded. This checkout has no tracked C++ diff for that file, so the durable repo source boundary must be reviewed before a production promotion claim.
- Device classification from final listener/API proof: Main Entrance Device A `10.184.37.21`, B `10.184.37.20`, C `10.184.37.22`, and D `10.184.37.23` all logged `sdk_login ok`, `sdk_alarm_arm ok`, and `device_armed`; final API classified them as `armed_waiting_for_tap`. D/C/A also have fresh HRIS post proof in the final window; B is armed and waiting for a new physical callback/post proof.
- HRIS callback post path is proven: listener logs show successful `hikvision_callback_post_result` rows and `hris_contract_post ok=true` through `apiBase=http://127.0.0.1:53001`.
- Saved Device Events performance/truth proof: final API timings were `summaryScope=facets` 3178ms, listener 5745ms, live-readiness 1793ms, saved-events 2288ms. Saved view returned real DeviceEvent rows and did not block on listener proof.
- UI proof: Playwright opened `http://localhost:5175/admin/configuration/devices/events?view=saved&action=listener-control`, showed the listener modal, `Service enabled`, `Ready for tap proof`, saved events, and no stale `Live path needs proof` or `not checked for a long time` wording. Evidence screenshot: `.runtime/overnight-hikvision-listener-green-20260721-065548/playwright-listener-modal-saved-events-final.png`.
- Code repair in this checkout: `hris-api/app/device/device.controller.ts` restores `summaryScope=facets` handling so facet counts are not collapsed by selected taxonomy leaf filters.
- Validation: API typecheck passed; focused API contracts passed 32/32; focused frontend Vitest contracts passed 31/31; live Playwright proof passed after three recoverable script/tooling retries. Python/C++ local tests could not run on Windows because `python`/`py` were unavailable, but the VM build/rebuild proof passed.
- Evidence root: `.runtime/overnight-hikvision-listener-green-20260721-065548/`.
- Recommendations: no new recommendations were added; existing `REC-20260721-HIKVISION-API-REVERSE-ENSURE-BUG` already covers the direct recovery issue observed in this run.

# 2026-07-21 Sync Center DB/Live Gate Removal + Four Hikvision Device Proof

- Status: `FULFILLED_WITH_WARNINGS`.
- Code changed: Sync Center no longer renders or owns the `Checking DB + live path` / Keep Ready / Prove-fix readiness strip. `GET /api/device/sync-preview?quick=true` is now the default Sync Center path and treats skipped live source counts as neutral `saved_preview` instead of a blocking error. The host-local Hikvision tunnel env map is generated as a single-line value so all `.20-.23` forwards are loaded by the local API.
- Runtime proof: `ssh project-truth-hris` worked while direct LAN SSH to `10.184.37.19` timed out; Cloudflare tunnel stayed active. VM fast reachability proved `.20-.23` required TCP ports `80/443/8000` open. Host-local forwards for all four devices were open.
- API proof: local API quick health proved `.20`, `.21`, `.22`, `.23` `online` via `env_tunnel_map`. Quick Sync Center preview returned target HRIS DeviceUser counts `.20=459`, `.21=687`, `.22=416`, `.23=399` in 2454ms without live source blocking. Separate live Hikvision user-info count succeeded for all four in 1574ms-4784ms. Device Users endpoint returned saved totals for all four.
- Listener proof: `/api/device/hikvision/listener` returned running/armed/receiving overall with four device rows; `.20` receiving and `.21-.23` armed.
- Browser proof: Playwright on `http://127.0.0.1:5175` proved `/admin/configuration/devices`, Sync Center, and Device Users show all four target IPs; no `Checking DB + live path`, `Prove / fix now`, or `Keep ready ON` text was present. Network captured quick health, `sync-preview?quick=true`, and listener calls only.
- Validation: backend focused contracts passed 17/17; frontend focused contract passed 1/1; API typecheck passed. Frontend `typecheck:test` still fails outside this scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, covered by existing `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Evidence root: `.runtime/sync-center-four-hikvision-20260721-090712/`.
- Boundary: stale non-target Hikvision devices still exist in config/list results, but they no longer block target-device health, Sync Center render, or Device Users proof. No biometric bytes were inferred from counts.

## Next Steps

- Open VSCode.
- File -> Open Folder.
- Select: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH.
- Start your chosen coding agent.
- Use the recommended first prompt above.
# 2026-07-19 â€” Raw fingerprint enrollment custody race repaired

- The C++ listener was not the failing layer: TEST A person `18` produced one raw template, attached it to the callback, and received HTTP success.
- Root cause was a last-writer-wins race in API UserInfo enrichment. A stale inventory snapshot could overwrite the DeviceUser raw metadata after the callback, while DeviceEvent still retained the template.
- API repair uses optimistic `updatedAt` merge/retry and preserves raw fingerprint/face custody. Exact evidenced-event replay remained present after the delayed enrichment window.
- Modal repair suppresses the false `Not captured yet` state while its saved DeviceUser refetch is pending. Users `15` and `18` render `1 stored` in headless proof.
- Evidence and boundary: `.runtime/fingerprint-enroll-raw-race-20260719/summary.md`.

# 2026-07-21 Device C DeviceUser Gap Repair Handoff

- Status: `FULFILLED_WITH_BOUNDARY`.
- Root cause: DeviceUser sync job planning used saved HRIS DeviceUser state only (`vendorUserCount: null`) for its decision matrix, so the running `needs_attention_only` job reported `missing_device_user_record=0` even while Sync Center preview proved Main Entrance Device C had `687` physical users and only `416` saved HRIS DeviceUser rows.
- Code changed: the job planner now calls the fast Hikvision device-user count before deciding missing source identities are zero. When the live source count exceeds saved HRIS rows, the job sets `sourceReadRequired=true` and reads source users before raw-custody repair.
- UI changed: job progress no longer labels failed raw capture attempts as remaining HRIS "raw gaps"; it uses `Device no-data` / `raw reads failed`, matching device 404/no-data evidence.
- Runtime repair: API was restarted locally on port `3001`. Repaired dry-run for Device C returned `missingDeviceUsers=271`, `sourceReadRequired=true`, `sourceReadSkipped=false`. Real job `690dbe6d-c751-4dc3-9dff-f1f70738012a` completed with `created=271`, `updated=416`, `linked=640`, and `unmatched=46`.
- Final proof: fresh Sync Center preview returned Device C `fromDevice=687`, `savedInHris=687`, `gap=0`, `missingDeviceUsers=0`, `needsLink=46`, `alreadyPresent=641`. Fresh merge plan showed `687` unique IDs and no duplicate unique IDs.
- Validation: backend focused contracts passed 27/27; API typecheck passed; frontend focused UI contract passed 1/1; `git diff --check` passed with only CRLF warnings.
- Boundary: 118 face raw reads failed because Device C returned 404/no-data for face image URLs. No raw biometric bytes were inferred or fabricated from counts.
- Evidence root: `.runtime/device-c-repaired-sync-20260721-1153/`.

# 2026-07-21 New Cutoff Payroll Dry-Run/Seed Handoff

- Status: `PARTIALLY_FULFILLED`. Payroll was not generated because preview/comparison still has severe unexplained source gaps after the safe seeds.
- Evidence root: `.runtime/overnight-payroll-new-cutoff-20260721-144322/`.
- Same local DEV lane was used: API `127.0.0.1:3001`, app `127.0.0.1:5175`, and canonical DEV DB `127.0.0.1:55435`. No production mutation and no Cloudflare tunnel changes.
- Workbook intake:
  - All provided new-cutoff XLSX files were inventoried.
  - HRIS Payroll Computation workbooks were encrypted; `officecrypto-tool` decrypted them into the evidence folder after verifying SheetJS/ExcelJS are not the right decrypt-first path for modern encrypted XLSX.
- Applied for July 15 (`2026-06-26` to `2026-07-10`, pay date `2026-07-15`):
  - Biometrics attendance seed from `Biometrics Data_Jun 26 - Jul 10.xlsx`.
  - Fast approved timesheet/line seed from the seeded attendance.
  - Scoped OT metadata repair from `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx`.
  - Scoped mass-upload seed from `Compensation Mass Upload 07.15.26.xlsx` and `Deduction Mass Upload 07.15.26.xlsx`: 1,307 EmployeeBenefit rows and 65 EmployeeLoan rows applied. Nineteen employee codes stayed unmatched.
- July 15 post-seed comparison still failed the generate gate: 859 workbook rows, 838 employees matched, 824 approved timesheets found, 0 exact/tolerance matches. Remaining categories: `SOURCE_MISSING_APPROVED_OT=553`, `SOURCE_MISSING_ALLOWANCE=124`, `SOURCE_MISSING_MANUAL_ADJUSTMENT=73`, `SOURCE_MISSING_DEDUCTION_OR_LOAN=43`, `HRIS_LOGIC_MISMATCH_REPAIRABLE=25`, `TIMESHEET_NOT_FOUND=14`, `EMPLOYEE_NOT_FOUND=21`, `SOURCE_MISSING_STATUTORY_CONFIG=6`.
- June 30 (`2026-06-11` to `2026-06-25`, pay date `2026-06-30`) stayed dry-run only:
  - No biometrics workbook exists in `docs/new-cutoff`.
  - DEV has no attendance/timesheets for the period.
  - Compensation upload has unmapped `INC` code across 816 rows; do not infer its payroll treatment without HR/source confirmation.
- July 30 (`2026-07-11` to `2026-07-25`) remains biometrics-mapping-only because no HRIS Payroll Computation comparator workbook was provided.
- Validation: `hris-api npm run test:regression:payroll-source-truth` passed 52 specs; `hris-api npm run typecheck` passed.

# 2026-07-22 Merge Users Selected-ID Matrix Review Handoff

- Status: `GREEN_NO_WRITE_EXECUTED`. The merge review flow was verified through the real non-mutating plan endpoint and browser modal, but the real merge job was not started.
- User problem addressed: the prior â€œNeeds decisionâ€ view was misleading because it could show duplicate rows for the same unique device ID. The review modal also hid the most important operator question: what selected ID writes from which source device to which target devices, and whether fingerprint/face will be copied.
- Frontend changed: `mergeList=issues` now renders one row per unique selected ID. The final review modal shows metrics for selected unique IDs, peer copy attempts, fingerprint gaps, face gaps, and conflicts resolved; per-target and per-source matrices; and a full selected-ID write matrix with physical source, targets, biometric source evidence, selected-device coverage/gaps, copy count, and an Edit action back to the row before starting.
- Backend changed: device-user merge job progress now includes `writeMatrix` and uses that matrix for `totalWrites`, so the job polling contract can match the final review counts. The matrix includes selected unique IDs, total writes, fingerprint gaps, face gaps, per-target/per-source summaries, and per-row source/target/coverage details.
- Browser proof: Playwright on `http://localhost:5175/admin/configuration/devices?action=device-users&syncPanel=users` authenticated as `admin@bandai.local`, hit `POST /api/device/hikvision/sdk-users/merge/plan`, used recommended sources, and opened the final review without pressing Start. The modal showed `754` selected unique IDs, `3,770` peer copy attempts, `3,493` fingerprint gaps, `3,655` face gaps, `1093/1093` conflicts resolved, `Writes by target device`, `Sources used`, `Selected ID write matrix`, `Physical source`, `Fingerprint`, `Face`, and `Edit`. Row proof for ID `1`: fingerprint `Source 2`, `5/6 devices; 1 gap`; face `Source 1`, `6/6 devices; aligned`; copy `5`.
- Validation: frontend contract test passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend merge-helper tests passed 12/12; backend typecheck passed; `git diff --check` passed with only CRLF notices.
- Evidence root: `.runtime/merge-users-ui-proof-20260722-035213/`.

# 2026-07-22 Merge Users Running-State Stage Repair Handoff

- Status: `CODE_VALIDATED_NO_NEW_WRITE_EXECUTED`.
- User problem addressed: after pressing Start, the merge modal still showed review/edit controls below the running progress card. This was misleading because recommended sources, selected rows, and scope are no longer editable once the job exists.
- Frontend changed: `enroll.tsx` now gates the review/editor body with `!hasSdkMergeJob`. While a job exists, the modal renders only the job monitor plus a `Locked job scope` section from backend `writeMatrix`, including selected unique IDs, peer copy attempts, fingerprint gaps at start, face gaps at start, targets receiving copies, and physical sources used.
- Validation: focused frontend UI contract passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend typecheck passed.
- Boundary: no additional real merge job was started during this repair. Browser proof against the exact operator-visible job needs the active `mergeJobId` or a fresh approved job run.

# 2026-07-22 Merge Users Live Progress Truth Repair Handoff

- Status: `LIVE_JOB_INSPECTED_PROGRESS_UI_REPAIRED`.
- Live job inspected: `d4fe5561-64f7-4349-b53e-922486c7436b`. API still returned `processing`, `totalWrites=3770`, `processedWrites=565`, `successfulWrites=0`, `failedWrites=0`, `results=[]`, `startedAt=2026-07-21T19:54:47.863Z`. The honest interpretation is that the backend is still inside the long device-copy call and has not returned actual per-target write rows.
- UI repair: running merge card now shows `Progress estimate` instead of `Completed` while processing. It also shows `Current phase`, `Elapsed`, `UI polling`, and `Backend update`, plus explicit copy that Applied/Needs attention stay zero until per-target results return and devices are reread.
- Backend repair: merge job updates now stamp `updatedAt`; frontend type accepts `updatedAt`.
- Validation: focused frontend contract passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend typecheck passed.

# 2026-07-22 Main Entrance A-F Health and Local Bootstrap Repair Handoff

- Status: `FULFILLED_WITH_PUBLIC_WARNING`.
- DB comparison: K3s DEV has exactly six active Main Entrance rows: B `.20`, A `.21`, C `.22`, D `.23`, E `.24`, F `.25`. All share HTTPS `443`, Hikvision SDK `8000`, and the same governed runtime shape. `.24` was not offline because of a malformed row.
- Root cause: `scripts/start-hikvision-remote-device-tunnel.ps1` and `hris-api/scripts/ensure-hikvision-remote-device-tunnel.cjs` defaulted to `.20-.23`; the running tunnel/env map confirmed only those four. Local health for `.24/.25` consequently used `resolved_runtime_endpoint` and failed from Windows, while K3s health was online.
- Code repair: default device IPs now include `.24/.25`; predev and manual restart labels say `.20-.25`; the focused contract asserts all six.
- Runtime proof: the regenerated tunnel has 18 working forwards. After local API restart, A-F quick health all returned `online`, `reachable`, `source=env_tunnel_map`. Full `.24/.25` checks returned `systemTime=readable`, `deviceApi=online`, proven by authenticated system-time reads. Playwright captured all six addresses and online health responses at `localhost:5175`.
- Validation: focused Mocha 11/11; API TypeScript typecheck passed; Node syntax checks passed; PowerShell tunnel script parse passed. An accidentally broad repository test invocation surfaced existing unrelated failures and is not counted as a focused regression failure.
- Public boundary: VM LAN app/API are 200 and the protected named tunnel service stayed active. Public hosts returned Cloudflare 503/TLS resets; current QUIC logs show repeated control-stream failures, and additive HTTP/2 attempts from both VM `.19` and `.78` were reset during edge TLS on port `7844`. No tunnel outage or destructive reconfiguration was performed.
- Evidence root: `.runtime/hikvision-six-device-20260722-143712/`.

# 2026-07-22 Merge Listener Truth and Active Progress UI Handoff

- Status: `LIVE_LISTENER_ACTIVE_MERGE_JOB_EXPIRED_NO_SAFE_WRITE_RETRY`.
- Original merge job `a9d3acf7-7dee-406a-9198-c413fbd699d4` remains unproven after API restart. Latest saved poll `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/` returned 404 `SDK user merge job not found or expired`; do not mark it completed and do not infer final six-device sync from counts.
- TEST B bridge was repaired with `scripts/start-host-hikvision-vm-ssh-bridge.ps1 -DeviceIp 192.168.254.110 -HttpListenPort 58180 -SdkListenPort 58100`; evidence `.runtime/hikvision-vm-ssh-bridge/20260722-151306/`. VM/host ports bind and SDK TCP connects on `58100`; HTTP/ISAPI through `58180` still times out.
- Original-six reread after TEST B bridge is invalid for final counts: `.runtime/merge-users-final-run-20260722-042955/fresh-original-six-plan-after-testb-bridge-20260722-151423/operator-summary.json` shows `validForFinalCounts=false`, `unionUsers=694`, `sourceRows=1381`, `plannedWrites=3470`, `errorCount=4` with Main Entrance D `Unauthorized`, TEST B `fetch failed`, Main Entrance C `Unauthorized`, TEST A `fetch failed`.
- Focused Main A-D reread narrowed the LAN blocker to Main Entrance D: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-cd-unauthorized-20260722-151915/operator-summary.json` has `errorCount=1`, D `Unauthorized`. Separate D health proof `.runtime/merge-users-final-run-20260722-042955/device-d-health-20260722-152010/` shows D online with system time readable and `userRead.count=744`; treat the plan error as endpoint/path-specific or transient until a clean reread proves otherwise.
- One post-health A-D plan attempt was invalidated by API restart/connection close; evidence `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-device-d-health-20260722-152052/operator-error.json`. API recovered and health is green through the watcher; do not treat that failed attempt as device count truth.
- Live listener is active independently of the expired merge job. Latest progress `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/operator-progress.json` shows API uptime advancing, listener `running=true`, `sdkState=receiving`, `callbacks=true`, `armed=true`, `deviceSummary=receiving=6`, and source inventory reads from Main Entrance Device E (`cmriu5ab102goi001x9o7nfct`) in 30-user pages through `totalMatches=740`.
- Frontend polish/hardening: the Hikvision listener modal now labels callback receiving separately from armed/listening and shows `Active SDK work` parsed from actual listener JSONL rows. Browser proof copied to `.runtime/merge-users-final-run-20260722-042955/browser-listener-active-work-20260722-151819/` confirms the modal renders raw log tail plus `0 callbacks / 6 armed/listening / 0 login failed / SDK work active` and `Active SDK work`.
- Validation completed: API typecheck passed; frontend Device User UI contract passed; targeted frontend ESLint for `events.tsx` and `enroll.tsx` passed with 0 errors and existing warnings only. Earlier API Hikvision contract still passed in this run context.
- Remaining real gaps: TEST A/TEST B are not final-reread-clean; Main Entrance D needs a clean merge-plan reread after the health proof; the listener/API log contains invalid biometric reconcile retries rejected with 400 because `sourceDeviceId` and `employeeNo` are empty; no safe retry write job was started. Cloudflare stayed active and no SDK files were deleted.
- Final non-mutating reread before handoff: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-d-live-read-20260722-152629/operator-summary.json` remained invalid with Main Entrance D `Unauthorized` and Main Entrance B `Unauthorized`; listener receiving state must not be treated as merge-plan readiness.

# 2026-07-22 Active Merge Job 77df35c4 Live Watch Handoff

- Status: `ACTIVE_JOB_RUNNING_NOT_TERMINAL`. Keep watching; do not close out.
- Original job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is still expired/404. The active job now visible through the API is `77df35c4-6c9b-4a68-9201-8ffc71fcb14b`, plan `328f5da4-71bd-4619-a281-05aaac6329e5`, started `2026-07-22T07:34:04.123Z`. This agent turn did not start that job.
- Important scope mismatch: active job `writeMatrix` reports `selectedUniqueIds=852` and `totalWrites=2551`. That differs from the previously intended selected scope (`569` needs-decision IDs, `2845` peer copy attempts). Do not rewrite history; document this as the scope of the running job and prove final postcondition from a fresh reread after terminal state.
- Evidence root: `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/`. The robust watcher writes full `poll-*.json` files and concise `polls-robust.jsonl`.
- Live progress observed in this window: backend exposed actual `currentStage`, `currentUserKey`, `updatedAt`, real `processedWrites/successfulWrites/failedWrites`, progress events, and `writeMatrix`. Events proved employees/sources/targets/credential stages such as employee `469` from Main Entrance Device E to B/C/F and employee `1340` from Main Entrance Device B to C/E/F. Later polls showed timeout/circuit-skip failures on Main Entrance Device E to C/F paths.
- Latest direct poll in this handoff window showed the job still `processing`; progress had advanced past `407/2551`, with failures rising from real timeout/circuit-skip paths. Treat failures as real rows to group after terminal state; do not claim all copies succeeded.
- Frontend changed: `hris-app/app/routes/admin/devices/enroll.tsx` running merge monitor now shows `Live copy now` from backend `progressEvents` with Employee now, Source, Targets, Credential stage, plus `Latest backend events`. It keeps pre-run review/edit controls hidden while `hasSdkMergeJob` is true.
- Browser proof: `.runtime/merge-users-final-run-20260722-042955/browser-merge-live-work-20260722-1545/operator-proof.json` and `merge-live-work.png` prove the modal shows Merge job running, live copy now, employee/source/targets/credential stage, selected unique IDs, peer copy attempts, latest backend events, and no editable review controls.
- Validation: frontend device-user UI contract passed after the UI patch; targeted frontend ESLint passed with 0 errors and existing warnings; API TypeScript passed after hardening the merge-plan biometric status assignment in `device.controller.ts`.
- Runtime guardrails preserved: API remained healthy, DB forward `127.0.0.1:55435` was rechecked, Cloudflare was not disabled, and no SDK files were deleted. TEST B bridge ports were repaired earlier but TEST B HTTP/ISAPI still timed out and is not final-count proof.
- Next required loop: keep polling job `77df35c4-6c9b-4a68-9201-8ffc71fcb14b`; if `updatedAt` stalls over 2 minutes, inspect `.runtime/local-api-watch/latest.log`, DB forward, and VM listener logs; if terminal failed, group failed rows by user/source/target/error; if terminal completed/attention, run a fresh non-mutating reread/merge plan for the same devices before claiming any final counts.

# 2026-07-22 Merge Job 77df35c4 Terminal Failed-Stale Handoff

- Status: `TERMINAL_FAILED_STALE_NO_SAFE_AUTO_RETRY`.
- Terminal poll evidence: `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/terminal-poll-20260722-155537.json`.
- Backend terminal state: `status=failed`, `currentStage=failed_stale`, `processedWrites=428`, `successfulWrites=361`, `failedWrites=67`, `totalWrites=2551`, message `Device-user merge worker is no longer active after API restart. Last progress was persisted; start a fresh merge for remaining failures only.`
- This is not completion. The API restarted and the durable snapshot correctly refused to keep pretending the worker was active.
- Failed rows were inspected from `.runtime/merge-ledger/77df35c4-6c9b-4a68-9201-8ffc71fcb14b/`: 361 success ledger rows and 67 failure ledger rows. Failure groups: E -> F 31, E -> C 31, B -> E 3, B -> C 1, B -> F 1. Failure status groups: 56 `circuit_skip`, 9 `timeout`, 2 `error`.
- Fresh four-device B/C/E/F plan after failure closed at the request boundary and was saved as invalid evidence under `.runtime/merge-users-final-run-20260722-042955/fresh-bcef-plan-after-77df35c4-failed-stale-20260722-1556/operator-error.json`.
- Pair reread evidence root: `.runtime/merge-users-final-run-20260722-042955/pair-rereads-after-77df35c4-failed-stale-20260722-1559/`.
- Pair reread results after terminal failure:
  - E-C: valid reread, E `740`, C `740`, `unionUsers=740`, `missing=0`, `plannedWrites=0`, conflicts `588`.
  - E-F: valid reread, E `740`, F `687`, `unionUsers=852`, `missing=277`, `plannedWrites=277`, conflicts `85`.
  - B-E: valid reread after DB-forward confirmation, B `687`, E `740`, `missing=53`, `plannedWrites=53`, conflicts `725`.
  - B-C: valid reread, B `687`, C `740`, `missing=53`, `plannedWrites=53`, conflicts `468`.
  - B-F: valid reread, B `687`, F `687`, `unionUsers=837`, `missing=300`, `plannedWrites=300`, conflicts `579`.
- Safe retry boundary: no `retryPlanId` was provided; the active job scope already differed from the intended operator scope; and fresh remaining plans still carry conflicts/source-choice decisions. Do not start another write job by guessing `applyAll` or recommended sources. A safe retry requires a reviewed remaining-scope plan or a backend-generated retry plan that locks only remaining actionable rows.
- Validation during this pass: API typecheck passed after the biometric status literal hardening; frontend device-user contract passed; targeted frontend ESLint passed with 0 errors and existing warnings. Browser proof of the running modal is under `.runtime/merge-users-final-run-20260722-042955/browser-merge-live-work-20260722-1545/`.

# 2026-07-23 Overnight Merge Device Users Owner Loop Handoff

- Status: `PARTIALLY FULFILLED`. Evidence root: `.runtime/merge-device-users-overnight-20260722-205845/`; full closeout: `WAKEUP-REPORT.md`.
- Fresh accepted scope was Main Entrance B/A/D/E/F. Main Entrance C was excluded after repeated `EHOSTUNREACH` user reads; TEST A/B remained outside the proven normal HTTP/SDK scope.
- Fresh before/after physical counts: B `687→812`, A `697→813`, D `744→849`, E `740→822`, F `715→748`. Device records increased `3583→4044` (+461); unique union stayed 865; peer gaps fell `742→281`.
- Final plan `3e08ac56-2f8f-4b91-8c69-b9eed346df95` read all five devices cleanly with zero errors. All remaining 281 peer gaps are on 205 IDs with unresolved conflicts; zero conflict-free rows remain. The loop stopped rather than guessing source identity fields.
- Biometric boundary: zero readable raw fingerprint records and zero readable raw face records were available. Final evidence is 1,746 fingerprint count-only records, 1,351 face count-only records, and explicit not-enrolled rows. Nothing count-only was called synchronized raw data.
- Failure-only retry was proven: canary timeouts were retried as only eight remaining rows; seven were ledger successes and the eighth immediate-verification failure was subsequently present on physical reread. Later stale-inventory false noops were detected by fresh reread, repaired in code, and retried rather than accepted.
- Corrected jobs applied 280/280 physical writes with zero already-matched and zero failures: `f457c844...`, `32dea565...`, `5c812f2b...`, `24e40a51...`.
- Repairs pushed to `develop`: `6977afd`, `8a52316`, `a32f264`, `a037f4b`, `fb8750e`. VM ansible/GitOps runtime proved exact deployed commit `fb8750e`; the named Cloudflare tunnel stayed active.
- Close health: canonical `127.0.0.1:55435` PostgreSQL handshake and Prisma query pass; local API health/login/auth-me pass; frontend `:5175` passes; public DEV health passes; all 18 A–F HTTP/HTTPS/SDK forwards pass and remain running.
- Validation: API typecheck pass; 30 focused Hikvision contracts pass; Device Users UI contract pass; targeted frontend ESLint 0 errors; deployed headless Playwright terminal-job proof pass. Full frontend typecheck has unrelated existing failures and was not called green.

# 2026-07-23 Overnight Merge Fresh Revalidation Handoff

- Status: `PARTIALLY FULFILLED`; evidence `.runtime/merge-device-users-overnight-20260723-050702/`; use its `WAKEUP-REPORT.md` as the current closeout.
- Previous five-device final-count evidence is historical only. Fresh read-only plans were unstable and invalid: `1d1ff7d3...` was 4/5 valid with 1,132 conflicts; `f062afa4...` was 1/2; `2cd6cd3c...` was 1/5 after DB transport loss; `39f0ab6c...` was 3/5 with 1,081 conflicts and 186 missing target records.
- Zero writes were attempted. There was no safe canary or reviewed remaining-scope matrix, and no circuit/timeout was counted as success.
- Listener repair was deployed and freshly armed A/B/D/E/F; C remained login error 7. The final SSH path later failed three direct-LAN attempts and repeated Cloudflare Access banner exchanges, while the already-established host tunnels and reverse bridge remained non-destructively preserved.
- Runtime/API repairs are covered by focused tests: 37 API contracts, 13 UI/events contracts, the PowerShell bridge contract, and API typecheck passed. Controlled `npm run dev` recovered health without operator action.
- Final browser proof is deliberately red: login and Sync Center pass, Merge says 0/8 available, and Listener says status unreachable. Do not reuse the earlier green browser state as current truth.
- Required next condition for any future write is a fresh zero-read-error plan with explicit conflict adjudication and a physical canary/reread. This is not operator homework for the current run; it is an external connectivity/decision boundary.

