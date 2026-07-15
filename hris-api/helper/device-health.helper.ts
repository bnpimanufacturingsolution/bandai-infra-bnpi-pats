import { buildHikvisionDeviceBaseUrl } from "../lib/hikvision-client";

type DeviceHealthTargetDevice = {
	address: string;
	port: number;
	protocol: string;
	config?: unknown;
};

export type DeviceHealthNetworkTarget = {
	host: string;
	port: number;
	endpoint: string | null;
	source: "device_address" | "resolved_runtime_endpoint";
};

const parseHostFromAddress = (address: string) => {
	const value = String(address || "").trim();
	if (!value) return "";
	try {
		return new URL(value).hostname;
	} catch {
		return value.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].trim();
	}
};

export const resolveHikvisionDeviceHealthNetworkTarget = (
	device: DeviceHealthTargetDevice,
): DeviceHealthNetworkTarget => {
	const fallbackHost = parseHostFromAddress(device.address);
	const fallbackPort = Number(device.port);

	try {
		const endpoint = buildHikvisionDeviceBaseUrl(device);
		const parsed = new URL(endpoint);
		const protocol = parsed.protocol === "https:" ? "https" : "http";
		const port = parsed.port
			? Number(parsed.port)
			: protocol === "https"
				? 443
				: 80;
		return {
			host: parsed.hostname,
			port,
			endpoint,
			source: "resolved_runtime_endpoint",
		};
	} catch {
		return {
			host: fallbackHost,
			port: fallbackPort,
			endpoint: null,
			source: "device_address",
		};
	}
};
