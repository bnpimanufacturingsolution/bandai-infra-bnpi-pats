import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | null = null;

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

export async function initializeTelemetry(): Promise<void> {
	if (!isEnabled(process.env.OTEL_ENABLED)) return;
	if (sdk) return;

	const serviceName = process.env.OTEL_SERVICE_NAME || "hris-api";
	const exporterUrl = resolveTraceExporterUrl();

	if (isEnabled(process.env.OTEL_DEBUG)) {
		diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
	}

	sdk = new NodeSDK({
		serviceName,
		traceExporter: new OTLPTraceExporter({ url: exporterUrl }),
		instrumentations: [getNodeAutoInstrumentations()],
	});

	await sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
	if (!sdk) return;
	await sdk.shutdown();
	sdk = null;
}
