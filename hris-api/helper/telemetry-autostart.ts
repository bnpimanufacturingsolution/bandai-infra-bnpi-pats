import { initializeTelemetry } from "./telemetry";

void initializeTelemetry().catch((error) => {
	console.warn(
		"telemetry.autostart.failed",
		error instanceof Error
			? { message: error.message, name: error.name, stack: error.stack }
			: error,
	);
});
