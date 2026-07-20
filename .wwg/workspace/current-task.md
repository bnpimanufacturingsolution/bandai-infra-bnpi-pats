# Current Task

## Latest Task Addendum - 2026-07-21 Four Hikvision devices online/armed

- Task mode: Mixed live runtime repair, native listener regression repair, and evidence closeout.
- Evidence: `.runtime/hikvision-four-device-online-20260721-064751/`.
- Runtime repaired:
  - Canonical VM access used `ssh project-truth-hris` after direct LAN SSH to `10.184.37.19` timed out from the Windows host.
  - VM direct TCP to `10.184.37.20`, `.21`, `.22`, and `.23` passed on ports `80`, `443`, and `8000`; no extra device bridge was required for the VM listener.
  - Host local API reverse `VM 127.0.0.1:53001 -> Windows 127.0.0.1:3001` was restored; VM `/health` through `53001` returned healthy.
  - The managed `project-truth-hikvision-hot-reload-listener.service` was rebuilt/restarted after deploying the fixed native listener source.
- Device proof:
  - HRIS config contains the four target Hikvision rows only as saved addresses `10.184.37.20`, `.21`, `.22`, `.23`, all HTTPS `443` with SDK `8000`.
  - Final API health returned `online` for all four target devices using the local tunnel map while preserving saved addresses.
  - Final listener/readiness API returned green readiness and all four listener devices with `lastLoginOk=true`, `armed=true`, and `receivingCallbacks=true`.
  - Raw VM logs show fresh `sdk_login`, `sdk_alarm_arm`, `device_armed`, `acs_alarm_received`, and successful callback post results for the target devices in this run.
  - Playwright against `http://127.0.0.1:5175/admin/configuration/devices` found all four target IPs present with online/ready/armed text nearby.
- Validation:
  - VM native build passed: `HIKVISION_LINUX_SDK_ROOT=... bash scripts/build-hikvision-biometric-service.sh`.
  - Focused backend contract passed: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` (`14` passing).
  - Focused listener-status helper passed: `hris-api/tests/hikvision-listener-status.helper.spec.ts` (`10` passing).
  - Broad `npm --prefix hris-api test -- ...` was accidentally expansive and failed on unrelated existing suite drift plus stale compose DB `10.184.37.19:15433`; focused reruns above passed.
- Boundary:
  - Cloudflare tunnel remained active.
  - No stale `.167`, `.168`, `.102`, or old rows were used as the four-device proof.
  - A recommendation was added for the `ensure-device-live-path.ps1` API reverse bridge argument-list bug discovered during recovery.

## Latest Task Addendum - 2026-07-20 Device Events saved view fast/truthful listener UX

- Task mode: Mixed admin UX/performance regression repair.
- Implemented:
  - Saved Device Events row/facet loading remains separate from listener/live-proof and quick device-health checks.
  - Hikvision listener status now uses direct LAN SSH before Cloudflare fallback and a short cache so readiness/listener UI do not stack repeated VM reads.
  - Device health `quick=true` now uses bounded TCP reachability (`tcpReachability`) and skips slow Hikvision system-time/source-count reads; full health can still perform deeper reads.
  - Armed-but-quiet live proof copy now says `Ready for tap proof` / `listener armed, waiting for a fresh tap` instead of stale/broken wording.
  - Saved Events UI now shows a separate `Device health` line and explicitly states reachability is separate from listener armed state and tap proof.
- Evidence:
  - API timing proof: `.runtime/device-events-stale-fast-20260720-211150/summary.json`.
  - Browser proof: `.runtime/device-events-stale-fast-20260720-211150/browser/playwright-settled-clean-result.json` and `saved-events-settled-clean.png`.
- Proof highlights:
  - Saved rows endpoint returned in `2.629s`; facets in `1.924s`.
  - Listener status repeat call used the short cache; listener/readiness no longer blocks the saved ledger render.
  - Quick health server durations for sampled devices were `0ms`, `1ms`, `1214ms`, and `1327ms`, all with `provenBy=tcpReachability` and `Skipped in quick health mode`.
  - Browser settled text showed `Ready for tap proof`, `4 online / 0 degraded / 3 offline`, the clean `/` health separator, and saved rows; it did not contain `Live path needs proof` or `not checked for a long time`.
- Validation:
  - `hris-api` `npx tsc --noEmit --pretty false --incremental false --listFiles false` passed.
  - Backend focused tests passed: `25` passing for listener-status helper, readiness, listener fast-path, and quick-health contracts.
  - Frontend focused contract passed: `12` passing for `app/lib/device-events-page-contract.test.ts`.
  - Frontend `typecheck:test` remains blocked by unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture drift.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-20 Remote local-dev Hikvision tunnel proof

- Task mode: Focused local-dev runtime access repair for far-away work against a LAN-only Hikvision device.
- Goal: Keep the saved HRIS device row visible as `10.184.37.21:443` / SDK `8000`, while allowing a Windows localhost API launched by `npm run dev` to reach the device through SSH forwards.
- Implemented:
  - Added `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` support for Hikvision HTTP/ISAPI base URL resolution, device health network probes, and SDK endpoint selection.
  - Added `scripts/start-hikvision-remote-device-tunnel.ps1`, which starts `127.0.0.1:10080 -> 10.184.37.21:80`, `127.0.0.1:10443 -> 10.184.37.21:443`, and `127.0.0.1:18000 -> 10.184.37.21:8000`, then writes the ignored local API env line.
  - Preserved the tunnel-map line when `hris-api/scripts/ensure-bnpi-db-access.cjs` regenerates `hris-api/.env.development.local`.
- Proof:
  - Tunnel helper returned `running`, PID `17684`, with TCP OK for `127.0.0.1:10080`, `:10443`, and `:18000`.
  - Local API `GET /api/device/cmrht5s2w00ei7zgsre8y3o5n/health` returned `summary.status=online` for Main Entrance Device A, while the response still showed saved device address `10.184.37.21` and `checks.network.source=env_tunnel_map`.
  - Playwright against `http://localhost:5175/admin/configuration/devices` found Main Entrance Device A and `Online`; all seven device health calls returned HTTP 200.
- Evidence:
  - `.runtime/hikvision-remote-device-tunnel-last.json`
  - `.runtime/remote-device-tunnel-proof-20260720-161455/device-a-health-with-tunnel-map.json`
  - `.runtime/remote-device-browser-proof-20260720082234/summary.json`
- Boundary:
  - On the current LAN, `ssh project-truth-hris` through Cloudflare still reset at the edge, so the helper used direct LAN fallback `infra@10.184.37.19` for this proof. Far-away work should use `project-truth-hris` when Cloudflare Access is reachable from that network.

## Latest Task Addendum - 2026-07-20 TEST A zero-missing recovery boundary

- Task mode: Agent-owned live recovery attempt, root-cause classification, and UI clarity repair.
- Evidence: `.runtime/test-a-zero-missing-raw-recovery-20260720-113320/`.
- Runtime/API proof:
  - Local API was restarted with `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=1` and proven healthy.
  - Raw-only sync job `48f654ff-8ed0-4ccb-8470-8f51d9654dbb` completed for TEST A in `biometrics_only` mode.
  - Job processed `136` missing biometric credentials, captured `0`, cached `938`, and failed `136` because the live panel read returned no raw bytes.
  - Failure log groups: `45` `no_face_on_device` row failures and `46` `no_fingerprint_data_from_device` row failures; fingerprint credential-slot missing remains `91`.
- SQL custody after recovery is unchanged: `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only; fingerprint `718` inventory slots / `628` raw stored / `91` raw missing; face `356` inventory / `311` raw stored / `45` raw missing.
- Direct capture proof for rows `83`, `839`, `984`, `1008`, `1076`, and `1143`: all six fingerprint captures returned compact HTTP `422` with `no_fingerprint_data_from_device`; all six face captures returned compact HTTP `422` with `no_face_on_device`.
- Deep ISAPI probe proof: control user `1004` returned fingerprint bytes in `13` probe shapes, proving the read path/parser can still retrieve raw data; missing users `8`, `83`, and `984` returned `0` hits across `54` probe attempts each.
- Classification: remaining gaps are live no-data/stale-count inventory claims, not recoverable raw blobs in current evidence. Counts are not bytes, and no blob was fabricated from `numOfFP`, `numOfFace`, or stored inventory metadata.
- UI clarity repair: the Sync device users review modal now labels counts as `Fingerprint inventory vs raw bytes` and `Face inventory vs raw bytes`, with `inventory enrolled / raw stored / raw no-data/missing` wording and explicit copy that no blobs are fabricated.
- Same-environment Playwright proof: local app `http://127.0.0.1:5175` opened TEST A Sync Center and verified the clarified modal copy (`playwright-modal-copy-proof.png`, `.txt`, `.json`).

## Latest Task Addendum - 2026-07-20 TEST A missing raw root-cause follow-up

- Task mode: Focused biometric custody root-cause repair with raw SQL, direct live device/API proof, backend contract tests, and same-environment Playwright proof.
- Evidence: `.runtime/test-a-missing-raw-root-cause-20260720-111215/`.
- Current TEST A SQL custody aggregate:
  - `394` DeviceUser rows.
  - `348` rows are raw-ok or not enrolled.
  - `45` rows are missing both fingerprint and face raw blobs.
  - `1` row is missing fingerprint raw only.
  - Fingerprint slots: `718` reported, `628` stored raw templates, `91` missing raw blobs.
  - Face slots: `356` reported, `311` stored raw faces, `45` missing raw blobs.
- Live capture classification for visible/sample rows `83`, `839`, `984`, `1008`, `1076`, and `1143`: all six are stale/count-only inventory rows where `UserInfo` reports enrolled counts/face URL but live raw endpoints return `no_fingerprint_data_from_device` and `no_face_on_device`. No parser/merge/probe code bug was proven for these rows, and no raw blob was fabricated.
- Code bug repaired in this pass: manual raw fingerprint/face capture endpoints no longer return HTTP `422` with a `status: "success"` body on no-data. They now return compact `status: "error"` bodies with `capture.reason`, preserving truthful no-data classification for UI/API consumers and avoiding large stale metadata payloads on failure.
- Validation: focused backend helper/contract tests passed (`20` passing), and `hris-api` `tsc --noEmit --pretty false` passed.
- Browser proof: local Playwright against `http://127.0.0.1:5175` opened TEST A Device Users Sync Center and issued the same local API calls through the authenticated browser context. All twelve sample capture calls returned compact HTTP `422` / `status: "error"` bodies with exact no-data reasons.

## Latest Task Addendum - 2026-07-20 TEST A raw biometric repair loop

- Task mode: Mixed biometric custody repair, API/UI regression repair, and live device proof.
- Device truth: TEST A was identified by API/DB as `cmrlgqsjv000oob01165tbd8n` (`192.168.254.102:443`, Hikvision). DeviceUser remains the durable current raw biometric custody plane; plain device person id is `DeviceUser.vendorUserId` / `employeeNo`.
- Root cause repaired: Hikvision bulk `FingerPrintUpload` can return only one template while `UserInfo.numOfFP=2`; the helper now probes per-finger when raw stored count is below reported template slots and merges prior + newly fetched templates without fabricating bytes.
- Raw-only sync proof:
  - Before focused repair: source users `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `325`, fingerprint missing `393`, face reported `356`, face raw `311`, face missing `45`.
  - Job `bbccf2b6-75be-4e78-a7fa-e1a683149c02` captured `266` additional raw payloads and reduced fingerprint missing to `120`.
  - Local recovery setting `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=2` removed transient `Unauthorized` failures; job `834d6273-74d8-416f-aecf-8fd92430a062` captured `29` more and reduced fingerprint missing to `91`.
  - Final preview: source users `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `627`, fingerprint missing `91`; face reported `356`, face raw `311`, face missing `45`.
- Remaining boundary: per-row sample repair for users `1008`, `1076`, and `1143` returned HTTP `422` with exact bodies `no_fingerprint_data_from_device` and `no_face_on_device`. These rows remain `missing_raw_blob`; no raw blobs were fabricated.
- UI proof: Sync review modal shows raw custody counts (`718 enrolled · 627 raw · 91 missing_raw_blob`, `356 enrolled · 311 raw · 45 missing_raw_blob`) and details modal shows `2 of 2 stored` for repaired user `1004`; user `1008` shows `2 missing_raw_blob`, `Repair: capture raw`, face count-only raw missing, and `Repair: capture face`.
- Evidence: `.runtime/test-a-raw-repair-loop-20260720-103434/`.

## Latest Task Addendum - 2026-07-20 Raw biometric package export/import alignment

- Task mode: Mixed owner-requirement correction across Device Users export/import API, admin UI, contracts, and WWG truth.
- Owner correction: the active Hikvision Device Users sync/export/import journey must not require encrypted bundles or passphrases. It must copy/export evidenced raw fingerprint `fingerData` blobs and raw face/image blobs when present.
- Required custody behavior:
  - DeviceUser remains the durable current raw biometric custody plane.
  - Matching DeviceEvent payloads can provide fallback raw custody for lifecycle ledger journeys.
  - CSV/Excel/Package JSON use raw blob columns/statuses, not `encrypted:v2` envelope cells.
  - Missing bytes stay explicit as `not_enrolled`, `missing_raw_blob`, or `not_requested`; no values are fabricated from credential counts.
- Stale context: 2026-07-14/2026-07-15 encrypted envelope/passphrase export proof is historical for this journey and must not drive current modal copy, API requirements, or tests.

## Latest Task Addendum - 2026-07-19 C++-first create/enroll raw wire truth

- Task mode: Mixed regression repair across C++ listener identity enrichment, biometric custody, realtime, and admin UI truth.
- Evidence: `.runtime/cpp-first-create-enroll-raw-20260719-200043/`.
- Listener truth: major=3 create/enroll ACS may carry empty `dwEmployeeNo`; do not claim first-callback plain identity. Serialized, completion-checked UserInfo inventory scans now prevent interleaved partial baselines from producing false deltas. A post-rebuild create of `99200129` resolved through a one-person inventory delta and posted plain identity; that new user honestly had `numOfFP=0` and no face.
- Enrollment truth: TEST A person `15` has `numOfFP=1`, `numOfFace=0`. Rewriting person 15's own template (donor=false) proved status 6, sticky read-back, and one 684-character raw template. Existing-person ACS remained empty/zero-template, then HRIS logSearch resolved plain `15` and automatic ISAPI capture stored the raw template on DeviceUser and FINGERPRINT_ENROLLED DeviceEvent payloads without manual Capture.
- Realtime/UI truth: `device-event:saved` delivered saved lifecycle rows with plain `employeeNo=15`; opaque tokens stayed only in payload evidence. Device user details renders stored raw fingerprint data and labels manual capture as repair-only.
- Face boundary: person `15` has no face on the device, so raw face remains honestly absent. Earlier person `1` face proof is historical and is not reused as proof for this path.

## Latest Task Addendum - 2026-07-19 Create+Enroll raw blob ledger journey

- Task mode: Meaningful feature / journey truth + live proof.
- Evidence: `.runtime/create-enroll-raw-ledger-journey-20260719-194709/summary.json`
- Exit: `GREEN_WITH_REAL_BLOCKER` (synthetic sticky clone still device anti-dupe; physical unique enroll out of scope).
- Proven:
  - Ledger: `USER_CREATED` + `FINGERPRINT_ENROLLED` plain `16` same DeviceUser
  - DeviceUser raw FP: persons `15`/`16`/`1` with 684-char base64 (not AES)
  - DeviceUser raw face: person `1` 14019-byte JPEG when `numOfFace=1`; `15`/`16` honest no-face
  - Capture API works with `req.organizationId`
  - UI: always refetch DeviceUser on details open; raw FP + face sections
- Auto path: schedule raw FP (+ face when present) after plain identity; enrich preserves raw
- Recommendation: Physical panel unique FP enroll for new person sticky (Proposed — prior REC).

## Latest Task Addendum - 2026-07-19 Backend helper module resolution repair

- Task mode: Backend TypeScript regression repair.
- Reported symptom: VS Code/TypeScript showed `TS2307` in `hris-api/app/device/device.controller.ts` for dynamic imports of `device-user-raw-fingerprint.helper` and `hikvision-event-contract.helper`.
- Root cause: `hris-api` uses `module: Node16` / `moduleResolution: node16`; dynamic imports need the emitted `.js` specifier. Static imports in the same tree remained resolvable, but the extensionless dynamic imports failed.
- Implemented:
  - Changed the three dynamic helper imports in `device.controller.ts` to `.helper.js`, matching existing project import style.
  - Added a narrow local type for recent lifecycle event backfill rows in `device-person-token.helper.ts`, clearing the strict type errors exposed after the missing modules were fixed.
- Proof:
  - `npx tsc --noEmit --pretty false` passed in `hris-api`.
  - Focused backend tests passed 63/63: `device-events-api-contract`, `device-person-token.helper`, `device-user-raw-fingerprint.helper`, and `hikvision-event-contract.helper`.
  - Focused backend lint passed for `device.controller.ts` and the three helper files.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Device Events saved filter facets

