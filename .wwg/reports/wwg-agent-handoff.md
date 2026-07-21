# WWG Agent Handoff

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
  - `browser-review-sync-dialog.png/.txt`: review modal shows `718 enrolled · 627 raw · 91 missing_raw_blob` and `356 enrolled · 311 raw · 45 missing_raw_blob`.
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
# 2026-07-19 — Raw fingerprint enrollment custody race repaired

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
