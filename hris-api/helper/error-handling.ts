import { getEnhancedLogger } from "../helper/logger.enhanced";
import { getRequestContext } from "../middleware/correlationId";
import { trace, context } from "@opentelemetry/api";

const logger = getEnhancedLogger();

/**
 * Global exception handler configuration
 */
export interface ExceptionConfig {
	captureStackTrace: boolean;
	captureContext: boolean;
	captureHeaders: boolean;
	sensitiveHeaderPatterns: RegExp[];
	excludePathPatterns: RegExp[];
}

const DEFAULT_CONFIG: ExceptionConfig = {
	captureStackTrace: true,
	captureContext: true,
	captureHeaders: true,
	sensitiveHeaderPatterns: [/auth|password|secret|token|api[_-]key|credential/i],
	excludePathPatterns: [/health|metrics|ready|live/],
};

let config = { ...DEFAULT_CONFIG };

/**
 * Configure error handling
 */
export function configureErrorHandling(customConfig: Partial<ExceptionConfig>) {
	config = { ...DEFAULT_CONFIG, ...customConfig };
}

/**
 * Get safe headers (filter sensitive ones)
 */
function getSafeHeaders(headers: Record<string, any>): Record<string, any> {
	if (!config.captureHeaders) return {};

	const safe: Record<string, any> = {};
	for (const [key, value] of Object.entries(headers)) {
		const isSensitive = config.sensitiveHeaderPatterns.some((pattern) => pattern.test(key));
		safe[key] = isSensitive ? "[REDACTED]" : value;
	}
	return safe;
}

/**
 * Serialize error for logging
 */
function serializeError(error: any): Record<string, any> {
	const serialized: Record<string, any> = {};

	if (error instanceof Error) {
		serialized.message = error.message;
		serialized.name = error.name;
		if (config.captureStackTrace) {
			serialized.stack = error.stack;
		}

		// Capture additional error properties
		if (error.cause) {
			serialized.cause = serializeError(error.cause);
		}

		// Database error
		if ("code" in error) {
			serialized.code = (error as any).code;
		}

		// Validation error
		if ("details" in error) {
			serialized.details = (error as any).details;
		}
	} else if (typeof error === "object") {
		serialized.value = JSON.stringify(error);
	} else {
		serialized.value = String(error);
	}

	return serialized;
}

/**
 * Log unexpected exception
 */
export function logUnexpectedException(
	error: unknown,
	context_info?: {
		location?: string;
		requestId?: string;
		userId?: string;
		action?: string;
	},
): void {
	const ctx = getRequestContext();
	const span = trace.getSpan(context.active());

	const metadata: Record<string, any> = {
		event: "exception.unhandled",
		location: context_info?.location || "unknown",
		timestamp: new Date().toISOString(),
		requestId: context_info?.requestId || ctx?.requestId,
		userId: context_info?.userId || ctx?.userId,
		action: context_info?.action,
		trace_id: span?.spanContext()?.traceId,
		span_id: span?.spanContext()?.spanId,
	};

	// Serialize error
	const errorData = serializeError(error);
	metadata.error = errorData;

	// Record in span if available
	if (span) {
		span.recordException(error as Error);
		span.setStatus({ code: 2 }); // ERROR
	}

	logger.error("exception.unhandled", metadata);
}

/**
 * Log HTTP error response
 */
export function logHttpError(
	statusCode: number,
	path: string,
	method: string,
	error?: unknown,
	headers?: Record<string, any>,
): void {
	const ctx = getRequestContext();
	const span = trace.getSpan(context.active());

	const isExcluded = config.excludePathPatterns.some((pattern) => pattern.test(path));
	if (isExcluded) return;

	const metadata: Record<string, any> = {
		event: "http.error",
		method,
		path,
		statusCode,
		requestId: ctx?.requestId,
		correlationId: ctx?.correlationId,
		userId: ctx?.userId,
		timestamp: new Date().toISOString(),
		trace_id: span?.spanContext()?.traceId,
		span_id: span?.spanContext()?.spanId,
	};

	if (headers) {
		metadata.headers = getSafeHeaders(headers);
	}

	if (error) {
		metadata.error = serializeError(error);

		if (span) {
			span.recordException(error as Error);
		}
	}

	if (statusCode >= 500) {
		logger.error(`http.error.${statusCode}`, metadata);
	} else if (statusCode >= 400) {
		logger.warn(`http.error.${statusCode}`, metadata);
	}
}

/**
 * Log database error
 */
