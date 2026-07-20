import { Prisma } from "../generated/prisma";

export type DeviceRuntimeVendor = "Hikvision" | "ZKTeco";

type DeviceConfigInput = Record<string, unknown> | null | undefined;

type DeviceRuntimeDefaultsInput = {
	config?: unknown;
	existingConfig?: unknown;
	name?: string | null;
	protocol?: string | null;
	port?: number | null;
};

const DEVICE_RUNTIME_DEFAULTS: Record<DeviceRuntimeVendor, Record<string, unknown>> = {
	Hikvision: {
		vendor: "Hikvision",
		source: "vendor/hikvision-linux",
		sdkPort: 8000,
		sdkProtocol: "tcp",
		webhookPath: "/api/hikvision/callback",
		employeeKioskLoginEnabled: false,
		employeeKioskLoginWindowSeconds: 12,
		employeeKioskLoginAppCode: "hris",
		employeeKioskLoginAudience: "employee-portal",
	},
	ZKTeco: {
		vendor: "ZKTeco",
		source: "vendor/zkteco-linux",
		sdkPort: 4370,
		sdkProtocol: "tcp",
		webhookPath: "/api/zkteco/events",
		employeeKioskLoginEnabled: false,
		employeeKioskLoginWindowSeconds: 12,
		employeeKioskLoginAppCode: "hris",
		employeeKioskLoginAudience: "employee-portal",
	},
};

const toRecord = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return { ...(value as Record<string, unknown>) };
};

const cleanConfig = (value: DeviceConfigInput): Record<string, unknown> => {
	const config = toRecord(value);
	for (const [key, rawValue] of Object.entries(config)) {
		if (typeof rawValue === "string") {
			const trimmed = rawValue.trim();
			if (trimmed) config[key] = trimmed;
			else delete config[key];
		}
		if (rawValue === undefined || rawValue === null) delete config[key];
	}
	return config;
};

export const resolveDeviceRuntimeVendor = ({
	config,
	name,
	protocol,
	port,
}: Omit<DeviceRuntimeDefaultsInput, "existingConfig">): DeviceRuntimeVendor | null => {
	const record = toRecord(config);
	const vendorText = String(record.vendor || record.type || record.source || "").toLowerCase();
	const nameText = String(name || "").toLowerCase();

	if (vendorText.includes("hikvision") || nameText.includes("hikvision")) return "Hikvision";
	if (
		vendorText.includes("zkteco") ||
		vendorText.includes("zk") ||
		nameText.includes("zkteco") ||
		nameText.includes("zk") ||
		(String(protocol || "").toLowerCase() === "tcp" && Number(port) === 4370)
	) {
		return "ZKTeco";
	}

	return null;
};

export const buildDeviceRuntimeConfig = ({
	config,
	existingConfig,
	name,
	protocol,
	port,
}: DeviceRuntimeDefaultsInput): Prisma.InputJsonObject => {
	const merged = {
		...cleanConfig(toRecord(existingConfig)),
		...cleanConfig(toRecord(config)),
	};
	const vendor = resolveDeviceRuntimeVendor({ config: merged, name, protocol, port });

	if (!vendor) return merged as Prisma.InputJsonObject;

	const runtimeDefaults = DEVICE_RUNTIME_DEFAULTS[vendor];
	return {
		...runtimeDefaults,
		...merged,
		source: runtimeDefaults.source,
		sdkPort: runtimeDefaults.sdkPort,
		sdkProtocol: runtimeDefaults.sdkProtocol,
		webhookPath: runtimeDefaults.webhookPath,
		employeeKioskLoginEnabled:
			typeof merged.employeeKioskLoginEnabled === "boolean"
				? merged.employeeKioskLoginEnabled
				: runtimeDefaults.employeeKioskLoginEnabled,
		employeeKioskLoginWindowSeconds:
			Number.isFinite(Number(merged.employeeKioskLoginWindowSeconds))
				? Number(merged.employeeKioskLoginWindowSeconds)
				: runtimeDefaults.employeeKioskLoginWindowSeconds,
		employeeKioskLoginAppCode:
			typeof merged.employeeKioskLoginAppCode === "string" &&
			String(merged.employeeKioskLoginAppCode).trim()
				? String(merged.employeeKioskLoginAppCode).trim()
				: runtimeDefaults.employeeKioskLoginAppCode,
		employeeKioskLoginAudience:
			typeof merged.employeeKioskLoginAudience === "string" &&
			String(merged.employeeKioskLoginAudience).trim()
				? String(merged.employeeKioskLoginAudience).trim()
				: runtimeDefaults.employeeKioskLoginAudience,
	} as Prisma.InputJsonObject;
};
