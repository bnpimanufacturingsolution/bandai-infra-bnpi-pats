import { createHash, randomUUID } from "node:crypto";

export const HIKVISION_CREDENTIAL_RECOVERY_STAGES = [
	"queued_source_custody_recovery",
	"exporting_source_credential",
	"comparing_sources",
	"resolving_richest_source",
	"probing_target_capability",
	"preparing_writer",
	"ready_to_write",
	"writing",
	"rereading_target",
	"physically_retained",
	"retrying_recoverable_failure",
	"physical_identity_action_required",
	"physical_reenrollment_required",
	"device_firmware_unsupported",
] as const;

export type HikvisionCredentialRecoveryStage =
	(typeof HIKVISION_CREDENTIAL_RECOVERY_STAGES)[number];

type OperationTelemetryContext = {
	requestId?: string | null;
	jobId: string;
	planId: string;
	scopeHash: string;
	organizationId: string;
	buildAttestation?: string | null;
	executionLocation?: string | null;
};

const text = (value: unknown) => String(value ?? "").trim();
const timestamp = (value: unknown, fallback: string) => {
	const parsed = new Date(text(value));
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
};
const safeChecksum = (value: unknown) => {
	const normalized = text(value).toLowerCase();
	return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
};
const safeInteger = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
};
const safeDiagnostic = (value: unknown) => {
	const normalized = text(value)
		.replace(
			/(authorization|token|secret|password|cookie|card(?:no|number)?|face(?:template|picture|data)?|finger(?:print|data|template)?)[=:]\s*[^,\s;]+/gi,
			"$1=[redacted]",
		)
		.slice(0, 500);
	return normalized || null;
};
const recoveryStage = (event: Record<string, any>): HikvisionCredentialRecoveryStage => {
	const explicit = text(event.recoveryStage) as HikvisionCredentialRecoveryStage;
	if (
		(HIKVISION_CREDENTIAL_RECOVERY_STAGES as readonly string[]).includes(explicit)
	) {
		return explicit;
	}
	const stage = text(event.stage);
	if (stage === "copy_success") return "physically_retained";
	if (stage === "reread_started" || stage === "reread_done") return "rereading_target";
	if (
		stage === "copy_started" ||
		stage === "credential_raw_write_started" ||
		stage === "vm_copy_attempt_started"
	) {
		return "writing";
	}
	if (stage === "copy_error") {
		return /(already (?:owned|enrolled)|duplicate owner|progress status 5|overwrite forbidden)/i.test(
			text(event.error || event.message),
		)
			? "physical_identity_action_required"
			: "retrying_recoverable_failure";
	}
	if (/probe|preflight/.test(stage)) return "probing_target_capability";
	if (/source|export|custody/.test(stage)) return "exporting_source_credential";
	return "preparing_writer";
};

const operationIdFor = (context: OperationTelemetryContext, event: Record<string, any>) =>
	createHash("sha256")
		.update(
			[
				context.jobId,
				text(event.id || event.writeId),
				text(event.vendorUserId || event.userKey),
				text(event.modality),
				text(event.sourceDeviceId),
				text(event.targetDeviceId),
			].join("\0"),
		)
		.digest("hex");

/**
 * Produces the durable, safe operation envelope used by API snapshots, ledger
 * rows, browser polling, and correlated logs. Raw credentials, card values,
 * pictures, authentication material, and arbitrary device bodies are omitted.
 */
export const buildHikvisionCredentialOperationTelemetry = (
	context: OperationTelemetryContext,
	event: Record<string, any>,
) => {
	const now = new Date().toISOString();
	const startedAt = timestamp(event.startedAt || event.at, now);
	const updatedAt = timestamp(event.updatedAt || event.at, now);
	const normalizedRecoveryStage = recoveryStage(event);
	const endedAt = event.endedAt
		? timestamp(event.endedAt, updatedAt)
		: ["physically_retained", "physical_identity_action_required", "physical_reenrollment_required", "device_firmware_unsupported"].includes(
					normalizedRecoveryStage,
				)
			? updatedAt
			: null;
	const durationMs =
		safeInteger(event.durationMs) ??
		(endedAt
			? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
			: null);

	return {
		requestId: text(event.requestId || context.requestId) || randomUUID(),
		jobId: context.jobId,
		operationId: text(event.operationId) || operationIdFor(context, event),
		planId: context.planId,
		scopeHash: context.scopeHash,
		organization: context.organizationId,
		vendorUserId: text(event.vendorUserId) || null,
		modality: text(event.modality) || null,
		sourceDeviceId: text(event.sourceDeviceId) || null,
		sourcePhysicalTarget: text(event.sourcePhysicalTarget || event.sourceDeviceAddress) || null,
		targetDeviceId: text(event.targetDeviceId) || null,
		targetPhysicalTarget: text(event.targetPhysicalTarget || event.targetDeviceAddress) || null,
		writerStrategy: text(event.writerStrategy || event.strategy) || null,
		buildAttestation:
			text(event.buildAttestation || context.buildAttestation).toLowerCase() || null,
		capabilityEvidenceChecksum: safeChecksum(
			event.capabilityEvidenceChecksum || event.capabilityEvidenceSha256,
		),
		stage: normalizedRecoveryStage,
		attempt: safeInteger(event.attempt) ?? 1,
		startedAt,
		updatedAt,
		endedAt,
		durationMs,
		sdkProgressStatus: safeInteger(event.sdkProgressStatus || event.progressStatus),
		sdkLastError: safeInteger(event.sdkLastError),
		isapiStatus: safeInteger(event.isapiStatus || event.statusCode),
		safeResponseClassification:
			text(event.safeResponseClassification || event.responseClassification) || null,
		preWriteCount: safeInteger(event.preWriteCount ?? event.targetReportedCount),
		preWriteChecksum: safeChecksum(event.preWriteChecksum),
		postWriteCount: safeInteger(event.postWriteCount ?? event.actualCount),
		postWriteChecksum: safeChecksum(event.postWriteChecksum),
		physicalRereadResult: text(event.physicalRereadResult) || null,
		namedCause: safeDiagnostic(event.namedCause || event.errorCode || event.error),
		retryDecision: safeDiagnostic(event.retryDecision),
		executionLocation:
			text(event.executionLocation || context.executionLocation) || "vm-container",
	};
};
