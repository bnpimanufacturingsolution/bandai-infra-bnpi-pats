type TraceValue = unknown;

function previewTraceValue(value: TraceValue, depth = 0, seen = new WeakSet<object>()): TraceValue {
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

function emitTrace(event: string, payload: Record<string, unknown>) {
	const record = {
		event,
		timestamp: new Date().toISOString(),
		...payload,
	};
	console.info(JSON.stringify(record));
}

export function trace<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => TReturn,
	functionName: string,
	moduleName?: string,
): (...args: TArgs) => TReturn {
	return (...args: TArgs) => {
		const start = performance.now();
		const argsPreview = previewTraceValue(args.length === 1 ? args[0] : args);

		emitTrace("function.entry", {
			functionName,
			function: functionName,
			module: moduleName,
			args_preview: argsPreview,
		});

		try {
			const result = fn(...args);
			const durationMs = Math.round(performance.now() - start);
			emitTrace("function.exit", {
				functionName,
				function: functionName,
				module: moduleName,
				duration_ms: durationMs,
				status: "success",
				result_preview: previewTraceValue(result),
			});
			return result;
		} catch (error) {
			const durationMs = Math.round(performance.now() - start);
			console.error(
				JSON.stringify({
					event: "function.error",
					timestamp: new Date().toISOString(),
					functionName,
					function: functionName,
					module: moduleName,
					duration_ms: durationMs,
					error: error instanceof Error ? error.message : String(error),
					error_preview: previewTraceValue(error),
				}),
			);
			throw error;
		}
	};
}

export async function traceAsync<T>(
	fn: () => Promise<T>,
	functionName: string,
	moduleName?: string,
): Promise<T> {
	const start = performance.now();
	emitTrace("function.entry", {
		functionName,
		function: functionName,
		module: moduleName,
	});

	try {
		const result = await fn();
		const durationMs = Math.round(performance.now() - start);
		emitTrace("function.exit", {
			functionName,
			function: functionName,
			module: moduleName,
			duration_ms: durationMs,
			status: "success",
			result_preview: previewTraceValue(result),
		});
		return result;
	} catch (error) {
		const durationMs = Math.round(performance.now() - start);
		console.error(
			JSON.stringify({
				event: "function.error",
				timestamp: new Date().toISOString(),
				functionName,
				function: functionName,
				module: moduleName,
				duration_ms: durationMs,
				error: error instanceof Error ? error.message : String(error),
				error_preview: previewTraceValue(error),
			}),
		);
		throw error;
	}
}