- Task mode: Admin UI/data-truth regression repair.
- Operator correction: Category and Action dropdowns on `/admin/configuration/devices/events?view=saved` must come from the saved `DeviceEvent` ledger/schema truth, not a guessed hard-coded action-to-category map.
- Implemented:
  - Saved events API summary now returns `byActionCategory`, grouped from persisted `device_events.eventAction + eventCategory`.
  - Device Events UI loads a separate saved-ledger facet query for the current device/time/search/status/source scope, excluding Category/Action filters, so dropdown choices reflect the whole saved row set for that scope.
  - Selecting an action now uses the saved-row action/category aggregate when it has one real parent category. Live proof showed `SYNC_SIGNAL -> RUNTIME`, so the UI no longer forces the stale `DEVICE_HEALTH` mapping.
- Proof:
  - API contract: `tests/device-events-api-contract.spec.ts` passed 6/6.
  - Live endpoint: `.runtime/device-events-filter-facets-20260719-192707/saved-events-facets-proof.json` showed total `9,759`, `SYNC_SIGNAL: { RUNTIME: 6,344 }`, and real category/action counts.
  - Headless browser: `.runtime/device-events-filter-ui-20260719-192858/ui-proof.json` showed Category options from saved rows (`Attendance`, `Enrollment`, `Runtime`, `Unknown vendor`, `User management`) and no empty `Device health`; Action options included `Sync signal`.
  - Headless browser selection: `.runtime/device-events-filter-select-20260719-193038/select-proof.json` showed selecting `Sync signal` sets `eventAction=SYNC_SIGNAL&eventCategory=RUNTIME`.
- Existing unrelated validation drift:
  - `hris-app` focused lint still fails on the two pre-existing `jsx-a11y/label-has-associated-control` errors in Device Events and many existing warnings.
  - `hris-app` source-contract test still fails on a pre-existing expectation that `events.tsx` contains `useDeviceHealthMap`.
  - `hris-api` typecheck remains blocked by pre-existing missing module `../../helper/device-user-raw-fingerprint.helper` and existing helper type errors.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Keep-ready reverse-tunnel stability

- Task mode: Regression repair + live VM/API proof.
- Reported symptom: TEST A repeatedly appeared to lose its reverse tunnel while the VM-side `ping 192.168.254.102` hung and the listener modal alternated between armed and login-failed states.
- Root cause:
  - SSH reverse forwarding exposes selected TCP ports on VM loopback; it does not route ICMP or make `192.168.254.102` pingable from the VM.
  - Listener status read only 80 JSONL lines. One seven-device SDK cycle can exceed that window, so working TEST A evidence scrolled out while later off-LAN login failures remained.
  - `Keep ready ON` treated every armed-but-quiet period as a forced re-arm condition, restarting a healthy listener every two minutes.
- Implemented:
  - Listener status summarizes a 400-line evidence window (while returning only 80 recent lines) and resets per-device sticky state at each new `device_config_loaded` attempt.
  - Keep-ready decision logic preserves a running armed listener while quiet and force-rearms only a stopped, unarmed, or genuinely login-failed listener. Database-only repair does not restart an armed listener.
  - Armed/quiet readiness copy now asks for one physical tap to refresh receiving proof instead of instructing repeated re-arms.
- Live proof:
  - Windows reached TEST A `192.168.254.102` on TCP `8000` and `443`.
  - VM loopback `53001`, `59000`, and `59443` stayed open; listener and VM-managed Cloudflare services stayed active.
  - Listener PID `2458362` remained unchanged from `11:04:27Z` through `11:09:55Z`, beyond the former two-minute restart cycle.
  - Admin status returned running/armed, safe-to-tap, and fresh successful HRIS callback posts; quiet remained yellow rather than being misreported as tunnel failure.
  - Focused tests: Keep-ready 3/3, listener/readiness 17/17, listener-modal Playwright 1/1.
- Existing unrelated validation drift: Full backend typecheck is blocked by the pre-existing missing module `helper/device-user-raw-fingerprint.helper`; targeted lint reaches two pre-existing empty-label accessibility errors in Device Events. Focused changed behavior is green.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Create+Enroll architecture reality marathon

- Task mode: Meaningful feature / wire-path harden + live proof (non-stop marathon).
- Evidence: `.runtime/create-enroll-arch-reality-20260719-183434/summary.json`
- Exit: `GREEN_WITH_REAL_BLOCKER` (not donor fake-green).
- **Root cause of synthetic FP stickiness:** `FingerPrintDownload` HTTP OK but `FingerPrintProgress` `cardReaderRecvStatus=5` `errorMsg=15` when cloning person-15 template onto a new employeeNo (device anti-dupe). Re-read stays `numOfFP=0`.
- **Code:**
  - C++: template enrich after inventory_delta/op-sync; ISAPI write verifies Progress + re-read fingerData
  - HRIS: `writeAndVerifyFingerprintOnDevice` / `parseFingerPrintProgress`; device.controller uses verify path
  - Proof scripts: ban donor-as-success
- **Proven green:** create plain + inventory_delta; person-15 device-owned raw 684; unit 6/6; reverse ports; rebuilt listener with `progressRecvOk`
- **Still open:** physical unique panel enroll for new person sticky F8; live C++ `fingerprintCount>=1` on ACS for person already having FP
- Job card: `docs/00-product/AGENT-PROMPT-create-enroll-architecture-reality-marathon.md`
- Recommendation capture: Physical panel enroll proof for F8 sticky on new person (Proposed).

## Latest Task Addendum - 2026-07-19 Create+Enroll flow C++ EXIT GATE

- Task mode: Meaningful C++ fix + live synthetic proof.
- Commit: `05f4320` on `develop`.
- Evidence: `.runtime/create-enroll-flow-proof-20260719-181730/summary.json`
- C++: full inventory (319 users), delayed identity re-POST, ISAPI FP fallback, arm baseline seed.
- Live G6 quote: `callback_identity_inventory_delta employeeNo=99182448` then `post_result employeeNo=99182448` with `identitySource=inventory_delta`.
- G3–G5: create/enroll plain DeviceUser+events + raw 684-char template (API). Device synthetic FP re-read may still show numOfFP=0 (labeled donor blob path).
- Recommendation capture: Device FP write stickiness after FingerPrintDownload.

## Latest Task Addendum - 2026-07-19 Device Events no-person sync signal copy

- Task mode: Admin UX regression repair + focused smoke proof.
- Operator correction: Saved runtime rows with no person id must not say `Resolving person id...` unless there is actual resolving/pending identity evidence. A Hikvision `SYNC_SIGNAL` can be live capture proof while carrying no person identity.
- Implemented:
  - Device Events table now labels no-id `SYNC_SIGNAL` rows as `No person id on SDK signal`.
  - No-id rows no longer create a Device user deep link/button or show the `Device user` badge; that shortcut appears only when a readable plain device person id exists.
  - Plain device-user navigation remains intact for real ids such as `15`.
- Proof:
  - Focused Playwright: `admin device events labels sync signals without implying person resolution` passed 1/1.
  - Focused Playwright: `admin device events keeps plain device user id separate from padded employee code` passed 1/1.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Live proof EXIT GATE (C++ enrich + synthetic enroll)

- Task mode: Live proof / evidence closeout.
- Evidence dir: `.runtime/live-cpp-enroll-proof-20260719-180128/summary.json`
- Proven green: host TCP/API, reverse :59000/:59443/:53001, rebuilt binary with enrich, listener armed/receiving, synthetic create `99180240` on device, DeviceUser raw template 684 chars (not AES), plain employeeNo on USER_CREATED/FINGERPRINT_ENROLLED ledger rows, API users returns raw.
- ACS live truth: major=3 still often `employeeNo=""`; enrich ran; inventory delta did not always attach plain in-window (`no_new_plain` / baseline). Do not claim ACS first packet always plain.
- Device FP write returned OK but `numOfFP` stayed 0 on re-read (3 retries); raw custody used donor-15 template path with explicit source label.
- Recommendation capture: Investigate C++ inventory pagination / delta when pageEmployees stuck at 30; improve FingerPrintDownload→Upload re-read for synthetic write.

## Latest Task Addendum - 2026-07-19 C++ plain-id enrich + raw templates + anti-assumption WWG

- Task mode: Regression repair + governance + C++ wire-path harden.
- Operator pushback: stop assuming first socket always has plain id; **trace** C++ ACS → POST → socket. Proven: major=3 often empty `dwEmployeeNo`; major=5 taps often plain; logSearch often opaque.
- Governance:
  - `.grok/rules/02-sdk-callback-wire-truth.md` (always-on)
  - `AGENTS.md` hard ban on inventing callback person id
  - principle `evidence-over-assumption.md` Hikvision wire-truth section
- C++ (`hikvision_biometric_service.cpp`):
  - `enrich_hris_job_before_post` before POST: inventory delta multipass when ACS person empty; attach raw FP templates (+ face when card known)
  - Callback JSON: `identitySource`, `fingerprints[]` raw base64, `faceTemplate`/`facePicture`, `fingerprintCount`
- HRIS:
  - Accept callback fingerprints/face → DeviceUser raw store immediately
  - Socket: plain-only `employeeNo`; include deviceUser; UI “Resolving person id…” when empty/resolving
- Rebuild/redeploy listener binary on VM still required for C++ path to run live.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Raw fingerprint template on DeviceUser (not AES)

- Task mode: Bug fix / product expectation correction + live proof.
- Operator correction: on fingerprint enroll, store **raw** base64 fingerData on DeviceUser — do **not** default to encrypted-only custody.
- Implemented:
  - `hris-api/helper/device-user-raw-fingerprint.helper.ts` — ISAPI FingerPrintUpload read, proven TEST A `FingerPrintInfo.FingerPrintList[]` parser, persist to `vendorMetadata.rawFingerprints.templates[].data` (and rawPayload mirror).
  - `enrichEnrollmentLifecycleEvent` schedules raw capture after FINGERPRINT_ENROLLED / USER_CREATED / USER_UPDATED when plain person id is known.
  - DeviceEvent gets pointer/status only (`rawFingerprintCustody`, `raw_on_device_user`); full blobs stay on DeviceUser.
  - Device user details UI shows raw present + first 120 chars preview.
- Live proof (TEST A person `15`, device `192.168.254.102`):
  - `rawPresent=true`, `fingerprintCount=1`, `firstTemplateChars=684`, `isAesEnvelope=false`
  - API `GET /api/device/<TEST A>/users?vendorUserId=15` returns raw templates under vendorMetadata + rawPayload
  - Evidence: `.runtime/raw-fp-live-2026-07-19T09-39-38-797Z/`, `.runtime/user15-raw-fp-viewable.json`
- Focused tests: raw-fingerprint helper + person-token 18/18 pass.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Enrollment identity architecture docs

