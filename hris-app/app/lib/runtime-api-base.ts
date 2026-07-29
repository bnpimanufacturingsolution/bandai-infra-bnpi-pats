/**
 * Resolve which API origin the browser should call.
 *
 * Project Truth public hosts (`*.bnpi-hris.tech`) must use the Cloudflare
 * tunnel → Hyper-V/K3s path, NOT the legacy Cloud Run DEV/UAT URLs.
 * Cloud Run currently fails login when Cloud SQL is unreachable
 * (Prisma: Can't reach database server at /cloudsql/...).
 *
 * Tunnel config (`cloudflared-bnpi-hris.yml`):
 *   dev.bnpi-hris.tech/api/*  → 10.184.37.19:3101
 *   dev-api.bnpi-hris.tech    → 10.184.37.19:3101
 */
const LEGACY_CLOUD_RUN_DEV =
	"https://hris-api-dev-161377059311.asia-southeast1.run.app";
const LEGACY_CLOUD_RUN_UAT =
	"https://hris-api-uat-161377059311.asia-southeast1.run.app";
const LOCAL_API_BASE = "http://localhost:3001";

const DEV_FE_HOSTS = new Set([
	"hris-workforce-dev-20260416-app.web.app",
	"hris-workforce-dev-20260416-app.firebaseapp.com",
]);

const UAT_FE_HOSTS = new Set([
	"hris-uat-web.web.app",
	"hris-uat-web.firebaseapp.com",
]);

/** Prefer same-origin so /api and /socket.io hit the tunnel ingress. */
const sameOriginApiBase = (): string => {
	if (typeof window === "undefined") return "";
	return window.location.origin;
};

export const getRuntimeApiBase = (): string => {
	const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
	if (envBase) {
		return envBase;
	}

	if (typeof window === "undefined") {
		// SSR/build fallback — not used for browser login on bnpi hosts
		return LOCAL_API_BASE;
	}

	const host = window.location.hostname.toLowerCase();

	if (host === "localhost" || host === "127.0.0.1") {
		return LOCAL_API_BASE;
	}

	// Project Truth public / tunnel hosts → same origin (Cloudflare routes /api)
	if (host === "dev.bnpi-hris.tech" || host.endsWith(".dev.bnpi-hris.tech")) {
		return sameOriginApiBase();
	}
	if (host === "uat.bnpi-hris.tech" || host.endsWith(".uat.bnpi-hris.tech")) {
		return sameOriginApiBase();
	}
	if (
		host === "bnpi-hris.tech" ||
		host === "www.bnpi-hris.tech" ||
		host === "app.bnpi-hris.tech"
	) {
		return sameOriginApiBase();
	}
	if (host === "dev-api.bnpi-hris.tech") {
		return "https://dev-api.bnpi-hris.tech";
	}
	if (host === "uat-api.bnpi-hris.tech") {
		return "https://uat-api.bnpi-hris.tech";
	}
	if (host === "api.bnpi-hris.tech") {
		return "https://api.bnpi-hris.tech";
	}

	// LAN appliance IPs / hostnames → paired API port when opened on app port
	if (/^10\.\d+\.\d+\.\d+$/.test(host) || host === "project-truth-node") {
		const port = window.location.port;
		// DEV app 3100 → API 3101; UAT 3200→3201; PROD 3000→3001
		if (port === "3100") return `http://${host}:3101`;
		if (port === "3200") return `http://${host}:3201`;
		if (port === "3000" || port === "") return `http://${host}:3001`;
		return `http://${host}:3001`;
	}

	// Legacy Firebase hosting (optional Cloud Run) — explicit product decision
	if (UAT_FE_HOSTS.has(host)) {
		return LEGACY_CLOUD_RUN_UAT;
	}
	if (DEV_FE_HOSTS.has(host)) {
		return LEGACY_CLOUD_RUN_DEV;
	}

	// Safe default for unknown hosts: same-origin (avoid silent Cloud Run DB outages)
	return sameOriginApiBase() || LOCAL_API_BASE;
};
