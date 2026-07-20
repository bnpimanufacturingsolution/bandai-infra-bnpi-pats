import { createModuleLogger } from "../helper/logger.enhanced";
import { getTracer, getMeter, createSpan } from "../helper/telemetry.enhanced";
import { traceAsync } from "../middleware/functionTracing";
import { getRequestContext } from "../middleware/correlationId";

const logger = createModuleLogger("service-instrumentation");

/**
 * Example 1: Basic Service with Traced Methods using Decorator
 */
export class UserService {
	async getUserById(userId: string) {
		const ctx = getRequestContext();

		logger.info("user.fetch.start", {
			event: "user.fetch.start",
			userId,
			requestId: ctx?.requestId,
		});

		try {
			// Simulate database query
			const user = await this.queryDatabase("SELECT * FROM users WHERE id = ?", [userId]);

			logger.info("user.fetch.success", {
				event: "user.fetch.success",
				userId,
				userEmail: user?.email,
				requestId: ctx?.requestId,
			});

			return user;
		} catch (error) {
			logger.error("user.fetch.error", {
				event: "user.fetch.error",
				userId,
				error: error instanceof Error ? error.message : String(error),
				requestId: ctx?.requestId,
			});

			throw error;
		}
	}

	async createUser(userData: { email: string; name: string }) {
		const ctx = getRequestContext();

		// Log business event
		logger.info("user.created", {
			event: "user.created",
			email: userData.email,
			userId: ctx?.userId,
			requestId: ctx?.requestId,
		});

		return { id: "123", ...userData };
	}

	private async queryDatabase(query: string, params: any[]) {
		const tracer = getTracer("database");
		return tracer.startActiveSpan("db.query", async (span) => {
			span.setAttribute("db.query", query);
			span.setAttribute("db.params", params.length);

			// Simulate query
			await new Promise((resolve) => setTimeout(resolve, 10));
			return { id: "1", email: "user@example.com" };
		});
	}
}

/**
 * Example 2: Service with Manual Trace Wrapping
 */
export class DepartmentService {
	async getDepartmentByName(name: string) {
		return traceAsync(
			async () => {
				const ctx = getRequestContext();
				logger.info("department.fetch.start", {
					event: "department.fetch.start",
					departmentName: name,
					requestId: ctx?.requestId,
				});

				// Simulate fetch
				await new Promise((resolve) => setTimeout(resolve, 5));

				logger.info("department.fetch.success", {
					event: "department.fetch.success",
					departmentName: name,
					requestId: ctx?.requestId,
				});

				return { id: "dept_123", name, managerId: "mgr_456" };
			},
			"getDepartmentByName",
			"DepartmentService",
		);
	}
}

/**
 * Example 3: Database Query Instrumentation
 */
export class DatabaseService {
	async executeQuery(query: string, params: any[] = []) {
		const tracer = getTracer("database");
		const meter = getMeter("database");

		// Create counter for queries
		const queryCounter = meter.createCounter("database.queries", {
			description: "Total database queries",
		});

		return tracer.startActiveSpan("database.query", async (span) => {
			const startTime = performance.now();

			try {
				span.setAttribute("db.statement", query);
				span.setAttribute("db.params_count", params.length);

				// Execute query
				await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

				span.setStatus({ code: 0 }); // OK
				queryCounter.add(1, { status: "success" });

				logger.debug("database.query.executed", {
					event: "database.query.executed",
					query: query.substring(0, 100),
					duration_ms: Math.round(performance.now() - startTime),
				});

				return { rows: [], rowCount: 0 };
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: 2 }); // ERROR
				queryCounter.add(1, { status: "error" });

				logger.error("database.query.error", {
					event: "database.query.error",
					query: query.substring(0, 100),
					error: error instanceof Error ? error.message : String(error),
				});

				throw error;
			}
		});
	}
}

/**
 * Example 4: HTTP Client Instrumentation
 */
