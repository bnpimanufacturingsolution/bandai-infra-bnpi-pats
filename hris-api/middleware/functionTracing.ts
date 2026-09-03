import { getLogger } from "../helper/logger.helper";
import { getRequestContext } from "./correlationId";

/**
 * Function Tracing Configuration
 * Controls which functions get traced based on environment
 */
interface TracingConfig {
	enabled: boolean;
	logFunctionEntry: boolean;
	logFunctionExit: boolean;
	logDuration: boolean;
	minDurationMs: number; // Only log if duration exceeds this
	excludePatterns: RegExp[];
}

const DEFAULT_TRACE_CONFIG: TracingConfig = {
	enabled: false,
	logFunctionEntry: false,
	logFunctionExit: false,
	logDuration: false,
	minDurationMs: 0,
	excludePatterns: [/^_/, /^internal/, /^$private/],
};

/**
 * Get tracing config based on environment
 * DEV: All tracing enabled by default
 * UAT: Conditional based on ENABLE_FUNCTION_TRACE
 * PROD: Only on manual override
 */
function getTracingConfig(): TracingConfig {
	const env = process.env.NODE_ENV || "development";
	const logLevel = process.env.LOG_LEVEL || "debug";
	const enableFunctionTrace = process.env.ENABLE_FUNCTION_TRACE === "true";

	if (env === "production") {
		// Production: only if explicitly enabled
		return {
			enabled: enableFunctionTrace,
			logFunctionEntry: enableFunctionTrace && logLevel === "debug",
			logFunctionExit: enableFunctionTrace && logLevel === "debug",
			logDuration: enableFunctionTrace,
			minDurationMs: 10, // Only log slow calls
			excludePatterns: [...DEFAULT_TRACE_CONFIG.excludePatterns],
		};
	}

	if (env === "uat" || env === "staging") {
		// UAT: conditional based on ENABLE_FUNCTION_TRACE
		return {
			enabled: enableFunctionTrace,
			logFunctionEntry: enableFunctionTrace,
			logFunctionExit: enableFunctionTrace,
			logDuration: enableFunctionTrace,
			minDurationMs: 0,
			excludePatterns: [...DEFAULT_TRACE_CONFIG.excludePatterns],
		};
	}

	// Development: all tracing enabled
	return {
		enabled: true,
		logFunctionEntry: logLevel === "debug",
		logFunctionExit: logLevel === "debug",
		logDuration: logLevel === "debug",
		minDurationMs: 0,
		excludePatterns: [...DEFAULT_TRACE_CONFIG.excludePatterns],
	};
}

/**
 * Check if function should be traced
 */
function shouldTrace(functionName: string, config: TracingConfig): boolean {
	if (!config.enabled) return false;

	const isExcluded = config.excludePatterns.some((pattern) => pattern.test(functionName));
	return !isExcluded;
}

function getFunctionLogLevel(): "debug" | "info" {
	return (process.env.NODE_ENV || "development") === "development" ? "debug" : "info";
}

function getTracingLogger(moduleName?: string) {
	const logger = getLogger();
	return moduleName ? logger.child({ module: moduleName }) : logger;
}

function previewTraceValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
	if (value === null || value === undefined) return value;
	if (depth > 2) return "[MaxDepth]";
	if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 197)}...` : value;
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "bigint") return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
		};
	}
	if (typeof value === "function") {
		return `[Function ${value.name || "anonymous"}]`;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 10).map((item) => previewTraceValue(item, depth + 1, seen));
	}
	if (typeof value !== "object") return String(value);

	if (seen.has(value as object)) return "[Circular]";
	seen.add(value as object);

	const output: Record<string, unknown> = {};
	for (const [key, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
		output[key] = previewTraceValue(childValue, depth + 1, seen);
	}
	return output;
}

/**
 * Trace function execution with entry, exit, and duration logging
 * Usage: @Trace or await trace(fn, 'functionName')
 */
export function trace<TArgs extends any[], TReturn>(
	fn: (...args: TArgs) => TReturn | Promise<TReturn>,
	functionName: string,
	moduleName?: string,
): (...args: TArgs) => TReturn | Promise<TReturn> {
	const config = getTracingConfig();
	const logger = getTracingLogger(moduleName);
	const logLevel = getFunctionLogLevel();

	if (!shouldTrace(functionName, config)) {
		return fn;
	}

	return function (this: any, ...args: TArgs) {
		const ctx = getRequestContext();
		const startTime = performance.now();
		const payloadPreview = previewTraceValue(args.length === 1 ? args[0] : args);

		// Log function entry
		if (config.logFunctionEntry) {
			logger.log(logLevel, `function.entry.${functionName}`, {
				event: "function.entry",
				function: functionName,
				functionName,
				payload_preview: payloadPreview,
				args_preview: payloadPreview,
				requestId: ctx?.requestId,
				correlationId: ctx?.correlationId,
			});
		}

		try {
			const result = fn.apply(this, args);

			// Handle async functions
			if (result instanceof Promise) {
				return result
					.then((resolvedValue) => {
						const duration = performance.now() - startTime;
						const resultPreview = previewTraceValue(resolvedValue);

						if (config.logFunctionExit) {
							logger.log(logLevel, `function.exit.${functionName}`, {
								event: "function.exit",
								function: functionName,
								functionName,
								duration_ms: Math.round(duration),
								status: "success",
								payload_preview: payloadPreview,
								result_preview: resultPreview,
								requestId: ctx?.requestId,
								correlationId: ctx?.correlationId,
							});
						}

						if (config.logDuration && duration >= config.minDurationMs) {
							logger.log(logLevel, `function.duration.${functionName}`, {
								event: "function.duration",
								function: functionName,
								duration_ms: Math.round(duration),
								threshold_ms: config.minDurationMs,
								requestId: ctx?.requestId,
								correlationId: ctx?.correlationId,
							});
						}

						return resolvedValue;
					})
					.catch((error) => {
						const duration = performance.now() - startTime;

						logger.error(`function.error.${functionName}`, {
							event: "function.error",
							function: functionName,
							functionName,
							duration_ms: Math.round(duration),
							error: error instanceof Error ? error.message : String(error),
							payload_preview: payloadPreview,
							error_preview: previewTraceValue(error),
							requestId: ctx?.requestId,
							correlationId: ctx?.correlationId,
						});

						throw error;
					});
			}

			// Handle sync functions
			const duration = performance.now() - startTime;
			const resultPreview = previewTraceValue(result);

			if (config.logFunctionExit) {
				logger.log(logLevel, `function.exit.${functionName}`, {
					event: "function.exit",
					function: functionName,
					functionName,
					duration_ms: Math.round(duration),
					status: "success",
					payload_preview: payloadPreview,
					result_preview: resultPreview,
					requestId: ctx?.requestId,
					correlationId: ctx?.correlationId,
				});
			}

			if (config.logDuration && duration >= config.minDurationMs) {
				logger.log(logLevel, `function.duration.${functionName}`, {
					event: "function.duration",
					function: functionName,
					duration_ms: Math.round(duration),
					threshold_ms: config.minDurationMs,
					requestId: ctx?.requestId,
					correlationId: ctx?.correlationId,
				});
			}

			return result;
		} catch (error) {
			const duration = performance.now() - startTime;

			logger.error(`function.error.${functionName}`, {
				event: "function.error",
				function: functionName,
				functionName,
				duration_ms: Math.round(duration),
				error: error instanceof Error ? error.message : String(error),
				payload_preview: payloadPreview,
				error_preview: previewTraceValue(error),
				requestId: ctx?.requestId,
				correlationId: ctx?.correlationId,
			});

			throw error;
		}
	};
}

/**
 * TypeScript decorator for function tracing
 * Usage:
 * class MyService {
 *   @Trace
 *   async myMethod() { }
 * }
 */
export function Trace(
	target: any,
	propertyKey: string,
	descriptor: PropertyDescriptor,
): PropertyDescriptor {
	const originalMethod = descriptor.value;
	const config = getTracingConfig();

	if (!shouldTrace(propertyKey, config)) {
		return descriptor;
	}

	descriptor.value = function (this: any, ...args: any[]) {
		return trace(originalMethod.bind(this), propertyKey, target.constructor.name)(...args);
	};

	return descriptor;
}

/**
 * Async trace wrapper
 * Usage: await traceAsync(() => somePromise(), 'functionName')
 */
export async function traceAsync<T>(
	fn: () => Promise<T>,
	functionName: string,
	moduleName?: string,
): Promise<T> {
	const config = getTracingConfig();
	const logger = getTracingLogger(moduleName);
	const logLevel = getFunctionLogLevel();

	if (!shouldTrace(functionName, config)) {
		return fn();
	}

	const ctx = getRequestContext();
	const startTime = performance.now();

	if (config.logFunctionEntry) {
		logger.log(logLevel, `function.entry.${functionName}`, {
			event: "function.entry",
			function: functionName,
			functionName,
			requestId: ctx?.requestId,
			correlationId: ctx?.correlationId,
		});
	}

	try {
		const result = await fn();
		const duration = performance.now() - startTime;
		const resultPreview = previewTraceValue(result);

		if (config.logFunctionExit) {
			logger.log(logLevel, `function.exit.${functionName}`, {
				event: "function.exit",
				function: functionName,
				functionName,
				duration_ms: Math.round(duration),
				status: "success",
				result_preview: resultPreview,
				requestId: ctx?.requestId,
				correlationId: ctx?.correlationId,
			});
		}

		if (config.logDuration && duration >= config.minDurationMs) {
			logger.log(logLevel, `function.duration.${functionName}`, {
				event: "function.duration",
				function: functionName,
				duration_ms: Math.round(duration),
				threshold_ms: config.minDurationMs,
				requestId: ctx?.requestId,
				correlationId: ctx?.correlationId,
			});
		}

		return result;
	} catch (error) {
		const duration = performance.now() - startTime;

		logger.error(`function.error.${functionName}`, {
			event: "function.error",
			function: functionName,
			functionName,
			duration_ms: Math.round(duration),
			error: error instanceof Error ? error.message : String(error),
			error_preview: previewTraceValue(error),
			requestId: ctx?.requestId,
			correlationId: ctx?.correlationId,
		});

		throw error;
	}
}

/**
 * Get current tracing configuration
 */
export function getTracingConfiguration(): TracingConfig {
	return getTracingConfig();
}

/**
 * Get tracing status for monitoring/debugging
 */
export function getTracingStatus() {
	const config = getTracingConfig();
	return {
		environment: process.env.NODE_ENV || "development",
		logLevel: process.env.LOG_LEVEL || "debug",
		enabled: config.enabled,
		functionEntry: config.logFunctionEntry,
		functionExit: config.logFunctionExit,
		duration: config.logDuration,
		minDurationMs: config.minDurationMs,
		enableFunctionTraceEnv: process.env.ENABLE_FUNCTION_TRACE,
	};
}
