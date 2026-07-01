const DEV_API_BASE = "https://hris-api-dev-161377059311.asia-southeast1.run.app";
const UAT_API_BASE = "https://hris-api-uat-161377059311.asia-southeast1.run.app";
const LOCAL_API_BASE = "http://localhost:3001";
const PROD_PUBLIC_API_BASE = "/api";
const DEV_FE_HOSTS = new Set([
	"hris-workforce-dev-20260416-app.web.app",
	"hris-workforce-dev-20260416-app.firebaseapp.com",
]);

const UAT_FE_HOSTS = new Set([
	"hris-uat-web.web.app",
	"hris-uat-web.firebaseapp.com",
]);

const PROD_TUNNEL_FE_HOSTS = new Set([
	"bnpi-hris.tech",
	"www.bnpi-hris.tech",
	"app.bnpi-hris.tech",
]);

const LAN_APP_TO_API_PORT: Record<string, string> = {
	"3000": "3001",
	"3100": "3101",
	"3200": "3201",
};

type RuntimeLocation = Pick<Location, "protocol" | "hostname" | "port">;

const isIpv4Address = (host: string): boolean => /^\d+\.\d+\.\d+\.\d+$/.test(host);

const isLoopbackHost = (host: string): boolean => host === "localhost" || host === "127.0.0.1";

const isRelativeApiBase = (value: string): boolean => value.startsWith("/");

export const resolveRuntimeApiBase = (
	location: RuntimeLocation | undefined,
	configuredBase?: string,
): string => {
	const envBase = (configuredBase || "").trim();
	if (envBase) {
		if (isRelativeApiBase(envBase) && location) {
			const host = location.hostname.toLowerCase();
			const apiPort = LAN_APP_TO_API_PORT[location.port];
			if ((isLoopbackHost(host) || isIpv4Address(host)) && apiPort) {
				return `${location.protocol}//${location.hostname}:${apiPort}`;
			}
		}
		return envBase;
	}

	if (!location) {
		return DEV_API_BASE;
	}

	const host = location.hostname.toLowerCase();
	const apiPort = LAN_APP_TO_API_PORT[location.port];

	if ((isLoopbackHost(host) || isIpv4Address(host)) && apiPort) {
		return `${location.protocol}//${location.hostname}:${apiPort}`;
	}

	if (isLoopbackHost(host)) {
		return LOCAL_API_BASE;
	}

	if (PROD_TUNNEL_FE_HOSTS.has(host)) {
		return PROD_PUBLIC_API_BASE;
	}

	if (host === "dev.bnpi-hris.tech") {
		return PROD_PUBLIC_API_BASE;
	}

	if (host === "uat.bnpi-hris.tech") {
		return PROD_PUBLIC_API_BASE;
	}

	if (UAT_FE_HOSTS.has(host)) {
		return UAT_API_BASE;
	}

	if (DEV_FE_HOSTS.has(host)) {
		return DEV_API_BASE;
	}

	return DEV_API_BASE;
};

export const getRuntimeApiBase = (): string => {
	const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
	return resolveRuntimeApiBase(
		typeof window === "undefined" ? undefined : window.location,
		envBase,
	);
};
