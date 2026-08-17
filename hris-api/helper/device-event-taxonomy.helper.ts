export type DeviceEventTaxonomy = {
	eventCategory: string;
	eventAction: string;
	eventLabel: string;
	eventConfidence: "PROVEN" | "SUPPORTED" | "INFERRED" | "UNKNOWN";
	processingLabel: string;
	transportLabel: string;
	capabilityConfidence: "proven" | "supported" | "inferred" | "unknown";
};

const withCompatibilityConfidence = (
	taxonomy: Omit<DeviceEventTaxonomy, "capabilityConfidence">,
): DeviceEventTaxonomy => ({
	...taxonomy,
	capabilityConfidence: taxonomy.eventConfidence.toLowerCase() as DeviceEventTaxonomy["capabilityConfidence"],
});

const titleFromToken = (value: string) =>
	value
		.toLowerCase()
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

export const formatDeviceEventProcessingLabel = (status?: string | null) => {
	switch (status) {
		case "ATTENDANCE_CREATED":
			return "Attendance created";
		case "ATTENDANCE_UPDATED":
			return "Attendance updated";
		case "MATCHED":
			return "Matched to employee";
		case "UNMATCHED":
			return "Needs employee match";
		case "IGNORED":
			return "Recorded, no attendance change";
		case "FAILED":
			return "Needs review";
		case "RECEIVED":
			return "Received";
		default:
			return status ? titleFromToken(status) : "Received";
	}
};

export const formatDeviceEventTransportLabel = (source?: string | null) => {
	switch (source) {
		case "EN_HCNETSDK_ALARM":
			return "Hikvision SDK listener";
		case "HIKVISION_CALLBACK":
			return "Hikvision callback watcher";
		case "ZKTECO_EVENT":
			return "ZKTeco Linux bridge";
		default:
			return source ? titleFromToken(source) : "Unknown runtime path";
	}
};

const readPayloadText = (payload: unknown, ...keys: string[]) => {
	const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
	for (const key of keys) {
		const value = record[key];
		if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
	}
	return "";
};