- Task mode: Docs / architecture sync.
- Goal: Capture operator vision for panel/SDK user create + enroll identity, verify architecture correctness, document exact flows, and provide diagrams so agents stay synced to the spec.
- Written:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` — full spec, identity planes, Flow A/B/C/D, mermaid sequence, acceptance, gaps.
  - `.wwg/wiki/05-architecture/hikvision-enrollment-identity-architecture.md` — WWG architecture twin.
  - Pointer in `docs/HIKVISION_RUNTIME_TRUTH.md`.
- Architecture verdict: Operator vision is correct; implementation is aligned with the happy path and panel-opaque path, with explicit boundary that plain person id may trail the first socket by a few seconds when major=3 has empty `dwEmployeeNo`.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Device Events plain DeviceUser navigation

- Task mode: Bug fix + focused admin UX regression proof.
- Goal: In Device Events, keep the physical device user ID (`DeviceUser.vendorUserId` / `employeeNo`, e.g. `15`) separate from the HRIS employee code display/link (`Employee.employeeId`, e.g. `00015`) so admins can open the Device user details quickly from rows and the details modal.
- Implemented:
  - Saved Device Events API now falls back from `device_events.deviceUserId` to `organizationId + deviceId + employeeNo = device_users.vendorUserId`, so older/healed rows can still return the matching `deviceUser` object when the event has a plain person ID.
  - Device Events UI now carries `deviceUserVendorUserId` separately and uses it for Sync Center deep links (`deviceUserSearch=15&deviceUserDetails=15`) while preserving the Employee record link for matched employees.
  - Device Users panel row type now declares `employeeNo` for the existing deep-link lookup path.
- Proof:
  - Direct local API: `GET /api/device/events?...&query=15` returned rows where `deviceUserId` was `null` but `deviceUser.vendorUserId` was recovered from the plain saved `employeeNo`.
  - Direct local API: `GET /api/device/<TEST A id>/users?vendorUserId=15` returned one TEST A DeviceUser with `vendorUserId=15` and `employeeNo=15`.
  - Focused Playwright: `admin device events keeps plain device user id separate from padded employee code` passed 1/1.
  - Focused backend Mocha: `tests/device-person-token.helper.spec.ts` + `tests/hikvision-callback.controller.spec.ts` passed 17/17.
- Existing unrelated validation drift:
  - Full `hris-app` typecheck remains red on many historical errors outside this Device Events fix; one local Device Users type hole surfaced by the run was fixed.
  - Full `admin-device-events-sync-modal.spec.ts` still has an older Sync logs assertion expecting a `Category` column while the current UI renders `Business area`; the new `15`/`00015` regression passes by name.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Restart-safe Hikvision reverse tunnel + in-app repair

- Task mode: Regression repair + focused admin UX.
- Goal: Recover the Hikvision reverse path after a host/VM restart without requiring the operator to rerun the full API predev sequence or manually choose a device IP.
- Root cause: The device SDK/HTTP reverse forwards and the VM-to-host API callback reverse were bundled into one SSH command. A stale VM `:53001` API listener therefore made the entire command fail before device ports `:59000` / `:59443` could bind.
- Implemented:
  - The host device bridge now owns only DB-resolved device HTTP/SDK forwards; `ensure-device-live-path.ps1` separately owns the API callback reverse.
  - Stale-port recovery inspects privileged `sshd` ownership, kills only the exact stale `infra` SSH session holding the requested ports, and sends multiline repair scripts over `bash -s` to avoid Windows SSH quoting drift.
  - The listener modal shows a compact `Check tunnel` / `Repair tunnel` action only for devices configured to use a reverse path. It calls the existing host-owned prove/repair endpoint and refreshes listener truth; it does not rerun all predev steps.
- Live proof (this host/VM):
  - Host can reach DB device `TEST A` at `192.168.254.102` on `:8000` and `:443`.
  - Device and API reverse paths run as separate SSH sessions; VM loopback listeners `:59000`, `:59443`, and `:53001` are present.
  - Admin prove endpoint returned `proven=true`, readiness green, listener `receiving=true`, and a fresh saved SDK event.
  - Focused Playwright listener-modal smoke passed 1/1; bridge contract passed 4/4; PowerShell parsing passed.
- Boundary: `ping 192.168.254.102` from the VM is not reverse-tunnel proof. SSH reverse forwarding exposes selected TCP ports on VM loopback; it does not route ICMP or the device subnet.
- Existing validation drift: Full `hris-app` typecheck remains red on numerous unrelated historical errors outside the touched Device Events surface; the focused Playwright regression is green.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Smart reverse-bridge IP after reboot

- Task mode: Bug fix + host runtime proof.
- Goal: After PC reboot, `npm run dev` / predev / Keep-ready must auto-pick the reverse-capable Hikvision IP (currently `192.168.254.102` for TEST A) without a manual `HIKVISION_VM_BRIDGE_DEVICE_IP` override, while staying fast.
- Root causes fixed:
  - Fast path accepted any open VM `:59000` even when the local SSH process did not target the resolved device IP (stale after reboot / thrash).
  - Legacy fallback still preferred historical `192.168.254.189`.
  - Resolver ranked DB reverse rows but did not probe which candidate the **host** can reach right now.
- Implemented:
  - `resolve-hikvision-vm-bridge-targets.cjs` now probes host TCP (sdk/http/443/80, ~300–400ms) and ranks `reverseBridge + hostReachable` first. Source becomes `db-reverse-bridge-host-reachable` when LIVE.
  - Fallback order when DB is down: `192.168.254.102` then `192.168.254.189`.
  - `ensure-hikvision-vm-bridge.cjs` fast-paths only when **local bridge matches resolved IPs AND VM :59000 is open**; otherwise stop + rebind.
  - `ensure-device-live-path.ps1` prefers host-reachable targets from the same resolver.
- Proof (this host):
  - Resolver: `TEST A` / `192.168.254.102` / `hostReachable=true` / openPorts `8000,443,80` / score 188.
  - Ensure: detected stale local match, rebound tunnel to `192.168.254.102`, ready in 13.6s.
  - Unit: `tests/resolve-hikvision-vm-bridge-targets.spec.cjs` 3/3.
- Operator note: still no need to set the IP manually for the normal case; optional override remains `HIKVISION_VM_BRIDGE_DEVICE_IP`. After ensure, restart Hikvision listener once if UI still shows pre-reboot arm state.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 SDK enrollment plain person id on callback

- Task mode: Bug fix / runtime identity path + unit proof.
- Goal: When an SDK user create/update (or enroll) callback already carries a plain device person id, apply it on the callback path immediately, socket identity quickly, and always land raw UserInfo metadata on `DeviceUser` — without treating multipass logSearch as the only path.
- Clarified architecture (not a secret second poller inventing people):
  - Live path is still the HCNetSDK ACS alarm callback → `/api/hikvision/callback`.
  - When `dwEmployeeNo` / plain `employeeNo` is present on that callback, HRIS now runs the fast identity path.
  - When the callback is only a major=3 opaque SYNC_SIGNAL (empty person), multipass ISAPI `ContentMgmt/logSearch` still resolves typed USER_CREATED / FP leaves and may map opaque tokens → plain via inventory delta / `DevicePersonToken`. That is follow-up evidence, not a replacement for the SDK callback.
- Implemented:
  - `applyFastEnrollmentIdentityOnSdkCallback` / `isHikvisionEnrollmentLifecycleCallback` in `hris-api/helper/device-person-token.helper.ts`.
  - Immediate `DeviceUser` upsert (stub + HRIS link via `deviceEmpId` / `employeeId` code match), `DeviceEvent` MATCHED/UNMATCHED with plain `employeeNo`, first `device-event:saved` socket.
  - Background `enrichEnrollmentLifecycleEvent` still pulls full UserInfo into `DeviceUser.rawPayload` / `vendorMetadata` and re-sockets.
  - `callback.controller.ts` non-attendance enrollment path uses the fast path and no longer forces `IGNORED` over identity when plain id is applied.
- Proof:
  - Focused Mocha: `tests/device-person-token.helper.spec.ts` + `tests/hikvision-callback.controller.spec.ts` → 17/17 pass.
- Boundary:
  - Plain device person id ≠ HRIS `Employee.employeeId` code unless already linked via DeviceUser / `deviceEmpId`.
  - Empty-person major=3 signals still need logSearch / inventory delta for plain id; we do not invent person numbers.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Hikvision bridge follows DB device address

- Task mode: Bug fix + runtime proof.
- Goal: Stop local predev/Keep-ready from reusing a stale TEST A reverse-tunnel IP when the HRIS Device row already has the current Hikvision address.
- Implemented:
  - Added a DB-backed resolver for host-side Hikvision VM bridge targets.
  - `ensure-hikvision-vm-bridge.cjs` now resolves reverse-bridge devices from HRIS Device rows, prefers rows configured with `ssh-reverse-forward`, and restarts stale tunnels instead of accepting an open SDK port pointed at an old IP.
  - `ensure-device-live-path.ps1` and `restart-local-hris-api-dev.ps1` now follow the same DB-resolved target unless an explicit operator override is supplied.
- Proof:
  - Resolver selected `TEST A` at `192.168.254.102` from the DB.
  - Host live-path ensure reported DB tunnel, SDK reverse, and API reverse all ready for `192.168.254.102`.
  - Prove endpoint returned `proven=true`, listener `armed=true`, `receiving=true`, and fresh SDK event proof.
- Truth sync: Existing Hikvision runtime truth already says the HRIS Device row is the source of configuration truth; this repair aligns predev/Keep-ready scripts with that truth.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-19 Local API predev DB fast path

- Task mode: Focused startup performance repair + regression proof.
- Goal: Make `hris-api` DEV startup claim `127.0.0.1:55435` quickly without changing the VM/K3s database architecture or disabling the VM-managed Cloudflare tunnel.
- Implemented:
  - The DB preflight now checks only the canonical localhost Prisma forward instead of also probing a LAN-bound alias that cannot satisfy the datasource contract.
  - The broad multi-port remote-LAN forward is opt-in and no longer blocks the default DB-specific cold path.
  - Direct LAN SSH is gated by a 600 ms TCP reachability check before SSH authentication; Cloudflare SSH remains the fallback.
  - Forward startup uses readiness polling instead of a fixed multi-second sleep.
  - Port 3001 ownership and DB access checks now run concurrently because they are independent.
- Proof:
  - Focused `ensure-bnpi-db-access` Mocha tests pass 2/2.
  - PowerShell and Node syntax parsing pass.
  - Warm real predev proof completed the DB step in 0.3 seconds and all seven predev steps in 8.9 seconds; the remaining dominant cost was the separate device-live-path check at 6.5 seconds.
  - Controlled cold proof through the Cloudflare SSH fallback opened a replacement Postgres forward in 3.18 seconds and returned a valid Postgres SSL negotiation reply; the replacement forward remains active.
- 2026-07-20 follow-up: `dev.bnpi-hris.tech` and K3s DEV proved the correct local DEV runtime: 7 active devices including `TEST A` (`cmrlgqsjv000oob01165tbd8n`, `192.168.254.102:443`), 394 TEST A DeviceUser rows, and 1924 TEST A DeviceEvent rows. Compose DEV at `10.184.37.19:15433` proved stale/drifted with only one old `192.168.18.39` device. Localhost hot reload must point at the K3s DEV forward `127.0.0.1:55435`; compose DEV `15433` is diagnostic-only unless explicitly requested.
- Recovery evidence: K3s was blocked by `DiskPressure=True` because old retained VHDX snapshots under `/var/lib/project-truth/retained-vhdx` consumed about 194 GB. Removing those retained snapshots increased free space from about 28 GB to about 193 GB; after K3s restart, node `DiskPressure=False`, and DEV `hris-postgres-0`, `hris-api`, `hris-app`, and `hris-hikvision-watcher` returned to `Running`.
- Truth sync: Architecture clarification; canonical DEV datasource remains `127.0.0.1:55435` backed by the VM/K3s database forward. Compose DEV `10.184.37.19:15433` must not be silently selected for normal localhost hot reload because it is a duplicate drift-prone runtime.
- Recommendation capture: No new recommendations were identified.

## Latest Task Addendum - 2026-07-17 Device-user sync stale processing truth

- Task mode: Regression repair + Playwright-first proof + API contract guard.
- Goal: A 35-hour stale Device-user sync status must not be displayed as live processing after app/dev-server startup. Sync device users remains admin-triggered; persisted status may reopen only when the job has recent progress evidence.
- Implemented:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now treats processing sync-job progress without a recent `updatedAt`/progress timestamp as stale and clears the active startup status instead of showing a live Sync status badge/modal.
  - `hris-api/app/device/device.controller.ts` now stamps device-user sync jobs with `updatedAt`, updates it on progress writes, and marks stale persisted processing snapshots as failed/stopped on job lookup.
  - `hris-app/app/services/devices.service.ts` exposes optional `updatedAt` on `DeviceUserSyncJobProgress`.
  - Playwright regression coverage added for stale startup state while preserving the fresh live-status toolbar path.
- Proof:
  - Failing-first Playwright reproduced the stale startup bug before the fix.
  - `npm run test:e2e:smoke -- tests/smoke/admin-device-user-summary-toolbar.spec.ts` passed 2/2 after the fix.
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-api-contract.spec.ts --grep "expires stale processing"` passed 1/1.
  - `npm run typecheck` in `hris-api` passed.
- Existing unrelated validation drift:
  - `npm run typecheck:test` in `hris-app` still fails in `app/routes/employee/dashboard/TimesheetsTab.test.tsx` with a pre-existing `UseQueryResult` mock-shape type error.
  - `npm test -- tests/device-user-api-contract.spec.ts` in `hris-api` runs the full backend suite because the script already includes `tests/**/*.spec.ts`; that broader run still has unrelated historical failures, and the focused Mocha command above was used for this contract.
- Truth sync: Project Truth and Project Truth summary now state that processing device-user sync snapshots older than 30 minutes without progress evidence are stale and require a fresh admin-triggered run.
- Recommendation capture: No new recommendations were identified.

Status: IMPLEMENTED + PROVEN — Device admin UX clarity (friendly status, slim Sync logs, no VM primary jargon)

## Latest Task Addendum - 2026-07-16 Device admin UX clarity pass

- Task mode: Meaningful UX feature + contract tests + Playwright journey proof.
- Goal: Device management / Device events / Sync logs / Sync users journey is admin-friendly, not engineer-verbose; loading is honest; Sync logs not repeated/noisy; no redundant filter columns; no primary VM jargon.
- Implemented:
  - `hris-app/app/routes/admin/devices/events.tsx` — Live capture status copy; Saved event ledger strip; Sync logs slim summary + blocked collapse + 4-column table; loading/empty honesty.
  - `hris-app/app/routes/admin/devices/manage.tsx` — “Checking device connection…” / “Reading users from device…”.
  - Contract + Playwright smoke (3 tests) updated and green.
  - Non-stop agent loop prompt: `docs/00-product/AGENT-PROMPT-device-admin-ux-clarity-loop.md`
- Evidence: `.runtime/device-ux-clarity-20260716-221328/`, screenshots under `.runtime/device-ux-clarity-proof/screenshots/`
- Proof: vitest 12/12; playwright 3/3.
- Residual (not UX-contract blockers): physical Hikvision reachability, public GitOps image lag until promote, host LAN SSH timeout from some agent hosts.

## Latest Task Addendum - 2026-07-16 Sync logs live residual unblocked (Cloudflare)

- Task mode: Runtime proof / residual close-out (no code change).
- Trigger: operator `ssh project-truth-hris` succeeded after Cloudflare Access browser login; public client screens stayed up.
- Evidence: `.runtime/vm-sync-logs-continue-20260716-220308/`
- Proven:
  - Host LAN to `10.184.37.19` still times out from this agent host; Cloudflare SSH + public origins work.
  - Argo apps at revision `7309928` (includes event-first `ee42f4a`); PROD/DEV/UAT `hris-api`/`hris-app` Running on `hris-api-local:develop` / app images; tunnel active.
  - `GET https://api.bnpi-hris.tech/api/device/sync-preview` returns per-device `eventRows[]` + `sources[]` with live ZKTeco Ready rows (e.g. `.235` willAdd `2035` / already `20267`).
  - `GET https://dev-api.bnpi-hris.tech/api/device/sync-preview` returns Hikvision 16-row event catalogs with already-in-HRIS by action even when sources unavailable.
  - Public browser: admin login → Device events → Sync logs (`action=sync-logs`); UI shows Event to add / Will add / Already in HRIS / Source proof; network `sync-preview` HTTP 200.
- Residual still open:
  - Hikvision TCP from VM fail for configured addresses; PROD Main Entrance Device missing access credentials in preview error.
  - ZKTeco `.234` preview still source_unavailable while later TCP `4370` OK — investigate bridge/read path, not modal contract.
  - `project-truth-runtime-dev` Argo app Synced/Degraded.
  - Per-type operation **willAdd** precision still needs per-action logSearch classification when Hikvision sources are reachable.
  - ansible-pull commit `e156c70` lags Argo serving revision `7309928`.

## Latest Task Addendum - 2026-07-16 Sync logs event-first modal

- Task mode: Meaningful feature + API contract + UI + tests + Playwright proof.
- Commit: `ee42f4a` on `develop`.
- Evidence: `.runtime/sync-logs-event-first-20260716-215712/`
- Goal: Sync logs modal is event-first — per Hikvision device show what will be added to Device Events (not inventory-first On device / In HRIS / Can import as the main story).
- Implemented:
  - `hris-api/helper/sync-logs-event-rows.helper.ts` catalog + dual-source builders.
  - `GET /api/device/sync-preview` now returns `eventRows[]`, `sources[]`, operation log total probe (`ContentMgmt/logSearch`), attendance total (`AccessControl/AcsEvent`), and already-in-HRIS by `eventAction`.
  - UI summary uses Ready source checks X of Y from source probes; per-device table remains Event to add | Will add | Already in HRIS | Source proof | Filter after sync | Status.
  - Focused mocha + vitest + Playwright headless smoke (ZKTeco + Hikvision event-first) with screenshots.
- Boundary / residual (updated by live proof above):
  - Live DB/API preview residual closed via Cloudflare public + CF SSH path.
  - Per-type operation **willAdd** precision and Hikvision physical source reachability remain open.
  - Full historical ACS serial reconciliation still out of scope.

## Latest Task Addendum - 2026-07-16 Hikvision Device Events Source Truth

- Task mode: Mixed runtime repair, meaningful feature, persistence cleanup, tests, and UI verification.
- Completed:
  - Repaired Windows port 3001 ownership/exclusion drift and the local restart helper's false-negative health timeout.
  - Directly proved Main Entrance Device A inventory, ACS pagination, logSearch availability/pagination/raw metaIds, and selected-window serial parity.
  - Enforced the `DeviceEvent` evidence contract, saved-row filters/summaries, SDK/logSearch taxonomy, runtime correlation, and deduplication.
  - Exported and removed 219 proven fake lifecycle rows with zero attendance deletion.
  - Refined the saved-only Device Events UI and passed live Playwright ledger/details proof.
- Evidence: `.wwg/reports/hikvision-device-events-sync-center-current-state-20260716.md` and `.runtime/device-events-sync-center-20260716-160910/`.
- Boundary: full historical ACS serial reconciliation and GitOps/public promotion were not performed in this local implementation pass.

## Latest Task Addendum - 2026-07-13 Device User Vendor Metadata Tooltip

- Task mode: Meaningful feature with additive persistence and admin UI display.
- User goal:
  - Add a non-destructive `DeviceUser` metadata field for vendor SDK/ISAPI
    user payloads, including fingerprint/image-related vendor metadata when
    available, so HR/admin journeys can recover per-device user context.
  - Make the saved value visible in the Sync Center device-user row details
    modal through a tooltip/preview without replacing the raw source payload.
- Implemented local behavior:
  - Added additive `DeviceUser.vendorMetadata` JSON/JSONB schema support while
    preserving existing `rawPayload`.
  - Hikvision user sync now prepares structured vendor metadata from
    `UserInfo/Search` payloads and the API guards selects/writes so older local
    databases do not fail before the migration is applied.
  - Sync Center user details now shows a `Vendor metadata` preview with a
    tooltip plus an expandable `Vendor metadata JSON` section; raw source
    payload remains available separately.
- Validation:
  - Local migration was applied and Prisma Client regenerated.
  - Local API endpoint proof for a real device-user list showed
    `vendorMetadata` in the response, falling back from `rawPayload` for rows
    synced before the new column existed.
  - Focused backend sync/API contract tests and the Sync Center UI contract
    test passed.
- Boundary:
  - Existing rows may show fallback vendor metadata from `rawPayload` until a
    fresh user sync persists structured `vendorMetadata`.
  - This does not approve raw biometric template custody beyond the existing
    admin device-user/vendor metadata surface.

## Latest Task Addendum - 2026-07-12 Hikvision Remote-Site Agent And Local Dev Tunnel Proof

## Latest Task Addendum - 2026-07-12 HRIS Employee App Submodule And Runtime Integration

- Task mode: Mixed repo-structure integration plus runtime/GitOps sync.
- User goal:
  - Bring `https://github.com/hrisworkforcesystem-coder/hris-emp-app/tree/develop` into this Project Truth workspace as a visible/editable root folder while preserving the upstream repo relationship.
  - Align it with the existing `hris-api` / `hris-app` repo shape and extend Project Truth runtime/GitOps evidence so DEV/UAT/PROD are not implicit.
- Implemented integration:
  - Added root git submodule `hris-emp-app` on upstream branch `develop`.
  - Added parent-owned container wrapper `appliance/dockerfiles/hris-emp-app.Dockerfile` plus Nginx proxy template so the employee app can stay a clean upstream checkout while runtime-specific `/api` and `socket.io` proxy behavior lives in Project Truth.
  - Added Compose services:
    - PROD `hris-emp-app` on port `3300`
    - DEV `hris-emp-app-dev` on port `3310`
    - UAT `hris-emp-app-uat` on port `3320`
  - Added matching K3s runtime Deployments/Services in `gitops/runtime-k8s/overlays/{prod,dev,uat}/runtime.yaml`.
  - Extended image staging/import and verification scripts so Project Truth now treats `hris-emp-app` as part of the runtime surface, not an orphan checkout.
- Truth/docs sync:
  - Updated Project Truth summary, Project Truth wiki, README verification targets, and local port config to include `hris-emp-app`.
  - Reserved employee-app public hostnames `emp.bnpi-hris.tech`, `dev-emp.bnpi-hris.tech`, and `uat-emp.bnpi-hris.tech` in both host-managed and VM-managed tunnel configs plus runtime CORS surfaces.
- Validation target:
  - Focused config verification only in this pass; runtime bring-up/probe is still required before claiming live VM proof for the new employee-app ports.

- Task mode: Cross-network Hikvision runtime repair plus local-dev remote test path.
- User goal:
  - Keep the listener truth accurate while making the currently running local
    dev stack reachable from a remote device-side network for tomorrow's test.
