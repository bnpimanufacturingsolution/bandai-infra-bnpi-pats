import type { NextFunction, Request, Response } from "express";
import { context, trace } from "@opentelemetry/api";
import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "hris_api_" });
const HTTP_METRICS_SAMPLE_RATE_RAW = Number(process.env.HTTP_METRICS_SAMPLE_RATE ?? "1");
const HTTP_METRICS_SAMPLE_RATE =
	Number.isFinite(HTTP_METRICS_SAMPLE_RATE_RAW) && HTTP_METRICS_SAMPLE_RATE_RAW > 0
		? Math.min(1, HTTP_METRICS_SAMPLE_RATE_RAW)
		: 1;
let httpMetricsRequestCounter = 0;

const httpRequestsTotal = new client.Counter({
	name: "hris_api_http_requests_total",
	help: "Total number of HTTP requests",
	labelNames: ["method", "route", "module", "status_code"] as const,
	registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
	name: "hris_api_http_request_duration_seconds",
	help: "Duration of HTTP requests in seconds",
	labelNames: ["method", "route", "module", "status_code"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
	registers: [register],
});

const httpInFlightRequests = new client.Gauge({
	name: "hris_api_http_in_flight_requests",
	help: "Current number of in-flight HTTP requests",
	labelNames: ["method", "route", "module"] as const,
	registers: [register],
});

const traceContextTotal = new client.Counter({
	name: "hris_api_trace_context_total",
	help: "Total HTTP requests tagged by trace context presence",
	labelNames: ["module", "route", "state"] as const,
	registers: [register],
});

function getModuleLabel(route: string): string {
	const normalized = normalizePath(route || "");
	const segments = normalized.split("/").filter(Boolean);
	if (segments.length === 0) return "root";

	if (segments[0] === "api" && segments.length >= 2) {
		return segments[1];
	}

	return segments[0];
}

function normalizePath(path: string): string {
	if (!path) return "unknown";

	const noQuery = path.split("?")[0];
	const segments = noQuery.split("/").filter(Boolean);
	if (segments.length === 0) return "/";

	const normalized = segments.map((seg) => {
		if (/^\d+$/.test(seg)) return ":id";
		if (/^[0-9a-fA-F]{24}$/.test(seg)) return ":id";
		if (/^[0-9a-fA-F-]{32,36}$/.test(seg)) return ":id";
		return seg;
	});

	return `/${normalized.join("/")}`;
}

function getRouteLabel(req: Request): string {
	const routePath = (req.route?.path as string | undefined) || "";
	const base = req.baseUrl || "";

	if (routePath) {
		const joined = `${base}${routePath}`.replace(/\/+/g, "/");
		return normalizePath(joined);
	}

	return normalizePath(req.originalUrl || req.path || "unknown");
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
	// Sampling reduces middleware CPU overhead under heavy load while preserving trend visibility.
	httpMetricsRequestCounter += 1;
	const shouldSample =
		HTTP_METRICS_SAMPLE_RATE >= 1 ||
		(httpMetricsRequestCounter % Math.max(1, Math.round(1 / HTTP_METRICS_SAMPLE_RATE)) === 0);
	if (!shouldSample) {
		next();
		return;
	}

	const method = req.method;
	const route = getRouteLabel(req);
	const module = getModuleLabel(route);
	const spanPresentAtEntry = Boolean(trace.getSpan(context.active())?.spanContext()?.traceId);
	const endTimer = httpRequestDurationSeconds.startTimer({ method, route, module });
	httpInFlightRequests.inc({ method, route, module });

	res.on("finish", () => {
		const statusCode = String(res.statusCode);
		httpRequestsTotal.inc({ method, route, module, status_code: statusCode });
		traceContextTotal.inc({ module, route, state: spanPresentAtEntry ? "present" : "missing" });
		endTimer({ method, route, module, status_code: statusCode });
		httpInFlightRequests.dec({ method, route, module });
	});

	next();
}

export async function metricsHandler(req: Request, res: Response): Promise<void> {
	res.setHeader("Content-Type", register.contentType);
	res.end(await register.metrics());
}