export const classifyDeviceEvent = (event: {
	source?: string | null;
	status?: string | null;
	eventType?: string | null;
	major?: string | number | null;
	minor?: string | number | null;
	payload?: unknown;
	errorMessage?: string | null;
}): DeviceEventTaxonomy => {
	const source = String(event.source || "");
	const eventType = String(event.eventType || readPayloadText(event.payload, "eventType"));
	const eventKind = readPayloadText(event.payload, "eventKind");
	const actionCode = readPayloadText(event.payload, "actionCode", "minorName");
	const minor = String(event.minor ?? readPayloadText(event.payload, "minor") ?? "").trim();
	const processingLabel = formatDeviceEventProcessingLabel(event.status);
	const transportLabel = formatDeviceEventTransportLabel(source);

	if (source === "ZKTECO_EVENT" || eventType === "AttendanceTransaction") {
		return withCompatibilityConfidence({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Attendance punch",
			eventConfidence: "PROVEN",
			processingLabel,
			transportLabel,
		});
	}

	const major = String(event.major ?? readPayloadText(event.payload, "major") ?? "").trim();
	// Major 2 + minor 38 is ACS exception on armed panels, not MAJOR_EVENT tap.
	if (major === "2" && (minor === "38" || actionCode === "MINOR_FINGERPRINT_COMPARE_PASS")) {
		return withCompatibilityConfidence({
			eventCategory: "DEVICE_HEALTH",
			eventAction: "LISTENER_RECEIVED",
			eventLabel: "Armed-device ACS exception (not a punch)",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (
		major !== "2" &&
		(actionCode === "MINOR_FINGERPRINT_COMPARE_PASS" ||
			eventKind === "attendance_fingerprint_success" ||
			minor === "38")
	) {
		return withCompatibilityConfidence({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Fingerprint attendance punch",
			eventConfidence: "PROVEN",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_CARD_FINGERPRINT_VERIFY_PASS") {
		return withCompatibilityConfidence({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Card and fingerprint punch",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (
		actionCode === "MINOR_FINGERPRINT_COMPARE_FAIL" ||
		actionCode === "MINOR_CARD_FINGERPRINT_VERIFY_FAIL" ||
		actionCode === "MINOR_FINGERPRINT_INEXISTENCE" ||
		eventKind === "attendance_fingerprint_failed"
	) {
		return withCompatibilityConfidence({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP_REJECTED",
			eventLabel: "Rejected tap",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_ADD_FINGER_BY_CARD" || actionCode === "MINOR_ADD_FINGER_BY_EMPLOYEE_NO") {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_MOD_FINGER_BY_CARD" || actionCode === "MINOR_MOD_FINGER_BY_EMPLOYEE_NO") {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_UPDATED",
			eventLabel: "Fingerprint updated",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (
		actionCode === "MINOR_DEL_FINGER" ||
		actionCode === "MINOR_CLR_FINGER_BY_READER" ||
		actionCode === "MINOR_CLR_FINGER_BY_CARD" ||
		actionCode === "MINOR_CLR_FINGER_BY_EMPLOYEE_ON"
	) {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_DELETED",
			eventLabel: "Fingerprint deleted",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_ADD_CARD" || actionCode === "MINOR_ADD_CARD_INFO") {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_MOD_CARD" || actionCode === "MINOR_MODIFY_CARD_INFO") {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_UPDATED",
			eventLabel: "Card updated",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (
		actionCode === "MINOR_DELETE_CARD_INFO" ||
		actionCode === "MINOR_CLR_CARD" ||
		actionCode === "MINOR_CLR_CARD_BY_CARD_OR_EMPLOYEE"
	) {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_DELETED",
			eventLabel: "Card deleted",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_ADD_USER_INFO") {
		return withCompatibilityConfidence({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence:
				eventKind === "poll_inventory_user_created" ? "INFERRED" : "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	// C++ SDK callback may set eventKind without vendor actionCode yet (UNKNOWN_MINOR).
	// Still type the ledger row so EN_HCNETSDK_ALARM filter shows User management / Enrollment,
	// not only Runtime SYNC_SIGNAL.
	if (
		eventKind === "biometric_user_management" ||
		eventKind === "poll_inventory_user_created"
	) {
		return withCompatibilityConfidence({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence:
				eventKind === "poll_inventory_user_created" ? "INFERRED" : "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (eventKind === "biometric_fingerprint_management") {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	// C++ attach raw FP templates on callback → enrollment ledger on the same SDK source.
	const fingerprints = (event.payload as any)?.fingerprints;
	const fingerprintCount = Number(
		(event.payload as any)?.fingerprintCount ??
			(Array.isArray(fingerprints) ? fingerprints.length : 0),
	);
	const hasRawFpBlob =
		Array.isArray(fingerprints) &&
		fingerprints.some((fp: any) => String(fp?.data || "").trim().length >= 8);
	if (
		(fingerprintCount > 0 || hasRawFpBlob) &&
		(eventKind === "biometric_operation_sync" ||
			eventKind === "biometric_fingerprint_management" ||
			source === "EN_HCNETSDK_ALARM")
	) {
		return withCompatibilityConfidence({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "PROVEN",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_MODIFY_USER_INFO") {
		return withCompatibilityConfidence({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_UPDATED",
			eventLabel: "Device user updated",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (actionCode === "MINOR_CLR_USER_INFO") {
		return withCompatibilityConfidence({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_DELETED",
			eventLabel: "Device user deleted",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (
		eventKind === "biometric_operation_sync" ||
		actionCode.startsWith("OBSERVED_OPERATION_MINOR_") ||
		(source === "EN_HCNETSDK_ALARM" && String(event.major ?? "").trim() === "3")
	) {
		return withCompatibilityConfidence({
			eventCategory: "RUNTIME",
			eventAction: "SYNC_SIGNAL",
			// SDK only says "an operation happened" — person/type come from logSearch follow-up.
			eventLabel: "Device operation signal (resolving person/enroll details)",
			eventConfidence: "SUPPORTED",
			processingLabel,
			transportLabel,
		});
	}

	if (event.status === "FAILED" || event.errorMessage) {
		return withCompatibilityConfidence({
			eventCategory: "UNKNOWN_VENDOR",
			eventAction: eventKind === "acs_event" ? "UNKNOWN" : "LISTENER_RECEIVED",
			eventLabel: eventKind === "acs_event" ? "Access controller event needs review" : "Device event needs review",
			eventConfidence: "UNKNOWN",
			processingLabel,
			transportLabel,
		});
	}

	return withCompatibilityConfidence({
		eventCategory: "UNKNOWN_VENDOR",
		eventAction: eventKind === "acs_event" ? "UNKNOWN" : "LISTENER_RECEIVED",
		eventLabel: eventKind === "acs_event" ? "Access controller event" : "Device event",
		eventConfidence: eventKind === "acs_event" ? "UNKNOWN" : actionCode && actionCode !== "UNKNOWN_MINOR" ? "INFERRED" : "UNKNOWN",
		processingLabel,
		transportLabel,
	});
};

export const buildPersistedDeviceEventTaxonomy = (event: Parameters<typeof classifyDeviceEvent>[0]) => {
	const taxonomy = classifyDeviceEvent(event);
	return {
		eventCategory: taxonomy.eventCategory,
		eventAction: taxonomy.eventAction,
		eventLabel: taxonomy.eventLabel,
		eventConfidence: taxonomy.eventConfidence,
	};
};