export function logDatabaseError(error: unknown, query?: string, params?: any[]): void {
	const ctx = getRequestContext();
	const span = trace.getSpan(context.active());

	const metadata: Record<string, any> = {
		event: "database.error",
		requestId: ctx?.requestId,
		correlationId: ctx?.correlationId,
		userId: ctx?.userId,
		timestamp: new Date().toISOString(),
		trace_id: span?.spanContext()?.traceId,
		span_id: span?.spanContext()?.spanId,
	};

	if (query) {
		metadata.query = query.substring(0, 200);
	}

	if (params) {
		metadata.param_count = params.length;
	}

	metadata.error = serializeError(error);

	if (span) {
		span.recordException(error as Error);
		span.setStatus({ code: 2 }); // ERROR
	}

	logger.error("database.error", metadata);
}

/**
 * Log external service failure
 */
export function logExternalServiceError(
	serviceName: string,
	endpoint: string,
	statusCode?: number,
	error?: unknown,
): void {
	const ctx = getRequestContext();
	const span = trace.getSpan(context.active());

	const metadata: Record<string, any> = {
		event: "external_service.error",
		service: serviceName,
		endpoint,
		statusCode,
		requestId: ctx?.requestId,
		correlationId: ctx?.correlationId,
		userId: ctx?.userId,
		timestamp: new Date().toISOString(),
		trace_id: span?.spanContext()?.traceId,
		span_id: span?.spanContext()?.spanId,
	};

	if (error) {
		metadata.error = serializeError(error);

		if (span) {
			span.recordException(error as Error);
		}
	}

	logger.error("external_service.error", metadata);
}

/**
 * Log validation error
 */
export function logValidationError(
	fieldName: string,
	message: string,
	value?: any,
	context_info?: any,
): void {
	const ctx = getRequestContext();

	const metadata: Record<string, any> = {
		event: "validation.error",
		fieldName,
		message,
		requestId: ctx?.requestId,
		correlationId: ctx?.correlationId,
		userId: ctx?.userId,
		timestamp: new Date().toISOString(),
	};

	if (value !== undefined && typeof value !== "function") {
		metadata.value = String(value).substring(0, 100);
	}

	if (context_info) {
		metadata.context = context_info;
	}

	logger.warn("validation.error", metadata);
}

/**
 * Log security-related event
 */
export function logSecurityEvent(eventType: string, details: Record<string, any>): void {
	const ctx = getRequestContext();

	const metadata: Record<string, any> = {
		event: `security.${eventType}`,
		requestId: ctx?.requestId,
		correlationId: ctx?.correlationId,
		userId: ctx?.userId,
		ipAddress: ctx?.ipAddress,
		timestamp: new Date().toISOString(),
		...details,
	};

	logger.warn(`security.${eventType}`, metadata);
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers(): void {
	// Unhandled exception handler
	process.on("uncaughtException", (error: Error) => {
		logUnexpectedException(error, {
			location: "uncaughtException",
			action: "process.exit",
		});

		logger.error("process.uncaught_exception.fatal", {
			event: "process.uncaught_exception.fatal",
			message: error.message,
			stack: error.stack,
		});

		process.exit(1);
	});

	// Unhandled promise rejection handler
	process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
		logUnexpectedException(reason, {
			location: "unhandledRejection",
			action: "promise.rejection",
		});

		logger.error("process.unhandled_rejection", {
			event: "process.unhandled_rejection",
			reason: serializeError(reason),
			promise: String(promise),
		});

		// Don't exit for unhandled rejection, but log it
	});

	// Deprecation warning handler
	process.on("warning", (warning: any) => {
		logger.warn("process.warning", {
			event: "process.warning",
			name: warning.name,
			message: warning.message,
			stack: warning.stack,
		});
	});
}

/**
 * Express error handler middleware
 */
export function errorHandlerMiddleware(err: any, req: any, res: any, next: any): void {
	const statusCode = err.statusCode || err.status || 500;
	const path = req.path || req.url || "unknown";
	const method = req.method || "UNKNOWN";

	// Log error
	logHttpError(statusCode, path, method, err, req.headers);

	// Send response
	const errorResponse = {
		error: true,
		message: err.message || "Internal Server Error",
		statusCode,
		requestId: (req as any).requestId || "unknown",
		...(process.env.NODE_ENV === "development" && { stack: err.stack }),
	};

	res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper for Express routes
 */
export function asyncHandler(fn: (req: any, res: any, next: any) => Promise<void>) {
	return (req: any, res: any, next: any) => {
		Promise.resolve(fn(req, res, next)).catch((error) => {
			logUnexpectedException(error, {
				location: "asyncHandler",
				action: "route_handler",
			});
			next(error);
		});
	};
}
