export const normalizeApiBase = (raw: string, fallback: string): string => {
	const value = (raw || "").trim();
	if (!value) return fallback;

	const normalized = value.replace(/\/+$/, "");
	const hasApiSuffix = normalized.toLowerCase().endsWith("/api");

	if (!hasApiSuffix) {
		return `${normalized}/api`;
	}

	return normalized;
};

const PUBLIC_APP_SOCKET_HOSTS: Record<string, Set<string>> = {
	"bnpi-hris.tech": new Set(["api.bnpi-hris.tech"]),
	"www.bnpi-hris.tech": new Set(["api.bnpi-hris.tech"]),
	"app.bnpi-hris.tech": new Set(["api.bnpi-hris.tech"]),
	"dev.bnpi-hris.tech": new Set(["dev-api.bnpi-hris.tech"]),
	"uat.bnpi-hris.tech": new Set(["uat-api.bnpi-hris.tech"]),
};

const APP_TO_API_PORT: Record<string, string> = {
	"3000": "3001",
	"3100": "3101",
	"3200": "3201",
};

const shouldUseFallbackSocketOrigin = (normalizedBase: string, fallbackOrigin: string): boolean => {
	if (!fallbackOrigin) return false;

	try {
		const base = new URL(normalizedBase);
		const fallback = new URL(fallbackOrigin);
		const pairedApiHosts = PUBLIC_APP_SOCKET_HOSTS[fallback.hostname.toLowerCase()];

		if (pairedApiHosts?.has(base.hostname.toLowerCase())) {
			return true;
		}

		const expectedApiPort = APP_TO_API_PORT[fallback.port];
		return (
			Boolean(expectedApiPort) &&
			base.protocol === fallback.protocol &&
			base.hostname.toLowerCase() === fallback.hostname.toLowerCase() &&
			base.port === expectedApiPort
		);
	} catch {
		return false;
	}
};

export const resolveSocketBaseUrl = (
	rawBase: string | undefined,
	fallbackOrigin: string,
): string => {
	const value = (rawBase || "").trim();
	if (!value) return fallbackOrigin;

	const normalized = value.replace(/\/+$/, "");
	if (normalized.startsWith("/") && normalized.toLowerCase().endsWith("/api")) {
		return fallbackOrigin;
	}

	if (shouldUseFallbackSocketOrigin(normalized, fallbackOrigin)) {
		return fallbackOrigin;
	}

	if (normalized.toLowerCase().endsWith("/api")) {
		return normalized.slice(0, -4);
	}

	return normalized;
};

export const normalizeEndpointForBase = (baseURL: string, endpoint: string): string => {
	const normalizedBase = baseURL.replace(/\/+$/, "");
	const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

	if (
		normalizedBase.toLowerCase().endsWith("/api") &&
		normalizedEndpoint.toLowerCase().startsWith("/api/")
	) {
		return normalizedEndpoint.slice(4);
	}

	return normalizedEndpoint;
};

export const resolveApiUrl = (baseURL: string, endpoint: string): string => {
	const normalizedBase = baseURL.replace(/\/+$/, "");
	return `${normalizedBase}${normalizeEndpointForBase(baseURL, endpoint)}`;
};

