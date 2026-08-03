/**
 * Operator-facing device address display for reverse-tunneled panels.
 *
 * Connectivity still uses stored `device.address` / `device.port` (API health/SDK).
 * UI prefers physical LAN identity when config or name embeds it, and shows the
 * tunnel/runtime endpoint as secondary copy so operators are not confused by
 * publish IPs (e.g. 10.184.37.19:58380) alone.
 */

export type DeviceDisplayAddressInput = {
	name?: string | null;
	address?: string | null;
	port?: number | string | null;
	config?: unknown;
};

export type DeviceDisplayAddress = {
	/** Primary label for operators (physical LAN when known). */
	primaryEndpoint: string;
	/** Host portion of primary endpoint. */
	primaryHost: string;
	/** Port portion of primary endpoint when known. */
	primaryPort: number | null;
	/** Runtime/tunnel host shown secondarily when it differs from primary. */
	runtimeHost: string;
	/** Runtime/tunnel port when known. */
	runtimePort: number | null;
	/** Full runtime/tunnel endpoint used by pods/API when tunneled. */
	runtimeEndpoint: string;
	/** True when primary physical identity differs from runtime/tunnel host. */
	usesReverseTunnelDisplay: boolean;
	/** Secondary line, e.g. "via reverse tunnel 10.184.37.19:58380". */
	tunnelLabel: string | null;
	/** Tooltip / title combining both. */
	title: string;
	/** Where the primary host came from. */
	primarySource: "config.physicalAddress" | "name" | "address";
};

const IPV4_RE =
	/\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?::(\d{1,5}))?\b/;

const getConfigRecord = (config: unknown): Record<string, unknown> =>
	config && typeof config === "object" && !Array.isArray(config)
		? (config as Record<string, unknown>)
		: {};

const cleanText = (value: unknown): string => String(value ?? "").trim();

