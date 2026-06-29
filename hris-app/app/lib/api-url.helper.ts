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

