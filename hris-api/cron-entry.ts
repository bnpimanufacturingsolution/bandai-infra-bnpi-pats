import { connectAllDatabases, disconnectAllDatabases } from "./config/database";
import { initCronJobs } from "./app/cron/cron.service";

console.log("🚀 Starting Cron Worker Service...");

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
	console.error("❌ Uncaught Exception:", error);
	process.exit(1);
});

process.on("unhandledRejection", (error) => {
	console.error("❌ Unhandled Rejection:", error);
	process.exit(1);
});

// Start the worker
const startWorker = async () => {
	try {
		// 1. Connect to databases
		await connectAllDatabases();
		console.log("✅ Database connected successfully within Cron Worker");

		// 2. Initialize Cron Jobs
		initCronJobs();

		console.log("✅ Cron Worker is running and waiting for tasks...");
	} catch (error) {
		console.error("❌ Error starting Cron Worker:", error);
		process.exit(1);
	}
};

startWorker();

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
	console.log(`\n${signal} received. Shutting down Cron Worker...`);
	try {
		await disconnectAllDatabases();
		console.log("✅ Database connections closed.");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
