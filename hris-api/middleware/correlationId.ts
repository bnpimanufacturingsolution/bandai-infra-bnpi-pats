import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Context Store for Request-scoped Data
 * Uses Node.js AsyncLocalStorage for async context propagation
 */
import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
	requestId: string;
	correlationId: string;
	userId?: string;
	tenantId?: string;
	traceId?: string;
	spanId?: string;
	timestamp: Date;
	userAgent?: string;
	ipAddress?: string;
}

// Global async local storage for request context
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
	return requestContextStorage.getStore();
}

/**
 * Get request ID or generate new one
 */
export function getRequestId(): string {
	return getRequestContext()?.requestId || randomUUID();
}

/**
 * Get correlation ID or generate new one
 */
export function getCorrelationId(): string {
	return getRequestContext()?.correlationId || randomUUID();
}

/**
 * Get user ID if available
 */
export function getUserId(): string | undefined {
	return getRequestContext()?.userId;
}

/**
 * Get tenant ID if available
 */
export function getTenantId(): string | undefined {
	return getRequestContext()?.tenantId;
}

/**
 * Store context on global object (for logger access)
 */
function storeContextOnGlobal(ctx: RequestContext): void {
	(global as any).requestId = ctx.requestId;
	(global as any).correlationId = ctx.correlationId;
	(global as any).userId = ctx.userId;
	(global as any).tenantId = ctx.tenantId;
	(global as any).requestContext = ctx;
}

/**
 * Clear context from global object
 */
function clearContextFromGlobal(): void {
	delete (global as any).requestId;
	delete (global as any).correlationId;
	delete (global as any).userId;
	delete (global as any).tenantId;
	delete (global as any).requestContext;
}

/**
 * Correlation ID and Context Middleware
 * Initializes request context and propagates it through the request lifecycle
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
	// Generate or extract IDs
	const requestId = req.headers["x-request-id"] ? String(req.headers["x-request-id"]) : randomUUID();
	const correlationId = req.headers["x-correlation-id"]
		? String(req.headers["x-correlation-id"])
		: requestId;

	// Extract or generate trace ID
	const traceId = req.headers["x-trace-id"] ? String(req.headers["x-trace-id"]) : undefined;
	const spanId = req.headers["x-span-id"] ? String(req.headers["x-span-id"]) : undefined;

	// Get client IP
	const ipAddress =
		(req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
		req.socket.remoteAddress ||
		"unknown";

	// Create request context
	const requestContext: RequestContext = {
		requestId,
		correlationId,
		traceId,
		spanId,
		timestamp: new Date(),
		userAgent: req.headers["user-agent"],
		ipAddress,
	};

	// Add user ID if authenticated (from JWT or session)
	if ((req as any).user?.id) {
		requestContext.userId = (req as any).user.id;
	}

	// Add tenant ID if available
	if ((req as any).tenantId) {
		requestContext.tenantId = (req as any).tenantId;
	}

	// Run request in async context
	requestContextStorage.run(requestContext, () => {
		// Store on global for logger access
		storeContextOnGlobal(requestContext);

		// Add IDs to response headers
		res.setHeader("x-request-id", requestId);
		res.setHeader("x-correlation-id", correlationId);
		if (traceId) {
			res.setHeader("x-trace-id", traceId);
		}

		// Clean up on response finish
		const originalSend = res.send;
		res.send = function (data: any) {
			clearContextFromGlobal();
			return originalSend.call(this, data);
		};

		next();
	});
}

/**
 * Attach context to request object for easy access
 */
export function attachContextMiddleware(req: Request, res: Response, next: NextFunction): void {
	const context = getRequestContext();
	if (context) {
		(req as any).requestContext = context;
		(req as any).requestId = context.requestId;
		(req as any).correlationId = context.correlationId;
		(req as any).userId = context.userId;
		(req as any).tenantId = context.tenantId;
	}
	next();
}

/**
 * Run function within request context
 * Useful for background jobs or manual async operations
 */
export function runInRequestContext<T>(
	ctx: Partial<RequestContext>,
	fn: () => Promise<T> | T,
): Promise<T> {
	const fullContext: RequestContext = {
		requestId: ctx.requestId || randomUUID(),
		correlationId: ctx.correlationId || randomUUID(),
		userId: ctx.userId,
		tenantId: ctx.tenantId,
		traceId: ctx.traceId,
		spanId: ctx.spanId,
		timestamp: ctx.timestamp || new Date(),
		userAgent: ctx.userAgent,
		ipAddress: ctx.ipAddress,
	};

	return new Promise((resolve, reject) => {
		requestContextStorage.run(fullContext, async () => {
			storeContextOnGlobal(fullContext);
			try {
				const result = await Promise.resolve(fn());
				resolve(result);
			} catch (error) {
				reject(error);
			} finally {
				clearContextFromGlobal();
			}
		});
	});
}
