import type { NextFunction, Request, Response } from "express";
import { context, trace } from "@opentelemetry/api";
import type { Prisma } from "../generated/prisma";
import { prisma } from "../config/database";
import { config } from "../config/config";
import { getLogger } from "../helper/logger.helper";
import type { AuthRequest } from "./verifyToken";

const logger = getLogger().child({ module: "apiActivity" });

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
let activityLogCounter = 0;

function normalizePath(path: string): string {
	const [pathWithoutQuery] = path.split("?");
	const segments = pathWithoutQuery.split("/").filter(Boolean);
	if (segments.length === 0) return "/";

	return `/${segments
		.map((segment) => {
			if (/^\d+$/.test(segment)) return ":id";
			if (/^[0-9a-fA-F]{24}$/.test(segment)) return ":id";
			if (/^[0-9a-fA-F-]{32,36}$/.test(segment)) return ":id";
			if (/^c[a-z0-9]{8,}$/i.test(segment)) return ":id";
			return segment;
		})
		.join("/")}`;
}

function getRouteLabel(req: Request): string {
	const routePath = (req.route?.path as string | undefined) || "";
	const base = req.baseUrl || "";

	if (routePath) {
		return normalizePath(`${base}${routePath}`.replace(/\/+/g, "/"));
	}

	return normalizePath(req.originalUrl || req.path || "unknown");
}

function getModuleLabel(route: string): string {
	const segments = route.split("/").filter(Boolean);
	if (segments[0] === "api" && segments[1]) return segments[1];
	return segments[0] || "root";
}

function isExcludedPath(req: Request): boolean {
	const path = req.path || req.originalUrl || "";
	return config.apiActivityLogging.excludedPaths.some((excludedPath) => {
		if (!excludedPath) return false;
		return path === excludedPath || path.startsWith(`${excludedPath}/`);
	});
}

function shouldSample(): boolean {
	const sampleRate = config.apiActivityLogging.sampleRate;
	if (sampleRate >= 1) return true;
	if (sampleRate <= 0) return false;

	activityLogCounter += 1;
	const interval = Math.max(1, Math.round(1 / sampleRate));
	return activityLogCounter % interval === 0;
}

function getClientIp(req: Request): string {
	const forwardedFor = req.get("x-forwarded-for");
	if (forwardedFor) {
		return forwardedFor.split(",")[0].trim();
	}

	return req.ip || req.socket.remoteAddress || "unknown";
}

function getBodyMetadata(req: Request): Record<string, unknown> | null {
	if (config.apiActivityLogging.bodyMode === "none") {
		return null;
	}

	if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
		return null;
	}

	return {
		fieldNames: Object.keys(req.body).filter((fieldName) => {
			const normalized = fieldName.toLowerCase();
			return !(
				normalized.includes("password") ||
				normalized.includes("token") ||
				normalized.includes("secret") ||
				normalized.includes("cookie")
			);
		}),
		fieldCount: Object.keys(req.body).length,
	};
}

export function apiActivityLoggingMiddleware(
	req: AuthRequest,
	res: Response,
	next: NextFunction,
): void {
	if (!config.apiActivityLogging.enabled || isExcludedPath(req)) {
		next();
		return;
	}

	if (!config.apiActivityLogging.includeReads && READ_METHODS.has(req.method.toUpperCase())) {
		next();
		return;
	}

	if (!shouldSample()) {
		next();
		return;
	}

	const startedAt = Date.now();
	const route = getRouteLabel(req);
	const module = getModuleLabel(route);
	const spanContext = trace.getSpan(context.active())?.spanContext();
	const traceIdAtEntry = spanContext?.traceId || null;
	const spanIdAtEntry = spanContext?.spanId || null;
	const requestBodyMetadata = getBodyMetadata(req);

	res.on("finish", () => {
		const durationMs = Date.now() - startedAt;
		const statusCode = res.statusCode;
		const statusClass = `${Math.floor(statusCode / 100)}xx`;
		const successful = statusCode < 400;
		const authUserId = req.userId || null;
		const employeeId = req.metadata?.employee?.id || null;
		const organizationId = req.organizationId || null;
		const ip = getClientIp(req);
		const userAgent = req.get("User-Agent") || "unknown";
		const activeSpanContext = trace.getSpan(context.active())?.spanContext();
		const traceId = activeSpanContext?.traceId || traceIdAtEntry;
		const spanId = activeSpanContext?.spanId || spanIdAtEntry;

		const payload = {
			userId: authUserId,
			employeeId,
			organizationId,
			route,
			module,
			statusCode,
			statusClass,
			durationMs,
			successful,
			traceId,
			spanId,
			queryKeys: Object.keys(req.query || {}),
			body: requestBodyMetadata,
		};

		logger.info("api.activity.request", {
			event: "api.activity.request",
			user_id: authUserId,
			employee_id: employeeId,
			organization_id: organizationId,
			method: req.method,
			path: req.originalUrl,
			route,
			module,
			status_code: statusCode,
			status_class: statusClass,
			duration_ms: durationMs,
			ip,
			user_agent: userAgent,
			trace_id: traceId,
			span_id: spanId,
		});

		void prisma.activityLogging
			.create({
				data: {
					employeeId,
					headers: {
						userAgent,
					},
					ip,
					path: req.originalUrl || req.url,
					method: req.method,
					action: `${req.method.toUpperCase()} ${route}`,
					description: `${req.method.toUpperCase()} ${route} completed with ${statusCode}`,
					organizationId,
					entityType: module.toUpperCase(),
					payload: payload as Prisma.InputJsonValue,
				},
			})
			.catch((error: unknown) => {
				logger.warn("api.activity.persist_failed", {
					event: "api.activity.persist_failed",
					error:
						error instanceof Error
							? { message: error.message, name: error.name, stack: error.stack }
							: error,
					route,
					method: req.method,
					status_code: statusCode,
					trace_id: traceId,
				});
			});
	});

	next();
}
