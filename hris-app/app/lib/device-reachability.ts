export type DeviceReachabilityStatus =
	| "online"
	| "degraded"
	| "offline"
	| "checking"
	| "unknown";

export type DeviceReachabilitySummary = {
	status: DeviceReachabilityStatus;
	label: string;
	checkedAt?: string | null;
	detail?: string | null;
};

export const resolveDeviceReachabilityStatus = (input: {
	isLoading?: boolean;
	isError?: boolean;
	summaryStatus?: string | null;
}): DeviceReachabilityStatus => {
	if (input.isLoading) return "checking";
	if (input.isError) return "unknown";
	const status = String(input.summaryStatus || "")
		.trim()
		.toLowerCase();
	if (status === "online") return "online";
	if (status === "degraded") return "degraded";
	if (status === "offline") return "offline";
	return "unknown";
};

export const getDeviceReachabilityLabel = (status: DeviceReachabilityStatus) => {
	switch (status) {
		case "online":
			return "Online";
		case "degraded":
			return "Degraded";
		case "offline":
			return "Offline";
		case "checking":
			return "Checking…";
		default:
			return "Unknown";
	}
};

/** Solid status dot for dropdowns and compact chips. */
export const getDeviceReachabilityDotClass = (status: DeviceReachabilityStatus) => {
	switch (status) {
		case "online":
			return "bg-emerald-500";
		case "degraded":
			return "bg-amber-500";
		case "offline":
			return "bg-red-500";
		case "checking":
			return "bg-slate-300 animate-pulse";
		default:
			return "bg-slate-400";
	}
};

/** Soft badge surface for the Devices table Status column. */
export const getDeviceReachabilityBadgeClass = (status: DeviceReachabilityStatus) => {
	switch (status) {
		case "online":
			return "border-emerald-200 bg-emerald-50 text-emerald-800";
		case "degraded":
			return "border-amber-200 bg-amber-50 text-amber-900";
		case "offline":
			return "border-red-200 bg-red-50 text-red-800";
		case "checking":
			return "border-slate-200 bg-slate-50 text-slate-600";
		default:
			return "border-slate-200 bg-slate-50 text-slate-600";
	}
};

export const buildDeviceReachabilitySummary = (input: {
	isLoading?: boolean;
	isError?: boolean;
	summaryStatus?: string | null;
	checkedAt?: string | null;
	networkOk?: boolean | null;
	deviceApiOk?: boolean | null;
	errorMessage?: string | null;
}): DeviceReachabilitySummary => {
	const status = resolveDeviceReachabilityStatus(input);
	let detail: string | null = null;
	if (status === "online") {
		detail = "Device is reachable from HRIS";
	} else if (status === "degraded") {
		detail = "Partially reachable — some checks failed";
	} else if (status === "offline") {
		detail =
			input.networkOk === false
				? "Network unreachable"
				: input.deviceApiOk === false
					? "Device API not responding"
					: "Device appears offline";
	} else if (status === "checking") {
		detail = "Checking reachability…";
	} else if (input.errorMessage) {
		detail = input.errorMessage;
	} else {
		detail = "Status not checked yet";
	}

	return {
		status,
		label: getDeviceReachabilityLabel(status),
		checkedAt: input.checkedAt || null,
		detail,
	};
};
