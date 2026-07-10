import { Request } from "express";
import { HIKVISION_CONFIG } from "../config/hikvision.endpoint";
import { PrismaClient } from "../generated/prisma";
import https from "https";

interface HikvisionFetchOptions extends Omit<RequestInit, "body"> {
	body?: string | object;
	deviceId?: string;
	prisma?: PrismaClient;
	request?: Request;
	timeoutMs?: number;
}

export type HikvisionBinaryResponse = {
	status: number;
	contentType: string;
	contentLength: number;
	buffer: Buffer;
};

type HikvisionDeviceConnection = {
	id?: string;
	name?: string;
	baseUrl: string;
	username: string;
	password: string;
};

const getRequestOrganizationId = (request?: Request) =>
	String((request as any)?.organizationId || (request as any)?.userOrganizationId || "").trim();

const getBodyDeviceId = (body?: string | object) => {
	if (!body || typeof body === "string") return "";
	const candidate = (body as any).deviceId || (body as any).hikvisionDeviceId;
	return candidate ? String(candidate).trim() : "";
};

const stripProxyFields = (body?: string | object) => {
	if (!body || typeof body === "string") return body;
	const { deviceId: _deviceId, hikvisionDeviceId: _hikvisionDeviceId, ...payload } = body as any;
	return payload;
};

const getDeviceAccess = (access: unknown) => {
	const value = access && typeof access === "object" ? (access as any) : {};
	return {
		username: String(value.username || HIKVISION_CONFIG.username || "").trim(),
		password: String(value.password || HIKVISION_CONFIG.password || "").trim(),
	};
};

export const getHikvisionDeviceHttpPort = (device: {
	port: number;
	protocol: string;
	config?: unknown;
}) => {
	if (device.protocol !== "https" && Number(device.port) === 8000) return 80;
	if (device.protocol === "https" && Number(device.port) === 8000) return 443;
	return Number(device.port);
};

const getHikvisionRuntimeEndpoint = (device: {
	address: string;
	port: number;
	protocol: string;
	config?: unknown;
}) => {
	const config = device.config && typeof device.config === "object" ? (device.config as any) : {};
	const runtimeBaseUrl = String(
		config.hikvisionRuntimeBaseUrl ||
			config.hikvisionProxyBaseUrl ||
			config.runtimeBaseUrl ||
			"",
	).trim();
	if (runtimeBaseUrl) return runtimeBaseUrl.replace(/\/$/, "");

	const runtimeAddress = String(
		config.hikvisionRuntimeAddress ||
			config.hikvisionProxyAddress ||
			config.runtimeAddress ||
			"",
	).trim();
	if (!runtimeAddress) return "";

	const runtimePort = Number(
		config.hikvisionRuntimePort ||
			config.hikvisionProxyPort ||
			config.runtimePort ||
			getHikvisionDeviceHttpPort(device),
	);
	const runtimeProtocol = String(
		config.hikvisionRuntimeProtocol ||
			config.hikvisionProxyProtocol ||
			config.runtimeProtocol ||
			device.protocol ||
			"http",
	).toLowerCase() === "https"
		? "https"
		: "http";

	if (/^https?:\/\//i.test(runtimeAddress)) {
		const parsed = new URL(runtimeAddress);
		if (!parsed.port && runtimePort) parsed.port = String(runtimePort);
		return parsed.toString().replace(/\/$/, "");
	}

	return `${runtimeProtocol}://${runtimeAddress}:${runtimePort}`;
};

export const buildHikvisionDeviceBaseUrl = (device: {
	address: string;
	port: number;
	protocol: string;
	config?: unknown;
}) => {
	const runtimeEndpoint = getHikvisionRuntimeEndpoint(device);
	if (runtimeEndpoint) return runtimeEndpoint;

	const address = String(device.address || "").trim();
	const httpPort = getHikvisionDeviceHttpPort(device);
	if (/^https?:\/\//i.test(address)) {
		const parsed = new URL(address);
		if (!parsed.port && httpPort) {
			parsed.port = String(httpPort);
		}
		return parsed.toString().replace(/\/$/, "");
	}

	const protocol = device.protocol === "https" ? "https" : "http";
	return `${protocol}://${address}:${httpPort}`;
};

