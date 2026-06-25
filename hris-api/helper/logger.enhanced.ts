import winston from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";
import fs from "fs";
import path from "path";
import os from "os";
import { context, trace } from "@opentelemetry/api";
import { config } from "../config/config";

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

/**
 * Enhanced Winston Format with OpenTelemetry Integration
 * Adds trace context, span context, and all required observability fields
 */
const enhancedOtelTraceFormat = winston.format((info) => {
	const span = trace.getSpan(context.active());
	const spanContext = span?.spanContext();

	// Add OpenTelemetry context
	if (spanContext?.traceId) {
		info.traceId = spanContext.traceId;
	}
	if (spanContext?.spanId) {
		info.spanId = spanContext.spanId;
	}

	// Add required observability fields
	if (!info.serviceName) {
		info.serviceName = process.env.OTEL_SERVICE_NAME || "hris-api";
	}

	if (!info.environment) {
		info.environment = process.env.NODE_ENV || "development";
	}

	if (!info.hostname) {
		info.hostname = os.hostname();
	}

	if (!info.applicationVersion) {
		info.applicationVersion = process.env.APP_VERSION || "1.0.0";
	}

	// Add request context if available
	if (!info.requestId && (global as any).requestId) {
		info.requestId = (global as any).requestId;
	}

	if (!info.correlationId && (global as any).correlationId) {
		info.correlationId = (global as any).correlationId;
	}

	if (!info.userId && (global as any).userId) {
		info.userId = (global as any).userId;
	}

	return info;
})();

/**
 * Console format for development
 * Colorized and human-readable
 */
const consoleFormat = printf((info) => {
	const {
		level,
		message,
		error,
		module,
		timestamp,
		traceId,
		spanId,
		requestId,
		correlationId,
		userId,
		hostname,
		...meta
	} = info;

	let errorInfo = "";
	let stackInfo = "";
	if (error) {
		if (error instanceof Error) {
			errorInfo = ` | Error: ${error.message}`;
			if (error.stack) {
				stackInfo = `\nStack: ${error.stack}`;
			}
		} else if (typeof error === "string") {
			errorInfo = ` | Error: ${error}`;
		} else if (typeof error === "object" && "message" in error) {
			errorInfo = ` | Error: ${(error as any).message}`;
			if ((error as any).stack) {
				stackInfo = `\nStack: ${(error as any).stack}`;
			}
		}
	}

	let validationInfo = "";
	if (meta.errors && Array.isArray(meta.errors)) {
		const errorFields = meta.errors
			.map((err: any) => `${err.field}: ${err.message}`)
			.join(", ");
		validationInfo = ` | Validation Errors: [${errorFields}]`;
	}

	const time = timestamp
		? new Date(timestamp as string).toLocaleTimeString()
		: new Date().toLocaleTimeString();
	const moduleInfo = module ? `[${module}]` : "";
	const traceInfo =
		traceId || requestId
			? ` [${traceId ? `trace_id=${traceId}` : ""}${spanId ? ` span_id=${spanId}` : ""}${requestId ? ` req_id=${requestId}` : ""}]`
			: "";
	const userInfo = userId ? ` [user_id=${userId}]` : "";

	let mainMessage = message || "";
	if (typeof mainMessage === "string" && mainMessage.includes("request body:")) {
		mainMessage = mainMessage.replace(
			/request body:\s*\{[\s\S]*\}/,
			"request body: [FILTERED]",
		);
	}

	return `${time} ${level.toUpperCase()} ${moduleInfo}${traceInfo}${userInfo} ${mainMessage}${errorInfo}${validationInfo}${stackInfo}`;
});

/**
 * JSON format for file/remote logging
 * Includes all structured fields for LGTM stack
 */
