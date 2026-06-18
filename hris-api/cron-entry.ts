import "./helper/telemetry-autostart";
import { connectDb, connectRedis, disconnectAllDatabases } from "./config/database";
import { config } from "./config/config";
import { initCronJobs } from "./app/cron/cron.service";
import { shutdownTelemetry } from "./helper/telemetry";

console.log("Starting Cron Worker Service...");

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
	process.exit(1);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled Rejection:", error);
	process.exit(1);
});

const startWorker = async () => {
	try {
		await connectDb();
		if (config.redis.enabled) {
			await connectRedis();
		}
		console.log("Database connected successfully within Cron Worker");

		initCronJobs();

		console.log("Cron Worker is running and waiting for tasks...");
	} catch (error) {
		console.error("Error starting Cron Worker:", error);
		process.exit(1);
	}
};

startWorker();

const gracefulShutdown = async (signal: string) => {
	console.log(`\n${signal} received. Shutting down Cron Worker...`);
	try {
		await disconnectAllDatabases();
		await shutdownTelemetry();
		console.log("Database connections closed.");
		process.exit(0);
	} catch (error) {
		console.error("Error during shutdown:", error);
		process.exit(1);
	}
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