/**
 * Centralized Hikvision API client with Digest Authentication
 * Uses digest-fetch library for automatic digest auth handling
 */
class HikvisionClient {
	private async createClient(username: string, password: string): Promise<any> {
		const { default: DigestClient } = await import("digest-fetch");
		return new DigestClient(username, password, {
			algorithm: "MD5",
		});
	}

	private async resolveDeviceConnection(
		options: HikvisionFetchOptions,
	): Promise<HikvisionDeviceConnection> {
		const organizationId = getRequestOrganizationId(options.request);
		const requestedDeviceId =
			options.deviceId ||
			getBodyDeviceId(options.body) ||
			String((options.request?.query as any)?.deviceId || "").trim();

		if (options.prisma && (requestedDeviceId || organizationId)) {
			const device = await options.prisma.device.findFirst({
				where: {
					isDeleted: false,
					...(requestedDeviceId ? { id: requestedDeviceId } : {}),
					...(organizationId ? { organizationId } : {}),
				},
				orderBy: { createdAt: "asc" },
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
				},
			});

			if (!device) {
				throw {
					status: 404,
					message: requestedDeviceId
						? "Device not found for this organization"
						: "No Hikvision device configured for this organization",
					data: { deviceId: requestedDeviceId || undefined },
				};
			}

			const access = getDeviceAccess(device.access);
			if (!access.username || !access.password) {
				throw {
					status: 400,
					message: "Selected device is missing access credentials",
					data: { deviceId: device.id, deviceName: device.name },
				};
			}

			return {
				id: device.id,
				name: device.name,
				baseUrl: buildHikvisionDeviceBaseUrl(device),
				username: access.username,
				password: access.password,
			};
		}

