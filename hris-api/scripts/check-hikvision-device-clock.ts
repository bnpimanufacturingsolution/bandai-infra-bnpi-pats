import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import { extractHikvisionSystemLocalTime } from "../helper/hikvision-event-contract.helper";

const prisma = new PrismaClient();

const parseArgs = () => {
	const options: Record<string, string> = {};
	for (const arg of process.argv.slice(2)) {
		if (!arg.startsWith("--") || !arg.includes("=")) continue;
		const [key, ...rest] = arg.slice(2).split("=");
		options[key] = rest.join("=");
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (!key.startsWith("npm_config_") || value === undefined) continue;
		const normalizedKey = key
			.slice("npm_config_".length)
			.replace(/_/g, "-")
			.replace(/^deviceid$/i, "deviceId");
		options[normalizedKey] ||= value;
	}
	return options;
};

const main = async () => {
	const options = parseArgs();
	const deviceId = String(options.deviceId || "").trim();
	if (!deviceId) throw new Error("Missing --deviceId=<id>");

	const device = await prisma.device.findFirst({
		where: { id: deviceId, isDeleted: false },
		select: { id: true, organizationId: true, name: true },
	});
	if (!device) throw new Error(`Device not found: ${deviceId}`);

	const serverTime = new Date();
	const payload = await hikvisionFetch("/ISAPI/System/time?format=json", {
		method: "GET",
		prisma,
		request: { organizationId: device.organizationId } as any,
		deviceId,
	});
	const rawDeviceTime = extractHikvisionSystemLocalTime(payload);
	const parsedDeviceTime = rawDeviceTime ? new Date(String(rawDeviceTime)) : null;
	const skewSeconds =
		parsedDeviceTime && !Number.isNaN(parsedDeviceTime.getTime())
			? Math.round((parsedDeviceTime.getTime() - serverTime.getTime()) / 1000)
			: null;

	console.log(
		JSON.stringify(
			{
				device,
				serverTime: serverTime.toISOString(),
				rawDeviceTime,
				parsedDeviceTime: parsedDeviceTime?.toISOString?.() || null,
				skewSeconds,
				payload,
			},
			null,
			2,
		),
	);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
