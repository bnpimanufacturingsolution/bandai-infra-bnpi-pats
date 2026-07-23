import { existsSync } from "fs";

export type HikvisionRuntimeLocation = "windows-host" | "vm-host" | "vm-container";

export type HikvisionRuntimeRoute = {
	location: HikvisionRuntimeLocation;
	commandTransport: "local" | "ssh";
	apiBase: string;
	allowCloudflareSshFallback: boolean;
	reason: string;
};

type ResolveHikvisionRuntimeRouteOptions = {
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	isContainer?: boolean;
};

const RUNTIME_LOCATIONS = new Set<HikvisionRuntimeLocation>([
	"windows-host",
	"vm-host",
	"vm-container",
]);

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const boundedPort = (value: unknown, fallback: number) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
};

const defaultVmApiPort = (appEnv: string) => {
	switch (appEnv.toLowerCase()) {
		case "dev":
		case "development":
			return 3101;
		case "uat":
			return 3201;
		default:
			return 3001;
	}
};

export const resolveHikvisionRuntimeRoute = (
	options: ResolveHikvisionRuntimeRouteOptions = {},
): HikvisionRuntimeRoute => {
	const env = options.env || process.env;
	const platform = options.platform || process.platform;
	const configuredLocation = String(
		env.PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION || "",
	)
		.trim()
		.toLowerCase();
	if (
		configuredLocation &&
		!RUNTIME_LOCATIONS.has(configuredLocation as HikvisionRuntimeLocation)
	) {
		throw new Error(
			`Invalid PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION=${configuredLocation}; expected windows-host, vm-host, or vm-container`,
		);
	}

	const isContainer =
		options.isContainer ??
		Boolean(
			env.KUBERNETES_SERVICE_HOST ||
				String(env.PROJECT_TRUTH_CONTAINERIZED || "").toLowerCase() === "true" ||
				existsSync("/.dockerenv"),
		);
	const location =
		(configuredLocation as HikvisionRuntimeLocation) ||
		(platform === "win32" ? "windows-host" : isContainer ? "vm-container" : "vm-host");
	const configuredApiBase = String(
		env.PROJECT_TRUTH_HIKVISION_VM_API_BASE || "",
	).trim();

	if (location === "windows-host") {
		return {
			location,
			commandTransport: "ssh",
			apiBase: normalizeBaseUrl(configuredApiBase || "http://127.0.0.1:53001"),
			allowCloudflareSshFallback: true,
			reason: configuredLocation
				? "explicit Windows-host runtime"
				: "auto-detected Windows host runtime",
		};
	}

	if (location === "vm-host") {
		const localApiPort = boundedPort(env.PORT, 3001);
		return {
			location,
			commandTransport: "local",
			apiBase: normalizeBaseUrl(
				configuredApiBase || `http://127.0.0.1:${localApiPort}`,
			),
			allowCloudflareSshFallback: false,
			reason: configuredLocation
				? "explicit native VM-host runtime"
				: "auto-detected native Linux VM-host runtime",
		};
	}

	const defaultApiPort = defaultVmApiPort(String(env.APP_ENV || env.NODE_ENV || ""));
	const vmApiPort = boundedPort(
		env.PROJECT_TRUTH_HIKVISION_VM_API_PORT,
		defaultApiPort,
	);
	return {
		location,
		commandTransport: "ssh",
		apiBase: normalizeBaseUrl(
			configuredApiBase || `http://127.0.0.1:${vmApiPort}`,
		),
		allowCloudflareSshFallback: false,
		reason: configuredLocation
			? "explicit VM-container runtime"
			: "auto-detected K3s/Docker VM-container runtime",
	};
};
