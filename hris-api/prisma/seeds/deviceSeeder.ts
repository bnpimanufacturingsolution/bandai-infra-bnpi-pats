import { PrismaClient } from "../../generated/prisma";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";

const prisma = new PrismaClient();

/**
 * Device Seeder
 *
 * Creates or updates biometric devices for the organization.
 * Devices are used for attendance tracking and access control.
 */

export interface DeviceDefinition {
	name: string;
	address: string;
	port: number;
	protocol: "http" | "https" | "tcp" | "udp";
	config?: Record<string, any>;
	access?: {
		username?: string;
		password?: string;
	};
}

type DeviceSeedEnv = Record<string, string | undefined>;

type HikvisionSeedDeviceInput = {
	name?: string;
	address?: string;
	port?: number | string;
	protocol?: string;
	sdkPort?: number | string;
	sdkProtocol?: string;
	webhookPath?: string;
	username?: string;
	password?: string;
};

const optionalEnv = (name: string) => {
	const value = process.env[name];
	return value && value.trim() ? value.trim() : undefined;
};

const optionalEnvValue = (env: DeviceSeedEnv, name: string) => {
	const value = env[name];
	return value && String(value).trim() ? String(value).trim() : undefined;
};

const optionalProtocol = (
	value: string | undefined,
): DeviceDefinition["protocol"] | undefined => {
	if (value === "http" || value === "https" || value === "tcp" || value === "udp") {
		return value;
	}
	return undefined;
};

const buildSeedManagedConfig = (config?: Record<string, any>) => ({
	...(config || {}),
	seedManaged: true,
});

const buildHikvisionSeedDevice = (
	input: HikvisionSeedDeviceInput,
	fallbackName: string,
): DeviceDefinition | null => {
	const name = String(input.name || fallbackName).trim();
	const address = String(input.address || "").trim();
	const protocol = optionalProtocol(String(input.protocol || "").trim()) || "http";
	const port = Number(input.port || 80);
	const sdkPort = Number(input.sdkPort || 8000);
	const sdkProtocol = optionalProtocol(String(input.sdkProtocol || "").trim()) || "tcp";
	const webhookPath = String(input.webhookPath || "/api/hikvision/callback").trim();
	const username = String(input.username || "").trim();
	const password = String(input.password || "").trim();

	if (!name || !address || !Number.isFinite(port) || !Number.isFinite(sdkPort)) {
		return null;
	}

	return {
		name,
		address,
		port,
		protocol,
		config: buildSeedManagedConfig({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort,
			sdkProtocol,
			webhookPath,
		}),
		access: {
			...(username ? { username } : {}),
			...(password ? { password } : {}),
		},
	};
};

const parseHikvisionSeedDevicesJson = (env: DeviceSeedEnv) => {
	const raw = String(env.HIKVISION_SEED_DEVICES_JSON || "").trim();
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error("HIKVISION_SEED_DEVICES_JSON must be a JSON array");
		}

		return parsed
			.map((item, index) =>
				buildHikvisionSeedDevice((item || {}) as HikvisionSeedDeviceInput, `Hikvision Device ${index + 1}`),
			)
			.filter(Boolean) as DeviceDefinition[];
	} catch (error: any) {
		throw new Error(error?.message || "Invalid HIKVISION_SEED_DEVICES_JSON");
	}
};

const buildDefaultHikvisionSeedDevices = (env: DeviceSeedEnv) => {
	const configuredDevices = parseHikvisionSeedDevicesJson(env);
	if (configuredDevices.length > 0) return configuredDevices;

	const fallback = buildHikvisionSeedDevice(
		{
			name: "Main Entrance Device",
			address: env.HIKVISION_SEED_ADDRESS || "10.184.37.139",
			port: env.HIKVISION_SEED_PORT || 80,
			protocol: env.HIKVISION_SEED_PROTOCOL || "http",
			sdkPort: env.HIKVISION_SEED_SDK_PORT || 8000,
			username: optionalEnvValue(env, "HIKVISION_SEED_USERNAME"),
			password: optionalEnvValue(env, "HIKVISION_SEED_PASSWORD"),
		},
		"Main Entrance Device",
	);

	return fallback ? [fallback] : [];
};

