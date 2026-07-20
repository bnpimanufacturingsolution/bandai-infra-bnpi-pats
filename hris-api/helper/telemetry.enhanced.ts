import { diag, DiagConsoleLogger, DiagLogLevel, metrics, trace, type Span } from "@opentelemetry/api";

let initialized = false;

function isEnabled(value: string | undefined): boolean {
	return String(value || "")
		.trim()
		.toLowerCase() === "true";
}

function resolveTraceExporterUrl(): string {
	const explicitTraceEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
	if (explicitTraceEndpoint) return explicitTraceEndpoint;

	const genericEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
	if (!genericEndpoint) return "http://localhost:4318/v1/traces";

	return genericEndpoint.endsWith("/v1/traces")
		? genericEndpoint
		: `${genericEndpoint.replace(/\/+$/, "")}/v1/traces`;
}

function resolveMetricsExporterUrl(): string {
	const explicitMetricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim();
	if (explicitMetricsEndpoint) return explicitMetricsEndpoint;

	const genericEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
	if (!genericEndpoint) return "http://localhost:4318/v1/metrics";

	return genericEndpoint.endsWith("/v1/metrics")
		? genericEndpoint
		: `${genericEndpoint.replace(/\/+$/, "")}/v1/metrics`;
}

export async function initializeEnhancedTelemetry(): Promise<void> {
	if (!isEnabled(process.env.OTEL_ENABLED)) {
		console.debug("OpenTelemetry is disabled (OTEL_ENABLED not set to true)");
		return;
	}

	if (initialized) {
		console.debug("OpenTelemetry telemetry already initialized");
		return;
	}

	if (isEnabled(process.env.OTEL_DEBUG)) {
		diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
	}

	initialized = true;
	console.log("[OpenTelemetry] Enhanced telemetry shim initialized", {
		serviceName: process.env.OTEL_SERVICE_NAME || "hris-api",
		traceExporterUrl: resolveTraceExporterUrl(),
		metricsExporterUrl: resolveMetricsExporterUrl(),
		debugEnabled: isEnabled(process.env.OTEL_DEBUG),
	});
}

export async function shutdownEnhancedTelemetry(): Promise<void> {
	initialized = false;
}

export function getTracer(moduleName: string) {
	return trace.getTracer(moduleName, process.env.APP_VERSION || "1.0.0");
}

export function getMeter(moduleName: string) {
	return metrics.getMeter(moduleName, process.env.APP_VERSION || "1.0.0");
}

export async function createSpan<T>(
	name: string,
	fn: (span: Span) => Promise<T> | T,
	attributes?: Record<string, unknown>,
): Promise<T> {
	const tracer = trace.getTracer("manual", process.env.APP_VERSION || "1.0.0");
	return tracer.startActiveSpan(name, async (span) => {
		try {
			if (attributes) {
				for (const [key, value] of Object.entries(attributes)) {
					span.setAttribute(key, value as never);
				}
			}
			return await fn(span);
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: 2 });
			throw error;
		} finally {
			span.end();
		}
	});
}

export function linkSpans(parentSpan: Span | null | undefined, childSpan: Span | null | undefined): void {
	void parentSpan;
	void childSpan;
}

export function getTelemetryStatus() {
	return {
		enabled: isEnabled(process.env.OTEL_ENABLED),
		initialized,
		serviceName: process.env.OTEL_SERVICE_NAME || "hris-api",
		traceExporterUrl: resolveTraceExporterUrl(),
		metricsExporterUrl: resolveMetricsExporterUrl(),
		debugEnabled: isEnabled(process.env.OTEL_DEBUG),
	};
}
