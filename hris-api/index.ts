import "./helper/telemetry-autostart";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/config";
import openApiSpecs from "./docs/openApiSpecs";
import verifyToken from "./middleware/verifyToken";
import { connectAllDatabases, disconnectAllDatabases, prisma, runWithDbRequestContext } from "./config/database";
import { securityMiddleware, devSecurityMiddleware } from "./middleware/security";
import { authSecurityMiddleware } from "./middleware/security";
import { networkInterfaces } from "os";
import { getLogger } from "./helper/logger.helper";
import { httpMetricsMiddleware, metricsHandler } from "./middleware/observability";
import { apiActivityLoggingMiddleware } from "./middleware/apiActivityLogging";
import { apiDebugLoggingMiddleware } from "./middleware/apiDebugLogging";
import { shutdownTelemetry } from "./helper/telemetry";
import { recordHttpOutcome, startStatusSampler } from "./app/status/status.service";

process.setMaxListeners(50);
const logger = getLogger();
logger.info("startup.boot.begin", {
	event: "startup.boot.begin",
	pid: process.pid,
	node_env: process.env.NODE_ENV || "undefined",
	port: process.env.PORT || config.port,
	host: config.host,
	cloud_run_service: process.env.K_SERVICE || null,
	cloud_run_revision: process.env.K_REVISION || null,
	enable_startup_services: config.enableStartupServices,
});

declare global {
	var app: import("express").Application | undefined;
	var __errorHandlersRegistered: boolean | undefined;
}

if (!global.__errorHandlersRegistered) {
	global.__errorHandlersRegistered = true;

	process.on("uncaughtException", (err) => {
		logger.error("process.uncaught_exception", {
			event: "process.uncaught_exception",
			error: {
				message: err.message,
				name: err.name,
				stack: err.stack,
			},
		});
		process.exit(1);
	});

	process.on("unhandledRejection", (reason: unknown, promise) => {
		logger.error("process.unhandled_rejection", {
			event: "process.unhandled_rejection",
			error:
				reason instanceof Error
					? {
							message: reason.message,
							name: reason.name,
							stack: reason.stack,
						}
					: reason,
			promise: String(promise),
		});
		process.exit(1);
	});
}

function getLocalIPAddress(): { ip: string; adapter: string } | null {
	const nets = networkInterfaces();
	const addresses: Array<{ name: string; address: string; priority: number }> = [];

	for (const name of Object.keys(nets)) {
		const net = nets[name];
		if (net) {
			for (const addr of net) {
				// Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
				if (addr.family === "IPv4" && !addr.internal) {
					const ip = addr.address;
					let priority = 0;

					// Exclude VirtualBox adapters (192.168.56.x)
					if (ip.startsWith("192.168.56.")) {
						continue;
					}

					// Exclude Docker/WSL adapters (172.16-31.x.x)
					if (ip.startsWith("172.")) {
						const secondOctet = parseInt(ip.split(".")[1]);
						if (secondOctet >= 16 && secondOctet <= 31) {
							continue;
						}
					}

					// Exclude adapter names that suggest virtual adapters
					const lowerName = name.toLowerCase();
					if (
						lowerName.includes("virtualbox") ||
						lowerName.includes("vmware") ||
						lowerName.includes("hyper-v") ||
						lowerName.includes("vpn") ||
						lowerName.includes("tunnel")
					) {
						continue;
					}

					// Prioritize: Ethernet/Wi-Fi adapters get higher priority
					if (
						lowerName.includes("ethernet") ||
						lowerName.includes("wi-fi") ||
						lowerName.includes("wlan") ||
						lowerName.includes("lan")
					) {
						priority = 10;
					} else if (ip.startsWith("192.168.")) {
						// Regular LAN IPs get medium priority
						priority = 5;
					}

					addresses.push({ name, address: ip, priority });
				}
			}
		}
	}

	// Sort by priority (highest first) and return the best match
	if (addresses.length > 0) {
		addresses.sort((a, b) => b.priority - a.priority);
		return { ip: addresses[0].address, adapter: addresses[0].name };
	}

	return null;
}

