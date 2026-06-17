import type { NextFunction, Request, Response } from "express";
import { getLogger } from "../helper/logger.helper";

const logger = getLogger();
const SUCCESS_SAMPLE_RATE_RAW = Number(process.env.API_DEBUG_SUCCESS_SAMPLE_RATE ?? "0.01");
const SUCCESS_SAMPLE_RATE =
	Number.isFinite(SUCCESS_SAMPLE_RATE_RAW) && SUCCESS_SAMPLE_RATE_RAW >= 0
		? Math.min(1, SUCCESS_SAMPLE_RATE_RAW)
		: 0.01;

const HEADER_ALLOWLIST = new Set([
	"content-type",
	"user-agent",
	"x-request-id",
	"x-forwarded-for",
	"x-real-ip",
	"origin",
	"referer",
]);

function truncate(value: string, max = 800): string {
	if (!value) return "";
	return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return "[unserializable]";
	}
}

function sanitizeHeaders(headers: Request["headers"]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) {
		const key = k.toLowerCase();
		if (!HEADER_ALLOWLIST.has(key)) continue;
		if (Array.isArray(v)) out[key] = truncate(v.join(","));
		else if (typeof v === "string") out[key] = truncate(v);
	}
	return out;
}

function buildCurl(req: Request): string {
	const method = req.method.toUpperCase();
	const proto = req.protocol || "http";
	const host = req.get("host") || "localhost:3001";
	const url = `${proto}://${host}${req.originalUrl || req.url || ""}`;
	const contentType = req.get("content-type");
	const bodyRaw = req.body ? truncate(safeStringify(req.body), 300) : "";

	const parts = [`curl -i -X ${method} '${url}'`];
	if (contentType) {
		parts.push(`-H 'Content-Type: ${contentType}'`);
	}
	if (bodyRaw && bodyRaw !== "{}") {
		parts.push(`-d '${bodyRaw.replace(/'/g, "\\'")}'`);
	}
	return parts.join(" ");
}

export function apiDebugLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
	const startedAt = Date.now();

	let responseBodySnippet = "";
	const originalJson = res.json.bind(res);
	const originalSend = res.send.bind(res);

	res.json = ((body: unknown) => {
		responseBodySnippet = truncate(safeStringify(body), 700);
		return originalJson(body);
	}) as Response["json"];

	res.send = ((body?: unknown) => {
		if (typeof body === "string") {
			responseBodySnippet = truncate(body, 700);
		} else if (body !== undefined) {
			responseBodySnippet = truncate(safeStringify(body), 700);
		}
		return originalSend(body);
	}) as Response["send"];

	res.on("finish", () => {
		const durationMs = Date.now() - startedAt;
		const requestBodySnippet =
			req.body && Object.keys(req.body as object).length > 0
				? truncate(safeStringify(req.body), 700)
				: "";
		const headers = sanitizeHeaders(req.headers);
		const curl = buildCurl(req);

		if (res.statusCode >= 400) {
			const line =
				`api.request.error status=${res.statusCode} method=${req.method} path=${req.originalUrl || req.url} ` +
				`duration_ms=${durationMs} headers=${safeStringify(headers)} ` +
				`request_body=${requestBodySnippet || "none"} response_body=${responseBodySnippet || "none"} ` +
				`curl=\"${curl}\"`;

			logger.error(line, {
				module: "api-debug",
				event: "api.request.error",
				status_code: res.statusCode,
				method: req.method,
				path: req.originalUrl || req.url,
				duration_ms: durationMs,
			});
			return;
		}

		// Sample successful requests for debugging without flooding logs.
		if (Math.random() > SUCCESS_SAMPLE_RATE) return;
		const successLine =
			`api.request.success status=${res.statusCode} method=${req.method} path=${req.originalUrl || req.url} ` +
			`duration_ms=${durationMs} headers=${safeStringify(headers)} ` +
			`request_body=${requestBodySnippet || "none"} response_body=${responseBodySnippet || "none"} ` +
			`curl=\"${curl}\"`;
		logger.info(successLine, {
			module: "api-debug",
			event: "api.request.success",
			status_code: res.statusCode,
			method: req.method,
			path: req.originalUrl || req.url,
			duration_ms: durationMs,
			sampled: true,
			success_sample_rate: SUCCESS_SAMPLE_RATE,
		});
	});

	next();
}
