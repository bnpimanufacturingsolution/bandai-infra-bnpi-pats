import { expect } from "chai";
import { describe, it } from "mocha";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Hikvision biometric sync contract", () => {
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.controller.ts"), "utf8");
	const routerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.router.ts"), "utf8");
	const serviceSource = () =>
		readFileSync(
			join(process.cwd(), "../vendor/hikvision-linux/hikvision_biometric_service.cpp"),
			"utf8",
		);
	const envelopeHelperSource = () =>
		readFileSync(join(process.cwd(), "app/device/biometric-envelope.helper.ts"), "utf8");
	const indexSource = () => readFileSync(join(process.cwd(), "index.ts"), "utf8");
	const securityMiddlewareSource = () =>
		readFileSync(join(process.cwd(), "middleware/security.ts"), "utf8");
	const webpackSource = () => readFileSync(join(process.cwd(), "webpack.config.js"), "utf8");

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
		expect(router).to.include('"/hikvision/copy-user"');
		expect(router).to.include("requestTimeout({");
		expect(router).to.include('label: "hikvision-copy-user"');
		expect(router).to.include("controller.copyHikvisionDeviceUserToPeer");
		expect(controller).to.include("const copyHikvisionDeviceUserToPeer = async");
		// Durable job path for multi-minute face+FP peer copy with pollable stages.
		expect(router).to.include('"/hikvision/copy-user/jobs"');
		expect(router).to.include('"/hikvision/copy-user/jobs/:jobId"');
		expect(router).to.include("controller.startHikvisionPeerCopyJob");
		expect(router).to.include("controller.getHikvisionPeerCopyJob");
		expect(controller).to.include("startHikvisionPeerCopyJob");
		expect(controller).to.include("device-user-peer-copy-jobs");
		expect(controller).to.include("Peer-copy job queued");
		expect(controller).to.include("const executeHikvisionDeviceUserPeerCopy = async");
		expect(controller).to.include("const copyHikvisionUserToPeerWithRetry = async");
		expect(controller).to.include("const runHikvisionManualCopyOnVm = async");
		expect(controller).to.include("credentialOnly?: boolean");
		expect(controller).to.include("dryRun?: boolean");
		expect(controller).to.include('"--manual-credential-only"');
		expect(controller).to.include('...(params.dryRun ? ["--dry-run"] : ["--execute"])');
		expect(controller).to.include(
			"const isDryRun = req.body?.dryRun === true || req.body?.execute === false",
		);
		expect(controller).to.include(
			"Dry run only; no Hikvision device or HRIS records were changed",
		);
		expect(controller).to.include("plannedStages");
		expect(controller).to.include("requiresPhysicalPeerCopy");
		expect(controller).to.include("sourceCredentialSummary");
		expect(controller).to.include("targetCredentialSummary");
		expect(controller).to.include("targetSingleUserRefreshMs");
		expect(controller).to.include("requestTotalMs");
		expect(controller).to.include("const writeHikvisionManualCopySpec =");
		expect(controller).to.include("HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1");
		// Manual copy must mint HRIS token (static override previously left 401 on VM curl).
		expect(controller).to.include("HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api");
		expect(controller).to.include("resolveHikvisionRuntimeRoute");
		expect(controller).to.include(
			"`HIKVISION_HOST_REVERSE_API_BASE=${runtimeRoute.apiBase}`",
		);
		expect(controller).to.include(
			"`HIKVISION_HOT_RELOAD_API_BASE=${runtimeRoute.apiBase}`",
		);
		expect(controller).to.include("runtimeLocation: runtimeRoute.location");
		expect(controller).to.include("commandTransport: runtimeRoute.commandTransport");
		expect(controller).to.include("HIKVISION_DEVICE_SPEC_OVERRIDE=");
		expect(controller).to.include('name: "static_spec"');
		expect(controller).to.include("const preflightHikvisionManualCopyEndpoint = async");
		expect(controller).to.include("useTunnelMap: false");
		expect(controller).to.include("config.hikvisionSdkRuntimeAddress || device?.address");
		expect(controller).to.not.include("preferPhysicalAddress: true");
		expect(controller).to.include("VM cannot reach");
		expect(controller).to.include("quoteRemoteShellArg");
		expect(controller).to.include("remoteArgs.map(quoteRemoteShellArg).join");
		expect(controller).to.include("peer_copy_noop_already_synced");
		expect(controller).to.include("peer_copy_noop_overlay_only");
		expect(controller).to.include('strategy: "noop_overlay_only"');
		expect(controller).to.include(
			"!shouldConvergeDeviceUserToPeer(sourceDeviceUser, existingTargetDeviceUser)",
		);
		expect(controller).to.include("const isMissingHikvisionListenerRuntimeError =");
		expect(controller).to.include("const isDeterministicHikvisionManualCopySdkFailure =");
		expect(controller).to.include("const runManualCopy = (extraEnv: string[] = []) =>");
		expect(controller).to.include("Math.max(manualCopyTimeoutSeconds * 1000 + 5000, 15000)");
		expect(controller).to.include("maxBuffer: 5 * 1024 * 1024");
		expect(controller).to.include("result.exitCode !== 0");
		expect(controller).to.include("isMissingHikvisionListenerRuntimeError(firstAttemptDetail)");
		expect(controller).to.include(
			"isDeterministicHikvisionManualCopySdkFailure(sdkFailureMessage)",
		);
		expect(controller).to.include(
			"if (isDeterministicHikvisionManualCopySdkFailure(error?.message || error)) break;",
		);
		expect(controller.indexOf('name: "postgres"')).to.be.lessThan(
			controller.indexOf('name: "api"'),
		);
		expect(controller).to.include("HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api");
		expect(controller).to.include("HIKVISION_VM_LOCAL_API_BASE");
		expect(controller).to.include("HIKVISION_VM_WRAPPER_REMOTE_PATH");
		expect(controller).to.include("HIKVISION_DEVICE_USER_COPY");
		expect(controller).to.include(
			"sourceDeviceId, targetDeviceId or targetDeviceIds, and employeeNo are required",
		);
		expect(controller).to.include("syntheticCredentialOverlayApplied");
		expect(controller).to.include("refreshed target truth still shows");
		expect(controller).to.include("Treat this as not copied yet");
		expect(controller).to.include("await mirrorDeviceUserLinkToPeer({");
		expect(wrapper).to.include("--run-once");
		expect(wrapper).to.include("HIKVISION_DEVICE_ID_FILTER");
		expect(wrapper).to.include('cmd+=(--seconds "${HIKVISION_RUN_SECONDS:-1}")');
		expect(serviceSource()).to.include("bool credential_only = false");
		expect(serviceSource()).to.match(
			/const bool manual_fingerprint_clone_mode =[\s\S]*manual_include_fingerprints;/,
		);
		expect(serviceSource()).to.include('{"reason", "credential_only"}');
		expect(serviceSource()).to.include('{"event", "peer_face_write_preview"}');
		expect(serviceSource()).to.include(
			"if (!execute_mode && manual_job.credential_only)",
		);
	});

	it("gives the live SDK merge inventory plan the heavy-request timeout budget", () => {
		const router = routerSource();
		expect(router).to.include('"/hikvision/sdk-users/merge/plan"');
		expect(router).to.include('label: "hikvision-sdk-user-merge-plan"');
		expect(router).to.include("timeoutMs: config.heavyRequestTimeoutMs");
	});

	it("reuses durable SDK owner-conflict evidence before recommending fingerprint writes", () => {
		const controller = controllerSource();
		expect(controller).to.include("readDurableFingerprintOwnerConflicts");
		expect(controller).to.include("progressStatus");
		expect(controller).to.include("progressErrorMsg");
		expect(controller).to.include("reconcileDurableFingerprintOwnerConflicts(");
		// Recovery jobs (not only merge snapshots) must feed progress5 peer evidence.
		expect(controller).to.include("extractProgress5OwnerConflictsFromWriteError");
		expect(controller).to.include("credentialRecoveryJob.findMany");
		expect(controller).to.include("device_fp_anti_dupe_peer_owner");
	});

	it("persists complete correlated credential operation telemetry without truncating rows", () => {
		const controller = controllerSource();
		expect(controller).to.include("buildHikvisionCredentialOperationTelemetry");
		expect(controller).to.include("operationTelemetry");
		expect(controller).to.include("heartbeatAt");
		expect(controller).to.include("executionLocation");
		expect(controller).not.to.include(
			"[...(latest?.results || []), resultRow].slice(-250)",
		);
		expect(controller).not.to.include(
			"[...(job.progressEvents || []), appendProgressEvent].slice(-100)",
		);
	});

	it("keeps face and card recovery serial and auto-attests a physically retained canary", () => {
		const controller = controllerSource();
		expect(controller).to.include("serialFaceCardGroups");
		expect(controller).to.include("for (const group of serialFaceCardGroups)");
		expect(controller).to.include(
			"persistPhysicallyProvenHikvisionWriterCapability",
		);
		expect(controller).to.include("HIKVISION_AUTHORIZED_CARD_CANARY_DEVICE_ID");
		expect(controller).to.include("HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID");
		expect(controller).to.include("isAuthorizedHikvisionFaceCanaryDevice");
		expect(controller).to.include("authorizedHikvisionFaceCanaryDeviceIds");
		expect(controller).to.include("CardInfo custody inventory");
		expect(controller).not.to.include("authorizedCanaryVendorUserIds.includes");
	});

	it("keeps credential-only card writes exact-build and physically reread-gated", () => {
		const controller = controllerSource();
		const service = serviceSource();
		expect(controller).to.include("currentProjectTruthBuildAttestation()");
		expect(controller).to.include("cardRecordCapability");
		expect(controller).to.include("testedBuildAttested");
		expect(controller).to.include("physicallyRetained === true");
		expect(controller).not.to.include("authorizedCanaryVendorUserIds.includes");
		expect(controller).to.include('"--manual-include-card"');
		expect(controller).to.include("withTargetDeviceWriteLocks");
		expect(controller).to.include("Target reciprocal CardInfo reread did not prove");
		expect(controller).to.include("EmployeeNoList");
		expect(controller).to.include("CardNoList");
		expect(controller).to.include("fingerprintGroupsByTarget");
		expect(controller).to.include(
			"for (const group of targetGroups)",
		);
		expect(controller).to.include("fingerprintCustodyMatchesReview");
		expect(controller).to.include("sourceFingerprintTemplateChecksums");
		expect(controller).to.include(
			"Reviewed fingerprint custody recovery failed closed",
		);
		expect(controller).to.include("exactFreshOwners.length === 1");
		expect(controller).to.include("freshUserInfoOwnerVerified: true");
		expect(controller).to.include('write.modality === "card"');
		expect(service).to.include("bool include_card = false");
		expect(service).to.include('arg == "--manual-include-card"');
		expect(service).to.include("target_card_allows_owner");
		expect(service).to.include('"peer_card_owner_conflict"');
		expect(service).to.include("add_sync_card_if_unowned");
		expect(service).to.include('"peer_card_write_preview"');
	});

	it("keeps stored-face custody canary-only with exact SDK reread proof", () => {
		const controller = controllerSource();
		const service = serviceSource();
		expect(controller).to.include("runHikvisionStoredFaceWriteOnVm");
		expect(controller).to.include("stored_face_sdk_");
		expect(controller).to.include("sanitizeSdkFaceDiag");
		expect(controller).to.include("sdkFaceFailureMessage");
		expect(controller).not.to.include("HIKVISION_STORED_FACE_WRITER_BUILD_ATTESTATION");
		expect(controller).to.include("resolveHikvisionDeployedBuildAttestation");
		expect(controller).to.include("resolveFleetWriterCapability");
		expect(controller).to.include("writerCapabilityProof");
		expect(controller).to.include(
			"revalidateFrozenHikvisionFaceWriterCapability",
		);
		expect(controller).to.include(
			"Frozen face writer capability proof does not match the reviewed operation scope",
		);
		expect(controller).to.include(
			"Current target model/firmware/build no longer matches",
		);
		expect(controller).to.include(
			'decision.evidenceChecksum !== String(proof.evidenceChecksum || "")',
		);
		expect(controller).to.include("reviewedFleetCapability");
		expect(controller).not.to.include("fleetCapabilityValidated: true");
		expect(controller).to.include("HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID");
		expect(controller).to.include("isAuthorizedHikvisionFaceCanaryDevice");
		expect(controller).to.include("authorizedHikvisionFaceCanaryDeviceIds");
		expect(controller).to.include("faceAndTemplateRecord");
		expect(controller).to.include("testedBuildAttestation");
		expect(controller).to.include("currentStoredFaceWriterBuildAttestation");
		expect(controller).to.include("root-owned mode-0600 stored-face custody");
		expect(controller).to.include(
			"Fresh physical stored-face custody changed after review",
		);
		expect(controller).not.to.include(
			"reviewed.cardNoSha256 !== currentEvidence.cardNoSha256",
		);
		expect(controller).to.include("runHikvisionBiometricExportOnVm");
		expect(controller).to.include("cardOwnerVerified");
		expect(controller).to.include(
			"no exact employee-owned CardInfo association",
		);
		expect(controller).to.include("storedFaceOwnerVerified");
		expect(controller).to.include(
			"exact physical identity ownership was not attested",
		);
		expect(controller).to.include("Target now reports a face; refusing to overwrite");
		expect(controller).to.include(
			"Target full CardInfo inventory yielded multiple owned cards",
		);
		expect(controller).to.include(
			"Neither exact shared card custody, the same canonical HRIS employee, nor the same plain vendor person id proves",
		);
		expect(controller).to.include(
			"Face peer association is proven by same vendor person id, but neither source nor target yields a card value",
		);
		expect(controller).to.include('"stored_face_write_reread_completed"');
		expect(controller).to.include("templateMatch");
		expect(controller).to.include("pictureMatch");
		expect(controller).to.include("withTargetDeviceWriteLock");
		// Admin sandbox dual-owner force (vendor 1–20 only) clears conflicting
		// admin owners before fingerprint write; PROD 21+ stay protected.
		expect(controller).to.include("adminSandboxForceOverwrite");
		expect(controller).to.include("admin_sandbox_fp_clear");
		expect(controller).to.include("clearAdminSandboxFingerprintConflictsSticky");
		expect(controller).to.include("admin_sandbox_fp_progress5_retry");
		// Sticky-empty hard-fail + multi-shape delete live in the fingerprint helper.
		const fingerprintHelper = readFileSync(
			join(process.cwd(), "helper/device-user-raw-fingerprint.helper.ts"),
			"utf8",
		);
		expect(fingerprintHelper).to.include("deleteHikvisionFingerprintSlotsForEmployee");
		expect(fingerprintHelper).to.include("admin_sandbox_fp_clear_not_sticky");
		expect(fingerprintHelper).to.include("stickyEmpty");
		expect(fingerprintHelper).to.include("parseFingerprintProgressOccupyingEmployee");
		// Live sticky-clear 2026-07-25: device MessageParametersLack errorMsg=mode
		// without mode field; shapes must include byEmployeeNo mode.
		expect(fingerprintHelper).to.include('mode: "byEmployeeNo"');
		// No-mode primary shapes re-trigger MessageParametersLack errorMsg=mode.
		expect(fingerprintHelper).to.include("mode_by_employee_list_all_slots");
		expect(fingerprintHelper).to.not.match(
			/label: "object_single_employee"/,
		);
		expect(fingerprintHelper).to.include("mode_by_employee_list");
		// Live sticky-clear 2026-07-27: mode shapes still failed until Delete
		// sent Content-Type application/json (fetch default is form-urlencoded).
		expect(fingerprintHelper).to.include(
			'"Content-Type": "application/json; charset=UTF-8"',
		);
		expect(service).to.include("--stored-face-payload-file");
		expect(service).to.include('"startRemoteConfigMs"');
		expect(service).to.include('"sendAndCallbackMs"');
		expect(service).to.include('"callbackCompleted"');
		// CODE DEFECT fix: ensure ACS card before SET_FACE_AND_TEMPLATE and
		// emit named failReason/recvStatus so writeOk=false is diagnosable.
		expect(service).to.include("add_sync_card_if_unowned");
		expect(service).to.include('"stored_face_card_ensure"');
		expect(service).to.include('"failReason"');
		expect(service).to.include('"recvStatus"');
		expect(service).to.include("device_face_template_full");
		expect(service).to.include("stored_face_card_ensure_failed");
		expect(controller).to.include("peer_face_write ok=");
		expect(controller).to.include("card_ensure ok=");
		expect(service).to.include('"rereadMs"');
		expect(service).to.include("claim_callback_identity_scan");
		expect(service).to.include('"callback_identity_enrich_throttled"');
		expect(service).to.include("callback_identity_scan_min_interval");
		expect(service).to.include("std::chrono::minutes(1)");
		expect(service).to.include("should_defer_empty_callback_identity_to_backend");
		expect(service).to.include('"callback_identity_enrich_deferred"');
		expect(service).to.include('"backend_operation_log_resolution"');
		expect(service).to.include('"cooldownMs", "60000"');
		expect(service).to.include('"pt-inv-" + std::to_string(');
		expect(service).to.include('"pt-touch-" + std::to_string(');
		expect(service).to.not.include('"pt-inv-" << page << "-" << position');
		expect(service).to.not.include('"pt-touch-" << page << "-" << position');
		expect(controller).to.include("const searchID = randomUUID();");
		expect(controller).to.not.include("`device-user-sync-${Date.now()}-${position}`");
		expect(service).to.include("schedule_delayed_hris_identity_repost(job, 5000, 1)");
		expect(service).to.not.include("schedule_delayed_hris_identity_repost(job, 10000, 3)");
		expect(service).to.include("NET_DVR_SET_FACE_AND_TEMPLATE");
		expect(service).to.include("NET_DVR_GET_FACE_AND_TEMPLATE");
		const activityLogging = readFileSync(
			join(process.cwd(), "middleware/apiActivityLogging.ts"),
			"utf8",
		);
		for (const field of [
			"cardno",
			"fingerprint",
			"facetemplate",
			"facepicture",
			"rawface",
			"rawblob",
		]) {
			expect(activityLogging).to.include(`normalized.includes("${field}")`);
		}
	});

	it("keeps FDLib picture writes target-capability-gated, one-use delivered, and reread-proven", () => {
		const controller = controllerSource();
		const router = routerSource();
		expect(controller).to.include("classifyHikvisionFdlibPictureTarget");
		expect(controller).to.include("writerStrategy: \"fdlib_picture_import\"");
		expect(controller).to.include("runHikvisionFdlibPictureWrite");
		expect(controller).to.include("HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT");
		expect(controller).to.include("HIKVISION_FDLIB_FACE_SEARCH_ENDPOINT");
		expect(controller).to.include("assertHikvisionFdlibPrewriteEvidence");
		expect(controller).to.include("assertHikvisionFdlibWriteAccepted");
		expect(controller).to.include(
			"Fresh physical FDLib source picture changed after review",
		);
		expect(controller).to.include("hikvisionCredentialCapabilityEvidence");
		expect(controller).to.include("capabilityEvidenceSha256");
		expect(controller).to.include("verifyHikvisionFdlibPhysicalReread");
		expect(controller).to.include("withTargetDeviceWriteLock");
		expect(router).not.to.include("fdlib-face-delivery/:token");
	});

	it("locks physical merge execution to the reviewed scope hash", () => {
		const router = routerSource();
		const controller = controllerSource();
		expect(router).to.include('"/hikvision/sdk-users/merge/review"');
		expect(controller).to.include("buildDeviceUserMergeScopeLock");
		expect(controller).to.include("expectedScopeHash");
		expect(controller).to.include("Merge scope hash does not match the reviewed write matrix");
	});

	it("exposes durable recovery jobs instead of a planner-only queue", () => {
		const router = routerSource();
		const controller = controllerSource();
		expect(router).to.include('"/hikvision/sdk-users/merge/recovery/review"');
		expect(controller).to.include("buildCredentialRecoveryExecutionPreview");
		expect(controller).to.include("executionPreview");
		expect(controller).to.include("dryRun");
		expect(router).to.include('"/hikvision/sdk-users/merge/recovery/jobs"');
		expect(controller).to.include("credentialRecoveryJob");
		expect(controller).to.include("leaseExpiresAt");
		expect(controller).to.include("heartbeatAt");
		expect(controller).to.include("resumeCursor");
		expect(controller).to.include("processHikvisionCredentialRecoveryJob");
		expect(controller).to.include("canaryModality");
		expect(controller).to.include(
			"String(write.modality) === canaryModality",
		);
		expect(controller).to.include("buildCredentialRecoveryPendingTaskWhere");
		expect(controller).to.include("replanHeartbeat");
		expect(controller).to.include("physicalHeartbeat");
		expect(controller).to.include("CREDENTIAL_RECOVERY_STALE_LEASE");
		expect(controller).to.include("credential_recovery_stale_worker_fenced");
		expect(controller).to.include("attemptedWriteTaskKeys");
		expect(controller).to.include("remainingWriteAttemptBudget");
		expect(controller).to.include("Credential recovery write-attempt fence refused the canary");
		expect(controller).to.include('status: recoveryDecision.shouldRetry ? "retrying" : "failed"');
		expect(controller).to.include('status: "processing"');
		expect(controller).to.include("expired_physical_stage_requires_adjudication");
		expect(controller).to.include(
			"Automatic resume is forbidden until the target is physically reread",
		);
		expect(controller).to.include("successfulOperationIds");
		expect(controller).to.include("verified !== readyWrites.length");
		expect(controller).to.include("credential_recovery_write_progress");
		expect(controller).to.include("hikvision_merge_device_inventory_timing");
		expect(controller).to.include("credential_recovery_replan_completed");
		expect(controller).to.include("stageDurationMs");
		expect(controller).to.include("physicalApplyElapsedMs");
		expect(controller).to.include("fingerprintBundleWriteMs");
		expect(controller).to.include("targetFingerprintRereadMs");
		expect(controller).to.include("targetUserSyncMs");
		expect(controller).to.include("fleet_reconciliation_deferred");
		expect(controller).to.include("skipFinalFleetReread: true");
		expect(controller).to.include(
			"Credential recovery replan lost full-inventory readability for the frozen device scope",
		);
	});

	it("waits for tunnel recovery before failing a reviewed merge source row", () => {
		const controller = controllerSource();
		expect(controller).to.include("HIKVISION_MERGE_SOURCE_REFRESH_RETRY_LIMIT");
		expect(controller).to.include('stage: "source_refresh_retry_wait"');
		expect(controller).to.include("waiting for tunnel recovery before retry");
		expect(controller).to.include("4_000 * sourceAttempt");
		expect(controller).to.include("HIKVISION_MERGE_BATCH_VM_RETRY_LIMIT || 3");
		expect(controller).to.include("2_000 * vmAttempt");
	});

	it("joins live merge counts with saved raw biometric custody", () => {
		const controller = controllerSource();
		expect(controller).to.include("vendorMetadata: true");
		expect(controller).to.include("buildRawDeviceUserBiometricCustody({");
		expect(controller).to.include(
			"plannerFingerprintTemplates.length >=",
		);
		expect(controller).to.include(
			'rawCustody.face.rawBlobPresent',
		);
		expect(controller).to.include("portableFaceBundle");
		expect(controller).to.include(
			"stored_raw_fingerprint_write_and_reread",
		);
		expect(controller).to.not.include(
			"even if a separate HRIS custody workflow has blobs",
		);
	});

	it("resolves emitted js import suffixes back to TypeScript during deployment builds", () => {
		expect(webpackSource()).to.include("extensionAlias");
		expect(webpackSource()).to.include('".js": [".js", ".ts"]');
	});

	it("supports scoped device-user export and gated import execute without plaintext biometric custody", () => {
		const router = routerSource();
		const controller = controllerSource();
		const hikvisionCpp = serviceSource();
		const index = indexSource();
		const security = securityMiddlewareSource();

		expect(router).to.include(
			'routes.post("/users/export/preview", controller.previewDeviceUserExport)',
		);
		expect(router).to.include('routes.post("/users/export", controller.exportDeviceUsers)');
		expect(router).to.include(
			'routes.post("/users/import/preview", controller.previewDeviceUserImport)',
		);
		expect(router).to.include(
			'routes.post("/users/import/execute", controller.executeDeviceUserImport)',
		);
		expect(router).to.include(
			'routes.get("/users/import/jobs/:jobId", controller.getDeviceUserImportJob)',
		);
		expect(controller).to.include("const normalizeDeviceUserExportSelection =");
		expect(controller).to.include('"currentPage", "selectedRows"');
		expect(controller).to.include("const filterDeviceUserExportRows =");
		expect(controller).to.include("vendorUserIds");
		expect(controller).to.include("rawBiometricPackage");
		expect(controller).to.include("rawBiometricPackageRequested");
		expect(controller).to.include(
			"raw_evidenced_blobs_allowed_for_admin_device_user_sync_package",
		);
		expect(controller).to.include("BIOMETRIC_TEMPLATE_KEY_PATTERN");
		expect(controller).to.include("[redacted-biometric-template]");
		expect(controller).to.include("sanitizeDeviceUserPortableValue");
		expect(controller).to.include("buildDeviceUserImportResultRow");
		expect(controller).to.include("summarizeDeviceUserImportTarget");
		expect(controller).to.include("waitForDelayedHikvisionPeerCopy");
		expect(controller).to.include("HIKVISION_PEER_COPY_COMPLETION_WAIT_MS");
		expect(controller).to.include("DEVICE_USER_IMPORT_ROW_TIMEOUT_MS");
		expect(controller).to.include("withDeviceUserImportTimeout");
		expect(controller).to.include("Timed out copying device user");
		expect(controller).to.include(
			"raw fingerprint/face blobs are exported only when evidenced",
		);
		expect(controller).to.include("raw_blobs_from_device_user_or_event");
		expect(controller).to.include("loadLatestRawBiometricEventPayload");
		expect(controller).to.include("parseRawFingerprintTemplatesFromCell");
		expect(controller).to.include("normalizeRawPackageFingerprintTemplates");
		expect(controller).to.include("FP\\s*(\\d*)");
		expect(controller).to.include("raw_blobs_allowed_when_evidenced_on_device_user_or_event");
		expect(controller).to.include(
			"raw_package_or_sdk_peer_copy_allowed_with_admin_preview_and_confirmation",
		);
		expect(controller).to.include("backfillDeviceUserBiometricMetadata");
		expect(controller).to.include("hikvision_sdk_biometric_metadata_backfill");
		expect(controller).to.include('modality?: "fingerprint" | "face" | "combined"');
		expect(controller).to.include("rawFingerprintBlobCount");
		// Export must project decryptable AES biometricBundle into raw package
		// when raw plane empty (backfill only stores encrypted envelopes).
		expect(controller).to.include("decrypted_encrypted_biometric_bundle");
		expect(controller).to.include("projectedFromEncrypted");
		expect(controller).to.include("encryptedPresent");
		expect(controller).to.include("rawFaceBlobCount");
		expect(controller).to.include("buildRawDeviceUserBiometricCustody");
		expect(router).to.include('"/:id/users/biometric-metadata/backfill"');
		expect(router).to.include("controller.backfillDeviceUserBiometricMetadata");
		expect(controller).to.include("const buildDeviceUserImportPreviewToken =");
		expect(controller).to.include("previewToken from this preview response");
		expect(controller).to.include(
			"Import execute requires a fresh previewToken from import preview",
		);
		expect(controller).to.include(
			"biometricTransferMode=sdkPeerCopy, rawPackage, or metadataOnly",
		);
		expect(controller).to.include('"rawPackage"');
		expect(controller).to.include("const sanitizeDeviceUserImportPayloadForBackup =");
		expect(controller).to.include("rawBiometricPackage: payload?.rawBiometricPackage || null");
		expect(controller).to.include(
			'plaintextBiometricExposed: biometricTransferMode === "rawPackage"',
		);
		expect(controller).to.include("rawUser?: unknown");
		expect(controller).to.include("copyHikvisionUserToPeerWithRetry({");
		expect(controller).to.include('strategy: "delayed_target_reread"');
		expect(controller).to.include("const copyHikvisionUserToPeersBatch = async");
		expect(controller).to.include("targetDeviceIds");
		expect(controller).to.include("targetDevices: reachableTargets");
		expect(controller).to.include("vmSessionCount: sharedVmCopyResult ? 1 : 0");
		// Merge apply must reuse batch multi-target (one VM session per unique ID), not only 1:1.
		expect(controller).to.include("await copyHikvisionUserToPeersBatch({");
		expect(controller).to.include('stage: "batch_copy_started"');
		expect(controller).to.include("batchMultiTarget: true");
		expect(controller).to.include("HIKVISION_MERGE_COPY_TIMEOUT_CIRCUIT_LIMIT || 3");
		// Durable merge ledger + face-aware physical peer copy + smarter VM timeout.
		expect(controller).to.include("const appendMergeLedgerRow =");
		expect(controller).to.include("HIKVISION_MERGE_LEDGER_DIR");
		expect(controller).to.include("success.jsonl");
		expect(controller).to.include("failure.jsonl");
		expect(controller).to.include("countsAsPeerWriteSuccess");
		expect(controller).to.include("alreadyConvergedWrites");
		expect(controller).to.include("!event?.alreadyConverged");
		expect(controller).to.include("batchResult.alreadyConverged === true");
		expect(controller).to.include("forcePhysicalCopy?: boolean");
		expect(controller).to.include("forcePhysicalCopy: true");
		expect(controller).to.include("!params.forcePhysicalCopy &&");
		expect(hikvisionCpp).to.include("if (!manual_reconcile_mode)");
		expect(controller).to.include("params.includeFaceRecognition &&");
		expect(controller).to.include("HIKVISION_MANUAL_COPY_TIMEOUT_SECONDS || 45");
		// Durable merge job snapshots survive API restart (no fake forever-processing).
		expect(controller).to.include("DEVICE_USER_MERGE_JOB_DIR");
		expect(controller).to.include("const persistDeviceUserMergeJob =");
		expect(controller).to.include("const readDeviceUserMergeJob =");
		expect(controller).to.include("const resolveDeviceUserMergeJob =");
		expect(controller).to.include("const markDeviceUserMergeJobStale =");
		expect(controller).to.include("persistDeviceUserMergeJob(job)");
		expect(controller).to.include("workerActive");
		expect(controller).to.include("failed_stale");
		expect(controller).to.include(
			'job.status !== "processing" && job.startedAt.getTime() < cutoff',
		);
		expect(controller).to.include("is already processing. Poll that locked scope");
		expect(controller).to.include('stage: "db_merge_retry"');
		expect(controller).to.include('stage: "db_merge_error"');
		expect(controller).to.include(
			"Never update DeviceUser as though a failed physical copy succeeded",
		);
		expect(controller).to.include("const sourceDeviceId = user.sourceDeviceId");
		expect(controller).to.not.include(
			'const selectedRawRecord = selectedRecordFor("fingerprint")',
		);
		expect(controller).to.include("device-user-merge-jobs");
		expect(controller).to.include("const settled = await Promise.allSettled(");
		expect(controller).to.include("preferredHikvisionListenerVmTargetLabel");
		expect(controller).to.include("HIKVISION_VM_SSH_CONNECT_TIMEOUT_SECONDS");
		expect(controller).to.include("rawPayload.facePicture");
		expect(controller).to.include("No raw biometric blob was found on this import row");
		expect(envelopeHelperSource()).to.include("passphrase-scrypt");
		expect(envelopeHelperSource()).to.include(
			"Encrypted biometric bundle source binding mismatch",
		);
		expect(controller).to.include(
			"DEVICE_USER_BIOMETRIC_BUNDLE_KEY is required for biometric custody in production",
		);
		expect(controller).to.include('const appEnvironment = String(process.env.APP_ENV || "")');
		expect(controller).to.include(
			'appEnvironment === "production" || appEnvironment === "prod"',
		);
		expect(index).to.include('const apiBodyLimit = process.env.HRIS_API_BODY_LIMIT || "75mb"');
		expect(index).to.include("express.json({ limit: apiBodyLimit })");
		expect(index).to.include("express.urlencoded({ extended: true, limit: apiBodyLimit })");
		expect(security).to.include("const parseRequestSizeLimit =");
		expect(security).to.include('process.env.HRIS_API_BODY_LIMIT || "75mb"');
		expect(security).to.include("formatRequestSizeLimit(maxSize)");
		expect(readFileSync(join(process.cwd(), "config/security.ts"), "utf8")).to.include(
			"maxSize: 75 * 1024 * 1024",
		);
		expect(controller).to.include('noOpReason: "already_converged_persisted_truth"');
		expect(controller).to.include("const runDeviceUserImportExecuteWork = async");
		expect(controller).to.include("const getDeviceUserImportJob = async");
		expect(controller).to.include("Device-user import job accepted");
		expect(controller).to.include("const terminalStatus =");
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
		expect(controller).to.include(
			"Applied as dev-only synthetic fingerprint tally for UI verification",
		);
	});

	it("exposes a dev-safe synthetic face tally route for cross-device verification", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.post("/hikvision/mock-face", controller.mockHikvisionFaceTally)',
		);
		expect(controller).to.include("const mockHikvisionFaceTally = async");
		expect(controller).to.include(
			"Applied as dev-only synthetic face tally for UI verification",
		);
		expect(controller).to.include(
			"Copied as dev-only synthetic face tally for peer verification",
		);
	});

	it("refreshes DeviceUser truth while quarantining current-state lifecycle invention", () => {
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
		expect(controller).to.include("current DeviceUser row is not evidence");
		expect(controller).to.include(
			'reason: "current_device_user_state_is_not_lifecycle_evidence"',
		);
		expect(controller).not.to.include("derivedFromCurrentDeviceState: true");
		expect(controller).to.include('eventAction: "SYNC_IMPORTED"');
		expect(controller).to.include('eventType: "BiometricReconcile"');
		expect(controller).to.include("derivedFromReconcile: true");
	});

	it("keeps Linux callback work queued and attaches raw templates only after evidenced reads", () => {
		const service = serviceSource();
		const alarmCallback = service.slice(
			service.indexOf("void CALLBACK alarm_callback("),
			service.indexOf("std::string build_status_contract_json("),
		);

		expect(service).to.include("NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)");
		expect(service).to.include("NET_DVR_SetupAlarmChan_V50");
		expect(service).to.include("queue_hris_device_event(job)");
		expect(service).to.include("observed_employee_numbers_by_host");
		expect(service).to.include('lifecycle_job.event_kind = "poll_inventory_user_created"');
		expect(service).to.include("lifecycle_job.sdk_time = now_utc()");
		expect(service).to.include("queue_hris_device_event(lifecycle_job)");
		expect(service).to.include('"poll_user_created_detected"');
		expect(service).to.include('"/api/hikvision/callback"');
		expect(service).to.include("EN_HCNETSDK_ALARM");
		expect(service).to.include("queue_reconcile(job)");
		expect(service).to.include("worker_loop");
		expect(service).to.include("bool execute_mode = true;");
		expect(service).to.include(
			'std::string reconcile_spool_dir = "/tmp/project-truth-hikvision-reconcile-spool";',
		);
		expect(service).to.include("post_json_with_retries");
		expect(service).to.include("post_hris_contract_payload");
		expect(service).to.include('std::fprintf(config_file, "connect-timeout = 3\\n");');
		expect(service).to.include(
			'std::fprintf(config_file, "max-time = %d\\n", std::max(1, max_time_seconds));',
		);
		expect(service).to.include('"hikvision_callback_post"');
		expect(service).to.include("immediate ? 1 : 3");
		expect(service).to.include("immediate ? 5 : 30");
		expect(service).to.include('arg == "--replay-spool-only"');
		expect(service).to.include('arg == "--post-contract-file"');
		expect(service).to.include('std::getenv("HIKVISION_HRIS_API_TOKEN")');
		expect(service).to.include("hris_contract_spool_written");
		expect(service).to.include("hris_contract_spool_quarantined");
		expect(service).to.include("missing_source_device_id");
		expect(service).to.include(
			"/tmp/project-truth-hikvision-reconcile-quarantine",
		);
		expect(service).to.include("replay_pending_hris_contract_posts();");
		expect(service).to.include(
			'std::string callback_spool_dir = "/tmp/project-truth-hikvision-callback-spool";',
		);
		expect(service).to.include("hikvision_callback_spool_written");
		expect(service).to.include("replay_pending_hikvision_callbacks();");
		expect(service).to.include("callback_spool_replay_loop");
		expect(service).to.include(
			"std::thread callback_spool_replayer(callback_spool_replay_loop)",
		);
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
		expect(service).to.include("is_observed_operation_sync_minor(acs->dwMinor)");
		expect(service).to.include("job.include_face_recognition = job.include_fingerprints;");
		expect(alarmCallback).to.not.include("job.include_fingerprints = true;");
		expect(service).to.include("build_user_setup_payload_from_search_response");
		expect(service).to.include("read_device_employee_numbers");
		expect(service).to.include("inventory_read_mutex");
		expect(service).to.include("inventory_baseline_ready_hosts");
		expect(service).to.include("source_user_inventory_incomplete_discarded");
		expect(service).to.include("callback_identity_inventory_incomplete");
		expect(service).to.include("inventory_baseline_seed_failed");
		expect(service).to.include("resolve_plain_employee_no_from_userinfo_touch");
		expect(service).to.include("intersections.size() == 1");
		expect(service).to.not.include('job.identity_source = "recent_employee_candidate"');
		expect(service).to.not.include("plain = pick_newest_plain_employee_no(changed)");
		expect(service).to.include("reconcile_full_mirror_completed");
		expect(service).to.include("reconcile_suppressed_recent_peer_apply");
		expect(service).to.include("target.config.hris_device_id == source.config.hris_device_id");
		expect(service).to.include("target.config.hris_device_id == source->config.hris_device_id");
		expect(service).to.include("read_fingerprints_via_isapi");
		expect(service).to.include('<< "\\\"fingerprints\\\":"');
		expect(service).to.include('"fingerData"');
	});

	it("arms SDK sessions before replaying a large historical HRIS spool", () => {
		const service = serviceSource();
		const armGuard = service.indexOf("if (!has_sessions)");
		const replay = service.indexOf("std::thread(replay_pending_hris_contract_posts).detach()");
		expect(armGuard).to.be.greaterThan(-1);
		expect(replay).to.be.greaterThan(armGuard);
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
		expect(controller).to.include('runtimeRoute.commandTransport === "local"');
		expect(controller).to.include("runtimeRoute.allowCloudflareSshFallback");
		expect(controller).to.include('runtimeRoute.location === "vm-container"');
		expect(controller).to.include(
			"Physical credential merge writes must run through the VM-local K3s API.",
		);
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

	it("falls back from an unroutable direct VM listener target to the Cloudflare alias", () => {
		const controller = controllerSource();
		expect(controller).to.include("const shouldTryNextTarget =");
		expect(controller).to.include("isHikvisionTransportFailure(transportDetail)");
		expect(controller).to.include("result.exitCode === 124");
		expect(controller).to.include("if (!shouldTryNextTarget)");
		expect(controller).to.include('target.label.startsWith("alias:") ? 3 : 1');
		expect(controller).to.include("evidenceLogLines.length > 0 || Boolean(activeText)");
		expect(controller).to.include(
			"sudo tail -n 3000 /var/log/project-truth/hikvision-hot-reload-listener.jsonl",
		);
	});

	it("keeps the VM hot-reload wrapper sourced from all Hikvision device rows instead of one hardcoded device", () => {
		const controller = controllerSource();
		const wrapper = readFileSync(
			join(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
			"utf8",
		);

		expect(wrapper).to.include("COALESCE(config->>'vendor', '') = 'Hikvision'");
		expect(wrapper).to.include(
			'password = clean(access.get("password")) or clean(os.environ.get("HIKVISION_PASSWORD"))',
		);
		expect(wrapper).to.include("hikvisionSdkRuntimeAddress");
		expect(wrapper).to.include("hikvisionSdkRuntimePort");
		expect(wrapper).to.include(
			"HOST_REVERSE_API_BASE=${HIKVISION_HOST_REVERSE_API_BASE:-http://127.0.0.1:53001}",
		);
		expect(wrapper).to.include('LOCAL_API_BASE="$(resolve_local_api_base)"');
		expect(wrapper).to.include("DEVICE_SOURCE=${HIKVISION_HOT_RELOAD_DEVICE_SOURCE:-postgres}");
		expect(wrapper).to.include("fetch_hikvision_device_rows_from_api()");
		expect(wrapper).to.include("/api/device?page=1&limit=${DEVICE_FETCH_LIMIT}&document=true");
		expect(wrapper).to.include("Authorization: Bearer $token");
		expect(wrapper).to.include('case "$DEVICE_SOURCE" in');
		expect(wrapper).to.include('rows="$(fetch_hikvision_device_rows_from_api "$hris_token")"');
		expect(wrapper).to.include("ensure_work_tree()");
		expect(wrapper).to.include(
			'! cmp --silent "$deployed_source_file" "$source_file"',
		);
		expect(wrapper).to.include(
			'! cmp --silent "$deployed_build_script" "$build_script"',
		);
		expect(wrapper).to.include('if [[ ! -x "$binary" || "$rebuild_required" == "1" ]]');
		expect(wrapper).to.not.include(
			'"$SOURCE_ROOT/hikvision_biometric_service.cpp" -nt "$source_file"',
		);
		expect(wrapper).to.include('--device-file "$SPEC"');
		expect(wrapper).to.include("fetch_hikvision_hris_token()");
		expect(wrapper).to.include("/api/auth/login");
		expect(wrapper).to.include("LOGIN_APP_CODE=${HIKVISION_HOT_RELOAD_LOGIN_APP_CODE:-hris}");
		expect(wrapper).to.include("export LOGIN_EMAIL LOGIN_PASSWORD LOGIN_APP_CODE");
		expect(wrapper).to.include('export HIKVISION_HRIS_API_TOKEN="$hris_token"');
		expect(wrapper).to.not.include("where name='Main Entrance Device'");
		expect(controller).to.include("reconcileHikvisionRuntimeAfterDeviceChange");
		expect(controller).to.include(
			'await reconcileHikvisionRuntimeAfterDeviceChange(device, "device_create")',
		);
		expect(controller).to.include(
			'await reconcileHikvisionRuntimeAfterDeviceChange(updatedDevice, "device_update")',
		);
		expect(controller).to.include(
			'await reconcileHikvisionRuntimeAfterDeviceChange(existingDevice, "device_delete")',
		);
	});

	it("auto-syncs Hikvision device users right after create so Sync Center can show linked and open matches immediately", () => {
		const controller = controllerSource();

		expect(controller).to.include("const syncHikvisionDeviceUsersFromSource = async");
		expect(controller).to.include("await syncHikvisionDeviceUsersFromSource({");
		expect(controller).to.include(
			"const syncedDeviceUsers = await prisma.deviceUser.findMany({",
		);
		expect(controller).to.include(
			"const lifecycleBackfill = await persistDeviceUserLifecycleBackfill({",
		);
		expect(controller).to.include('reason: "sync_device_users_route"');
		expect(controller).to.include('minor: "SYNC_ROUTE_BACKFILL"');
		expect(controller).to.include("lifecycleBackfill,");
		expect(controller).to.include("Post-create Hikvision device users synced");
		expect(controller).to.include(
			"Hikvision device rejected the saved access credentials during UserInfo/Search",
		);
		expect(controller).to.include("startedByUserId: (req as any).userId || null");
		expect(controller).to.include("isHikvisionDevice(device)");
		expect(controller).to.include('String((device as any)?.access?.password || "").trim()');
		expect(controller).to.include("Target single-user sync before enroll did not complete");
		expect(controller).to.include("deviceUser.upsert");
		expect(controller).to.include("deviceUserLinked");
	});

	it("runs missing biometric custody as a durable per-device background sync phase", () => {
		const controller = controllerSource();

		expect(controller).to.include("captureMissingBiometricCustodyForDevice");
		expect(controller).to.include('currentModality?: "fingerprint" | "face" | null');
		expect(controller).to.include("biometricProcessed");
		expect(controller).to.include("biometricCaptured");
		expect(controller).to.include("biometricFailed");
		expect(controller).to.include("biometricFailureLog");
		expect(controller).to.include("missingRawCount");
		expect(controller).to.include("storedCount");
		expect(controller).to.include("persistDeviceUserSyncJob(nextJob)");
		expect(controller).to.include("readDeviceUserSyncJob(jobId)");
		expect(controller).to.include("captureRawFingerprintsForEnrollment");
		expect(controller).to.include("captureRawFaceForEnrollment");
		expect(controller).to.include("captureDeviceUserRawFace");
		expect(controller).to.include("HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY");
		expect(controller).to.include("await Promise.all(workers)");
		expect(controller).to.include("summarizeDeviceUserRawBiometricCustody");
		expect(controller).to.include("fingerprintRawMissing");
		expect(controller).to.include("faceRawMissing");
		expect(controller).to.include(
			'custodyScope: liveVendorUserIds ? "current_live_device_users" : "hris_device_users"',
		);
		expect(controller).to.include("staleHrisOnlyRows");
		expect(controller).to.include("staleFingerprintReported");
		expect(controller).to.include("staleFingerprintRawBlobCount");
		expect(controller).to.include("biometricCustodyScope");
		expect(controller).to.include("biometricStaleHrisOnlyRows");
		expect(controller).to.include("fingerprintEnvelopeMissing");
		expect(controller).to.include("faceEnvelopeMissing");
		expect(controller).to.include(
			"Raw biometric custody repair completed; some credentials still need missing_raw_blob review.",
		);
	});

	it("uses native SDK template plus picture custody before face-picture fallback", () => {
		const controller = controllerSource();

		expect(controller).to.include('"hikvision_sdk_credential_recovery"');
		expect(controller).to.include('"hikvision_sdk_template_picture"');
		expect(controller).to.include('"isapi_face_picture_fallback"');
		expect(controller).to.include("sdkTemplateRecoveryError");
		expect(controller).to.include('"credential_recovery_face_sdk_fallback"');
		expect(controller).to.include("faceTemplateSize: Number(result?.faceTemplateSize || 0)");
		expect(controller).to.include("Hikvision SDK export event missing");
		expect(controller).to.not.include(
			'finalResult.stdout.trim() ||\n\t\t\t\t\t\t"No biometric export event returned',
		);
		expect(controller.indexOf("await runHikvisionBiometricExportOnVm({")).to.be.lessThan(
			controller.indexOf("source: \"isapi_face_picture_fallback\""),
		);
	});

	it("blocks face writes during planning when source and target identity association is unproven", () => {
		const controller = controllerSource();

		// Planner uses resolveFaceAssociationStrategy: card, HRIS employee, or
		// same plain vendor person id. Only hard conflicts stay dual-owner red.
		expect(controller).to.include("resolveFaceAssociationStrategy({");
		expect(controller).to.include("association.strategy");
		expect(controller).to.include("association.blockingReason");
		expect(controller).to.include(
			'"physical_identity_adjudication_required"',
		);
		expect(controller).to.include("write.modality === \"face\"");
		expect(controller).to.include("faceAssociationStrategy,");
		expect(controller.indexOf("if (!faceAssociationStrategy)")).to.be.lessThan(
			controller.indexOf('writerStrategy: "sdk_face_template_writer"'),
		);
		const helper = readFileSync(
			join(process.cwd(), "helper/device-user-merge.helper.ts"),
			"utf8",
		);
		expect(helper).to.include('"same_vendor_user_id"');
		expect(helper).to.include("export const resolveFaceAssociationStrategy");
	});

	it("selects recovery work across the full bounded graph instead of one sorted-device prefix", () => {
		const controller = controllerSource();

		expect(controller).to.include("take: 5_000");
		expect(controller).to.include("if (deviceId && !independent.has(deviceId))");
		expect(controller).to.include("if (independent.size >= 5) break");
		expect(controller).to.include("if (remainingWriteAttemptBudget > 0)");
		expect(controller).to.include(
			"if (!writeFailure && !verified && remainingPending > 0)",
		);
		expect(controller).to.include('"exact_shared_card"');
	});

	it("sanitizes Hikvision faceURL non-image failures before recording raw custody status", () => {
		const helper = readFileSync(
			join(process.cwd(), "helper/device-user-raw-fingerprint.helper.ts"),
			"utf8",
		);

		expect(helper).to.include("classifyHikvisionRawFaceBinaryResponse");
		expect(helper).to.include('"face_image_not_found_on_device"');
		expect(helper).to.include('"face_image_unauthorized"');
		expect(helper).to.include('"face_binary_not_image"');
		expect(helper).to.include("diagnosticPath: picPath");
		expect(helper).to.include('buf.toString("base64")');
		expect(helper.indexOf("classifyHikvisionRawFaceBinaryResponse")).to.be.lessThan(
			helper.indexOf('const b64 = buf.toString("base64")'),
		);
		const controller = controllerSource();
		expect(controller).to.include("sanitizeDeviceUserSyncRawFailureReason");
		expect(controller).to.include("sanitizeDeviceUserSyncFailureReasons");
		expect(controller).to.include("sanitizeDeviceUserSyncJobResults");
		expect(controller).to.include("formatDeviceUserSyncMissingRawBlobSummary");
		expect(controller).to.include("results: sanitizeDeviceUserSyncJobResults(job.results)");
		expect(controller).to.include(
			"sanitizeDeviceUserSyncJobResults(patch.results || job.results)",
		);
	});

	it("returns error-shaped responses for manual raw capture no-data failures", () => {
		const controller = controllerSource();

		expect(controller).to.include(
			'const reason = result.reason || "Raw fingerprint capture failed"',
		);
		expect(controller).to.include('const reason = result.reason || "Raw face capture failed"');
		expect(controller).to.include("const response: any = buildErrorResponse(reason, 422");
		expect(controller).to.include('field: "capture.reason"');
		expect(controller).to.include("response.data = {");
		expect(controller).to.include("capture: result");
		expect(controller).to.include("res.status(422).json(response)");
		expect(controller).to.include('"Raw fingerprints captured on DeviceUser"');
		expect(controller).to.include('"Raw face captured on DeviceUser"');
	});

	it("exposes selected-device activity for Sync Center observability without mutating devices", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include('routes.get("/:id/activity", controller.getDeviceActivity)');
		expect(controller).to.include("const getDeviceActivity = async");
		expect(controller).to.include("Device activity retrieved");
		expect(controller).to.include("getActiveDeviceUserSyncJobForDevice");
		expect(controller).to.include("rawSdkPersistence");
		expect(controller).to.include(
			"Raw SDK source reads are not persisted as a separate stream yet",
		);
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

	it("plans device-user sync through a missing-record decision matrix before expensive reads", () => {
		const controller = controllerSource();

		expect(controller).to.include("type DeviceUserSyncDecisionBucketKey");
		expect(controller).to.include('"missing_device_user_record"');
		expect(controller).to.include('"missing_employee_link"');
		expect(controller).to.include('"missing_raw_fingerprint_blob"');
		expect(controller).to.include('"missing_raw_face_blob"');
		expect(controller).to.include('"already_present"');
		expect(controller).to.include('"stale_count_only_or_live_no_data"');
		expect(controller).to.include('"unsupported_by_sync"');
		expect(controller).to.include("buildDeviceUserSyncDecisionMatrix");
		expect(controller).to.include("buildDeviceUserSyncJobDecisionMatrix");
		expect(controller).to.include("getHikvisionFastDeviceUserSourceCount");
		expect(controller).to.include("vendorUserCount = Number(sourceCount.userCount)");
		expect(controller).to.include("syncDecisionMatrix");
		expect(controller).to.include("selectedFastPlan");
		expect(controller).to.include("sourceReadRequired");
		expect(controller).to.include("Live device user count shows missing DeviceUser records");
		expect(controller).to.include("Building missing-record matrix");
		expect(controller).to.include("Device user sync dry-run plan generated");
		expect(controller).to.include("willCreateJob: false");
		expect(controller).to.include("executionPlan");
		expect(controller).to.include(
			"Skip source user reread because saved HRIS state scopes the actionable work",
		);
		expect(controller).to.include(
			"Device-user sync worker is no longer active after API restart",
		);
		expect(controller).to.include('job.status !== "processing"');
		expect(controller).to.include("decision_matrix_did_not_require_source_identity_read");
		expect(controller).to.include("saved_matrix_has_no_missing_raw_biometric_blobs");
		expect(controller).to.include("Reading source users needed for identity gaps");
		expect(controller).to.include("Capturing missing fingerprint raw bytes");
		expect(controller).to.include("Capturing missing face raw bytes");
		expect(controller).to.include("Skipping known no-data rows");
		expect(controller).to.include(
			"Saved HRIS DeviceUser truth already identifies raw-custody gaps",
		);
	});

	it("keeps the device events page working when device_users has not been migrated yet", () => {
		const controller = controllerSource();

		expect(controller).to.include("const hasDeviceUsersTable = await hasDeviceUserTable()");
		expect(controller).to.include(
			"const hasDeviceEventColumns = await getDeviceEventColumnPresence()",
		);
		expect(controller).to.include("const deviceUserJoinSql =");
		expect(controller).to.include("hasDeviceUsersTable && hasDeviceEventColumns.deviceUserId");
		expect(controller).to.include("LEFT JOIN LATERAL (");
		expect(controller).to.include('NULL::text AS \"vendorUserId\"');
		expect(controller).to.include("${deviceUserJoinSql}");
		expect(controller).to.include("NULL::text");
		expect(controller).to.include("'UNKNOWN_VENDOR'::text");
		expect(controller).to.include("GROUP BY 1");
		expect(controller).to.include('migrationState: "device_users_table_missing"');
		expect(controller).to.include("if (!(await hasDeviceUserTable()))");
		expect(controller).to.include(
			"const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn()",
		);
	});
});
