const DEV_API_BASE = "https://hris-api-dev-161377059311.asia-southeast1.run.app";
const UAT_API_BASE = "https://hris-api-uat-161377059311.asia-southeast1.run.app";
const LOCAL_API_BASE = "http://localhost:3001";
const API_PORT = "3001";

const DEV_FE_HOSTS = new Set([
	"hris-workforce-dev-20260416-app.web.app",
	"hris-workforce-dev-20260416-app.firebaseapp.com",
]);

const UAT_FE_HOSTS = new Set([
	"hris-uat-web.web.app",
	"hris-uat-web.firebaseapp.com",
]);

export const getRuntimeApiBase = (): string => {
	const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

	if (typeof window === "undefined") {
		return envBase || DEV_API_BASE;
	}

	const host = window.location.hostname.toLowerCase();

	if (host === "localhost" || host === "127.0.0.1") {
		return envBase || LOCAL_API_BASE;
	}

	if (envBase && envBase !== LOCAL_API_BASE) {
		return envBase;
	}

	if (UAT_FE_HOSTS.has(host)) {
		return UAT_API_BASE;
	}

	if (DEV_FE_HOSTS.has(host)) {
		return DEV_API_BASE;
	}

	return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
};
