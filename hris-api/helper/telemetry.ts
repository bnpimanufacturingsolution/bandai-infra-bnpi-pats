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

export async function initializeTelemetry(): Promise<void> {
	if (!isEnabled(process.env.OTEL_ENABLED)) return;
	if (sdk) return;

	const serviceName = process.env.OTEL_SERVICE_NAME || "hris-api";
	const exporterUrl =
		process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
		"http://localhost:4318/v1/traces";

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