- Confirmed listener/runtime truth:
  - Local `GET /api/device/hikvision/listener` now returns truthful diagnosis
    fields from the live VM log:
    - `sdk.lastTargetHost=10.184.38.137`
    - `sdk.lastLoginError=7`
    - `sdk.lastFailureReason=no_armed_devices`
    - diagnosis text explicitly says the VM is healthy but device login/network
      reachability is still failing.
  - Live browser proof in the separate headed Chrome window, after reload, now
    shows the same truthful state in the Hikvision listener modal instead of
    the earlier stale "status check has not completed" view.
- Cross-network architecture hardening:
  - `appliance/systemd/project-truth-hikvision-hot-reload-listener.service`
    now reads optional override env from
    `/etc/project-truth/hikvision-hot-reload.env`, so a Linux host beside the
    devices can run the same managed listener in site-agent mode without
    editing the unit itself.
  - Added `scripts/start-local-hikvision-remote-test.ps1` to expose the local
    dev API/app through additive temporary trycloudflare URLs and generate a
    ready-to-use remote site-agent env file.
  - `docs/HIKVISION_RUNTIME_TRUTH.md` now documents the temporary remote-dev
    tunnel path as a dev-only bridge, with the Linux site agent beside the
    device remaining the durable architecture.
- Proven remote-dev tunnel path:
  - Temporary public API URL:
    `https://trim-attached-hiring-hart.trycloudflare.com`
  - Temporary public app URL:
    `https://constant-scholar-handbook-learners.trycloudflare.com`
  - Public API health returned HTTP 200.
  - Public app `/auth/login` returned HTTP 200 after allowing
    `*.trycloudflare.com` in `hris-app/vite.config.ts`.
  - Public API login with `admin@bandai.local` / `password123` succeeded and a
    subsequent public `GET /api/device?page=1&limit=10&document=true` returned
    the live local `Main Entrance Device` row, proving the exact remote
    site-agent fetch path against the user's current local dev API.
- Remaining truth:
  - The remote path for tomorrow is now viable:
    remote Linux site agent on the device LAN -> public tunneled local API.
  - The central VM still cannot directly reach `10.184.38.137:80` or `:8000`,
    so direct central-VM HCNetSDK login remains blocked by device-side
    reachability/network path, not by the local browser/API plumbing.
- Evidence:
  - `.runtime/listener-proof-20260712-163353/`
  - `.runtime/local-hikvision-remote-test/20260712-163759/`

## Latest Task Addendum - 2026-07-10 Hikvision Synthetic Fingerprint Tally And Live Device Reachability Blocker

- Task mode: Local API/UI truth repair plus runtime blocker isolation.
- User goal:
  - Prove whether fingerprint tally can be tested honestly when a temp
    Hikvision user has no real template bytes, and keep the Device Users modal
    truthful instead of pretending a synthetic count is a physical device
    fingerprint.
- Confirmed SDK truth:
  - Local HCNetSDK headers and Hikvision demo code confirm
    `NET_DVR_FINGER_PRINT_CFG_V50` requires real `dwFingerPrintLen` plus
    `byFingerData` blob content.
  - A temp or copied user with `numOfFP=0` cannot honestly become
    `fingerprintCount=1` at the physical-device truth layer unless a real
    template is read from a source device and written back through the SDK.
- Implemented change:
  - `hris-api/app/device/device.controller.ts` now exposes
    `POST /api/device/hikvision/mock-fingerprint` for a clearly labeled
    dev-only synthetic fingerprint tally on an existing HRIS `DeviceUser` row.
  - The same controller now carries that synthetic tally to the peer HRIS row
    during `POST /api/device/hikvision/copy-user` only when the source user has
    no real fingerprint templates to send, so the FE journey can be tested
    without claiming physical device truth.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose the synthetic tally
    state separately from the real fingerprint truth in the Device Users modal.
- Proven local UI/API truth:
  - The exact screenshot row `vendorUserId=9023` on `Main Entrance Device A`
    was confirmed before the patch as:
    - `rawPayload.numOfFP=0`
    - `_hrisDeviceMetadata.credentialSummary.fingerprintCount=0`
  - After restarting the local API, `POST /api/device/hikvision/mock-fingerprint`
    with `fingerprintCount=1` wrote only
    `_hrisDeviceMetadata.syntheticCredentialSummary.fingerprintCount=1` while
    leaving the physical-device truth at `numOfFP=0`.
  - Clearing the same synthetic tally removed
    `_hrisDeviceMetadata.syntheticCredentialSummary` and returned the row to
    pure zero-truth state.
- Live blocker isolated with proof:
  - As of `2026-07-10T09:50Z`, both Hikvision devices were unreachable from
    the VM on both TCP `80` and `8000`.
  - The running VM listener journal simultaneously showed repeated
    `source_user_inventory_read ok=false lastError=7` for both device IDs.
  - Because of that reachability loss, I could not honestly complete a fresh
    real temp-user physical copy/delete pass in this slice even though the
    earlier under-5-second peer-copy proof remains recorded.
- Evidence:
  - `.runtime/hikvision-synth-proof-20260710-165311/mock-fingerprint-9023-proof.json`
  - `.runtime/hikvision-synth-proof-20260710-165311/vm-device-port-check.txt`
  - `.runtime/hikvision-synth-proof-20260710-165311/listener-device-failures.log`

## Latest Task Addendum - 2026-07-10 Hikvision FE To SDK Peer Copy Journey Under 5 Seconds

- Task mode: Local frontend/backend/runtime repair with real-device proof.
- User goal:
  - Make the admin device-user journey tell the truth and physically copy the
    selected Hikvision user to the peer device quickly enough that the flow
    feels under 5 seconds.
- Current-state finding before the final pass:
  - The new `POST /api/device/hikvision/copy-user` path existed, but the local
    API process at `localhost:3001` was stale and did not expose the route
    until the local dev API was restarted.
  - The first working API copy pass still felt slow because it waited on a
    scoped VM run window plus a full target-device user reread; real timings
    were about `10.4s`, then about `6.4s` after removing the whole-device
    source refresh.
- Final change:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now supports
    scoped one-off runs with device filtering and a short run window intended
    for a single user-copy request.
  - `hris-api/app/device/device.controller.ts` now exposes a real
    admin-only `POST /api/device/hikvision/copy-user` path that:
    - runs a scoped VM SDK copy from a chosen source device to a chosen target
      device,
    - confirms the peer write from SDK evidence,
    - refreshes only the copied target user into HRIS truth instead of
      rereading the entire target device,
    - and reuses the same copy helper during Hikvision enrollment when the
      target device does not yet physically contain the requested vendor user.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose a real
    `Copy to peer device` action in the Device Users panel instead of forcing
    the journey through metadata-only sync assumptions.
- Runtime proof:
  - Temp user `9022` proved the route after the stale API restart; the physical
    peer write landed immediately, but the old endpoint shape still returned in
    about `10.4s`.
  - Temp user `9025` proved the scoped single-user target refresh was active:
    the API response returned `targetSyncTotalSourceRecords=1` and the full
    copy request completed in about `6.392s`.
  - Temp user `9026` reduced the same end-to-end API call to about `5.601s`
    with the shorter VM run window.
  - Temp user `9027` completed the same real device-to-device copy in about
    `2.910s` end to end through the local API route, with
    `beforeTargetStatus=NO MATCH`, `targetSyncTotalSourceRecords=1`, and
    `targetAfterCopyStatus=OK`.
  - Cleanup then deleted temp users `9022` through `9027` from both devices;
    post-delete searches returned `NO MATCH` on `10.184.38.86` and
    `10.184.38.136`.
- Remaining truth:
  - The admin Device Users page now has a real FE-to-SDK copy action in code,
    and the backing API/runtime path is proven under 5 seconds by direct
    endpoint plus device truth.
  - I did not run a final browser-rendered click proof against the new modal in
    this pass; the FE code is wired, but the proof here is API plus direct
    device SDK truth.
- Evidence:
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-proof.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-after-api-restart.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9023-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9024-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9025-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9026-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9027-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/cleanup-9022-9027.json`

## Latest Task Addendum - 2026-07-10 Hikvision Fast User Delta Path

- Task mode: Local runtime refactor, device-to-device latency reduction, and
  real-device evidence.
- User goal:
  - Reduce the perceived Hikvision cross-device user-copy delay from about
    60 seconds to about 3-5 seconds in local dev mode.
- Current-state finding before the refactor:
  - Live VM listener logs showed generic Hikvision operation-sync callbacks
    (`OBSERVED_OPERATION_MINOR_112/121/122`) were triggering sequential
    full-mirror reconciles.
  - One observed 4-user mirror blocked the single worker from about
    `07:48:32Z` to `07:50:00Z`, with per-user fingerprint read/write waits
    dominating the latency.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now routes
    generic operation-sync callbacks with no `employeeNo` through a fast
    inventory-delta path first.
  - The fast path reads source and peer employee inventories, computes missing
    employee numbers per peer, and writes only the missing user records
    immediately, without blocking on fingerprint reads/writes.
  - Manual full mirror behavior remains available for explicit/manual runs.
- Runtime proof:
  - After rebuilding on the VM and restarting
    `project-truth-hikvision-hot-reload-listener.service`, live callbacks at
    `07:57:03Z` showed `reconcile_fast_path_inventory_delta` and
    `reconcile_fast_path_completed` instead of the earlier long-running
    full-mirror pattern.
  - A real temp user `9012` was created on source device `AAA`
    (`10.184.38.86`) by ISAPI.
  - A one-off real-device reconcile using the patched binary then copied
    `9012` from `AAA` to `Main Entrance Device` in the same second:
    `reconcile_queued`, `source_user_read ok=true`, `peer_user_write ok=true`,
    and `reconcile_completed` all logged at `2026-07-10T07:59:44Z`.
  - A later live-listener proof with the polling fallback created temp user
    `9013` on `AAA`; the running service detected the missing peer user at
    `08:11:37Z`, queued `poll_missing_user`, wrote the peer user at
    `08:11:38Z`, and completed the reconcile at `08:11:38Z`.
  - A one-off single-user fingerprint mirror for existing employee `1`
    completed in about one second: `source_user_read` at `08:11:58Z`,
    `source_fingerprint_read`, `peer_user_write`, `peer_fingerprint_write`,
    and `reconcile_completed` all landed by `08:11:59Z`.
  - Direct current-device truth check for employee `21` then showed:
    `AAA -> numOfFP=0, numOfFace=0` and
    `Main Entrance Device A -> numOfFP=1, numOfFace=1, faceURL present`.
  - A local `POST /api/device/cmpxw13hx002h7zwso7dyedrn/users/sync` refresh
    updated the saved `DeviceUser` row for vendor user `21` so the API now
    returns `numOfFP=1`, `numOfFace=1`, and `faceURL` for
    `Main Entrance Device A`.
  - Cleanup delete calls for `9012` returned `statusString=OK` on both
    devices.
  - Cleanup delete calls for `9013` also returned `statusString=OK` on both
    devices.
- Remaining truth:
  - The user-copy path itself is now fast when driven through the user-only
    reconcile flow.
  - The fingerprint copy path itself is now fast when driven through the
    single-user reconcile flow.
  - Direct ISAPI create of `9012` on `AAA` still did not produce a usable
    user-management callback in the next 15 seconds, so automatic propagation
    for API-created users remains gated by device callback behavior unless the
    new poll fallback detects the missing peer user.
- Evidence:
  - `.runtime/hikvision-fast-path-20260710-155617/listener-fast-path-after-restart.log`
  - `.runtime/hikvision-fast-path-20260710-155617/temp-create-9012-proof.txt`
  - `.runtime/hikvision-fast-path-20260710-155617/listener-since-create-9012.log`
  - `.runtime/hikvision-fast-path-20260710-155617/manual-single-user-9012.jsonl`
  - `.runtime/hikvision-fast-path-20260710-155617/delete-9012-proof.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/auto-create-9013-journal.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/fingerprint-single-user-1.jsonl`
  - `.runtime/hikvision-under5-proof-20260710-161015/delete-9013.txt`
  - `.runtime/hikvision-ui-truth-20260710-161529/user21-both-devices.json`
  - `.runtime/hikvision-ui-truth-20260710-161529/main-user21-after-sync.json`

## Latest Task Addendum - 2026-07-10 VM Static IP 10.184.37.241 Host Route Repair

- Task mode: Runtime/network drift repair with local host evidence.
- User goal:
  - The running Hyper-V VM should be reachable from the Windows host at static
    `10.184.37.241`, not only through the transient `192.168.*` Default Switch
    address.
  - Local HRIS API/database access should work when the app/browser is
    refreshed.
- Current-state finding:
  - Hyper-V reported `project-truth-local-vhdx-proof` running on
    `Default Switch` with guest IPs `10.184.37.241`,
    `192.168.237.193`, and link-local IPv6.
  - Inside the VM, `eth0` had `10.184.37.241/24` and
    `192.168.237.193/20`; DB/API ports were listening on `0.0.0.0`.
  - Windows could reach the transient `192.168.237.193` address, but could not
    reach `10.184.37.241` because `vEthernet (Default Switch)` only had
    `192.168.224.1/20`, so Windows routed `10.184.37.241` through Wi-Fi.
- Repair:
  - Added host-side `10.184.37.250/24` to `vEthernet (Default Switch)`.
  - Added idempotent recovery script:
    `scripts/ensure-project-truth-vm-241-host-route.ps1`.
  - The script verifies the named VM, ensures the host-side Default Switch
    address exists, and probes `10.184.37.241` ports `22`, `3000`, `3001`,
    `15432`, `15433`, and `15434`.
- Validation:
  - Windows TCP probes to `10.184.37.241` passed for SSH, app/API, and
    PROD/DEV/UAT DB ports.
  - SSH to `infra@10.184.37.241` returned hostname `project-truth-node` and
    `eth0` with `10.184.37.241/24`.
  - Prisma from Windows to
    `postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public`
    returned `db=hris`, `user=postgres`, server port `5432`, and
    `public_tables=73`.
  - `http://10.184.37.241:3001/health`, `http://localhost:3001/health`, and
    admin login through both API paths passed.
  - Headless browser refresh/login at `http://localhost:5175/auth/login`
    reached `http://localhost:5175/admin/dashboard`.
- Evidence:
  - `.runtime/vm-static-ip-241-repair-20260710-075945/`
  - Screenshot proof:
    `.runtime/vm-static-ip-241-repair-20260710-075945/vm-10.184.37.241-proof.png`
    and
    `.runtime/vm-static-ip-241-repair-20260710-075945/localhost-app-refresh-login-proof.png`

## Latest Task Addendum - 2026-07-09 Device UX And Employee Hard Delete

- Task mode: Mixed UI/UX hardening, admin destructive-action safety, API
  contract repair, and local evidence.
- User goal:
  - Verify and clarify Add/Edit Device, device list event journeys, Device
    events modals/details, and responsive behavior for a normal HRIS admin.
  - Keep the Device events model truth centered on `eventCategory` and
    `eventAction`, with `source` only as Runtime path/debug and `status` only
    as HRIS result.
  - Add an admin-only Employee hard delete dropdown journey that previews
    relation blockers before any destructive execute path can run.
- UI result:
  - Add/Edit Device now groups adapter/callback fields under
    `Vendor and runtime routing`, while retaining `Runtime adapter`,
    `Internal adapter key`, and `Callback path` as intended terms with clearer
    helper copy.
  - Device events copy no longer presents browser socket connectivity as SDK
    tap truth. The page uses clearer labels such as
    `Browser connected; no recent SDK tap`,
    `No saved device event has arrived in this view yet`,
    `No recent SDK tap saved`, `Any event category`, and `Any event action`.
  - Employee admin rows expose `Preview hard delete` only for admin
    configuration users. The modal shows blocker, delete, detach, and archive
    counts, relation details, typed confirmation only when safe, and specific
    toasts.
- API result:
  - Added `POST /api/employee/:id/hard-delete-preview`.
  - Preview mode is non-mutating and returns the exact blocker/delete/detach
    plan.
  - Execute mode requires an admin actor, a safe preview with no blockers, and
    typed `DELETE <employeeId>` confirmation. Device events/users and audit
    references are detached rather than deleted; legal/payroll/attendance/time
    history blockers stop hard delete.
