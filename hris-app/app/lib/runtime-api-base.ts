const DEV_API_BASE = "https://hris-api-dev-161377059311.asia-southeast1.run.app";
const UAT_API_BASE = "https://hris-api-uat-161377059311.asia-southeast1.run.app";
const LOCAL_API_BASE = "http://localhost:3001";
const DEFAULT_API_PORT = "3001";
const APP_TO_API_PORT: Record<string, string> = {
	"3000": "3001",
	"3100": "3101",
	"3200": "3201",
};

const DEV_FE_HOSTS = new Set([
	"hris-workforce-dev-20260416-app.web.app",
	"hris-workforce-dev-20260416-app.firebaseapp.com",
]);

const UAT_FE_HOSTS = new Set([
	"hris-uat-web.web.app",
	"hris-uat-web.firebaseapp.com",
]);

export const resolveRuntimeApiBase = (
	location: Pick<Location, "protocol" | "hostname" | "port"> | undefined,
	envBase?: string,
): string => {
	const configuredBase = (envBase || "").trim();
	const isAbsoluteConfiguredBase = /^https?:\/\//i.test(configuredBase);

	if (!location) {
		return configuredBase || DEV_API_BASE;
	}

	const host = location.hostname.toLowerCase();
	const apiPort = APP_TO_API_PORT[location.port] || DEFAULT_API_PORT;

	if (host === "localhost" || host === "127.0.0.1") {
		if (isAbsoluteConfiguredBase && configuredBase !== LOCAL_API_BASE) {
			return configuredBase;
		}
		return `${location.protocol}//${location.hostname}:${apiPort}`;
	}

	if (isAbsoluteConfiguredBase && configuredBase !== LOCAL_API_BASE) {
		return configuredBase;
	}

	if (UAT_FE_HOSTS.has(host)) {
		return UAT_API_BASE;
	}

	if (DEV_FE_HOSTS.has(host)) {
		return DEV_API_BASE;
	}

	return `${location.protocol}//${location.hostname}:${apiPort}`;
};

export const getRuntimeApiBase = (): string => {
	const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
	return resolveRuntimeApiBase(typeof window === "undefined" ? undefined : window.location, envBase);
};