export class HttpClientService {
	async callExternalApi(endpoint: string, method: string = "GET", body?: any) {
		const tracer = getTracer("http-client");
		const meter = getMeter("http-client");

		const requestDuration = meter.createHistogram("http.client.duration", {
			description: "HTTP client request duration",
		});

		return tracer.startActiveSpan(`http.${method.toLowerCase()}`, async (span) => {
			const startTime = performance.now();
			const ctx = getRequestContext();

			try {
				span.setAttribute("http.method", method);
				span.setAttribute("http.url", endpoint);

				logger.debug("http.client.request.start", {
					event: "http.client.request.start",
					endpoint,
					method,
					requestId: ctx?.requestId,
				});

				// Simulate API call
				const response = await fetch(endpoint, {
					method,
					body: body ? JSON.stringify(body) : undefined,
				});

				span.setAttribute("http.status_code", response.status);
				requestDuration.record(performance.now() - startTime);

				logger.info("http.client.request.complete", {
					event: "http.client.request.complete",
					endpoint,
					statusCode: response.status,
					duration_ms: Math.round(performance.now() - startTime),
					requestId: ctx?.requestId,
				});

				return response;
			} catch (error) {
				span.recordException(error as Error);
				requestDuration.record(performance.now() - startTime);

				logger.error("http.client.request.error", {
					event: "http.client.request.error",
					endpoint,
					error: error instanceof Error ? error.message : String(error),
					requestId: ctx?.requestId,
				});

				throw error;
			}
		});
	}
}

/**
 * Example 5: Job/Cron Task Instrumentation
 */
export class PayrollProcessingJob {
	async processMonthlyPayroll(month: number, year: number) {
		return traceAsync(
			async () => {
				const tracer = getTracer("jobs");
				const ctx = getRequestContext();

				logger.info("payroll.processing.start", {
					event: "payroll.processing.start",
					month,
					year,
					requestId: ctx?.requestId,
				});

				return tracer.startActiveSpan("payroll.process", async (span) => {
					span.setAttribute("payroll.month", month);
					span.setAttribute("payroll.year", year);

					try {
						// Process employees
						const employees = await this.fetchEmployees();
						logger.info("payroll.employees.fetched", {
							event: "payroll.employees.fetched",
							count: employees.length,
						});

						for (const employee of employees) {
							await this.calculatePayroll(employee);
						}

						logger.info("payroll.processing.complete", {
							event: "payroll.processing.complete",
							month,
							year,
							employeesProcessed: employees.length,
							requestId: ctx?.requestId,
						});

						return {
							processed: employees.length,
							errors: 0,
						};
					} catch (error) {
						span.recordException(error as Error);
						logger.error("payroll.processing.error", {
							event: "payroll.processing.error",
							month,
							year,
							error: error instanceof Error ? error.message : String(error),
						});
						throw error;
					}
				});
			},
			"processMonthlyPayroll",
			"PayrollProcessingJob",
		);
	}

	private async fetchEmployees() {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return [
			{ id: "emp_1", name: "John Doe" },
			{ id: "emp_2", name: "Jane Smith" },
		];
	}

	private async calculatePayroll(employee: any) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

/**
 * Example 6: Authentication Service with Audit Logging
 */
export class AuthService {
	async login(email: string, password: string) {
		const ctx = getRequestContext();

		logger.info("auth.login.attempt", {
			event: "auth.login.attempt",
			email,
			ipAddress: ctx?.ipAddress,
			timestamp: new Date().toISOString(),
		});

		try {
			// Validate credentials
			const user = await this.validateCredentials(email, password);

			// Audit: successful login
			logger.info("auth.login.success", {
				event: "auth.login.success",
				userId: user.id,
				email,
				ipAddress: ctx?.ipAddress,
				timestamp: new Date().toISOString(),
			});

			return { token: "jwt_token_here", user };
		} catch (error) {
			// Audit: failed login
			logger.warn("auth.login.failure", {
				event: "auth.login.failure",
				email,
				error: error instanceof Error ? error.message : String(error),
				ipAddress: ctx?.ipAddress,
				timestamp: new Date().toISOString(),
			});

			throw error;
		}
	}

	private async validateCredentials(email: string, password: string) {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { id: "user_123", email };
	}
}

/**
 * Example 7: Metrics Export Helper
 */
export class MetricsHelper {
	static recordUserAction(action: string, userId: string, metadata?: any) {
		const meter = getMeter("business");
		const actionCounter = meter.createCounter("user.action", {
			description: "User actions",
		});

		actionCounter.add(1, { action, userId });

		logger.info("user.action", {
			event: "user.action",
			action,
			userId,
			...metadata,
		});
	}

	static recordBusinessEvent(eventType: string, details: any) {
		const meter = getMeter("business");
		const eventCounter = meter.createCounter("business.event", {
			description: "Business events",
		});

		eventCounter.add(1, { eventType });

		logger.info(`business.${eventType}`, {
			event: `business.${eventType}`,
			...details,
		});
	}
}
