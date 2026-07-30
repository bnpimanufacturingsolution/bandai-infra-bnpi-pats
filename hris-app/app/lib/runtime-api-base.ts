/**
 * Resolve which API origin the browser should call.
 *
 * Project Truth public hosts (`*.bnpi-hris.tech`) and LAN hosts
 * (`*.bnpi-hris.lan`) must use same-origin `/api` via Cloudflare or Caddy,
 * NOT the legacy Cloud Run DEV/UAT URLs.
 *
 * Tunnel config (`cloudflared-bnpi-hris.yml`):
 *   dev.bnpi-hris.tech/api/*  → 10.184.37.19:3101
 * LAN Caddy:
 *   dev.bnpi-hris.lan/api/*   → 127.0.0.1:3101
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

	// Project Truth public (.tech) and LAN (.lan) hosts → same origin.
	// Cloudflare routes /api on .tech; Caddy routes /api on .lan.
	const isLanZone = host === "bnpi-hris.lan" || host.endsWith(".bnpi-hris.lan");
	const isTechZone = host === "bnpi-hris.tech" || host.endsWith(".bnpi-hris.tech");
	if (isLanZone || isTechZone) {
		// API-only hostnames still use absolute origin (same host is the API).
		if (
			host === "dev-api.bnpi-hris.tech" ||
			host === "uat-api.bnpi-hris.tech" ||
			host === "api.bnpi-hris.tech" ||
			host === "dev-api.bnpi-hris.lan" ||
			host === "uat-api.bnpi-hris.lan" ||
			host === "api.bnpi-hris.lan"
		) {
			return sameOriginApiBase();
		}
		// App / emp hosts: same-origin so /api hits tunnel or LAN Caddy (no CORS).
		return sameOriginApiBase();
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