export const getDeviceDefinitions = (env: DeviceSeedEnv = process.env): DeviceDefinition[] => {
	const hikvisionDevices = buildDefaultHikvisionSeedDevices(env);

	return [
		...hikvisionDevices,
		{
			name: "ZKTeco Device 10.184.38.10",
			address: "10.184.38.10",
			port: 4370,
			protocol: "tcp",
			config: buildSeedManagedConfig({
				vendor: "ZKTeco",
				source: "vendor/zkteco-linux",
				webhookPath: "/api/zkteco/events",
			}),
		},
		{
			name: "ZKTeco Device 10.184.38.234",
			address: "10.184.38.234",
			port: 4370,
			protocol: "tcp",
			config: buildSeedManagedConfig({
				vendor: "ZKTeco",
				source: "vendor/zkteco-linux",
				webhookPath: "/api/zkteco/events",
			}),
		},
		{
			name: "ZKTeco Device 10.184.38.235",
			address: "10.184.38.235",
			port: 4370,
			protocol: "tcp",
			config: buildSeedManagedConfig({
				vendor: "ZKTeco",
				source: "vendor/zkteco-linux",
				webhookPath: "/api/zkteco/events",
			}),
		},
		{
			name: "ZKTeco Device 10.184.38.9",
			address: "10.184.38.9",
			port: 4370,
			protocol: "tcp",
			config: buildSeedManagedConfig({
				vendor: "ZKTeco",
				source: "vendor/zkteco-linux",
				webhookPath: "/api/zkteco/events",
			}),
		},
	];
};

// Customize these devices according to your organization's biometric devices
export const DEVICE_DEFINITIONS: DeviceDefinition[] = getDeviceDefinitions();

export async function ensureDevices(
	organizationId?: string,
	prismaClient: PrismaClient = prisma,
): Promise<Map<string, string>> {
	console.log("\n=== Creating Devices ===");
	const resolvedOrganizationId = organizationId ?? (await resolveDefaultSeedOrganizationId());
	const deviceMap = new Map<string, string>();
	const activeDeviceKeys = DEVICE_DEFINITIONS.map((deviceDef) => ({
		address: deviceDef.address,
		port: deviceDef.port,
	}));

	for (const deviceDef of DEVICE_DEFINITIONS) {
		// Create unique identifier using address and port
		const deviceIdentifier = `${deviceDef.address}:${deviceDef.port}`;

		try {
			const device = await prismaClient.device.upsert({
				where: {
					organizationId_address_port: {
						organizationId: resolvedOrganizationId,
						address: deviceDef.address,
						port: deviceDef.port,
					},
				},
				update: {
					name: deviceDef.name,
					protocol: deviceDef.protocol,
					config: deviceDef.config || {},
					access: deviceDef.access
						? {
								...(deviceDef.access.username
									? { username: deviceDef.access.username }
									: {}),
								...(deviceDef.access.password
									? { password: deviceDef.access.password }
									: {}),
							}
						: {},
				},
				create: {
					organizationId: resolvedOrganizationId,
					name: deviceDef.name,
					address: deviceDef.address,
					port: deviceDef.port,
					protocol: deviceDef.protocol,
					config: deviceDef.config || {},
					access: deviceDef.access
						? {
								...(deviceDef.access.username
									? { username: deviceDef.access.username }
									: {}),
								...(deviceDef.access.password
									? { password: deviceDef.access.password }
									: {}),
							}
						: {},
				},
			});

			deviceMap.set(deviceDef.name, device.id);
			console.log(
				`   Device: ${deviceDef.name} (${deviceIdentifier}) - ${deviceDef.protocol.toUpperCase()}`,
			);
		} catch (error) {
			console.error(`   Failed creating device ${deviceDef.name}:`, error);
			throw error;
		}
	}

	const staleDeviceCleanup = await prismaClient.device.updateMany({
		where: {
			organizationId: resolvedOrganizationId,
			isDeleted: false,
			config: {
				path: ["seedManaged"],
				equals: true,
			},
			NOT: {
				OR: activeDeviceKeys,
			},
		},
		data: {
			isDeleted: true,
		},
	});
	if (staleDeviceCleanup.count > 0) {
		console.log(`   Soft-deleted stale development device rows: ${staleDeviceCleanup.count}`);
	}

	return deviceMap;
}

/**
 * Seed devices for the organization
 * This is called from the main seeding process
 */
export async function seedDevices() {
	console.log("\n" + "=".repeat(80));
	console.log(" STARTING DEVICE SEEDING");
	console.log("=".repeat(80));

	try {
		const devices = await ensureDevices();

		// Summary
		console.log("\n" + "=".repeat(80));
		console.log(" DEVICE SEEDING COMPLETE");
		console.log("=".repeat(80));
		console.log(`\n DEVICE SUMMARY:`);
		console.log(`    Total Devices Created/Updated: ${devices.size}`);
		console.log("\n" + "=".repeat(80));

		return devices;
	} catch (error) {
		console.error("\n Device seeding failed:", error);
		throw error;
	}
}