async function withTimeout<T>(
	operation: Promise<T>,
	timeoutMs: number,
	operationName: string,
): Promise<T> {
	let timeoutHandle: NodeJS.Timeout | null = null;

	try {
		return await Promise.race([
			operation,
			new Promise<T>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

const app = express();
app.set("trust proxy", 1);
const DEACTIVATED_ACCOUNT_MESSAGE =
	"Your account has been deactivated due to termination or resignation. Please contact HR for further assistance.";

const server = createServer(app);
server.requestTimeout = config.defaultRequestTimeoutMs;
server.headersTimeout = config.headersTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.setTimeout(config.defaultRequestTimeoutMs);

const io = new Server(server, {
	cors: {
		origin: (origin, callback) => {
			callback(null, config.cors.isAllowedOrigin(origin));
		},
		credentials: config.cors.credentials,
	},
});

app.use((req: Request, res: Response, next: NextFunction) => {
	runWithDbRequestContext(() => {
		(req as any).io = io;
		next();
	});
});

// Socket.io connection handling for real-time notifications
io.on("connection", (socket) => {
	console.log(`?? Socket connected: ${socket.id}`);

	// Join employee-specific room for targeted notifications
	socket.on("join:employee", (employeeId: string) => {
		if (employeeId) {
			socket.join(`employee:${employeeId}`);
			console.log(`?? Socket ${socket.id} joined room: employee:${employeeId}`);
		}
	});

	// Leave employee room
	socket.on("leave:employee", (employeeId: string) => {
		if (employeeId) {
			socket.leave(`employee:${employeeId}`);
			console.log(`?? Socket ${socket.id} left room: employee:${employeeId}`);
		}
	});

	socket.on(
		"join:device-events",
		(payload: { organizationId?: string | null; deviceId?: string | null } = {}) => {
			const organizationId = String(payload.organizationId || "").trim();
			const deviceId = String(payload.deviceId || "").trim();
			if (organizationId) {
				socket.join(`device-events:org:${organizationId}`);
				console.log(
					`?? Socket ${socket.id} joined room: device-events:org:${organizationId}`,
				);
			}
			if (deviceId && deviceId !== "all") {
				socket.join(`device-events:device:${deviceId}`);
				console.log(
					`?? Socket ${socket.id} joined room: device-events:device:${deviceId}`,
				);
			}
		},
	);

	socket.on("join:attendance", (payload: { organizationId?: string | null } = {}) => {
		const organizationId = String(payload.organizationId || "").trim();
		if (organizationId) {
			socket.join(`attendance:org:${organizationId}`);
			console.log(`Socket ${socket.id} joined room: attendance:org:${organizationId}`);
		}
	});

	socket.on("leave:attendance", (payload: { organizationId?: string | null } = {}) => {
		const organizationId = String(payload.organizationId || "").trim();
		if (organizationId) {
			socket.leave(`attendance:org:${organizationId}`);
			console.log(`Socket ${socket.id} left room: attendance:org:${organizationId}`);
		}
	});

	socket.on(
		"leave:device-events",
		(payload: { organizationId?: string | null; deviceId?: string | null } = {}) => {
			const organizationId = String(payload.organizationId || "").trim();
			const deviceId = String(payload.deviceId || "").trim();
			if (organizationId) {
				socket.leave(`device-events:org:${organizationId}`);
				console.log(
					`?? Socket ${socket.id} left room: device-events:org:${organizationId}`,
				);
			}
			if (deviceId && deviceId !== "all") {
				socket.leave(`device-events:device:${deviceId}`);
				console.log(
					`?? Socket ${socket.id} left room: device-events:device:${deviceId}`,
				);
			}
		},
	);

	socket.on("disconnect", () => {
		console.log(`?? Socket disconnected: ${socket.id}`);
	});
});

// Redis subscriber for cross-service events (e.g. from Cron)
import { redisClient } from "./config/redis";

if (config.enableStartupServices) {
	(async () => {
		try {
			if (!redisClient.isClientConnected()) {
				console.warn(
					"Redis subscriber setup skipped because Redis is not connected. App will continue without pub/sub events.",
				);
				return;
			}

			// Create a dedicated subscriber client
			const subClient = redisClient.getClient().duplicate();
			subClient.on("error", (error) => {
				console.error("Redis subscriber error:", error);
			});

			await subClient.subscribe("events:eligibility-updated");
			console.log("Listening for Redis events: events:eligibility-updated");

			subClient.on("message", (channel, message) => {
				if (channel === "events:eligibility-updated") {
					try {
						const data = JSON.parse(message);
						console.log(
							`?? Received eligibility update for Org ${data.organizationId}, broadcasting to sockets`,
						);

						// Broadcast to all clients (or filter by org if we had org-rooms set up for everyone)
						// For now, broadcast to everyone or let frontend filter
						io.emit("eligibility-updated", data);

						// If we had org rooms: io.to(`org:${data.organizationId}`).emit(...)
					} catch (e) {
						console.error("Error parsing Redis message:", e);
					}
				}
			});
		} catch (err) {
			console.error("Failed to setup Redis subscriber:", err);
		}
	})();
} else {
	console.log("Redis subscriber disabled (ENABLE_STARTUP_SERVICES=false)");
}

// Apply security middleware based on environment
if (process.env.NODE_ENV === "production") {
	app.use(securityMiddleware);
	console.log("?? Production security middleware enabled");
} else {
	app.use(devSecurityMiddleware);
	console.log("? Development security middleware enabled (relaxed mode)");
}

const template = require("./app/template")(prisma);
const payrollperiod = require("./app/payrollperiod")(prisma);
const request = require("./app/request")(prisma);
const employeepayroll = require("./app/employeepayroll")(prisma);
const employeebenefit = require("./app/employeeBenefit")(prisma);
const loantype = require("./app/loanType")(prisma);
const calculator = require("./app/calculator")(prisma);
const benefittype = require("./app/benefitType")(prisma);
const employeeloan = require("./app/employeeLoan")(prisma);
const department = require("./app/department")(prisma);
const agency = require("./app/agency")(prisma);
const attendance = require("./app/attendance")(prisma);
const timesheet = require("./app/timesheet")(prisma);
const leavesetting = require("./app/leaveSetting")(prisma);
const position = require("./app/position")(prisma);
const person = require("./app/person")(prisma);
const dashboard = require("./app/dashboard")(prisma);
const employee = require("./app/employee")(prisma);
const employeeSchedule = require("./app/employeeSchedule")(prisma);
const hikvision = config.enableDeviceServices ? require("./app/hikvision")(prisma) : null;
const zkteco = config.enableDeviceServices ? require("./app/zkteco")(prisma) : null;
const metrics = config.enableMetricsServices ? require("./app/metrics")(prisma) : null;
const report = require("./app/report")(prisma);
const level = require("./app/level")(prisma);
const rule = require("./app/Rule")(prisma);
const calendaritem = require("./app/calendar-item")(prisma);
const device = config.enableDeviceServices ? require("./app/device")(prisma) : null;
const applicant = require("./app/applicant")(prisma);
const job = require("./app/job")(prisma);
const guide = require("./app/guide")(prisma);
const checklistItem = require("./app/checklistItem")(prisma);
const boardingprocess = require("./app/boardingProcess")(prisma);
const note = require("./app/note")(prisma);
const boardingtemplate = require("./app/boardingTemplate")(prisma);
const templateitem = require("./app/templateItem")(prisma);
const termination = require("./app/termination")(prisma);
const termiantion = require("./app/termination")(prisma);
const notification = require("./app/notification")(prisma);
const docs = require("./app/docs/docs");
const migration = require("./app/migration")(prisma);
const celebrations = require("./app/celebrations")(prisma);
const auth = require("./app/auth")(prisma);
const document = require("./app/document")(prisma);
const employeedocuments = require("./app/employeeDocuments")(prisma);
const documenttype = require("./app/documentType")(prisma);
const soalineitem = require("./app/soalineitem")(prisma);
const soaremittance = require("./app/soaremittance")(prisma);
const statementofaccount = require("./app/statementofaccount")(prisma);
const activitylogging = require("./app/activityLogging")(prisma);
const auditlogging = require("./app/auditLogging")(prisma);
const documentfolder = require("./app/documentFolder")(prisma);
const shifttype = require("./app/shiftType")(prisma);
const scheduleoverride = require("./app/scheduleOverride")(prisma);
const scheduletemplate = require("./app/scheduleTemplate")(prisma);
const systemprovisioning = require("./app/systemProvisioning")(prisma);
const workflowconfig = require("./app/workflowConfig")(prisma);
const workflowengine = require("./app/workflowEngine")(prisma);
const workforceRecruitmentSetting = require("./app/workforceRecruitmentSetting")(prisma);
const requesttransaction = require("./app/requestTransaction")(prisma);
const statusmodule = require("./app/status")(prisma);
const timesheetline = require("./app/timesheetline")(prisma);
const section = require("./app/section")(prisma);
const leaveType = require("./app/leaveType")(prisma);

const apiBodyLimit = process.env.HRIS_API_BODY_LIMIT || "75mb";
app.use(express.json({ limit: apiBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: apiBodyLimit }));
app.use(cookieParser());
app.use(
	"/uploads",
	express.static(process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads"), {
		fallthrough: false,
		maxAge: "1h",
		setHeaders: (res) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
			res.removeHeader("Cross-Origin-Embedder-Policy");
			res.removeHeader("Content-Security-Policy");
		},
	}),
);
app.use(apiDebugLoggingMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
	const requestOrigin = req.headers.origin;

	if (requestOrigin && config.cors.isAllowedOrigin(requestOrigin)) {
		res.header("Access-Control-Allow-Origin", requestOrigin);
		res.header("Vary", "Origin");
		if (config.cors.credentials) {
			res.header("Access-Control-Allow-Credentials", "true");
		}
		res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");

		const requestedHeaders = req.headers["access-control-request-headers"];
		if (typeof requestedHeaders === "string" && requestedHeaders.trim()) {
			res.header("Access-Control-Allow-Headers", requestedHeaders);
		} else {
			res.header(
				"Access-Control-Allow-Headers",
				"Origin, X-Requested-With, Content-Type, Accept, Authorization",
			);
		}
	}

	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}

	next();
});

