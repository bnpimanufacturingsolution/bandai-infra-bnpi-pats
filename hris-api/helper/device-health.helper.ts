import {
	buildHikvisionDeviceBaseUrl,
	getHikvisionDeviceHttpPort,
	resolveHikvisionTunnelTarget,
} from "../lib/hikvision-client";

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
	source: "device_address" | "resolved_runtime_endpoint" | "env_tunnel_map";
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
	const httpPort = getHikvisionDeviceHttpPort(device);
	const tunnelTarget = resolveHikvisionTunnelTarget(fallbackHost, httpPort);
	if (tunnelTarget) {
		const protocol = tunnelTarget.protocol || (device.protocol === "https" ? "https" : "http");
		return {
			host: tunnelTarget.host,
			port: tunnelTarget.port,
			endpoint: `${protocol}://${tunnelTarget.host}:${tunnelTarget.port}`,
			source: "env_tunnel_map",
		};
	}

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