- Validation:
  - `hris-app` focused tests passed:
    `npm test -- app/lib/device-events-page-contract.test.ts app/lib/employee-hard-delete-ui-contract.test.ts app/services/employees.service.test.ts`.
  - `hris-api` focused direct Mocha tests passed:
    `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-hard-delete.contract.spec.ts tests/device-events-api-contract.spec.ts tests/device-event-taxonomy.helper.spec.ts`.
  - `hris-api npm run typecheck` passed.
  - `hris-app npm run typecheck:test` still fails only on the pre-existing
    `TimesheetsTab.test.tsx` React Query mock typing issue already tracked as
    `REC-20260706-TEST-TYPECHECK-MOCKS`.
  - Real local API dry-run as `admin@bandai.local` returned HTTP 200 with
    `blockerCount=2`, `deleteCount=2`, `detachCount=13`, and
    `archiveCount=0`; no execute call was made against live employee data.
  - Headless Playwright verified admin login, Add Device desktop/narrow,
    Edit Device from list, device list `View all events`, row
    `View Device Events`, Device events page desktop/narrow, Sync logs modal,
    Listener modal, event details modal, and employee hard-delete preview
    blocker modal.
- Evidence:
  - `.runtime/device-ui-ux-employee-delete-20260709-231712/`
  - API dry-run:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/employee-hard-delete-preview-dry-run.json`
  - Browser proof:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/playwright-verification.json`
    and screenshots under
    `.runtime/device-ui-ux-employee-delete-20260709-231712/screenshots/`

## Latest Task Addendum - 2026-07-09 Hikvision Listener Admin Control

- Task mode: Mixed UI/UX hardening, local runtime control, and operator
  evidence.
- User goal:
  - The Device attendance page should show the real VM listener heartbeat, not
    only recent tap evidence.
  - Admin should have a clean control journey to check, start/stop, and restart
    the local VM hot-reload Hikvision listener if it stops.
- Backend result:
  - Added admin-only fixed endpoints:
    `GET /api/device/hikvision/listener` and
    `POST /api/device/hikvision/listener`.
  - The API controls only the fixed VM systemd service
    `project-truth-hikvision-hot-reload-listener.service` over SSH to
    `10.184.37.241`; allowed actions are `start`, `stop`, and `restart`.
  - The implementation uses `execFile` with fixed arguments and an action
    allowlist, not arbitrary shell command input.
- UI result:
  - The header separates saved-row proof from VM listener heartbeat:
    `SDK listener recent` / `VM listener running`.
  - The status strip now treats a running VM service as healthy heartbeat and
    uses `Waiting for next tap` when no fresh tap has arrived yet.
  - Added a `Hikvision listener` modal with service status, enabled toggle,
    non-mutating `Check status`, restart action, runtime target, and recent
    listener log tail.
  - The shared modal component now wires its visible title into
    `aria-labelledby` and description into `aria-describedby`.
- Validation:
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - Playwright proof logged in locally, opened the listener modal, refreshed
    status, closed/reopened, closed with Escape, and captured screenshots.
  - Admin API restart proof restarted the VM service from PID `129398` to
    `192455`, then returned `active/running`; SDK init/login/alarm arm and
    callback posts were `ok=true`.
- Evidence:
  - `.runtime/hikvision-listener-modal-playwright-20260709-221455/`
  - `.runtime/hikvision-listener-api-restart-20260709-221703/`

## Latest Task Addendum - 2026-07-09 Hikvision Live Listener Execute Default

- Task mode: Bug fix / operator workflow repair for local hot-reload tap
  debugging.
- User goal:
  - Live taps should save into the hot-reload HRIS path by default instead of
    silently running preview-only.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now defaults
    `execute_mode` to `true`.
  - `--execute` remains accepted and idempotent.
  - New `--dry-run` flag restores preview-only behavior when intentionally
    needed.
  - `vendor/hikvision-linux/README.md` now documents execute as the live
    listener default.
- Validation:
  - Focused contract test passed:
    `npm test -- --grep "Hikvision biometric sync contract"` in `hris-api`.
  - The VM copy under
    `/tmp/project-truth-hikvision-live-20260709-credential-repair/vendor-hikvision-linux`
    was rebuilt.
  - Default-mode smoke ran without `--execute`, reported `mode=execute`,
    `sdk_alarm_arm ok true`, posted callback results with `ok=true`, and
    cleaned up the alarm channel.
- Evidence:
  - `.runtime/hikvision-default-execute-smoke-20260709-213551/`

## Latest Task Addendum - 2026-07-09 Hikvision Hot-Reload Listener Truth UI

- Task mode: Mixed local runtime repair, UI truth repair, and operator
  evidence.
- User goal:
  - The Device attendance page must not show a green/live state merely because
    the browser socket is connected when the VM Hikvision SDK listener is not
    actually receiving/posting tap events.
  - Local hot reload should keep receiving taps without an agent manually
    starting a one-off listener.
- Runtime repair:
  - Installed and enabled VM systemd service
    `project-truth-hikvision-hot-reload-listener.service`.
  - The service runs the rebuilt Linux HCNetSDK listener continuously against
    live Hikvision `192.168.254.189:8000` and posts to the Windows host local
    hot-reload API at `http://10.184.37.248:3001`.
  - The service uses `--device-file
    /run/project-truth/hikvision-hot-reload-device.spec` so the device password
    does not appear in process arguments.
  - Service status was active/running, posted callback results with `ok=true`,
    and local API showed recent rows including serial `1613` mapped to
    `Ernst tey Malasa`.
- UI repair:
  - Saved Hikvision/HCNetSDK views now poll saved rows every 2 seconds even
    when the browser socket is connected.
  - The page now distinguishes browser socket connectivity from fresh SDK
    listener evidence.
  - The prior green labels are replaced for SDK alarm scopes with:
    `SDK listener recent`, `SDK listener receiving taps`, and
    `SDK alarm rows fresh` only when recent `EN_HCNETSDK_ALARM` rows exist.
  - When no recent SDK row exists, the page shows SDK idle/not-recent wording
    instead of implying the physical tap path is live.
- Validation:
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - Headless browser proof showed the localhost page contains
    `SDK listener recent`, `SDK listener receiving taps`, and no old
    `Saved rows live` / `Saved rows update live` wording.
- Evidence:
  - `.runtime/hikvision-hot-reload-daemon-20260709-213948/`
  - `.runtime/hikvision-hot-reload-service-20260709-214733/`

## Latest Task Addendum - 2026-07-09 Hikvision Credential Repair Success

- Task mode: Mixed credential repair, local hot-reload proof, VM SDK proof,
  and evidence.
- User supplied a new Digest Auth credential for `admin` on the live Hikvision
  terminal at `192.168.254.189`.
- Host direct credential proof:
  - `GET http://192.168.254.189:80/ISAPI/Security/userCheck` with Digest Auth
    returned HTTP `200`, `statusValue=200`, and `statusString=OK`.
- VM/PROD runtime repair:
  - Updated PROD `Main Entrance Device` `Device.access` in VM Postgres with
    username `admin` and a redacted 16-character password.
  - VM-backed `GET /api/device/:id/health` now reports network `reachable`,
    device API `online`, and reads terminal time from `192.168.254.189`.
  - Current PROD `sync-preview` still reports event-total unavailable
    (`code 1073741828`), which is now separate from credential auth because
    device health succeeds.
- Local hot-reload repair:
  - Local hot-reload API/app were already running at `localhost:3001` and
    `localhost:5175`.
  - Local API points at VM DEV Postgres on `10.184.37.241:15433`, so the DEV
    `Main Entrance Device` row was updated to `192.168.254.189:80`, protocol
    `http`, model `DS-K1T341CMFW`, SDK port `8000`, source
    `vendor/hikvision-linux`, callback path `/api/hikvision/callback`, and the
    same redacted credential.
  - Local `GET /api/device/:id/health` now reports `online`.
  - Local `GET /api/device/sync-preview?deviceId=cmpxw13hx002h7zwso7dyedrn`
    now reports `vendorEventCount=1518`, `vendorUserCount=7`,
    `canStartSync=true`, and `status=needs_sync`.
  - Local Playwright proof opened
    `http://localhost:5175/admin/configuration/devices/events?view=saved&deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    and rendered the saved-events page with `Main Entrance Device`,
    `Ernst tey Malasa`, live-row text, and the updated configured address.
- VM HCNetSDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` built and
    ran from the VM against `192.168.254.189:8000`.
  - SDK init succeeded, callback registration succeeded, SDK login succeeded
    with `lastError=0`, and alarm arm succeeded with `lastError=0`.
  - The listener received live ACS/fingerprint events, posted them to
    `/api/hikvision/callback`, and HRIS persisted 74 recent
    `EN_HCNETSDK_ALARM` rows for `Main Entrance Device`.
  - Recent saved rows include fingerprint pass events for `employeeNo=1`; they
    currently persist as `UNMATCHED` where employee mapping is not resolved in
    the PROD data.
- Evidence:
  - `.runtime/hikvision-credential-local-hotreload-20260709-210645/`
- Remaining boundary:
  - Credential auth and real SDK event delivery are no longer blocked.
  - Remaining work is product/data follow-up: reconcile employee/device-user
    mapping and classify why PROD sync-preview event-total still reports
    `code 1073741828` while health and SDK listener succeed.

## Latest Task Addendum - 2026-07-09 Hyper-V Default Switch Route Repair

- Task mode: Mixed VM route repair, credential boundary, SDK proof, and
  evidence.
- User goal:
  - Continue local Hyper-V plus Hikvision repair with Project Truth runtime
    inside `project-truth-local-vhdx-proof`, Docker inside the VM, and no new
    Hyper-V switch unless `Default Switch` is disproven.
  - First repair boot-time route drift, then repair live Hikvision credentials
    for `Main Entrance Device` at `192.168.254.189`, then rerun HRIS and SDK
    proof.
- Runtime result:
  - VM remains attached to `Default Switch`.
  - VM host-access IP remains `10.184.37.241/24`.
  - Boot-time LAN owner config was changed from stale static
    `172.31.99.250/23` plus default route `172.31.98.1` to
    `/etc/project-truth/lan.env` DHCP mode with pinned
    `PROJECT_TRUTH_LAN_DHCP_ADDRESSES=10.184.37.241/24`.
  - After reboot, netplan kept `dhcp4: true` plus `10.184.37.241/24`, the VM
    received `Default Switch` DHCP/NAT address `172.26.59.137/20`, defaulted
    through `172.26.48.1`, and reached `192.168.254.189:80` and `:8000`.
  - Stale failed `project-truth-hikvision-route.service` was disabled. The
    normal `project-truth-ansible-pull.timer` was re-enabled.
- HRIS/API proof:
  - `http://10.184.37.241:3001/health` returned healthy after reboot.
  - Admin login to the VM-backed API succeeded.
  - `/api/device/:id/health` for `Main Entrance Device` reported network
    `reachable` and device API `Unauthorized`.
  - `/api/device/sync-preview?deviceId=cmqq3ho8c002eti3dzzk94z1w` returned
    `source_unavailable` with error `Unauthorized`.
- Credential boundary:
  - The runtime `Device.access` source has username `admin` and a present
    9-character password, but direct digest auth to
    `http://192.168.254.189/ISAPI/System/time?format=json` returned HTTP `401`
    and the device reported `lockStatus=lock`.
  - Redacted credential-source search found no alternate documented runtime
    credential. Historical `AlarmDemo.config` matches the current 9-character
    credential hash; other hits are examples, tests, or placeholders.
- SDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` was copied
    to the VM and built against the Linux HCNetSDK under
    `~/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`.
  - SDK init and callback registration succeeded.
  - SDK login to `192.168.254.189:8000` failed with HCNetSDK error `153` while
    the device was locked, so no alarm channel was armed.
- Evidence:
  - `.runtime/hikvision-route-credential-repair-20260709-204243/`
- Remaining boundary:
  - Real tap proof is still missing. Route drift is repaired; the active
    blocker is credential custody/rotation for the live Hikvision terminal.
    Continuing without a verified credential would mean guessing an unknown
    device secret and can prolong terminal lockout.

## Latest Task Addendum - 2026-07-09 Hikvision Real-Tap Pipeline Continuation

- Task mode: Mixed runtime proof, credential boundary, callback/realtime
  simulation, tests, and evidence.
- User goal:
  - Continue the previously blocked real physical Hikvision tap pipeline now
    that host-test VM `10.184.37.241` can reach `10.184.37.139`.
  - Prove the path from Linux HCNetSDK alarm callback through
    `/api/hikvision/callback`, `DeviceEvent`, socket emit, and local saved-events
    UI when real tap evidence is available.
- Current-state result:
  - Local API dry-run proof passed. `http://localhost:3001/health` was healthy,
    admin login succeeded, `/api/hikvision/callback?preview=true` matched
    `Main Entrance Device` id `cmpxw13hx002h7zwso7dyedrn` at
    `10.184.37.139:80`, used source `EN_HCNETSDK_ALARM`, and saved zero rows
    for the preview marker.
  - Host-test VM `10.184.37.241` reached the Hikvision physical device:
    `ping 10.184.37.139` passed with 0% loss, TCP `80` passed, and TCP `8000`
    passed.
  - Docker is running on the host-test VM; PROD/DEV/UAT app/API containers are
    present. A stale existing `hris-hikvision-watcher` process was observed
    using old `10.184.38.215`, so it is drift and not current device proof.
  - Current local `vendor/hikvision-linux` source was copied to a task-scoped
    VM temp folder and built with
    `vendor/hikvision-linux/scripts/build-hikvision-biometric-service.sh`
    against Linux HCNetSDK.
  - Bounded SDK run proved `NET_DVR_Init` and
    `NET_DVR_SetDVRMessageCallBack_V51`; `NET_DVR_Login_V40` failed with
    HCNetSDK error `1` because no real Hikvision device credential pair was
    available from documented local config, VM env, Docker env, Kubernetes env,
    or previous evidence searched in this pass. `NET_DVR_SetupAlarmChan_V50`
    could not be reached without login.
- Simulation evidence, explicitly not real-tap proof:
  - Non-production SDK-shaped callback saved `DeviceEvent`
    `cmrd1gb4900347zk0v59jp7e6`, returned through the saved-events API, and
    emitted one `device-event:saved` socket payload.
  - Browser proof opened
    `http://localhost:5175/admin/configuration/devices/events?deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    first, waited for "Saved rows update live", then a simulated callback made
    marker `CODEX-UI-LIVE-HCNETSDK-READY-1783573373427` appear with
    "Socket received" and no manual refresh.
- Evidence directory:
  - `.runtime/hikvision-real-tap-pipeline-20260709-125441/`
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed
    11 tests.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|device event realtime helper"`
    in `hris-api` passed 7 tests.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed 16 tests.
- Remaining boundary:
  - Real physical tap proof is still missing. The current blocker is not
    host-test VM reachability; it is absence of a documented real Hikvision
    credential source for SDK login/alarm arm. Once credentials are supplied,
    rerun the service, prove `NET_DVR_Login_V40`,
    `NET_DVR_SetupAlarmChan_V50`, capture real JSONL callback output, and then
    verify real saved row, attendance/timesheet projection where applicable,
    socket emit, and browser live-row update.

## Latest Task Addendum - 2026-07-09 Hikvision HCNetSDK Single Source

- Task mode: Mixed runtime path repair, API contract, tests, and evidence.
- User goal:
  - Make the Linux HCNetSDK path the clean single source of truth for live
    Hikvision tap events.
  - Keep HRIS `Device` row truth at `Main Entrance Device`,
    `10.184.37.139:80`, protocol `http`, model `DS-K1T341CMFW`, SDK port
    `8000`.
- Implementation result:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` is now the only
    active C++ HCNetSDK runtime source.
  - Removed the old active `hcnetsdk_alarm_probe` build path and replaced it
    with `scripts/build-hikvision-biometric-service.sh`.
  - SDK callback work stays minimal: parse ACS alarm, emit JSONL evidence,
    queue HRIS callback posting, and queue biometric reconcile only for
    user/fingerprint management events.
  - Worker posts SDK alarm events to `/api/hikvision/callback` with source
    `EN_HCNETSDK_ALARM`, so existing callback logic owns `DeviceEvent`
    persistence, attendance/timesheet projection, cache invalidation, and
    `device-event:saved` socket emission.
  - Added `/api/hikvision/callback?preview=true` / `dryRun=true` as a
    non-mutating proof path before persistence.
  - DEV seed defaults and Hikvision tests now use `10.184.37.139` instead of
    stale Hikvision addresses.
- Evidence:
  - Endpoint/API proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/local-api-callback-preview-proof-after-restart.json`.
    Admin login passed, callback preview matched `Main Entrance Device`,
    no preview row was saved, and biometric reconcile dry-run returned planned
    changes with `rawFingerprintTemplateStored=false`.
  - Accidental stale-API preview row cleanup:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/accidental-preview-row-cleanup.json`
    deleted only `employeeNo=CODEX-PREVIEW` row
    `cmrcvgud903247zb8zk9bt6e4` after the stale API saved it before restart.
  - Network/runtime proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/network-runtime-owner-proof.json`
    and `vm-network-cloudflared-proof-clean.json`.
    Windows host reached `10.184.37.139:80` and `:8000`; direct VM at
    `10.184.37.19` failed both with `No route to host`.
  - SDK/build proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-build-proof-after-fix.json`
    compiled and linked `hikvision-biometric-service` against VM
    `libhcnetsdk.so`.
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-bounded-run.json`
    proved `NET_DVR_Init` and callback registration, then `NET_DVR_Login_V40`
    failed with SDK error `7` before arm because the VM cannot route to the
    device.
  - Host-local Linux owner check:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/wsl-runtime-owner-proof.json`
    found only `docker-desktop` WSL and no usable bash userland; Docker Linux
    engine was not running.
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|Hikvision device seed defaults|Hikvision endpoint config|device event realtime helper|DEV Hikvision watcher runtime manifest"` passed.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed.
- Remaining boundary:
  - Real SDK login, alarm arm, physical tap callback, saved row existence,
    socket delivery to `localhost:5175`, and browser live-row proof remain
    unproven until either VM-to-device routing is repaired or a real
    host-local Linux runtime with device reachability is prepared and supplied
    valid Hikvision credentials.