// Configure CORS
app.use(
	cors({
		origin: (origin, callback) => {
			callback(null, config.cors.isAllowedOrigin(origin));
		},
		credentials: config.cors.credentials,
	}),
);

// Health check endpoint
app.get("/", (req: Request, res: Response) => {
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Prometheus scrape endpoint for infrastructure-level monitoring.
app.get("/metrics", metricsHandler);
app.use(httpMetricsMiddleware);

// Enhanced health check with SLA status
app.get("/health", (req: Request, res: Response) => {
	// Import slaMonitor at the top level instead
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		message: "SLA monitoring is active",
	});
});

// Redis health check endpoint
app.get("/health/redis", async (req: Request, res: Response) => {
	try {
		const { redisClient } = await import("./config/redis.js");
		const start = Date.now();
		await redisClient.ping();
		const latency = Date.now() - start;

		const stats = await redisClient.getClient().info("memory");
		const memoryMatch = stats.match(/used_memory_human:(.+)/);
		const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

		const dbsize = await redisClient.getClient().dbsize();

		res.status(200).json({
			status: "healthy",
			redis: {
				connected: redisClient.isClientConnected(),
				latency: `${latency}ms`,
				memoryUsage,
				totalKeys: dbsize,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		res.status(503).json({
			status: "unhealthy",
			redis: {
				connected: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			timestamp: new Date().toISOString(),
		});
	}
});

app.use(statusmodule);

// Set up routes that don't need authentication
if (process.env.NODE_ENV !== "production") {
	app.use(`${config.baseApiPath}/swagger`, swaggerUi.serve, swaggerUi.setup(openApiSpecs()));
}

// Apply authentication-specific security middleware
app.use(`${config.baseApiPath}/auth`, authSecurityMiddleware);
app.use(config.baseApiPath, apiActivityLoggingMiddleware);

// Block login for employees who are already terminated/resigned (best effort).
app.use(
	`${config.baseApiPath}/auth/login`,
	async (req: Request, res: Response, next: NextFunction) => {
		if (req.method !== "POST") {
			next();
			return;
		}

		const identifier = String((req.body as any)?.identifier ?? (req.body as any)?.email ?? "")
			.trim()
			.toLowerCase();

		if (!identifier) {
			next();
			return;
		}

		try {
			const deactivatedEmployee = identifier.includes("@")
				? await (async () => {
						const candidatePersons = await prisma.person.findMany({
							where: {
								isDeleted: false,
							},
							select: {
								id: true,
								contactInfo: true,
							},
						});
						const matchedPersonIds = candidatePersons
							.filter((person) => {
								const contactInfo =
									person.contactInfo &&
									typeof person.contactInfo === "object" &&
									!Array.isArray(person.contactInfo)
										? (person.contactInfo as Record<string, unknown>)
										: {};
								return String(contactInfo.email || "").trim().toLowerCase() === identifier;
							})
							.map((person) => person.id);

						if (matchedPersonIds.length === 0) return null;

						return prisma.employee.findFirst({
							where: {
								isDeleted: false,
								employmentStatus: {
									in: ["TERMINATED", "RESIGNED"],
								},
								personId: { in: matchedPersonIds },
							},
							select: {
								id: true,
								employmentStatus: true,
							},
						});
					})()
				: await prisma.employee.findFirst({
						where: {
							isDeleted: false,
							employeeId: identifier,
							employmentStatus: {
								in: ["TERMINATED", "RESIGNED"],
							},
						},
						select: {
							id: true,
							employmentStatus: true,
						},
					});

			if (deactivatedEmployee) {
				res.status(403).json({
					message: DEACTIVATED_ACCOUNT_MESSAGE,
					error: "ACCOUNT_DEACTIVATED",
					data: {
						employmentStatus: deactivatedEmployee.employmentStatus,
					},
				});
				return;
			}
		} catch (error) {
			console.error("Error checking deactivated login restriction:", error);
		}

		next();
	},
);

// Apply middleware for protected routes, excluding /docs, /auth, and /hikvision
app.use(config.baseApiPath, (req: Request, res: Response, next: NextFunction) => {
	const startedAt = Date.now();
	res.on("finish", () => {
		if (res.statusCode < 400) return;
		const pathWithoutBase = req.path || "";
		const firstSegment = pathWithoutBase.split("/").filter(Boolean)[0];
		if (!firstSegment) return;
		if (firstSegment === "status") return;

		recordHttpOutcome(firstSegment, {
			statusCode: res.statusCode,
			message: `${req.method} ${req.originalUrl} failed with ${res.statusCode} (${Date.now() - startedAt}ms)`,
			requestPath: req.path,
		});
	});

	if (process.env.LOG_HTTP_REQUESTS === "true") {
		console.log("Incoming request:", req.method, req.path);
	}
	if (
		req.path.startsWith("/docs") ||
		req.path.startsWith("/auth") ||
		req.path.startsWith("/system-provisioning") ||
		req.path.startsWith("/hikvision") ||
		req.path.startsWith("/zkteco") ||
		req.path.startsWith("/applicant") ||
		req.path.startsWith("/person") ||
		req.path.startsWith("/job") ||
		req.path.startsWith("/guide") ||
		req.path === "/position"
	) {
		// Skip middleware for the docs, auth, and hikvision routes
		return next();
	}
	verifyToken(req, res, () => {
		next();
	});
});

app.use(config.baseApiPath, template);
app.use(config.baseApiPath, payrollperiod);
app.use(config.baseApiPath, request);
app.use(config.baseApiPath, employeepayroll);
app.use(config.baseApiPath, employeebenefit);
app.use(config.baseApiPath, loantype);
app.use(config.baseApiPath, calculator);
app.use(config.baseApiPath, benefittype);
app.use(config.baseApiPath, employeeloan);
app.use(config.baseApiPath, department);
app.use(config.baseApiPath, agency);
app.use(config.baseApiPath, attendance);
app.use(config.baseApiPath, timesheet);
app.use(config.baseApiPath, leavesetting);
app.use(config.baseApiPath, position);
app.use(config.baseApiPath, dashboard);
app.use(config.baseApiPath, employee);
app.use(config.baseApiPath, employeeSchedule);
if (config.enableDeviceServices && hikvision) {
	app.use(`${config.baseApiPath}/hikvision`, hikvision);
}
if (config.enableDeviceServices && zkteco) {
	app.use(config.baseApiPath, zkteco);
}
app.use(config.baseApiPath, person);
if (config.enableMetricsServices && metrics) {
	app.use(config.baseApiPath, metrics);
}
app.use(config.baseApiPath, report);
app.use(config.baseApiPath, level);
app.use(config.baseApiPath, rule);
app.use(config.baseApiPath, calendaritem);
if (config.enableDeviceServices && device) {
	app.use(config.baseApiPath, device);
}
app.use(config.baseApiPath, applicant);
app.use(config.baseApiPath, job);
app.use(config.baseApiPath, guide);
app.use(config.baseApiPath, checklistItem);
app.use(config.baseApiPath, boardingprocess);
app.use(config.baseApiPath, note);
app.use(config.baseApiPath, boardingtemplate);
app.use(config.baseApiPath, templateitem);
app.use(config.baseApiPath, termination);
app.use(config.baseApiPath, notification);
app.use(config.baseApiPath, docs(prisma, app));
app.use(config.baseApiPath, migration);
app.use(config.baseApiPath, celebrations);
app.use(config.baseApiPath, auth);
app.use(config.baseApiPath, document);
app.use(config.baseApiPath, employeedocuments);
app.use(config.baseApiPath, documenttype);
app.use(config.baseApiPath, soalineitem);
app.use(config.baseApiPath, soaremittance);
app.use(config.baseApiPath, statementofaccount);
app.use(config.baseApiPath, activitylogging);
app.use(config.baseApiPath, auditlogging);
app.use(config.baseApiPath, documentfolder);
app.use(config.baseApiPath, shifttype);
app.use(config.baseApiPath, scheduleoverride);
app.use(config.baseApiPath, scheduletemplate);
app.use(config.baseApiPath, systemprovisioning);
app.use(config.baseApiPath, workflowconfig);
app.use(config.baseApiPath, workflowengine);
app.use(config.baseApiPath, workforceRecruitmentSetting);
app.use(config.baseApiPath, requesttransaction);
app.use(config.baseApiPath, timesheetline);
app.use(config.baseApiPath, section);
app.use(config.baseApiPath, leaveType);

// Store app instance globally for docs generation after all routes are registered
global.app = app;

server.on("error", (err: NodeJS.ErrnoException) => {
	logger.error("server.error", {
		event: "server.error",
		error: {
			message: err.message,
			name: err.name,
			stack: err.stack,
			code: err.code,
		},
		port: config.port,
	});
	process.exit(1);
});

logger.info("server.listen.starting", {
	event: "server.listen.starting",
	port: config.port,
	host: config.host,
});

server.listen(Number(config.port), config.host, async () => {
	try {
		if (config.enableStartupServices) {
			try {
				await withTimeout(connectAllDatabases(), 15000, "Startup database connection");
			} catch (error) {
				logger.warn("startup.db_connect.skipped_after_timeout", {
					event: "startup.db_connect.skipped_after_timeout",
					error:
						error instanceof Error
							? {
									message: error.message,
									name: error.name,
									stack: error.stack,
								}
							: error,
					timeout_ms: 15000,
				});
			}
		} else {
			logger.info("startup.db_connect.disabled", {
				event: "startup.db_connect.disabled",
			});
		}

		if (config.enableStartupServices) {
			startStatusSampler(prisma);
		} else {
			logger.info("startup.status_sampler.disabled", {
				event: "startup.status_sampler.disabled",
			});
		}

		const networkInfo = config.enableStartupServices ? getLocalIPAddress() : null;

		logger.info("server.ready", {
			event: "server.ready",
			port: config.port,
			host: config.host,
			base_api_path: config.baseApiPath,
			network_ip: networkInfo?.ip,
			network_adapter: networkInfo?.adapter,
			request_timeouts: {
				default: config.defaultRequestTimeoutMs,
				heavy: config.heavyRequestTimeoutMs,
				headers: config.headersTimeoutMs,
				keep_alive: config.keepAliveTimeoutMs,
			},
			prisma_transaction_defaults: {
				timeout: config.prismaTransactionTimeoutMs,
				max_wait: config.prismaTransactionMaxWaitMs,
				slow_warn: config.slowRequestWarnMs,
			},
		});
		logger.info(`Server running at http://localhost:${config.port}`);
		if (!config.enableStartupServices) {
			logger.info("startup.network_ip_detection.disabled", {
				event: "startup.network_ip_detection.disabled",
			});
		}
	} catch (error) {
		logger.error("database.connect.failed", {
			event: "database.connect.failed",
			error:
				error instanceof Error
					? {
							message: error.message,
							name: error.name,
							stack: error.stack,
						}
					: error,
		});
		process.exit(1);
	}
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
	logger.info("server.shutdown.start", {
		event: "server.shutdown.start",
		signal,
	});

	try {
		await disconnectAllDatabases();

		server.close(async () => {
			logger.info("server.shutdown.complete", {
				event: "server.shutdown.complete",
				signal,
			});
			await shutdownTelemetry();
			process.exit(0);
		});
	} catch (error) {
		logger.error("server.shutdown.failed", {
			event: "server.shutdown.failed",
			signal,
			error:
				error instanceof Error
					? {
							message: error.message,
							name: error.name,
							stack: error.stack,
						}
					: error,
		});
		await shutdownTelemetry();
		process.exit(1);
	}
};

// Register shutdown handlers
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