const structuredJsonFormat = winston.format((info) => {
	return {
		timestamp: info.timestamp || new Date().toISOString(),
		level: info.level,
		message: info.message,
		service: {
			name: info.serviceName || "hris-api",
			version: info.applicationVersion || "1.0.0",
		},
		environment: info.environment || "development",
		host: {
			name: info.hostname || os.hostname(),
		},
		trace: {
			id: info.traceId,
			span_id: info.spanId,
		},
		request: {
			id: info.requestId,
			correlation_id: info.correlationId,
		},
		user: {
			id: info.userId,
		},
		error: info.error
			? {
					message: info.error instanceof Error ? info.error.message : String(info.error),
					stack: info.error instanceof Error ? info.error.stack : undefined,
					type: info.error instanceof Error ? info.error.name : "Unknown",
				}
			: undefined,
		fields: Object.keys(info)
			.filter(
				(key) =>
					![
						"timestamp",
						"level",
						"message",
						"serviceName",
						"applicationVersion",
						"hostname",
						"environment",
						"traceId",
						"spanId",
						"requestId",
						"correlationId",
						"userId",
						"error",
					].includes(key),
			)
			.reduce(
				(acc, key) => {
					acc[key] = (info as any)[key];
					return acc;
				},
				{} as Record<string, any>,
			),
	};
})();

let loggerInstance: winston.Logger | null = null;
let fileLoggingStatus: { enabled: boolean; reason: string; logsDir: string } | null = null;

const isCloudRunRuntime = () =>
	Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.CLOUD_RUN_JOB);

const resolveFileLoggingStatus = () => {
	if (fileLoggingStatus) {
		return fileLoggingStatus;
	}

	const logsDir = path.resolve(process.cwd(), "logs");

	if (isCloudRunRuntime()) {
		fileLoggingStatus = {
			enabled: false,
			reason: "cloud_run_console_logging",
			logsDir,
		};
		return fileLoggingStatus;
	}

	try {
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		fileLoggingStatus = {
			enabled: true,
			reason: "local_file_logging_enabled",
			logsDir,
		};
		return fileLoggingStatus;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		fileLoggingStatus = {
			enabled: false,
			reason: `failed_to_create_logs_directory: ${message}`,
			logsDir,
		};
		return fileLoggingStatus;
	}
};

/**
 * Create enhanced logger instance with all required transports
 */
export function createEnhancedLogger(): winston.Logger {
	if (loggerInstance) {
		return loggerInstance;
	}

	const transports: winston.transport[] = [];
	const env = process.env.NODE_ENV || "development";
	const logLevel = process.env.LOG_LEVEL || (env === "production" ? "warn" : "debug");

	// Console transport (always enabled)
	transports.push(
		new winston.transports.Console({
			format: combine(
				colorize({ all: true }),
				enhancedOtelTraceFormat,
				timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
				consoleFormat,
			),
			level: logLevel,
		}),
	);

	// File transport (local development only)
	const fileLoggingInfo = resolveFileLoggingStatus();
	if (fileLoggingInfo.enabled) {
		transports.push(
			new winston.transports.File({
				filename: path.join(fileLoggingInfo.logsDir, "error.log"),
				level: "error",
				format: combine(
					enhancedOtelTraceFormat,
					timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
					json(),
				),
				maxsize: 10485760, // 10MB
				maxFiles: 5,
			}),
		);

		transports.push(
			new winston.transports.File({
				filename: path.join(fileLoggingInfo.logsDir, "combined.log"),
				format: combine(
					enhancedOtelTraceFormat,
					timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
					json(),
				),
				maxsize: 10485760, // 10MB
				maxFiles: 5,
			}),
		);
	}

	// Logtail transport (if configured)
	if (process.env.LOGTAIL_TOKEN) {
		try {
			const logtail = new Logtail(process.env.LOGTAIL_TOKEN);
			transports.push(
				new LogtailTransport(logtail, {
					format: combine(
						enhancedOtelTraceFormat,
						timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
						json(),
					),
				}),
			);
		} catch (error) {
			console.warn("Failed to initialize Logtail transport", error);
		}
	}

	loggerInstance = winston.createLogger({
		level: logLevel,
		format: combine(enhancedOtelTraceFormat, errors({ stack: true })),
		transports,
		exceptionHandlers: transports,
		rejectionHandlers: transports,
	});

	return loggerInstance;
}

/**
 * Get or create logger instance
 */
export function getEnhancedLogger(): winston.Logger {
	if (!loggerInstance) {
		createEnhancedLogger();
	}
	return loggerInstance!;
}

/**
 * Create a child logger with module context
 */
export function createModuleLogger(moduleName: string): winston.Logger {
	return getEnhancedLogger().child({ module: moduleName });
}
