import winston from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";
import fs from "fs";
import path from "path";
import { context, trace } from "@opentelemetry/api";
import { config } from "../config/config";

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

const otelTraceFormat = winston.format((info) => {
	const span = trace.getSpan(context.active());
	const spanContext = span?.spanContext();

	if (spanContext?.traceId) {
		info.trace_id = spanContext.traceId;
	}
	if (spanContext?.spanId) {
		info.span_id = spanContext.spanId;
	}

	if (!info["service.name"]) {
		info["service.name"] = process.env.OTEL_SERVICE_NAME || "hris-api";
	}
	if (!info.environment) {
		info.environment = process.env.NODE_ENV || "development";
	}

	return info;
});

const consoleFormat = printf((info) => {
	const { level, message, error, module, timestamp, trace_id, span_id, ...meta } = info;

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
	const traceInfo = trace_id ? ` [trace_id=${trace_id}${span_id ? ` span_id=${span_id}` : ""}]` : "";

	let mainMessage = message || "";
	if (typeof mainMessage === "string" && mainMessage.includes("request body:")) {
		mainMessage = mainMessage.replace(
			/request body:\s*\{[\s\S]*\}/,
			"request body: [FILTERED]",
		);
	}

	return `${time} ${level.toUpperCase()} ${moduleInfo}${traceInfo} ${mainMessage}${errorInfo}${validationInfo}${stackInfo}`;
});

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
		fs.mkdirSync(logsDir, { recursive: true });
		fs.accessSync(logsDir, fs.constants.W_OK);
		fileLoggingStatus = {
			enabled: true,
			reason: "logs_dir_writable",
			logsDir,
		};
		return fileLoggingStatus;
	} catch (error) {
		fileLoggingStatus = {
			enabled: false,
			reason:
				error instanceof Error ? `logs_dir_unavailable:${error.message}` : "logs_dir_unavailable",
			logsDir,
		};
		return fileLoggingStatus;
	}
};

export const getLogger = () => {
	if (loggerInstance) {
		return loggerInstance;
	}

	const fileLogging = resolveFileLoggingStatus();
	const logTransports: (winston.transport | LogtailTransport)[] = [
		new winston.transports.Console({
			format: combine(colorize(), timestamp(), consoleFormat),
		}),
	];

	const exceptionHandlers: winston.transport[] = [
		new winston.transports.Console({
			format: combine(
				colorize(),
				timestamp(),
				printf((info) => {
					const { level, message, stack, timestamp } = info;
					const time = timestamp
						? new Date(timestamp as string).toLocaleTimeString()
						: new Date().toLocaleTimeString();
					return `${time} ${level.toUpperCase()} EXCEPTION: ${message}\n${stack || ""}`;
				}),
			),
		}),
	];

	const rejectionHandlers: winston.transport[] = [
		new winston.transports.Console({
			format: combine(
				colorize(),
				timestamp(),
				printf((info) => {
					const { level, message, stack, timestamp } = info;
					const time = timestamp
						? new Date(timestamp as string).toLocaleTimeString()
						: new Date().toLocaleTimeString();
					return `${time} ${level.toUpperCase()} REJECTION: ${message}\n${stack || ""}`;
				}),
			),
		}),
	];

	if (fileLogging.enabled) {
		logTransports.push(
			new winston.transports.File({
				filename: path.join(fileLogging.logsDir, "info.log"),
				level: "info",
				format: combine(timestamp(), errors({ stack: true }), json()),
			}),
			new winston.transports.File({
				filename: path.join(fileLogging.logsDir, "error.log"),
				level: "error",
				format: combine(timestamp(), errors({ stack: true }), json()),
			}),
		);

		exceptionHandlers.unshift(
			new winston.transports.File({
				filename: path.join(fileLogging.logsDir, "exception.log"),
			}),
		);
		rejectionHandlers.unshift(
			new winston.transports.File({
				filename: path.join(fileLogging.logsDir, "rejection.log"),
			}),
		);
	}

	if (config.betterStackEnabled && config.betterStackSourceToken) {
		const logtail = new Logtail(config.betterStackSourceToken, {
			endpoint: config.betterStackHost,
		});
		logTransports.push(new LogtailTransport(logtail));
	}

	loggerInstance = winston.createLogger({
		level: process.env.NODE_ENV === "production" ? "info" : "debug",
		format: combine(otelTraceFormat(), timestamp(), errors({ stack: true }), json()),
		transports: logTransports,
		exceptionHandlers,
		rejectionHandlers,
	});

	loggerInstance.info("logger.initialized", {
		event: "logger.initialized",
		cloud_run_runtime: isCloudRunRuntime(),
		file_logging_enabled: fileLogging.enabled,
		file_logging_reason: fileLogging.reason,
		logs_dir: fileLogging.logsDir,
	});

	return loggerInstance;
};