		return {
			baseUrl: HIKVISION_CONFIG.baseUrl,
			username: HIKVISION_CONFIG.username,
			password: HIKVISION_CONFIG.password,
		};
	}

	/**
	 * Normalize endpoint to ensure ?format=json is present
	 */
	private normalizeEndpoint(endpoint: string): string {
		// Check if endpoint already has query parameters
		const hasQuery = endpoint.includes("?");

		// Check if format=json is already present
		if (endpoint.includes("format=json")) {
			return endpoint;
		}

		// Append ?format=json or &format=json
		if (hasQuery) {
			return `${endpoint}&format=json`;
		} else {
			return `${endpoint}?format=json`;
		}
	}

	private buildRequestUrl(connection: HikvisionDeviceConnection, endpoint: string, ensureJsonFormat = true) {
		if (/^https?:\/\//i.test(endpoint)) return endpoint;
		const normalizedEndpoint = ensureJsonFormat ? this.normalizeEndpoint(endpoint) : endpoint;
		return `${connection.baseUrl}${normalizedEndpoint}`;
	}

	/**
	 * Main fetch method - handles digest authentication automatically
	 */
	async fetch(endpoint: string, options: HikvisionFetchOptions = {}): Promise<any> {
		const connection = await this.resolveDeviceConnection(options);
		const url = this.buildRequestUrl(connection, endpoint, true);

		// Prepare headers from curl example
		const headers: Record<string, string> = {
			Accept: "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "max-age=0",
			Connection: "keep-alive",
			"If-Modified-Since": "0",
			Origin: connection.baseUrl,
			"X-Requested-With": "XMLHttpRequest",
			...((options.headers as Record<string, string>) || {}),
		};

		if (options.body && !headers["Content-Type"]) {
			headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
		}

		// Prepare fetch options
		const fetchOptions: RequestInit = {
			method: options.method || "GET",
			headers,
		};
		const timeoutMs = Math.max(Number(options.timeoutMs || HIKVISION_CONFIG.timeout || 10000), 1000);
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), timeoutMs);
		fetchOptions.signal = abortController.signal;

		// Handle body
		if (options.body) {
			const body = stripProxyFields(options.body);
			fetchOptions.body =
				typeof body === "string" ? body : JSON.stringify(body);
		}

		// For HTTPS with self-signed certificates, we need to configure the agent
		if (url.startsWith("https")) {
			const httpsAgent = new https.Agent({
				rejectUnauthorized: false,
			});
			// @ts-ignore - digest-fetch supports agent option
			fetchOptions.agent = httpsAgent;
		}

		try {
			const client = await this.createClient(connection.username, connection.password);
			const response = await client.fetch(url, fetchOptions);

			if (!response.ok) {
				const errorText = await response.text().catch(() => "");
				let errorData: any = { message: response.statusText };
				try {
					errorData = errorText ? JSON.parse(errorText) : errorData;
				} catch {
					errorData = { message: response.statusText, raw: errorText };
				}
				throw {
					status: response.status,
					message: errorData.message || response.statusText,
					data: errorData,
				};
			}

			const responseText = await response.text();
			try {
				return responseText ? JSON.parse(responseText) : {};
			} catch {
				return { raw: responseText };
			}
		} catch (error: any) {
			// If it's already our error format, rethrow it
			if (error.status) {
				throw error;
			}
			// Otherwise wrap it
			throw {
				status: 502,
				message: error.message
					? `Hikvision device request failed: ${error.message}`
					: "Hikvision device request failed",
				data: {
					deviceId: connection.id,
					deviceName: connection.name,
					baseUrl: connection.baseUrl,
					timeoutMs,
					errorName: error?.name,
					errorCode: error?.code || error?.cause?.code,
					errorCause: error?.cause?.message,
				},
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	async fetchBinary(
		endpoint: string,
		options: HikvisionFetchOptions = {},
	): Promise<HikvisionBinaryResponse> {
		const connection = await this.resolveDeviceConnection(options);
		const url = this.buildRequestUrl(connection, endpoint, false);
		const headers: Record<string, string> = {
			Accept: "image/*,*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			Origin: connection.baseUrl,
			"X-Requested-With": "XMLHttpRequest",
			...((options.headers as Record<string, string>) || {}),
		};
		const timeoutMs = Math.max(Number(options.timeoutMs || HIKVISION_CONFIG.timeout || 10000), 1000);
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), timeoutMs);
		const fetchOptions: RequestInit = {
			method: options.method || "GET",
			headers,
			signal: abortController.signal,
		};

		if (url.startsWith("https")) {
			const httpsAgent = new https.Agent({
				rejectUnauthorized: false,
			});
			// @ts-ignore - digest-fetch supports agent option
			fetchOptions.agent = httpsAgent;
		}

		try {
			const client = await this.createClient(connection.username, connection.password);
			const response = await client.fetch(url, fetchOptions);

			if (!response.ok) {
				const errorText = await response.text().catch(() => "");
				throw {
					status: response.status,
					message: errorText || response.statusText || "Failed to fetch Hikvision binary content",
					data: {
						deviceId: connection.id,
						deviceName: connection.name,
						baseUrl: connection.baseUrl,
					},
				};
			}

			const buffer = Buffer.from(await response.arrayBuffer());
			return {
				status: response.status,
				contentType: response.headers.get("content-type") || "application/octet-stream",
				contentLength: Number(response.headers.get("content-length") || buffer.length || 0),
				buffer,
			};
		} catch (error: any) {
			if (error.status) throw error;
			throw {
				status: 502,
				message: error.message
					? `Hikvision binary request failed: ${error.message}`
					: "Hikvision binary request failed",
				data: {
					deviceId: connection.id,
					deviceName: connection.name,
					baseUrl: connection.baseUrl,
					timeoutMs,
					errorName: error?.name,
					errorCode: error?.code || error?.cause?.code,
					errorCause: error?.cause?.message,
				},
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}

// Export singleton instance
export const hikvisionClient = new HikvisionClient();

/**
 * Convenience function for making requests (backward compatible)
 */
export const hikvisionFetch = async (
	endpoint: string,
	options: HikvisionFetchOptions = {},
): Promise<any> => {
	return hikvisionClient.fetch(endpoint, options);
};

export const hikvisionFetchBinary = async (
	endpoint: string,
	options: HikvisionFetchOptions = {},
): Promise<HikvisionBinaryResponse> => {
	return hikvisionClient.fetchBinary(endpoint, options);
};