const cleanHost = (value: unknown): string => {
	const text = cleanText(value);
	if (!text) return "";
	try {
		if (/^https?:\/\//i.test(text)) {
			return new URL(text).hostname;
		}
	} catch {
		// fall through
	}
	return text
		.replace(/^https?:\/\//i, "")
		.split("/")[0]
		.split(":")[0]
		.trim();
};

const cleanPort = (value: unknown): number | null => {
	const raw = cleanText(value);
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.trunc(n);
};

const formatEndpoint = (host: string, port: number | null): string => {
	if (!host) return port != null ? `:${port}` : "";
	return port != null ? `${host}:${port}` : host;
};

const hostsEqual = (a: string, b: string) =>
	cleanHost(a).toLowerCase() === cleanHost(b).toLowerCase();

/**
 * Prefer parenthesized IPv4 in device names, e.g. "Import Target A CSV (192.168.18.35)".
 * Falls back to the first IPv4 found in the name.
 */
export const extractIpv4FromDeviceName = (
	name?: string | null,
): { host: string; port: number | null } | null => {
	const text = cleanText(name);
	if (!text) return null;

	const paren = text.match(
		/\(((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?::(\d{1,5}))?\)/,
	);
	if (paren) {
		return {
			host: paren[1],
			port: paren[2] ? cleanPort(paren[2]) : null,
		};
	}

	const match = text.match(IPV4_RE);
	if (!match) return null;
	return {
		host: match[1],
		port: match[2] ? cleanPort(match[2]) : null,
	};
};

/**
 * Resolve operator-facing primary Device IP vs runtime/tunnel endpoint.
 * Does not mutate stored address/port used for API connectivity.
 */
export const resolveDeviceDisplayAddress = (
	device?: DeviceDisplayAddressInput | null,
): DeviceDisplayAddress => {
	const config = getConfigRecord(device?.config);
	const storedHost = cleanHost(device?.address);
	const storedPort = cleanPort(device?.port);

	const runtimeHostFromConfig = cleanHost(
		config.hikvisionRuntimeAddress ??
			config.hikvisionSdkRuntimeAddress ??
			config.runtimeAddress ??
			config.hikvisionProxyAddress,
	);
	const runtimePortFromConfig = cleanPort(
		config.hikvisionRuntimePort ??
			config.hikvisionSdkRuntimePort ??
			config.runtimePort ??
			config.hikvisionProxyPort,
	);

	const physicalHostFromConfig = cleanHost(
		config.physicalAddress ??
			config.physicalHost ??
			config.deviceLanAddress ??
			config.devicePhysicalAddress ??
			config.deviceAddress,
	);
	const physicalPortFromConfig = cleanPort(
		config.physicalPort ??
			config.physicalHttpPort ??
			config.devicePhysicalPort,
	);

	const fromName = extractIpv4FromDeviceName(device?.name);

	let primaryHost = "";
	let primaryPort: number | null = null;
	let primarySource: DeviceDisplayAddress["primarySource"] = "address";

	if (physicalHostFromConfig) {
		primaryHost = physicalHostFromConfig;
		primaryPort = physicalPortFromConfig;
		primarySource = "config.physicalAddress";
	} else if (fromName?.host) {
		primaryHost = fromName.host;
		primaryPort = fromName.port;
		primarySource = "name";
	} else {
		primaryHost = storedHost;
		primaryPort = storedPort;
		primarySource = "address";
	}

	// Same host as stored address without an explicit physical port → reuse stored port.
	if (
		primaryPort == null &&
		primaryHost &&
		storedHost &&
		hostsEqual(primaryHost, storedHost)
	) {
		primaryPort = storedPort;
	}

	/*
	 * Runtime/tunnel secondary:
	 * 1) Stored address differs from physical → stored address is publish/tunnel (Import Target).
	 * 2) Else explicit Hikvision runtime/SDK host differs from primary → loopback reverse-forward.
	 * 3) Else runtime equals stored (no secondary).
	 */
	let runtimeHost = storedHost;
	let runtimePort = storedPort;

	if (primaryHost && storedHost && !hostsEqual(primaryHost, storedHost)) {
		runtimeHost = storedHost;
		runtimePort = storedPort;
	} else if (
		runtimeHostFromConfig &&
		primaryHost &&
		!hostsEqual(runtimeHostFromConfig, primaryHost)
	) {
		runtimeHost = runtimeHostFromConfig;
		runtimePort = runtimePortFromConfig ?? storedPort;
	}

	const primaryEndpoint = formatEndpoint(primaryHost, primaryPort) || "-";
	const runtimeEndpoint = formatEndpoint(runtimeHost, runtimePort) || "-";
	const usesTunnel =
		Boolean(primaryHost && runtimeHost) && !hostsEqual(primaryHost, runtimeHost);

	const tunnelLabel = usesTunnel ? `via reverse tunnel ${runtimeEndpoint}` : null;
	const title = tunnelLabel
		? `Device IP ${primaryEndpoint} (${tunnelLabel})`
		: primaryEndpoint === "-"
			? "No address"
			: `Device IP ${primaryEndpoint}`;

	return {
		primaryEndpoint,
		primaryHost: primaryHost || "",
		primaryPort,
		runtimeHost: runtimeHost || "",
		runtimePort,
		runtimeEndpoint,
		usesReverseTunnelDisplay: usesTunnel,
		tunnelLabel,
		title,
		primarySource,
	};
};

/** Compact one-line string for tables/subtitles. */
export const formatDeviceDisplayAddressLine = (
	device?: DeviceDisplayAddressInput | null,
	options?: { includeTunnel?: boolean },
): string => {
	const resolved = resolveDeviceDisplayAddress(device);
	if (!resolved.primaryHost && resolved.primaryEndpoint === "-") return "-";
	if (options?.includeTunnel === false || !resolved.tunnelLabel) {
		return resolved.primaryEndpoint;
	}
	return `${resolved.primaryEndpoint} · ${resolved.tunnelLabel}`;
};
