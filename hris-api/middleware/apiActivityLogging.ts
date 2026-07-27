import type { NextFunction, Request, Response } from "express";
import { context, trace } from "@opentelemetry/api";
import type { Prisma } from "../generated/prisma";
import { prisma } from "../config/database";
import { config } from "../config/config";
import { getLogger } from "../helper/logger.helper";
import type { AuthRequest } from "./verifyToken";

const logger = getLogger().child({ module: "apiActivity" });

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
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
	const excluded = config?.apiActivityLogging?.excludedPaths;
	if (!Array.isArray(excluded) || excluded.length === 0) return false;
	return excluded.some((excludedPath) => {
		if (!excludedPath) return false;
		return path === excludedPath || path.startsWith(`${excludedPath}/`);
	});
}

function shouldSample(): boolean {
	const sampleRate = Number(config?.apiActivityLogging?.sampleRate ?? 1);
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
	if ((config?.apiActivityLogging?.bodyMode || "none") === "none") {
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

function isSensitiveField(fieldName: string): boolean {
	const normalized = fieldName.toLowerCase();
	return (
		normalized.includes("password") ||
		normalized.includes("token") ||
		normalized.includes("secret") ||
		normalized.includes("cookie") ||
		normalized.includes("authorization") ||
		normalized.includes("cardno") ||
		normalized.includes("fingerprint") ||
		normalized.includes("facetemplate") ||
		normalized.includes("facepicture") ||
		normalized.includes("faceurl") ||
		normalized.includes("rawface") ||
		normalized.includes("rawblob") ||
		normalized.includes("templatebase64") ||
		normalized.includes("picturebase64")
	);
}

function redactValue(value: unknown, depth = 0): unknown {
	if (depth > 3) return "[MaxDepth]";
	if (value === null || value === undefined) return value;
	if (value instanceof Date) return value.toISOString();
	if (["string", "number", "boolean"].includes(typeof value)) return value;
	if (Array.isArray(value)) {
		return value.slice(0, 10).map((item) => redactValue(item, depth + 1));
	}
	if (typeof value !== "object") return String(value);

	const output: Record<string, unknown> = {};
	for (const [key, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 25)) {
		output[key] = isSensitiveField(key) ? "[REDACTED]" : redactValue(childValue, depth + 1);
	}
	return output;
}

function summarizePayload(value: unknown): string {
	if (!value || typeof value !== "object" || Array.isArray(value)) return "";

	return Object.entries(value as Record<string, unknown>)
		.filter(([key]) => !isSensitiveField(key))
		.slice(0, 8)
		.map(([key, childValue]) => {
			if (childValue === null || childValue === undefined) return `${key}=null`;
			if (["string", "number", "boolean"].includes(typeof childValue)) {
				const text = String(childValue);
				return `${key}=${text.length > 60 ? `${text.slice(0, 57)}...` : text}`;
			}
			if (Array.isArray(childValue)) return `${key}=[${childValue.length}]`;
			if (typeof childValue === "object") return `${key}={...}`;
			return `${key}=${String(childValue)}`;
		})
		.join(",");
}

function getActionType(method: string): string {
	switch (method.toUpperCase()) {
		case "POST":
			return "create";
		case "PUT":
		case "PATCH":
			return "update";
		case "DELETE":
			return "delete";
		default:
			return "read";
	}
}

function getRouteEntityId(req: Request): string {
	const params = req.params || {};
	const preferredParam =
		params.id ||
		params.userId ||
		params.employeeId ||
		params.documentId ||
		params.requestId ||
		params.payrollPeriodId;
	if (preferredParam) return String(preferredParam);

	const pathWithoutQuery = (req.originalUrl || req.path || "").split("?")[0];
	const lastSegment = pathWithoutQuery.split("/").filter(Boolean).at(-1);
	return lastSegment && lastSegment !== getModuleLabel(pathWithoutQuery) ? lastSegment : "";
}

function collectIds(value: unknown, ids: string[] = [], depth = 0): string[] {
	if (!value || depth > 4 || ids.length >= 5) return ids;
	if (Array.isArray(value)) {
		for (const item of value.slice(0, 5)) collectIds(item, ids, depth + 1);
		return ids;
	}
	if (typeof value !== "object") return ids;

	const record = value as Record<string, unknown>;
	const id = record.id;
	if (typeof id === "string" && id && !ids.includes(id)) {
		ids.push(id);
	}
	for (const key of ["user", "employee", "document", "agency", "payrollPeriod", "data"]) {
		collectIds(record[key], ids, depth + 1);
	}
	return ids;
}

export function apiActivityLoggingMiddleware(
	req: AuthRequest,
	res: Response,
	next: NextFunction,
): void {
	// Fail-open: monorepo snapshot drops of config.apiActivityLogging must not 500 login.
	const activityCfg = config?.apiActivityLogging;
	if (!activityCfg || activityCfg.enabled !== true || isExcludedPath(req)) {
		next();
		return;
	}

	if (!activityCfg.includeReads && READ_METHODS.has(req.method.toUpperCase())) {
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
	let responseBody: unknown = null;
	const originalJson = res.json.bind(res);
	res.json = ((body: unknown) => {
		responseBody = body;
		return originalJson(body);
	}) as Response["json"];

	res.on("finish", () => {
		const durationMs = Date.now() - startedAt;
		const statusCode = res.statusCode;
		const statusClass = `${Math.floor(statusCode / 100)}xx`;
		const successful = statusCode < 400;
		const ip = getClientIp(req);
		const userAgent = req.get("User-Agent") || "unknown";

		const activeSpanContext = trace.getSpan(context.active())?.spanContext();
		const traceId = activeSpanContext?.traceId || traceIdAtEntry;
		const spanId = activeSpanContext?.spanId || spanIdAtEntry;

		// Enhanced user context extraction
		const userId = req.userId || req.metadata?.userId || null;
		const employeeId = req.metadata?.employee?.id || req.metadata?.employeeId || null;
		const userName = req.userName || req.metadata?.userName || null;
		const employeePersonalInfo = req.metadata?.employee?.personalInfo;
		const firstName = req.firstName || employeePersonalInfo?.firstName || req.metadata?.firstName || null;
		const lastName = req.lastName || employeePersonalInfo?.lastName || req.metadata?.lastName || null;
		const fullName = [firstName, lastName].filter(Boolean).join(" ") || userName || "Anonymous";
		const logUserId = userId || "";
		const logEmployeeId = employeeId || "";
		const logUserName = userName || "";
		const logFirstName = firstName || "";
		const logLastName = lastName || "";
		const logOrganizationId = req.organizationId || "";
		const authenticated = Boolean(userId);
		const method = req.method.toUpperCase();
		const actionType = getActionType(method);
		const requestPayload = WRITE_METHODS.has(method) ? redactValue(req.body || {}) : null;
		const responsePayload = WRITE_METHODS.has(method) ? redactValue(responseBody) : null;
		const responseIds = collectIds(responseBody);
		const routeEntityId = getRouteEntityId(req);
		const entityId = WRITE_METHODS.has(method) ? responseIds[0] || routeEntityId || "" : "";
		const requestPayloadSummary = summarizePayload(requestPayload);
		const responseEntitySummary = responseIds.length > 0 ? responseIds.join(",") : "";

		const payload = {
			userId,
			employeeId,
			userName,
			firstName,
			lastName,
			fullName,
			organizationId: logOrganizationId,
			route,
			module,
			statusCode,
			statusClass,
			durationMs,
			successful,
			traceId,
			spanId,
			actionType,
			entityId: entityId || null,
			responseEntityIds: responseIds,
			queryKeys: Object.keys(req.query || {}),
			body: requestBodyMetadata,
			requestPayload,
			responsePayload,
		};

		logger.info("api.activity.request", {
			event: "api.activity.request",
			authenticated,
			action_type: actionType,
			entity_id: entityId,
			response_entity_ids: responseEntitySummary,
			request_payload_summary: requestPayloadSummary,
			request_payload: requestPayload,
			response_payload: responsePayload,
			user_id: logUserId,
			employee_id: logEmployeeId,
			user_name: logUserName,
			first_name: logFirstName,
			last_name: logLastName,
			full_name: fullName,
			organization_id: logOrganizationId,
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
					organizationId: req.organizationId || null,
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
