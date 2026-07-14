import { expect } from "chai";
import { describe, it } from "mocha";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Hikvision biometric sync contract", () => {
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.controller.ts"), "utf8");
	const routerSource = () => readFileSync(join(process.cwd(), "app/device/device.router.ts"), "utf8");
	const serviceSource = () =>
		readFileSync(
			join(process.cwd(), "../vendor/hikvision-linux/hikvision_biometric_service.cpp"),
			"utf8",
		);

	it("exposes admin-only dry-run and execute reconciliation without template custody", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.post("/biometric-sync/reconcile", controller.reconcileBiometricSync)',
		);
		expect(controller).to.include("const reconcileBiometricSync = async");
		expect(controller).to.include("const admin = assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("const execute = body.execute === true");
		expect(controller).to.include("Biometric sync reconcile dry-run completed");
		expect(controller).to.include("Biometric sync reconcile job accepted");
		expect(controller).to.include("res.status(202).json");
		expect(controller).to.include("jobId: reconcileRunId");
		expect(controller).to.include("setImmediate(() =>");
		expect(controller).to.include("body.synchronous === true");
		expect(controller).to.include("upsertDeviceUsersFromCandidates");
		expect(controller).to.include("biometricSync: biometricSyncPayload");
		expect(controller).to.include("rawFingerprintTemplateStored: false");
	});

	it("exposes a scoped admin-only Hikvision peer copy route for real device-user propagation", () => {
		const router = routerSource();
		const controller = controllerSource();
		const wrapper = readFileSync(
			join(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
			"utf8",
		);

		expect(router).to.include(
			'routes.post("/hikvision/copy-user", controller.copyHikvisionDeviceUserToPeer)',
		);
		expect(controller).to.include("const copyHikvisionDeviceUserToPeer = async");
		expect(controller).to.include("const executeHikvisionDeviceUserPeerCopy = async");
		expect(controller).to.include("const copyHikvisionUserToPeerWithRetry = async");
		expect(controller).to.include("const runHikvisionManualCopyOnVm = async");
		expect(controller).to.include("const writeHikvisionManualCopySpec =");
		expect(controller).to.include("HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1");
		expect(controller).to.include("HIKVISION_DEVICE_SPEC_OVERRIDE=");
		expect(controller).to.include('name: "static_spec"');
		expect(controller).to.include("peer_copy_noop_already_synced");
		expect(controller).to.include("peer_copy_noop_overlay_only");
		expect(controller).to.include("strategy: \"noop_overlay_only\"");
		expect(controller).to.include("!shouldConvergeDeviceUserToPeer(sourceDeviceUser, existingTargetDeviceUser)");
		expect(controller).to.include("const isMissingHikvisionListenerRuntimeError =");
		expect(controller).to.include("const runManualCopy = (extraEnv: string[] = []) =>");
		expect(controller).to.include("Math.max(waitSeconds * 1000 + 45000, 60000)");
		expect(controller).to.include("maxBuffer: 5 * 1024 * 1024");
		expect(controller).to.include("result.exitCode !== 0");
		expect(controller).to.include("isMissingHikvisionListenerRuntimeError(firstAttemptDetail)");
		expect(controller.indexOf('name: "postgres"')).to.be.lessThan(
			controller.indexOf('name: "api"'),
		);
		expect(controller).to.include("HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api");
		expect(controller).to.include("HIKVISION_VM_LOCAL_API_BASE");
		expect(controller).to.include("HIKVISION_VM_WRAPPER_REMOTE_PATH");
		expect(controller).to.include("HIKVISION_DEVICE_USER_COPY");
		expect(controller).to.include("sourceDeviceId, targetDeviceId, and employeeNo are required");
		expect(controller).to.include("syntheticCredentialOverlayApplied");
		expect(controller).to.include("refreshed target truth still shows");
		expect(controller).to.include("Treat this as not copied yet");
		expect(controller).to.include("await mirrorDeviceUserLinkToPeer({");
		expect(wrapper).to.include("--run-once");
		expect(wrapper).to.include("HIKVISION_DEVICE_ID_FILTER");
		expect(wrapper).to.include('cmd+=(--seconds "${HIKVISION_RUN_SECONDS:-1}")');
	});

	it("supports scoped device-user export and gated import execute without plaintext biometric custody", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include('routes.post("/users/export/preview", controller.previewDeviceUserExport)');
		expect(router).to.include('routes.post("/users/export", controller.exportDeviceUsers)');
		expect(router).to.include('routes.post("/users/import/preview", controller.previewDeviceUserImport)');
		expect(router).to.include('routes.post("/users/import/execute", controller.executeDeviceUserImport)');
		expect(router).to.include('routes.get("/users/import/jobs/:jobId", controller.getDeviceUserImportJob)');
		expect(controller).to.include("const normalizeDeviceUserExportSelection =");
		expect(controller).to.include('"currentPage", "selectedRows"');
		expect(controller).to.include("const filterDeviceUserExportRows =");
		expect(controller).to.include("vendorUserIds");
		expect(controller).to.include("encryptedBiometricBundle");
		expect(controller).to.include("DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM");
		expect(controller).to.include('"aes-256-gcm"');
		expect(controller).to.include("BIOMETRIC_TEMPLATE_KEY_PATTERN");
		expect(controller).to.include("[redacted-biometric-template]");
		expect(controller).to.include("sanitizeDeviceUserPortableValue");
		expect(controller).to.include("buildDeviceUserImportResultRow");
		expect(controller).to.include("summarizeDeviceUserImportTarget");
		expect(controller).to.include("waitForDelayedHikvisionPeerCopy");
		expect(controller).to.include("HIKVISION_PEER_COPY_COMPLETION_WAIT_MS");
		expect(controller).to.include("raw fingerprint and face template bytes are never exported in normal JSON");
		expect(controller).to.include("encrypted_bundle_required_or_sdk_peer_copy");
		expect(controller).to.include("const buildDeviceUserImportPreviewToken =");
		expect(controller).to.include("previewToken from this preview response");
		expect(controller).to.include("Import execute requires a fresh previewToken from import preview");
		expect(controller).to.include("Encrypted biometric bundle import requires a passphrase");
		expect(controller).to.include("Portable biometric import requires an encrypted bundle passphrase");
		expect(controller).to.include("const sanitizeDeviceUserImportPayloadForBackup =");
		expect(controller).to.include("[encrypted-bundle-redacted]");
		expect(controller).to.include("plaintextBiometricExposed: false");
		expect(controller).to.include("rawUser?: unknown");
		expect(controller).to.include("copyHikvisionUserToPeerWithRetry({");
		expect(controller).to.include('strategy: "delayed_target_reread"');
		expect(controller).to.include("const runDeviceUserImportExecuteWork = async");
		expect(controller).to.include("const getDeviceUserImportJob = async");
		expect(controller).to.include("Device-user import job accepted");
		expect(controller).to.include("runAsJob");
		expect(controller).to.include("pollUrl: `/api/device/users/import/jobs/${jobId}`");
		expect(controller).to.include("DEVICE_USER_PACKAGE_IMPORT_JOB_DIR");
		expect(controller).to.include("persistDeviceUserPackageImportJob(job)");
		expect(controller).to.include("readDeviceUserPackageImportJob(jobId)");
		expect(controller).to.include("interrupted_by_api_restart");
		expect(controller).to.include("Conflict requires manual review before additive import");
		expect(controller).to.include("target-device-users-before.json");
		expect(controller).to.include("target-device-users-after.json");
		expect(controller).to.include('"http://127.0.0.1:3101"');
		expect(controller).to.not.include("fingerprintTemplate: user");
		expect(controller).to.not.include("faceTemplate: user");
	});

	it("exposes a dev-safe synthetic fingerprint tally route without claiming physical device truth", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.post("/hikvision/mock-fingerprint", controller.mockHikvisionFingerprintTally)',
		);
		expect(controller).to.include("const mockHikvisionFingerprintTally = async");
		expect(controller).to.include("deviceId and vendorUserId are required");
		expect(controller).to.include("Source device must be Hikvision");
		expect(controller).to.include("syntheticCredentialSummary");
		expect(controller).to.include("Applied as dev-only synthetic fingerprint tally for UI verification");
	});

	it("exposes a dev-safe synthetic face tally route for cross-device verification", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.post("/hikvision/mock-face", controller.mockHikvisionFaceTally)',
		);
		expect(controller).to.include("const mockHikvisionFaceTally = async");
		expect(controller).to.include("Applied as dev-only synthetic face tally for UI verification");
		expect(controller).to.include("Copied as dev-only synthetic face tally for peer verification");
	});

	it("refreshes per-device Hikvision DeviceUser truth during reconcile and persists derived lifecycle events", () => {
		const controller = controllerSource();

		expect(controller).to.include("const loadHikvisionDeviceUserSnapshot = async");
		expect(controller).to.include("const createBiometricLifecycleSyncRun = async");
		expect(controller).to.include("const finalizeBiometricLifecycleSyncRun = async");
		expect(controller).to.include("const persistDerivedBiometricLifecycleEvent = async");
		expect(controller).to.include("const persistDeviceUserLifecycleBackfill = async");
		expect(controller).to.include("const runBiometricLifecycleReconcileWork = async");
		expect(controller).to.include("const allowsSourceWideRefresh =");
		expect(controller).to.include('kind: "biometric_lifecycle_reconcile"');
		expect(controller).to.include("await finalizeBiometricLifecycleSyncRun(reconcileRunId");
		expect(controller).to.include('scope: "all_source_users"');
		expect(controller).to.include("refreshResults");
		expect(controller).to.include("sourceLifecycleBackfillResult");
		expect(controller).to.include("manual_device_user_lifecycle_backfill");
		expect(controller).to.include("derivedFromCurrentDeviceState: true");
		expect(controller).to.include('eventAction: "USER_CREATED"');
		expect(controller).to.include('eventAction: "FINGERPRINT_ENROLLED"');
		expect(controller).to.include('eventAction: "SYNC_IMPORTED"');
		expect(controller).to.include('eventType: "BiometricReconcile"');
		expect(controller).to.include("derivedFromReconcile: true");
	});

	it("keeps Linux callback work queued and omits raw fingerprint templates from evidence", () => {
		const service = serviceSource();

		expect(service).to.include("NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)");
		expect(service).to.include("NET_DVR_SetupAlarmChan_V50");
		expect(service).to.include("queue_hris_device_event(job)");
		expect(service).to.include('"/api/hikvision/callback"');
		expect(service).to.include("EN_HCNETSDK_ALARM");
		expect(service).to.include("queue_reconcile(job)");
		expect(service).to.include("worker_loop");
		expect(service).to.include("bool execute_mode = true;");
		expect(service).to.include('std::string reconcile_spool_dir = "/tmp/project-truth-hikvision-reconcile-spool";');
		expect(service).to.include("post_json_with_retries");
		expect(service).to.include("post_hris_contract_payload");
		expect(service).to.include('std::fprintf(config_file, "connect-timeout = 3\\n");');
		expect(service).to.include('std::fprintf(config_file, "max-time = 5\\n");');
		expect(service).to.include('arg == "--replay-spool-only"');
		expect(service).to.include('arg == "--post-contract-file"');
		expect(service).to.include('std::getenv("HIKVISION_HRIS_API_TOKEN")');
		expect(service).to.include("hris_contract_spool_written");
		expect(service).to.include("replay_pending_hris_contract_posts();");
		expect(service).to.include('arg == "--dry-run"');
		expect(service).to.include('arg == "--device-file"');
		expect(service).to.include("std::ifstream device_file");
		expect(service).to.include("NET_DVR_GET_FINGERPRINT_CFG_V50");
		expect(service).to.include("NET_DVR_SET_FINGERPRINT_CFG_V50");
		expect(service).to.include("NET_DVR_DEL_FINGERPRINT_CFG_V50");
		expect(service).to.include("rawFingerprintTemplateStored");
		expect(service).to.include("delete_peer_user");
		expect(service).to.include("delete_peer_fingerprints");
		expect(service).to.include("MINOR_CLR_USER_INFO");
		expect(service).to.include("MINOR_CLR_FINGER_BY_CARD");
		expect(service).to.include("is_observed_operation_sync_minor");
		expect(service).to.include("build_user_setup_payload_from_search_response");
		expect(service).to.include("read_device_employee_numbers");
		expect(service).to.include("reconcile_full_mirror_completed");
		expect(service).to.include("reconcile_suppressed_recent_peer_apply");
		expect(service).to.include("target.config.hris_device_id == source.config.hris_device_id");
		expect(service).to.include("target.config.hris_device_id == source->config.hris_device_id");
		expect(service).to.not.include('"fingerData"');
	});

	it("exposes fixed local VM listener status and control endpoints for admin recovery", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.get("/hikvision/listener", controller.getHikvisionListenerStatus)',
		);
		expect(router).to.include(
			'routes.post("/hikvision/listener", controller.controlHikvisionListener)',
		);
		expect(controller).to.include("const getHikvisionListenerStatus = async");
		expect(controller).to.include("const controlHikvisionListener = async");
		expect(controller).to.include("const admin = assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("HIKVISION_HOT_RELOAD_LISTENER_SERVICE");
		expect(controller).to.include('"project-truth-hikvision-hot-reload-listener.service"');
		expect(controller).to.include("HIKVISION_LISTENER_CONTROL_ACTIONS.has(action)");
		expect(controller).to.include("installManagedHikvisionListenerWrapperOnVm");
		expect(controller).to.include('process.platform === "linux"');
		expect(controller).to.include('"10.184.37.19"');
		expect(controller).to.include("project-truth-hikvision-hot-reload-daemon");
		expect(controller).to.include('["sudo", "systemctl", "daemon-reload"]');
		expect(controller).to.not.include('"sudo",\n\t\t"bash",\n\t\t"-lc"');
		expect(controller).to.include('if (action !== "stop")');
		expect(controller).to.include("runFixedProcess");
		expect(controller).to.include("execFile(");
		expect(controller).to.include('"systemctl"');
		expect(controller).to.include('"start", "stop", "restart"');
	});

	it("keeps the VM hot-reload wrapper sourced from all Hikvision device rows instead of one hardcoded device", () => {
		const controller = controllerSource();
		const wrapper = readFileSync(
			join(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
			"utf8",
		);

		expect(wrapper).to.include('COALESCE(config->>\'vendor\', \'\') = \'Hikvision\'');
		expect(wrapper).to.include('password = clean(access.get("password")) or clean(os.environ.get("HIKVISION_PASSWORD"))');
		expect(wrapper).to.include("hikvisionSdkRuntimeAddress");
		expect(wrapper).to.include("hikvisionSdkRuntimePort");
		expect(wrapper).to.include('LOCAL_API_BASE=${HIKVISION_HOT_RELOAD_API_BASE:-http://localhost:3101}');
		expect(wrapper).to.include('DEVICE_SOURCE=${HIKVISION_HOT_RELOAD_DEVICE_SOURCE:-postgres}');
		expect(wrapper).to.include('fetch_hikvision_device_rows_from_api()');
		expect(wrapper).to.include('/api/device?page=1&limit=${DEVICE_FETCH_LIMIT}&document=true');
		expect(wrapper).to.include('Authorization: Bearer $token');
		expect(wrapper).to.include('case "$DEVICE_SOURCE" in');
		expect(wrapper).to.include('rows="$(fetch_hikvision_device_rows_from_api "$hris_token")"');
		expect(wrapper).to.include("ensure_work_tree()");
		expect(wrapper).to.include('--device-file "$SPEC"');
		expect(wrapper).to.include('fetch_hikvision_hris_token()');
		expect(wrapper).to.include('/api/auth/login');
		expect(wrapper).to.include('LOGIN_APP_CODE=${HIKVISION_HOT_RELOAD_LOGIN_APP_CODE:-hris}');
		expect(wrapper).to.include('export LOGIN_EMAIL LOGIN_PASSWORD LOGIN_APP_CODE');
		expect(wrapper).to.include('export HIKVISION_HRIS_API_TOKEN="$hris_token"');
		expect(wrapper).to.not.include("where name='Main Entrance Device'");
		expect(controller).to.include("reconcileHikvisionRuntimeAfterDeviceChange");
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(device, "device_create")');
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(updatedDevice, "device_update")');
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(existingDevice, "device_delete")');
	});

	it("auto-syncs Hikvision device users right after create so Sync Center can show linked and open matches immediately", () => {
		const controller = controllerSource();

		expect(controller).to.include("const syncHikvisionDeviceUsersFromSource = async");
		expect(controller).to.include("await syncHikvisionDeviceUsersFromSource({");
		expect(controller).to.include("Post-create Hikvision device users synced");
		expect(controller).to.include("startedByUserId: (req as any).userId || null");
		expect(controller).to.include("isHikvisionDevice(device)");
		expect(controller).to.include('String((device as any)?.access?.password || "").trim()');
	});

	it("exposes selected-device activity for Sync Center observability without mutating devices", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include('routes.get("/:id/activity", controller.getDeviceActivity)');
		expect(controller).to.include("const getDeviceActivity = async");
		expect(controller).to.include("Device activity retrieved");
		expect(controller).to.include("getActiveDeviceUserSyncJobForDevice");
		expect(controller).to.include("rawSdkPersistence");
		expect(controller).to.include("Raw SDK source reads are not persisted as a separate stream yet");
		expect(controller).to.include("readActivityRowValue");
		expect(controller).to.include('readActivityRowValue(event, "eventCategory")');
		expect(controller).to.include("const originLabel =");
		expect(controller).to.include("Derived from current device-user state");
		expect(controller).to.include("Created by biometric reconcile");
		expect(controller).to.include("Received from SDK alarm listener");
		expect(controller).to.include("activeRun");
		expect(controller).to.include("activeJob");
		expect(controller).to.include("sdkReceived");
	});

	it("keeps the device events page working when device_users has not been migrated yet", () => {
		const controller = controllerSource();

		expect(controller).to.include("const hasDeviceUsersTable = await hasDeviceUserTable()");
		expect(controller).to.include("const hasDeviceEventColumns = await getDeviceEventColumnPresence()");
		expect(controller).to.include("const hasDeviceUserReference =");
		expect(controller).to.include("hasDeviceUsersTable && hasDeviceEventColumns.deviceUserId");
		expect(controller).to.include('LEFT JOIN LATERAL (');
		expect(controller).to.include('NULL::text AS \"vendorUserId\"');
		expect(controller).to.include('${deviceUserJoinSql}');
		expect(controller).to.include('NULL::text');
		expect(controller).to.include("'UNKNOWN_VENDOR'::text");
		expect(controller).to.include("GROUP BY 1");
		expect(controller).to.include('migrationState: "device_users_table_missing"');
		expect(controller).to.include("const deviceUserRows = (await hasDeviceUserTable())");
	});
});
