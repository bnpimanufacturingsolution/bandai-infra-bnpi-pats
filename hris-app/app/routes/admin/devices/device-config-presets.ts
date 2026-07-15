type DeviceConfigRecord = Record<string, unknown>;

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

export const normalizeDeviceConfigForSubmit = (
	config: unknown,
	existingConfig?: unknown,
): DeviceConfigRecord => {
	const next = getDeviceConfigRecord(config);
	const existing = getDeviceConfigRecord(existingConfig);
	const vendor = String(next.vendor || existing.vendor || "").trim();
	const preset = buildDeviceConfigPreset(vendor || "Hikvision");
	return {
		...existing,
		...preset,
		...next,
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