## Latest Task Addendum - 2026-07-09 Hikvision Device Row Drift Correction

- User clarified current Hikvision config truth from the admin UI:
  `Main Entrance Device`, `Hikvision` / `DS-K1T341CMFW`, address
  `10.184.37.139`, HTTP port `80`, protocol `HTTP`.
- Drift correction:
  - Hikvision Linux probe defaults, README examples, and discovery wrapper now
    use `10.184.37.139` instead of historical `192.168.254.181` /
    `10.184.38.215` candidates.
  - The discovery wrapper now uses direct LAN SSH `10.184.37.19` with
    `node-health-appliance_ed25519` and no longer defaults Hikvision username
    to HRIS `admin@bandai.local`.
  - Historical `.234/.235` references are ZKTeco evidence, not Hikvision
    config truth, and must not be copied into the Hikvision runtime path.

## Latest Task Addendum - 2026-07-09 Hikvision Biometric Sync Architecture

- Task mode: Docs-only architecture intake with code-discovery evidence.
- Latest user request:
  - Document the Hikvision Linux HCNetSDK alarm-callback biometric sync
    architecture in WWG.
  - Use the existing Windows HCNetSDK reference under
    `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64`
    as behavior evidence.
  - Make the future Linux runtime copy/refactor the callback/user/fingerprint
    sync behavior without preserving demo names such as `AlarmDemo`.
- Current-state finding:
  - The Windows reference `AlarmDemo.cpp` includes multi-device SDK login,
    `NET_DVR_SetDVRMessageCallBack_V51`, alarm arming, ACS event
    classification, user sync, fingerprint read/write, broker enrollment,
    queued employee sync, and event-triggered reconcile.
  - The Project Truth Linux scaffold already has a bounded
    `hcnetsdk_alarm_probe.cpp`, but Linux SDK login/alarm callback remains
    unproven from the VM because the earlier SDK login returned
    `NET_DVR_PASSWORD_ERROR (1)`.
- Documentation result:
  - Added `.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md`
    as target architecture.
  - Synced Project Truth, Project Truth Summary, terminology, runtime truth,
    and recommendation registry with the target architecture and boundaries.
- Boundaries:
  - Raw fingerprint template storage in normal `User` records is not approved
    without encryption, access-control, and retention design.
  - Device writes/deletes and template propagation require dry-run, audit,
    backup/recovery, and rollback evidence before production use.
  - The running VM-managed Cloudflare Tunnel must remain active during future
    VM/GitOps/runtime proof.

## Latest Task Addendum - 2026-07-09 Real Endpoint Dry-Run Pattern

- User standardized the preferred investigation pattern: authenticate as the
  correct local actor, call the exact endpoint used by the page in dry-run or
  preview mode, time it with `Measure-Command`, and capture full JSON/API
  evidence before browser/UI diagnosis.
- `AGENTS.md` now records this as the Project Truth Real Endpoint Dry-Run Rule.
- `.wwg/governance/drift-guard.md` now enforces direct API/network endpoint
  proof before screenshots or code guessing, with `.runtime/<task-stamp>/`
  evidence capture.
- Browser verification remains Playwright-first for the current local
  environment, but browser proof follows endpoint proof for runtime regressions.

## Latest Task Addendum - 2026-07-09

- Task mode: Mixed governance update, runtime schema repair, and admin UI regression repair.
- Latest user request:
  - Prefer headless Playwright over Vercel `agent-browser` for current Project Truth browser verification because `agent-browser` is unreliable on this Windows host.
  - Use dry-run/API evidence against the actual page endpoint before guessing from the UI.
  - Repair `/admin/configuration/devices/events?view=saved&action=sync-logs` so the Sync device logs modal can find configured sync-capable devices.
- Local evidence:
  - Direct API proof hit the real frontend endpoint `GET http://localhost:3001/api/device/sync-preview`.
  - Initial API proof failed with HTTP 500 because local DEV Postgres was missing `public.device_sync_runs`.
  - Full `npm run prisma-postgres:push` was not applied because Prisma warned it would drop populated `benefit_types.sourceCode`, `sourceFrequency`, and `sourceSchedule` columns.
  - A narrow create-only SQL repair created `DeviceSyncRunType`, `DeviceSyncRunStatus`, `device_sync_runs`, its foreign key, and indexes without dropping data. Evidence: `.runtime/device-sync-preview-20260709-080841-db-repair/db-repair-output-split.json`.
  - After repair, `GET /api/device/sync-preview` returned HTTP 200 in about `0.075s` with one `Main Entrance Device` row. Evidence: `.runtime/device-sync-preview-20260709-080841/api-sync-preview-evidence.json`.
  - Headless Playwright against `http://localhost:5175/admin/configuration/devices/events?view=saved&action=sync-logs` captured one preview row, no "No sync-capable devices", and no "No device preview rows returned". Evidence: `.runtime/device-sync-preview-20260709-081043-playwright/playwright-sync-logs-evidence.json` and `.runtime/device-sync-preview-20260709-081043-playwright/sync-logs-modal.png`.
- Code/test result:
  - The sync preview path now tolerates a missing `device_sync_runs` table by continuing without latest skipped-run counts instead of blanking/failing the modal.
  - Focused backend regression passed: `npm test -- --grep "sync preview"`.
  - Focused Playwright smoke passed: `npx playwright test -c playwright.smoke.config.ts tests/smoke/admin-device-events-sync-modal.spec.ts`.
- Remaining drift:
  - Hikvision source-count and SDK proof must be rerun against the current
    `Main Entrance Device` row `10.184.37.139:80` with SDK port `8000` from
    device config. Older `10.184.38.x` Hikvision targets are historical only.
  - GitOps/K3s/public DEV promotion remains open before treating this local fix as production runtime proof.

## Latest Task Addendum - 2026-07-06

- Task mode: Mixed meaningful feature, persistence, admin UX, and local runtime verification.
- Latest user request:
  - Add Device Users as a clear row dropdown destination from `/admin/configuration/devices`.
  - Replace immediate user sync with a review-first flow and a final `Sync device users` confirmation inside the modal.
  - Keep the flow visually consistent with the existing Sync Logs modal while using distinct terminology so admins do not confuse identity records with attendance logs.
- Local decision:
  - `DeviceUser` is the durable device identity/enrollment record.
  - `EmployeeDeviceEnrollment` was avoided because current evidence supports direct optional `DeviceUser.employeeId` plus status/source metadata.
  - `Sync device users` and `Sync logs` remain separate admin actions.
  - Biometric template transfer was not implemented because safe vendor read/write plus backup/restore capability was not proven.
- Local evidence:
  - API and frontend hot reload used `localhost:3001` and `localhost:5175`.
  - Physical Hikvision `UserInfo/Search` sync created 6 physical-source `DeviceUser` rows; 4 were auto-linked and 2 remained `UNMATCHED`.
  - Legacy backfill from `Employee.deviceEmpId` created 2,213 additional rows, leaving 2,219 total `DeviceUser` rows and 2,217 linked rows.
  - Hikvision log sync processed 982 source rows, saved 376, classified 606 as known skipped, failed 0, and left 0 truly missing.
  - Browser proof exists at `.runtime/browser-evidence/screenshots/device-users-review-sync-modal.png` and `.runtime/browser-evidence/device-users-review-sync-evidence.json`.
- Remaining drift:
  - Promote and verify the implementation through VM/GitOps/public DEV before calling it production runtime truth.

## Task Summary

- Task mode: Mixed docs/config/runtime drift repair after Existing Project Adoption
- Existing Project Adoption context:
  - This repo was adopted into WWG from existing code/docs/config.
  - Code/docs/config remain evidence of operational reality.
  - Inferred or stale adoption truth must stay labeled and reconciled instead of silently overwritten.
- User request:
  - Make the `bnpi-hris.tech` named Cloudflare Tunnel the first-class public path.
  - Remove normal TryCloudflare usage from Project Truth, VM login, SSH login, visual proof, image/bootstrap, and WWG truth surfaces.
  - Clarify whether SSH can be accessed through the domain.
  - Clarify how fresh/final images work on another device.

## Current Decision

- Current tunnel bootstrap ownership: host-managed on the Windows host.
- Current proof VM also has a VM-managed connector active after deliberate root-only credential import.
- Running-server Cloudflare access must remain active by default. Agents must
  not disable, stop, mask, remove, or toggle off `cloudflared-bnpi-hris.service`
  on the live VM, and must not add a default-local/cloud-mode guard, unless the
  user explicitly requests a time-bounded outage and a verified recovery path is
  already documented.
- Preferred BNPI remote-admin journey is VM-managed Cloudflare Tunnel plus
  browser-rendered SSH at `https://ssh.bnpi-hris.tech`; the BNPI Windows Server
  should remain Hyper-V-only with no inbound ports, no Windows SSH setup, and no
  `.ssh/config` dependency.
- Canonical startup/repair command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

- Fresh/final images must not contain Cloudflare tunnel credentials.
- TryCloudflare is disabled by default and remains only a deprecated manual proof tool.
- Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the host-managed named tunnel.
- Public SSH through `ssh.bnpi-hris.tech` is also verified through the VM-side connector using `ssh://localhost:22`.
- Postgres Cloudflare Access TCP hostnames are configured as client-forwarding targets: `db.bnpi-hris.tech` for PROD, `dev-db.bnpi-hris.tech` for DEV, and `uat-db.bnpi-hris.tech` for UAT. These require client-side `cloudflared access tcp` and produce local DB URLs such as `postgresql://postgres:postgres@localhost:55432/hris`; they are not raw public Postgres URLs through normal Cloudflare Tunnel.
- Local `npm run dev` for HRIS API/app is configured to use the deployed DEV
  VM-backed Postgres through the Cloudflare Access TCP helper on
  `localhost:55433`; PROD and UAT helper URLs are documented beside it.
- Browser-rendered SSH is the desired clean journey for unprepared office or
  remote PCs; it still needs Cloudflare Access browser-rendering proof after the
  Zero Trust application setting is enabled.
- V6 packaging should preserve the V2 one-click extracted-zip shape: a small
  zip with a double-click `.cmd`, public bucket VHDX download, SHA-256
  verification, Hyper-V import/start, visible log window, and then V6 runtime
  proof. The Cloudflare tunnel credential must come from ProgramData at runtime,
  not from the zip, bucket image, repo, or baked VM.
- V7 is the current public package lane. It promotes the known clean V5 base
  image into `hyperv/v7/latest`, then keeps the V6 runtime proof/import path so
  the latest scripts, Cloudflare VM connector setup, and public checks run after
  import. The live proof VM disk was not published because it has contained
  root-only Cloudflare runtime credentials.
- A compact in-VM retained current-state VHDX now exists for the live proof VM
  after pruning development-stage observability rolling backups. It is retained
  evidence/staging only until Windows Hyper-V boot/import validation passes.
- Client/local VHDX retention is intentional: the host/client live VHDX may
  differ from the reusable public image and must not be overwritten or promoted
  by default. If a host-side or in-VM retained copy is needed, create it as a
  separate retained artifact with hash/manifest evidence, while keeping the
  clean public V7 package lane separate from any credential-bearing or
  client-specific disk.
- Current V6 proof serves public/LAN HRIS through healthy Docker Compose
  containers and VM-side Cloudflare. K3s/Argo still needs follow-up because many
  pods remain Pending/Evicted under memory pressure even when Argo Applications
  summarize as Synced/Healthy.
- 2026-07-01 incident correction: the current public HRIS path for PROD, UAT,
  and DEV is Docker Compose app/API containers behind the `bnpi-hris` named
  Cloudflare Tunnel. Do not treat K3s HRIS pods as the active public serving
  path until K3s/Argo is deliberately re-enabled and proven end-to-end.
- 2026-07-01 incident correction: K3s HRIS deployments/statefulsets are paused
  at zero replicas for DEV/UAT/PROD to avoid runtime contention while Docker
  Compose serves public HRIS. PVCs and data were not deleted.
- 2026-07-01 incident correction: public browser traffic must not call
  `https://*.bnpi-hris.tech:3001`. The working public pattern is same-origin
  `/api` through the app proxy/tunnel for app hostnames, with API hostnames
  available for direct health and API checks.

## Evidence

- Runtime VM: `project-truth-local-vhdx-proof`
- Canonical Project Truth LAN/runtime IP: `10.184.37.19` (pure static)
- Retained secondary transition IP/TLS SAN: `10.184.37.78` (pure static)
- LAN SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`
- Named tunnel: `bnpi-hris`
- Named tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Public verification artifact: `.runtime/cloudflare-drift-proof/20260629-220610/public-verification-final.json`
- VM text proof: `.runtime/cloudflare-drift-proof/20260629-220610/screen-overview.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/screen-tunnels.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/vm-text-surfaces.txt`
- Named tunnel wrapper evidence: `.runtime/cloudflare-named-tunnel/20260629-220627/bnpi-cloudflare-tunnel.json`
- Latest host readiness/provision evidence: `.runtime/cloudflare-host-readiness/20260629-223648/bnpi-cloudflare-host-readiness.json`
- Latest SSH DNS/ingress evidence: `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json`
- V2 packaging reference: `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.cmd`,
  `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.ps1`, and
  `.runtime/gcp-v2-format/README-v2.txt`
- Latest V6 one-shot proof:
  `.runtime/v6-one-shot/20260630-112256/v6-one-shot-result.json`
- V6 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\project-truth-hyperv-one-click-installer-v6.zip`
- Published V6 tiny package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v6/latest/project-truth-hyperv-one-click-installer-v6.zip`
- V7 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v7\20260630-161359\project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 VHDX path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-node-local-hyperv-v7-current-state.vhdx`
- Retained in-VM compact current-state VHDX:
  `/var/lib/project-truth/retained-vhdx/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx`
- Retained current-state VHDX evidence:
  `.runtime/in-vm-vhdx-build/20260703-102324/current-state-vhdx-report.md`,
  `.runtime/in-vm-vhdx-build/20260703-102324/manifest.txt`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.sha256`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.qemu-img-info.json`,
  and
  `.runtime/in-vm-vhdx-build/20260703-102324/host-hyperv-boot-validation.md`
- 2026-07-01 public app restore evidence:
  `/var/lib/project-truth/backups/public-app-session-restore-20260701-061721`
- 2026-07-01 DEV public origin restore evidence:
  `/var/lib/project-truth/backups/dev-public-origin-restore-20260701-062006`
- Browser evidence screenshots:
  `.runtime/browser-evidence/screenshots/bnpi-public-after-restore.png`
  and `.runtime/browser-evidence/screenshots/dev-public-after-restore.png`

## Validation Notes

- LAN SSH and LAN HRIS endpoints passed.
- Public app/API/dev/uat/Grafana checks passed after connector warmup.
- CORS preflight returned HTTP 204.
- Wrong-password auth probe returned HTTP 401.
- `ssh.bnpi-hris.tech` DNS route and tunnel ingress were provisioned; LAN SSH passed; after Cloudflare Access policy allowed `1bis.solutions.tech@gmail.com`, SSH through `cloudflared access ssh --hostname %h` returned `SSH_ACCESS_OK`.
- On 2026-06-29, the named tunnel credential was imported into the proof VM as root-only runtime state, `cloudflared-bnpi-hris.service` was enabled and active, `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector, and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`.
- On 2026-07-03, live VM banner evidence after `sudo project-truth-ansible-pull`
  reported `Cloudflare named tunnel mode: VM-managed active`, public HRIS/API,
  Grafana, SSH browser, and `ssh project-truth-hris` targets, plus `OS pull
  last: develop@75e7c1d845df` and sync time `2026-07-03T04:40:53Z`.
- On 2026-06-30, V6 one-shot proof passed LAN PROD/DEV/UAT app/API health,
  public PROD/DEV/UAT app/API/Grafana health, public CORS, VM-side Cloudflare
  ingress validation, and CLI SSH through `ssh.bnpi-hris.tech`.
- On 2026-06-30, a V2-style V6 one-click zip was generated and uploaded as a
  tiny package under `hyperv/v6/latest`; public URL checks returned HTTP 200 for
  the zip, installer script, README, and manifest. The package contains no VHDX
  and no Cloudflare credential.
