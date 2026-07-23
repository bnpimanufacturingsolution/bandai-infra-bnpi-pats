import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

describe("DeviceUser API contract", () => {
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.controller.ts"), "utf8");
	const routerSource = () => readFileSync(join(process.cwd(), "app/device/device.router.ts"), "utf8");

	it("exposes admin-only device user sync and manual link routes", () => {
		const router = routerSource();
		const controller = controllerSource();
		expect(router).to.include('routes.get("/users", controller.listDeviceUsers)');
		expect(router).to.include('routes.get("/:id/users", controller.listDeviceUsers)');
		expect(router).to.include('routes.get("/users/:userId/photo", controller.getDeviceUserPhoto)');
		expect(router).to.include('routes.post("/users/export/preview", controller.previewDeviceUserExport)');
		expect(router).to.include('routes.post("/users/export", controller.exportDeviceUsers)');
		expect(router).to.include('routes.post("/users/import/preview", controller.previewDeviceUserImport)');
		expect(router).to.include('routes.post("/users/import/execute", controller.executeDeviceUserImport)');
		expect(router).to.include('routes.post("/:id/users/sync", controller.syncDeviceUsers)');
		expect(router).to.include('routes.post("/users/sync-jobs", controller.startDeviceUserSyncJob)');
		expect(router).to.include('routes.get("/users/sync-jobs/:jobId", controller.getDeviceUserSyncJob)');
		expect(router).to.include('routes.post("/users/sync-jobs/:jobId/cancel", controller.cancelDeviceUserSyncJob)');
		expect(router).to.include('routes.post("/:id/users/lifecycle-backfill", controller.backfillDeviceUserLifecycleEvents)');
		expect(router).to.include('routes.get("/:id/sync-runs", controller.getDeviceSyncRuns)');
		expect(router).to.include('routes.post("/import-jobs/:jobId/cancel", controller.cancelDeviceImportJob)');
		expect(router).to.include('routes.post("/users/:userId/link", controller.linkDeviceUser)');
		expect(router).to.include('routes.post("/users/:userId/unlink", controller.unlinkDeviceUser)');
		expect(controller).to.include('req.query.vendorUserId');
		expect(controller).to.include('req.query.vendorUserIds');
		expect(controller).to.include("req.query.employeeId");
		expect(controller).to.include("...(employeeId ? { employeeId } : {})");
		expect(controller).to.include("? { vendorUserId }");
		expect(controller).to.include('vendorUserId: { in: vendorUserIds }');
		expect(controller).to.include("DEVICE_USER_ADMIN_ROLES");
		expect(controller).to.include('"hris-admin"');
		expect(controller).to.include("assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("hasDeviceUserVendorMetadataColumn");
		expect(controller).to.include("vendorMetadata: true");
		expect(controller).to.include("rawVendorPayload");
		expect(controller).to.include("const getDeviceUserPhoto = async");
		expect(controller).to.include("DEVICE_USER_EXPORT_SCHEMA_VERSION");
		expect(controller).to.include("discoverHikvisionUserExportCapabilities");
		expect(controller).to.include("fingerprintTemplateExport");
		expect(controller).to.include("raw_blob_package_from_device_user_or_event");
		expect(controller).to.include("const previewDeviceUserImport = async");
		expect(controller).to.include("executeAvailable: planRows.length > 0");
		expect(controller).to.include("DEVICE_USER_IMPORT_CONFIRMATION");
		expect(controller).to.include("const backfillDeviceUserLifecycleEvents = async");
		expect(controller).to.include("persistDeviceUserLifecycleBackfill");
		expect(controller).to.include("manual_device_user_lifecycle_backfill");
		expect(controller).to.include("hikvisionFetchBinary");
		expect(controller).to.include("readDeviceUserFaceUrl");
		expect(controller).to.include("Device user face photo host does not match the configured device");
		expect(controller).to.include("type DeviceUserSyncMode =");
		expect(controller).to.include('"full_refresh"');
		expect(controller).to.include('"needs_attention_only"');
		expect(controller).to.include('"peer_converge"');
		expect(controller).to.include('const requestedMode = String((req.body as any)?.mode || "")');
		expect(controller).to.include(".trim()");
		expect(controller).to.include(".toLowerCase()");
		expect(controller).to.include('syncMode === "needs_attention_only"');
		expect(controller).to.include('requestedMode === "peer_converge"');
		expect(controller).to.include("Cross-device convergence queued");
		expect(controller).to.include("shouldConvergeDeviceUserToPeer");
		expect(controller).to.include("deviceIds");
	});

	it("expires stale processing device-user sync job snapshots instead of reviving them", () => {
		const controller = controllerSource();

		expect(controller).to.include("DEVICE_USER_SYNC_PROCESSING_STALE_MS");
		expect(controller).to.include("updatedAt: Date");
		expect(controller).to.include("updatedAt: new Date()");
		expect(controller).to.include("stale?: boolean");
		expect(controller).to.include("stale: true");
		expect(controller).to.include("isDeviceUserSyncJobStale");
		expect(controller).to.include("markDeviceUserSyncJobStale");
		expect(controller).to.include("Device-user sync stopped updating");
	});

	it("persists log sync run summaries so known skipped rows do not remain forever missing", () => {
		const controller = controllerSource();
		expect(controller).to.include("deviceSyncRun.create");
		expect(controller).to.include('kind: "biometric_lifecycle_reconcile"');
		expect(controller).to.include("await finalizeBiometricLifecycleSyncRun(reconcileRunId");
		expect(controller).to.include('runType: "DEVICE_LOGS"');
		expect(controller).to.include("skippedRecords: skipped");
		expect(controller).to.include("skipMissingEmployeeNo");
		expect(controller).to.include("const skipMissingEmployeeNo =");
		expect(controller).to.include("if (!employeeNo && skipMissingEmployeeNo)");
		expect(controller).to.include("knownSkipped += 1");
		expect(controller).to.include("missingEmployeeNo: knownSkipped");
		expect(controller).to.include("alreadySaved");
		expect(controller).to.include("findExistingHikvisionDeviceEvent");
		expect(controller).to.include("cancelRequested");
		expect(controller).to.include("knownSkippedEventCount");
		expect(controller).to.include("peerBaselineDeviceName");
		expect(controller).to.include("peerDriftTotalCount");
		expect(controller).to.include("compareSavedDeviceUserTruth");
		expect(controller).to.include("summarizeSavedDeviceUserTruth");
		expect(controller).to.include("totalUnsavedEventCount");
		expect(controller).to.include("importableIfSkipMissingEmployeeNo");
		expect(controller).to.include("importableIfSaveMissingEmployeeNo");
		expect(controller).to.include("Math.max(Number(totalEvents) - syncedEvents, 0)");
		expect(controller).to.include("Math.max(totalUnsavedEvents - knownSkippedEvents, 0)");
	});

	it("preserves stale and one-device-only Hikvision device-user rows", () => {
		const controller = controllerSource();
		expect(controller).to.include("Preserve stale and one-device-only identities");
		expect(controller).to.include("currentVendorUserIds");
		expect(controller).to.include("void currentVendorUserIds");
	});

	it("reads Hikvision merge devices with bounded concurrency/recovery and preserves failures", () => {
		const controller = controllerSource();
		expect(controller).to.include("const deviceResults: Array<{");
		expect(controller).to.include("const mergeReadConcurrency = Math.min(2, devices.length)");
		expect(controller).to.include("Array.from({ length: mergeReadConcurrency }");
		expect(controller).to.include("await readNextDevice()");
		expect(controller).to.include("recovery <= 3 && retryable");
		expect(controller).to.include("transiently reject a digest/session");
		expect(controller).to.include("Merge inventory read recovery");
		expect(controller).to.include("records.push(...result.records)");
		expect(controller).to.include("if (result.error) errors.push(result.error)");
		expect(controller).to.include("unreachableDevices: errors.map");
		expect(controller).to.include("readStatus: error ? \"failed\" : \"ok\"");
		expect(controller).to.include("idsRead: error ? null : idsRead");
	});

	it("gates merge biometric copy by usable raw custody instead of reported counts", () => {
		const controller = controllerSource();
		expect(controller).to.include('fingerprint?.status === "raw_blob_present"');
		expect(controller).to.include('face?.status === "raw_blob_present"');
		expect(controller).to.include("includeFingerprints,");
		expect(controller).to.include("includeFaceRecognition,");
	});

	it("compares credential job rereads against the full reviewed fleet plan", () => {
		const controller = controllerSource();
		expect(controller).to.include(
			'mode === "credentials" ? stored.plan : selectedAppliedPlan',
		);
		expect(controller).to.include("buildDeviceUserCredentialGapDelta(");
	});

	it("requires an exact physical fingerprint slot-checksum reread after writing", () => {
		const controller = controllerSource();
		expect(controller).to.include(
			"const physicalReread = await fetchRawFingerprintsViaIsapi",
		);
		expect(controller).to.include("missingRetainedChecksums.length > 0");
		expect(controller).to.include(
			'physicalRereadResult: "exact_slot_checksum_retained"',
		);
		expect(controller).to.include("postWriteFingerprintTemplateChecksums");
	});

	it("publishes safe exact-reread checksums for face and card canaries", () => {
		const controller = controllerSource();
		const router = routerSource();
		expect(controller).to.include("const encryptedStoredFace =");
		expect(controller).to.include("decryptedStoredFace?.faceTemplate");
		expect(controller).to.include("decryptedStoredFace?.facePicture");
		expect(controller).to.include(
			"Stored face custody envelope validation failed",
		);
		expect(controller).to.include("const authorizedCanaryTarget =");
		expect(controller).to.include(
			"process.env.HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID",
		);
		expect(controller).to.include("Stored-face SDK writes remain serial");
		expect(controller).to.include(
			'"exact_template_and_picture_checksums_retained"',
		);
		expect(controller).to.include('"exact_card_owner_value_pair_retained"');
		expect(controller).to.include("capabilityEvidenceChecksum:");
		expect(controller).to.include("retainedCardChecksum");
		expect(controller).to.include(
			"readExactHikvisionCardOwnerFromFullInventory",
		);
		expect(controller).to.include(
			"const searchID = randomUUID()",
		);
		expect(controller).to.include(
			'lastResponseStatus && lastResponseStatus !== "MORE"',
		);
		expect(controller).to.include("sourceFaceChecksumEvidence");
		expect(controller).to.include(
			"readHikvisionCardValuesForOwnerFromFullInventory",
		);
		expect(controller).to.include("canonicalEmployeeMatch");
		expect(controller).to.include(
			"same_canonical_hris_employee_with_target_owned_card",
		);
		expect(controller).to.include("targetCardRetainedChecksum");
		expect(controller).to.include("findExactHikvisionDeviceInfoValue");
		expect(controller).to.include(
			'new Set(["firmwareversion", "firmware", "softwareversion"])',
		);
		expect(controller).to.include(
			"All highest-count face sources have exact template and picture checksum equality",
		);
		expect(controller).to.include("attestRetainedHikvisionCardCanary");
		expect(controller).to.include(
			"narrow_reciprocal_card_query_false_negative",
		);
		expect(controller).to.include("physicalWriteReplayed: false");
		expect(controller).to.include(
			"Retained card canary attestation failed at ${attestationStage}",
		);
		expect(router).to.include(
			'"/hikvision/sdk-users/merge/jobs/:jobId/attest-retained-card"',
		);
	});

	it("uses a fast Hikvision UserInfo count for Device Users preview instead of stale all-device skip copy", () => {
		const controller = controllerSource();
		expect(controller).to.include("const getHikvisionFastDeviceUserSourceCount = async");
		expect(controller).to.include("hris-fast-user-count");
		expect(controller).to.include("Device logs not requested for device-user summary");
		expect(controller).to.include("Device user counts timed out; using saved HRIS evidence for preview");
		expect(controller).not.to.include("Live source totals skipped for fast all-device overview");
		expect(controller).not.to.include("Live source totals skipped for quick saved HRIS preview");
	});

	it("runs bulk device-user sync in bounded batches so one slow device does not block all devices", () => {
		const controller = controllerSource();
		expect(controller).to.include("const DEVICE_USER_SYNC_CONCURRENCY");
		expect(controller).to.include("processDeviceUserSyncTarget");
		expect(controller).to.include("index += DEVICE_USER_SYNC_CONCURRENCY");
		expect(controller).to.include("Promise.all(");
		expect(controller).to.include(".slice(index, index + DEVICE_USER_SYNC_CONCURRENCY)");
	});
});
