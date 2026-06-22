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

// Customize these devices according to your organization's biometric devices
export const DEVICE_DEFINITIONS: DeviceDefinition[] = [
	{
		name: "Main Entrance Device",
		address: "192.168.110.24",
		port: 80,
		protocol: "https",
		config: {},
		access: {
			username: "admin",
			password: "20262027@",
		},
	},
	{
		name: "ZKTeco Device 10.184.38.10",
		address: "10.184.38.10",
		port: 4370,
		protocol: "tcp",
		config: {
			vendor: "ZKTeco",
			source: "vendor/zkteco-sdk",
			webhookPath: "/api/zkteco/events",
		},
	},
	{
		name: "ZKTeco Device 10.184.38.234",
		address: "10.184.38.234",
		port: 4370,
		protocol: "tcp",
		config: {
			vendor: "ZKTeco",
			source: "vendor/zkteco-sdk",
			webhookPath: "/api/zkteco/events",
		},
	},
	{
		name: "ZKTeco Device 10.184.38.235",
		address: "10.184.38.235",
		port: 4370,
		protocol: "tcp",
		config: {
			vendor: "ZKTeco",
			source: "vendor/zkteco-sdk",
			webhookPath: "/api/zkteco/events",
		},
	},
	{
		name: "ZKTeco Device 10.184.38.9",
		address: "10.184.38.9",
		port: 4370,
		protocol: "tcp",
		config: {
			vendor: "ZKTeco",
			source: "vendor/zkteco-sdk",
			webhookPath: "/api/zkteco/events",
		},
	},
	// Add more devices as needed
	// {
	//   name: "Back Entrance Device",
	//   address: "192.168.110.25",
	//   port: 80,
	//   protocol: "https",
	//   config: {},
	//   access: {
	//     username: "admin",
	//     password: "Admin123",
	//   },
	// },
];

export async function ensureDevices(
	organizationId?: string,
	prismaClient: PrismaClient = prisma,
): Promise<Map<string, string>> {
	console.log("\n=== Creating Devices ===");
	const resolvedOrganizationId = organizationId ?? (await resolveDefaultSeedOrganizationId());
	const deviceMap = new Map<string, string>();

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