- On 2026-06-30, V7 was published under `hyperv/v7/latest`: GCS metadata showed
  the VHDX at `75635884032` bytes, all V7 sidecar and installer URLs returned
  HTTP 200, the downloaded public V7 zip matched SHA-256
  `4534136199EEBA85FFAFBF08C8EAFEEDA1BBC784D9F4D3A269F30D9F95D75088`, and a
  V7 installer dry run targeted the V7 VHDX/manifest paths while preserving the
  runtime-only Cloudflare credential import.
- On 2026-07-01, PROD and UAT app containers were recreated from
  `hris-app-local:develop` image
  `sha256:fa41efd235cbb372b7b9c2cd631081d8f7a6738af464b7ca67a0dcf47cdd83c5`.
  Browser verification for `https://bnpi-hris.tech/` loaded the HR login screen,
  requested `https://bnpi-hris.tech/api/system-provisioning/status` with HTTP
  200, and showed no public `:3001` browser request.
- On 2026-07-01, DEV Docker Compose API/app containers were restored without
  rebuilding or touching the DEV Postgres volume. VM origin checks passed:
  `http://localhost:3100/auth/login` HTTP 200,
  `http://localhost:3100/api/auth/me` HTTP 401, and
  `http://localhost:3101/health` HTTP 200. Browser verification for
  `https://dev.bnpi-hris.tech/` loaded the HR login screen, requested
  `https://dev.bnpi-hris.tech/api/system-provisioning/status` with HTTP 200,
  and showed no public `:3001` browser request.
- Earlier on 2026-07-02, `10.184.38.138` no longer answered SSH or HRIS port
  probes from the Windows host. The VM was temporarily reached through DHCP
  transient address `10.184.38.144`, and host-managed `cloudflared-bnpi-hris.yml` was
  temporarily corrected to that DHCP address. This was superseded by stable
  secondary address `10.184.37.19`.
- Public verification from the client LAN is currently blocked by network
  policy: plain HTTP returns a company-policy block page and HTTPS resets
  during TLS for `bnpi-hris.tech` hostnames, while general Cloudflare/Google
  HTTPS works.
- On 2026-07-03, after the LAN config drift follow-up, the VM was hard-cut over to
  pure static LAN addressing on `eth0`. The accepted canonical runtime target is
  now `10.184.37.19/24`; `10.184.37.78/24` is retained as a secondary transition
  address/TLS SAN. DHCP is disabled, the default route is static via
  `10.184.38.254`, and read-only VM probes proved ping, SSH, and PROD/DEV/UAT
  API health on `10.184.37.19`.
- On 2026-07-03, Postgres Access TCP DNS routes for `db.bnpi-hris.tech`,
  `dev-db.bnpi-hris.tech`, and `uat-db.bnpi-hris.tech` were provisioned to the
  named tunnel and resolved to Cloudflare A records. The host-managed connector
  was started with DB TCP ingress, and the live VM-side `/etc/cloudflared/config.yml`
  was updated with matching DB TCP ingress while preserving existing SSH routes.
  A client-side `cloudflared access tcp --hostname db.bnpi-hris.tech --url localhost:55432`
  smoke test opened the local listener but Postgres protocol probing failed with
  `websocket: bad handshake`, and a read-only Access API list returned HTTP 403.
  Treat DNS/tunnel ingress as applied, but teammate DB access is not fully
  verified until Cloudflare Access applications/policies are created for the DB
  hostnames.
- Later on 2026-07-03, after Access browser success and token return, real
  Postgres query proof passed through Cloudflare Access TCP for all three DB
  hostnames using a temporary Node `pg` probe under `.runtime/pg-probe`:
  `db.bnpi-hris.tech` via local `56532`, `dev-db.bnpi-hris.tech` via local
  `56533`, and `uat-db.bnpi-hris.tech` via local `56534` each returned
  `current_database=hris`, `current_user=postgres`, server port `5432`, and
  `public_tables=70`. The wrapper command timed out during cleanup, but no
  temporary test forwards remained afterward; only the intentional PROD helper
  forward on `localhost:55432` remained active.
- Later on 2026-07-03, local dev verification kept the stable DB helper
  forwards active on PROD `localhost:55432`, DEV `localhost:55433`, and UAT
  `localhost:55434`. `hris-api/.env` defaulted `npm run dev` to the DEV forward
  on `localhost:55433`, `http://localhost:3001/health` returned HTTP 200, direct
  API login for `admin@bandai.local` returned HTTP 200, and Playwright login
  through the local app at `http://localhost:5175/auth/login` reached
  `http://localhost:5175/admin/dashboard`. DEV DB snapshot and UI counts
  matched: `users=2039`, `employees=2217`, `departments=12`. Evidence:
  `.runtime/local-dev/20260703-verify/db-snapshot-dev-active.json`,
  `.runtime/local-dev/20260703-verify/api-auth-login-proof.json`, and
  `.runtime/local-dev/20260703-verify/browser/playwright-login-proof.json`.
- Later on 2026-07-03, development-stage observability rolling backups were
  hard-deleted as approved: `/srv/hris/observability/backups/rolling` dropped
  from about `161G` to zero files, `/srv/hris/observability/backups` was about
  `28K`, and `/srv/hris/observability` was about `8.2G`. Backup and replicator
  containers were intentionally left stopped to prevent immediate archive
  regeneration.
- Later on 2026-07-03, a compact retained current-state VHDX was built inside
  the VM after the prune. `qemu-img info` reported VHDX format, virtual size
  `500 GiB`, file length about `92.6 GiB`, and disk size about `83.2 GiB`;
  SHA-256 was
  `486378d08bb76cde3716f3f9d4a24fc02c15636b2e39e895b0c59fba1d8a9a1c`;
  `qemu-img check -f vhdx` reported no errors. Final local VM checks returned
  HTTP 200 for PROD/DEV/UAT app/API, Grafana, Prometheus, Loki, and Tempo.
- Later on 2026-07-03, the host-test copy of the retained current-state VHDX
  completed on the Windows host at
  `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`, with
  SHA-256
  `b1274ae7b50214b0888cd97aa43a79b0e901c19c4ebce1824923778a0a77a8aa`.
  Hyper-V `Get-VHD` read it as a dynamic VHDX with `500 GiB` virtual size,
  `88.32 GiB` file size, and `0` fragmentation. The
  `project-truth-local-vhdx-proof` VM started successfully from the image,
  Hyper-V Worker/Admin event `18601` reported that it successfully booted an
  operating system, heartbeat was OK, and KVP reported guest IPs
  `10.184.37.78` and `10.184.37.19`. Direct Windows host probes to SSH and
  HRIS ports still failed because the current `ProjectTruth-External`
  host/vSwitch path is on `192.168.254.149/24` and did not route to the guest's
  static `10.184.37.x` addresses, even after a temporary additive host
  `10.184.37.250/24` test address.
- The host-tested VHDX became fully reachable after moving
  `project-truth-local-vhdx-proof` to internal switch
  `ProjectTruth-HostTest-10-184-37` and setting the Windows host-side vEthernet
  to `10.184.37.250/24` with `SkipAsSource=False`. SSH and PROD/DEV/UAT
  app/API ports passed on both `10.184.37.19` and `10.184.37.78`; HTTP probes
  returned `200` for PROD/DEV/UAT login and health URLs on `10.184.37.19`;
  SSH to `infra@10.184.37.19` returned hostname `project-truth-node`; and
  Docker showed healthy PROD/DEV/UAT app/API containers.
- Playwright VM login smoke against `PROJECT_TRUTH_GUEST_IP=10.184.37.19`
  passed for PROD and UAT. DEV reached the dashboard and captured screenshots,
  but the strict console-health assertion failed on the already-known
  non-blocking DEV `400 action metrics` warning: `Employee context is required
  for action metrics`. Screenshot evidence was captured under
  `.runtime/browser-evidence/screenshots/host-test-vhdx/`.
- `git diff --check` passed.
- `wwg test-check --format plain` passes after the stable `10.184.37.19`
  runtime/config drift repair because the Cloudflare config regression guard was
  updated with the active SSH origin.
- `wwg validate` passes after the stable LAN target drift repair.
- On 2026-07-09, the local HRIS device-event model was hard-cut over from
  attendance/source/status-led UI language to persisted `DeviceEvent`
  taxonomy fields: `eventCategory`, `eventAction`, `eventLabel`, and
  `eventConfidence`. A narrow SQL migration/backfill preserved all 96 existing
  `device_events` rows, created backup table
  `device_events_backup_20260709_225223`, and backfilled:
  `ATTENDANCE/TAP/PROVEN=32`, `ACCESS_CONTROL/UNKNOWN/UNKNOWN=62`, and
  `UNKNOWN_VENDOR/LISTENER_RECEIVED/UNKNOWN=2`. The admin route now presents
  `Device events`, category/action filters, `HRIS result`, and debug-only
  runtime path wording while retaining raw `source` and processing `status`
  compatibility fields. Evidence:
  `.runtime/device-event-model-hardcutover-20260709-225223/`.

## Follow-Up Needed

- Decide whether VM-managed Cloudflare should become the canonical fresh-import path; this requires an explicit secure credential handoff procedure and must not bake credentials into images.
- Define the retained-client-VHDX artifact flow: host export/copy remains the
  reliable Hyper-V artifact, and any in-VM copy should be secondary evidence or
  staging only unless proven bootable/importable from Windows Hyper-V.
- Decide whether the internal `ProjectTruth-HostTest-10-184-37` switch should
  remain the standard local VHDX validation path when the Wi-Fi-backed
  `ProjectTruth-External` switch cannot route from the Windows host to the
  guest's static `10.184.37.x` addresses.
- Repair or classify the DEV `400 action metrics` console warning if future
  Playwright gates require zero console errors for DEV HR manager dashboard
  login. The dashboard renders and the warning is already documented as
  non-blocking in V6 evidence, but the strict smoke assertion still fails.
- Fix observability backup source/retention before re-enabling backup and
  replicator containers; the current backup loop generated about `161G` of
  rolling archives and logged stale `/data/grafana` archive errors.
- Keep Cloudflare Access SSH policy in the `933c5547e32839d664d155ce8a7424d5` Zero Trust account aligned with the allowed operator email.
- Replace shared Postgres superuser teammate URLs with limited per-environment
  database users before broadening DB Access TCP use beyond trusted operators.
- Enable and verify browser-rendered SSH for `https://ssh.bnpi-hris.tech` so
  remote admins can access the VM from unprepared browsers without configuring
  BNPI Windows host SSH or per-PC `.ssh/config`.
- Reconcile whether Docker Compose is the intended serving runtime for this V6
  appliance profile or tune K3s memory/capacity until Argo/K3s health matches
  the actually served HRIS app/API.
- Resolve existing WWG generated-report validation findings before release/commit claims that require a fully green WWG gate.

## Latest Task Addendum - 2026-07-12 Hikvision Listener VM Runtime Reachability And Live DEV Status Repair

- Task mode: VM listener/runtime repair, K3s DEV API promotion, and live
  endpoint proof.
- User goal:
  - Fix the Hikvision Linux listener path so the managed VM service is running
    and so the DEV API/UI can read truthful listener status from the same VM.
- Current-state finding before the fix:
  - The VM service could be started manually over `ssh project-truth-hris`,
    but the live DEV `hris-api` pod still used stale listener code that pointed
    at `10.184.37.241`.
  - After the first controller patch, the live DEV API still could not expose
    status/control because it ran inside a container without `ssh`, without a
    mounted VM key, and therefore could not reach the host-managed systemd
    service honestly.
- Implemented repair:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now rebuilds from
    `/opt/project-truth/vendor/hikvision-linux` and defaults HRIS posts to
    `http://localhost:3101`.
  - Added managed VM daemon wrapper
    `scripts/project-truth-hikvision-hot-reload-daemon.sh` and managed unit
    `appliance/systemd/project-truth-hikvision-hot-reload-listener.service`.
  - `hris-api/app/device/device.controller.ts` now installs the wrapper,
    daemon, and systemd unit together and exposes corrected VM target logic for
    the managed listener controls.
  - `ansible/project-truth-pull.yml` and
    `appliance/bin/project-truth-os-sync.sh` now install the managed listener
    scripts/unit so the repair survives VM self-heal.
  - `hris-api/Dockerfile` now installs `openssh-client`, and
    `gitops/runtime-k8s/overlays/dev/runtime.yaml` now mounts
    `/var/lib/project-truth/ssh` plus `PROJECT_TRUTH_VM_HOST`,
    `PROJECT_TRUTH_VM_USER`, and `PROJECT_TRUTH_VM_SSH_KEY` env so the DEV API
    pod can SSH back to the VM host truthfully.
  - Provisioned VM-local SSH key
    `/var/lib/project-truth/ssh/node-health-appliance_ed25519`, authorized it
    for `infra`, rebuilt `hris-api-local:develop`, imported it into K3s, and
    rolled the DEV `hris-api` deployment after temporarily pausing
    `project-truth-ansible-pull.timer` to avoid stale checkout drift during the
    rebuild. The timer was restarted after the rollout.
- Proven live truth:
  - VM systemd now reports
    `project-truth-hikvision-hot-reload-listener.service` as
    `ActiveState=active`, `SubState=running`, `Result=success`.
  - The live DEV authenticated endpoint
    `GET /api/device/hikvision/listener` now returns:
    - `vm.host=10.184.37.19`
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `logs.available=true`
    - `sdk.state=login_failed`
    - `lastLoginError=7`
  - The DEV pod now has `/usr/bin/ssh` and mounted key files at
    `/var/run/project-truth/ssh/node-health-appliance_ed25519`.
- Remaining blocker:
  - The listener runtime and API/UI visibility are repaired, but the physical
    device itself is still not armable from the VM today. Journals and live API
    logs show repeated `sdk_login host=10.184.37.139 lastError=7 ok=false` and
    `service_start_failed reason=no_armed_devices`, so endpoint truth now
    accurately reports a real device/network/credential failure instead of an
    opaque unknown state.

## Latest Task Addendum - 2026-07-12 Local Postgres Device Tables Drift Fallback Repair

- Task mode: Local API regression repair while the user exercises admin device
  journeys.
- User goal:
  - Stop local admin device pages from throwing repeated 500s while the current
    localhost runtime uses an older Postgres shape without `device_users` and
    without newer `device_events` taxonomy columns.
- Current-state finding before repair:
  - Local `localhost:3001` returned 500 for
    `GET /api/device/events?page=1&limit=10&sort=eventTime&order=desc&dateField=eventTime`
    because the raw SQL assumed:
    - `public.device_users` exists,
    - `device_events.deviceUserId` exists,
    - and taxonomy columns `eventCategory`, `eventAction`, `eventLabel`,
      `eventConfidence` exist.
  - The same local runtime returned 500 for `GET /api/device/sync-preview`
    because it called `prisma.deviceUser.findMany()` directly while
    `public.device_users` was absent.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now detects local
    `device_events` column presence through `information_schema` and degrades
    raw SQL to safe defaults when older columns are missing.
  - The device-events query now:
    - avoids joining `device_users` when either the table or the
      `device_events.deviceUserId` column is missing,
    - substitutes safe fallback values for missing taxonomy columns,
    - and keeps response shape stable for the frontend.
  - `GET /api/device/sync-preview` now treats missing `device_users` as an
    empty per-device user inventory instead of crashing.
  - Device-user list retrieval now returns an empty success payload with
    `migrationState=device_users_table_missing` instead of a 500 when the table
    is absent.
  - `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` now includes the
    contract coverage for these fallback paths.
- Proven local truth:
  - After restarting the local `tsx watch` API process, direct authenticated
    local endpoint proof succeeded:
    - `GET /api/device/events?...dateField=eventTime` returned HTTP 200 with
      populated saved-event rows.
    - `GET /api/device/sync-preview` returned HTTP 200 with device preview data
      and zeroed user summary values where `device_users` truth is unavailable.
  - The local DB truth probe showed the current `device_events` table is
    missing:
    - `deviceUserId`
    - `eventCategory`
    - `eventAction`
    - `eventLabel`
    - `eventConfidence`
  - Current behavior is now truthful: older local DB shape still works for read
    journeys, but richer device-user features remain naturally empty until the
    table is migrated.

## Latest Task Addendum - 2026-07-12 Listener Fallback and Cross-LAN Truth

- Task mode: Device listener runtime truth repair while the user continues the
  admin Sync Center journey from a host that is not currently on the VM's
  direct LAN path.
