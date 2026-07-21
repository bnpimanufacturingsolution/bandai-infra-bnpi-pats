type DeviceConfigRecord = Record<string, unknown>;

type DeviceRuntimeContext = {
	name?: string | null;
	address?: string | null;
	protocol?: string | null;
};

const DEFAULT_KIOSK_CONFIG = {
	employeeKioskLoginEnabled: false,
	employeeKioskLoginWindowSeconds: 12,
	employeeKioskLoginAppCode: "hris",
	employeeKioskLoginAudience: "employee-portal",
} as const;

export const getDeviceConfigRecord = (config: unknown): DeviceConfigRecord =>
	config && typeof config === "object" && !Array.isArray(config)
		? { ...(config as DeviceConfigRecord) }
		: {};

export const buildDeviceConfigPreset = (vendor: string): DeviceConfigRecord => {
	const normalized = vendor.toLowerCase();
	if (normalized.includes("zkteco") || normalized.includes("zk")) {
		return {
			vendor: "ZKTeco",
			source: "vendor/zkteco-linux",
			sdkPort: 4370,
			sdkProtocol: "tcp",
			webhookPath: "/api/zkteco/events",
			...DEFAULT_KIOSK_CONFIG,
		};
	}

	return {
		vendor: "Hikvision",
		source: "vendor/hikvision-linux",
		sdkPort: 8000,
		sdkProtocol: "tcp",
		webhookPath: "/api/hikvision/callback",
		...DEFAULT_KIOSK_CONFIG,
	};
};

export const getDefaultDeviceConfig = () => buildDeviceConfigPreset("Hikvision");

export const getHikvisionReverseBridgeIndex = ({
	name,
	address,
	config,
}: DeviceRuntimeContext & { config?: unknown }) => {
	const record = getDeviceConfigRecord(config);
	const explicitIndex = Number(record.hikvisionReverseBridgeIndex);
	if (Number.isInteger(explicitIndex) && explicitIndex >= 0) return explicitIndex;

	const nameMatch = String(name || "").match(/\bTEST\s+([A-Z])\b/i);
	if (nameMatch) return nameMatch[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);

	const addressMatch = String(address || "").match(/^192\.168\.254\.(\d+)$/);
	if (addressMatch) {
		const lastOctet = Number(addressMatch[1]);
		if (lastOctet >= 109 && lastOctet <= 130) return lastOctet - 109;
	}

	return 0;
};

export const buildHikvisionRuntimeConfig = (
	config: unknown,
	{ name, address, protocol }: DeviceRuntimeContext,
): DeviceConfigRecord => {
	const record = getDeviceConfigRecord(config);
	const usesReverseBridge =
		String(record.hikvisionSdkRuntimeTransport || "").toLowerCase() ===
			"ssh-reverse-forward" ||
		String(record.preferHostReverseBridge || "").toLowerCase() === "true" ||
		String(address || "").startsWith("192.168.254.");
	if (!usesReverseBridge) return {};

	const bridgeIndex = getHikvisionReverseBridgeIndex({ name, address, config: record });
	const offset = bridgeIndex * 100;
	return {
		hikvisionRuntimeAddress: "127.0.0.1",
		hikvisionRuntimePort: 59443 + offset,
		hikvisionRuntimeProtocol:
			String(protocol || "").toLowerCase() === "http" ? "http" : "https",
		hikvisionSdkRuntimeAddress: "127.0.0.1",
		hikvisionSdkRuntimePort: 59000 + offset,
		hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
		hikvisionReverseBridgeIndex: bridgeIndex,
	};
};

export const normalizeDeviceConfigForSubmit = (
	config: unknown,
	existingConfig?: unknown,
	context: DeviceRuntimeContext = {},
): DeviceConfigRecord => {
	const next = getDeviceConfigRecord(config);
	const existing = getDeviceConfigRecord(existingConfig);
	const vendor = String(next.vendor || existing.vendor || "").trim();
	const preset = buildDeviceConfigPreset(vendor || "Hikvision");
	const runtimeConfig =
		preset.vendor === "Hikvision"
			? buildHikvisionRuntimeConfig({ ...existing, ...next }, context)
			: {};
	return {
		...existing,
		...preset,
		...next,
		...runtimeConfig,
		vendor: preset.vendor,
		source: preset.source,
		sdkPort: preset.sdkPort,
		sdkProtocol: preset.sdkProtocol,
		webhookPath: preset.webhookPath,
		employeeKioskLoginEnabled:
			next.employeeKioskLoginEnabled === true || next.employeeKioskLoginEnabled === false
				? next.employeeKioskLoginEnabled
				: existing.employeeKioskLoginEnabled === true,
		employeeKioskLoginWindowSeconds:
			typeof next.employeeKioskLoginWindowSeconds === "number"
				? next.employeeKioskLoginWindowSeconds
				: typeof existing.employeeKioskLoginWindowSeconds === "number"
					? existing.employeeKioskLoginWindowSeconds
					: preset.employeeKioskLoginWindowSeconds,
		employeeKioskLoginAppCode:
			String(
				next.employeeKioskLoginAppCode ||
					existing.employeeKioskLoginAppCode ||
					preset.employeeKioskLoginAppCode,
			).trim() || "hris",
		employeeKioskLoginAudience:
			String(
				next.employeeKioskLoginAudience ||
					existing.employeeKioskLoginAudience ||
					preset.employeeKioskLoginAudience,
			).trim() || "employee-portal",
	};
};