- Current-state finding before repair:
  - Local `GET /api/device/hikvision/listener` still returned HTTP 200 but with
    misleading degraded truth:
    - `running=false`
    - `status=unknown`
    - `control.available=false`
    - `error=ssh: connect to host 10.184.37.19 port 22: Connection timed out`
  - The admin Sync Center therefore rendered `VM stopped` even though the VM
    listener service was actually healthy when reached through the prepared
    Cloudflare SSH alias.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now tries Hikvision VM commands
    against multiple targets in order:
    - direct LAN SSH to `infra@10.184.37.19`
    - fallback SSH alias `project-truth-hris`
  - The same fallback logic now applies to remote command execution and file
    copy operations used by listener status/control/runtime install flows.
  - Listener status payloads now expose the resolved path through
    `vm.path`, for example `alias:project-truth-hris`.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now distinguishes
    `status unreachable` from `VM stopped` so the Sync Center stops claiming a
    healthy remote listener is down when only the local LAN probe failed.
  - `hris-app/app/routes/admin/devices/events.tsx` now treats
    `control.available=false` and endpoint-level listener errors as status
    unavailability, not just transport exceptions.
- Proven local truth after restart:
  - After restarting the local `tsx watch` API runtime, direct authenticated
    local endpoint proof now returns:
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `vm.path=alias:project-truth-hris`
    - `sdk.state=login_failed`
    - `sdk.lastLoginError=7`
  - This confirms the cross-LAN admin/browser path is now repaired: the host
    can interrogate the VM listener through the prepared fallback route even
    when direct LAN SSH to `10.184.37.19` is unavailable from the workstation.
- Remaining blocker now isolated:
  - From the VM itself, direct probes show the physical device path is broken:
    - `10.184.37.139:8000` -> `No route to host`
    - `10.184.37.137:80` -> timed out
  - `GET /api/device/sync-preview` therefore still correctly reports
    `status=source_unavailable` with
    `error=Hikvision event total unavailable (code 20)`.
  - Current truth:
    - remote admin-to-VM listener visibility is repaired,
    - VM-managed listener service is running,
    - but VM-to-device network reachability still blocks real device user/tap
      acquisition.

## Latest Task Addendum - 2026-07-12 Dev Reset and VM Device Target Alignment

- Task mode: Live dev cleanup plus VM listener target correction while the user
  validates Hikvision LAN behavior before on-site work.
- User-requested cleanup completed:
  - Executed full saved device-event reset through the admin endpoint with
    built-in backup export.
  - Result:
    - `deleted.deviceEvents=173744`
    - `deleted.linkedAttendance=12`
    - `countsAfter.deviceEvents=0`
    - `countsAfter.linkedAttendance=0`
  - Backup evidence directory:
    - `.runtime/backups/device-events-reset-2026-07-12T08-15-43-135Z`
- Local host runtime corrected:
  - Local device row now uses the SADP-discovered address `10.184.38.137`
    instead of stale `10.184.37.137`.
  - Post-reset local proof now shows:
    - `GET /api/device/events?...` => `total=0`
    - `GET /api/device/sync-preview` => device address `10.184.38.137`,
      `hrisSavedCount=0`, `status=source_unavailable`
- VM listener truth corrected:
  - The VM runtime had a separate source of truth and was still targeting
    `10.184.37.139`.
  - Updated the VM-side `hris-postgres-dev` device row to
    `10.184.38.137`, verified `/run/project-truth/hikvision-hot-reload-device.spec`
    reflects that address, and restarted
    `project-truth-hikvision-hot-reload-listener.service`.
  - Live listener logs now show the listener attempting:
    - `sdk_login host=10.184.38.137`
    - `lastError=7`
    - `service_start_failed reason=no_armed_devices`
- Current final truth:
  - App/browser -> local API -> VM listener control path is working.
  - Local dev saved device events are cleared.
  - Local device configuration and VM listener target are aligned on
    `10.184.38.137`.
  - The remaining blocker is physical Hikvision reachability/auth behavior from
    the VM to the actual device LAN target, not stale app state or stale
    listener target selection.

## Latest Task Addendum - 2026-07-12 Cross-Network Hikvision Agent Mode

- Task mode: Architecture repair for deployments where the browser/admin user
  and central HRIS runtime are not on the same LAN as the Hikvision terminal.
- Research-backed conclusion:
  - For direct HCNetSDK/ISAPI control, some runtime still needs LAN adjacency
    to the physical device.
  - The correct cross-network pattern is not "make the browser share the
    device LAN"; it is "run an outbound agent on the device LAN and let that
    agent post back to HRIS."
- Implemented runtime change:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now supports:
    - `HIKVISION_HOT_RELOAD_DEVICE_SOURCE=postgres` for the VM-local mode
      already in use
    - `HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api` for a remote site-agent mode
  - In `api` mode, the wrapper:
    - authenticates to the configured HRIS API base,
    - fetches active Hikvision `Device` rows and credentials from
      `/api/device?...document=true`,
    - prepares the SDK spec locally on the site host,
    - then runs the same HCNetSDK listener and callback-post pipeline.
  - Added `scripts/hikvision-remote-site-agent.env.example` as the minimal env
    example for that mode.
- Proven contract:
  - `hris-api` Hikvision biometric sync contract tests still pass after the
    wrapper change.
- Architectural implication:
  - This enables the same Project Truth Hikvision listener runtime to be placed
    beside the remote device tomorrow, while still using central/public HRIS
    as the source of truth and callback sink.

## Latest Task Addendum - 2026-07-14 Multi-User Biometric Export Custody

- Task mode: mixed meaningful feature and regression repair with real-device,
  API, and Playwright proof.
- Main Entrance Device E current local snapshot contains 239 DeviceUser rows.
- Separate encrypted biometric custody is proven:
  - 217 rows contain a real fingerprint AES-256-GCM envelope.
  - 103 rows contain a real face AES-256-GCM envelope.
  - Fingerprint and face use separate envelope/key-source/blob columns.
  - No row reuses one encrypted ciphertext for both modalities.
- Twenty rows remained SDK-empty after combined, fingerprint-only, and
  face-only attempts. They remain explicit export errors/empty cells; no raw or
  encrypted value was fabricated from stale enrollment counts.
- Cached export proof through the real admin UI:
  - CSV download: 3.759 seconds.
  - Excel download: 3.655 seconds.
  - Package JSON download: 3.137 seconds.
  - All export POSTs and downloads were below 10 seconds.
- Full-package import readiness:
  - Portable JSON compaction removed duplicate encrypted objects and reduced
    the 239-user file from 11.9 MB to 4.98 MB without removing the visible
    fingerprint/face key/blob columns.
  - Package import preview: 239 matches, zero conflicts, `unlockable=true`,
    `plaintextExposed=false`.
  - Playwright CSV import preview: 239 matches, zero conflicts,
    `unlockable=true`, `plaintextExposed=false`, 2.578 seconds, no console
    errors.
- Local testing alignment:
  - The port 5175 frontend was restarted with a local API override so the
    current browser testing journey uses `http://localhost:3001/api` rather
    than the older VM API image.
  - The VM-managed Cloudflare Tunnel and Hikvision listener remained active.
- Remaining boundary:
  - Encrypted export and non-mutating import preview are proven.
  - Physical offline restore still needs the reviewed C++ SDK write-from-bundle
    path; direct HTTP write-back is not accepted as complete.
- Evidence: `.runtime/multi-user-biometric-export-proof-20260714-182917/`.

## 2026-07-15 Device Sync Progress And Bounded Preflight Addendum

- Status: `IN_PROGRESS` for the wider biometric portability finish line; the requested background-progress and bounded offline-device UX is implemented and locally proven.
- Device-user biometric capture is resumable and visible through an orange status modal and reopenable status badge. Main Entrance Device C job `d3a6f6f8-d16c-4919-b65e-e0b7a54502be` completed 537 modality tasks: 531 captured, 22 already present/cached, and 6 failed. The six failures remain explicit and are not treated as portable credentials.
- Merge preview reads independent devices concurrently and excludes devices that the bounded availability preview marks unavailable. Sync Logs preserves its last usable rows while its 15-second quiet refresh runs.
- Headless Playwright measured merge UI readiness at 3.369 seconds, merge API completion at 2.939 seconds, and sync preview refreshes at 4.406-4.677 seconds, with no console errors and no refresh skeleton replacing rows.
- CI passed at `f57d45e`. After repairing the npm 10 lockfile contract, VM reconciliation completed with zero failures, DEV Argo CD returned `Synced/Healthy`, new app/API pods were running, LAN app/API returned HTTP 200, and `cloudflared-bnpi-hris.service` remained active. The deployed merge dry-run completed in 3.781 seconds.
- Evidence: `.runtime/device-preflight-latency-20260715-151721/`, `.runtime/biometric-portability-proof-20260715-114841/playwright-main-c-background/`, and `.runtime/device-user-sync-jobs/d3a6f6f8-d16c-4919-b65e-e0b7a54502be.json`.

## 2026-07-15 Main Entrance Device C Export Accuracy Addendum

- Status: `COMPLETE` for the bounded current-page Excel/Package JSON export and import-preview journey; physical target-device restore remains explicitly unclaimed.
- The export modal now loads the source page while open, shows `Current page: 8 rows`, validates a separate v2 envelope for each device/user/modality, and refuses to create a biometric file when requested positive-count credentials are missing. The existing resumable background capture job is opened instead.
- Final headless Playwright downloads contained eight valid fingerprint envelopes for eight reported fingerprint users and seven valid face envelopes for seven reported face users. Vendor user 8 reports no face and correctly exports an empty face field with `not_enrolled` status.
- The real `.xlsx` had 28 required headers, zero placeholder cells, and safe hash parity with the separately downloaded Package JSON. Correct-passphrase import preview unlocked all 15 envelopes without plaintext exposure; an incorrect passphrase was rejected.
- Evidence: `.runtime/biometric-excel-proof-20260715-162935/`.

## 2026-07-19 Device Person 15 Architecture Documentation Addendum

- Task mode: docs-only architecture clarification following the Device Events / Device Users `15` vs `00015` identity repair.
- Operator intent documented:
  - Device user/person `15` created on the physical Hikvision device must appear as DeviceUser `vendorUserId=15`.
  - Device Events should resolve to the plain device person id `15` when DeviceUser or callback evidence exists.
  - Clicking `Device user` must navigate to Device User `15`, not a padded HRIS employee code.
  - Clicking an employee record may show the HRIS-padded code/device id `00015` when that employee is safely linked.
- Architecture verdict: the three-plane model remains correct: `DeviceUser` is physical-device identity/current inventory, `DeviceEvent` is saved event/history evidence, and `Employee` is the HRIS person record. Padding belongs only to HRIS employee matching/display; it must not rewrite `DeviceUser.vendorUserId`.
- Documentation updated:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` now includes a modal/click flowchart, ER diagram, decision table, and implementation-owner map for this contract.

## 2026-07-19 Hikvision Storage And Network Visualization Addendum

- Task mode: docs-only architecture clarification from operator runtime evidence.
- Observed network evidence:
  - From `project-truth-db-access` / `infra@project-truth-node`, `ping 192.168.254.102` returned `Time to live exceeded` from `61.245.16.174`.
  - Interpretation: the shell does not have a direct ICMP/L3 route to the private Hikvision device LAN. This is not proof that the panel is down and not proof that HRIS model storage failed.
  - Architecture boundary: Cloudflare DB/SSH access is not a general LAN route; use selected TCP reverse forwards or a site agent on the device LAN for HCNetSDK/ISAPI evidence.
- Storage documentation updated:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` now documents what is created/updated on panel user create and fingerprint enroll:
    - `DeviceEvent` rows for `USER_CREATED` and `FINGERPRINT_ENROLLED`.
    - one `DeviceUser` row for the current physical user identity (`vendorUserId=15`).
    - actual fingerprint template custody belongs to encrypted `DeviceUser.vendorMetadata.biometricBundle` / `_hrisDeviceMetadata.biometricExport` after the SDK biometric export worker reads template bytes; `DeviceEvent` stores proof/evidence only.
    - optional `DevicePersonToken` when Hikvision operation logs expose only an opaque token.
    - optional `Employee` link when an existing HRIS employee safely matches.
- Architecture twin updated:
  - `.wwg/wiki/05-architecture/hikvision-enrollment-identity-architecture.md` now records that `Employee.deviceEmpId` is plain for device matching, while `Employee.employeeId` may be padded/display-coded.

## 2026-07-19 Reverse Tunnel Stability Hardening Addendum

- Task mode: focused runtime hardening for Device Events Keep Ready / predev live path.
- Root cause identified:
  - The reverse tunnel itself can be healthy while the UI still shows six direct off-LAN device SDK login failures.
  - The older Keep Ready proof could also trust a stale Windows `ssh.exe` process or host-local `127.0.0.1:59000` instead of proving the VM-side reverse listener ports actually exist.
- Implemented hardening:
  - `scripts/ensure-device-live-path.ps1` now proves VM-side `127.0.0.1:59000` and `127.0.0.1:59443` before treating the Hikvision reverse bridge as healthy.
  - If a local SSH bridge process exists but VM reverse ports are not proven, Keep Ready records `reverse_bridge_stale` and rebinds the bridge.
  - `hris-api/scripts/ensure-device-live-path.cjs` fast path now requires VM SDK reverse proof instead of accepting a host-local SDK port as enough.
- Runtime proof after hardening:
  - `node hris-api/scripts/ensure-device-live-path.cjs` fast-passed with VM `53001=true` and VM `59000=true`, and listener `service_started` showed `hrisApiBase=http://127.0.0.1:53001`.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-device-live-path.ps1` returned `ok=true`, DB tunnel open, VM reverse ports open, API reverse open, and listener API base already host-aligned.
  - Listener status after hardening showed TEST A on `127.0.0.1:59000` with `lastLoginOk=true`, `armed=true`, `receivingCallbacks=true`, and `postingToHris=true`.
# Latest Task Addendum - 2026-07-19 Raw fingerprint callback/UserInfo race repair

- Task mode: Biometric persistence regression repair plus operator-journey hardening.
- Root cause: the C++ listener successfully read and posted the raw template, and the enrollment DeviceEvent retained it, but a slower UserInfo enrichment could overwrite DeviceUser with metadata read before the callback completed.
- Repair: DeviceUser UserInfo enrichment now uses an `updatedAt` optimistic merge/retry and preserves current raw fingerprint/face custody across a concurrent callback write.
- User journey: the Device Users details modal refetches the saved HRIS row and shows `Checking saved templates…` during that read; it does not show `Not captured yet` until absence is confirmed.
- Live TEST A proof: exact event `cmrrwqkpc009l7zaogna1hbkd` for person `18` replayed successfully; after 20 seconds DeviceUser retained one 684-character raw template from `cpp_sdk_callback_raw`. Users `15` and `18` both rendered `1 stored` in headless browser proof.
- Verification: 22 focused backend tests, 14 C++ source-contract tests, and 1 modal Playwright regression passed. The current C++ source also built/linked against the VM HCNetSDK in an isolated output path.
- Evidence: `.runtime/fingerprint-enroll-raw-race-20260719/summary.md` and screenshots in the same directory.
- Boundary: do not infer a person id from an empty first major=3 callback; raw capture starts after plain device-person identity is evidenced.

# Latest Task Addendum - 2026-07-20 DeviceUser Raw Biometric Export/Import Proof

- Task mode: mixed biometric custody repair, export/import correctness, and admin modal UX hardening.
- Current TEST A runtime truth from the completed proof: 394 exported DeviceUser rows, 338 linked, 56 unlinked; 361 rows report fingerprints and 316 rows carry raw fingerprint blobs; the latest package preview carries 628 raw fingerprint templates against the previously proven 718 enrolled template slots; 356 rows report face and 311 carry raw face blobs.
- Sync recovery loop: TEST A biometrics-only jobs `e692290a-1d4f-4965-887f-c107bd473992` and `8d3a48df-a85e-44e2-abd3-3120d21e046f` completed with zero new captures and cached existing custody; all-Hikvision recovery job `6c7e3e4c-f722-4b00-a57c-81e06ab709d4` remained stalled on Main Entrance Device B fetch failures and is not proof that TEST A is incomplete.
- Export proof: real browser downloads for CSV, Excel, and Package JSON have 394 rows/users, no duplicate columns, no encrypted/passphrase copy, explicit `not_enrolled` / `missing_raw_blob` statuses, and multi-fingerprint cells using the `FPn("...")` pattern.
- Import proof: full 22,968,896-byte Package JSON preview succeeded non-mutating on a proof API with `HRIS_API_BODY_LIMIT=75mb`; matching users 394, conflicts 0, missing HRIS employees 55; execute without `confirmation="IMPORT DEVICE USERS"` was rejected with HTTP 400.
- UI proof: export modal shows the current action, scope, row count, and biometric readiness while preview/export is running; CSV import modal shows preview-first wording and package-data status without raw/developer copy.
- Remaining boundary: 46 rows still have `Reported biometric enrollment exists but no evidenced raw blob is stored`; this is retained as `partial_missing_requested_raw_blobs`, not fabricated from counts.
- Evidence: `.runtime/device-user-raw-export-proof-20260720-110129/final-evidence-summary.json`, `browser-export-download-proof.json`, `api-import-proof-3002-summary.json`, and screenshots in the same directory.
