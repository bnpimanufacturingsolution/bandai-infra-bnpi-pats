# Enterprise Observability Framework

## Overview

This document describes the complete enterprise-grade observability framework for the HRIS API using Winston, OpenTelemetry, and the LGTM stack (Loki, Grafana, Tempo, Mimir).

### Core Principles

1. **Logs = What Happened** - Business events, operational events, audits, warnings, errors
2. **Metrics = System Health** - Request counts, latency, error rates, resource usage
3. **Traces = Where Time Was Spent** - Request flow, service dependencies, execution timing

This separation reduces log noise while maintaining full visibility into system behavior.

## Architecture

```
Application (Node.js + Winston + OpenTelemetry)
                    ↓
        OpenTelemetry Collector (OTLP)
          ↙         ↓         ↘
        Loki      Tempo      Mimir
      (Logs)    (Traces)   (Metrics)
          ↘         ↓         ↙
              Grafana (Visualization)
```

## Environment-Specific Logging Policy

### DEVELOPMENT (DEV)

**Default:** `LOG_LEVEL=debug`

**Enabled:**

- ✅ Function entry logging (`[DEBUG] Enter createUser()`)
- ✅ Function exit logging (`[DEBUG] Exit createUser() Duration=45ms`)
- ✅ Execution duration logging
- ✅ Detailed debugging information
- ✅ Request/response inspection (excluding sensitive data)

**Purpose:** Developer troubleshooting and understanding application flow

**Example Log Output:**

```
08:15:23 DEBUG [user-service] [trace_id=abc123 span_id=xyz789 req_id=req_001] Enter createUser()
08:15:23 DEBUG [user-service] Validating request
08:15:23 DEBUG [user-service] Saving user
08:15:24 DEBUG [user-service] Exit createUser() Duration=45ms
```

### USER ACCEPTANCE TESTING (UAT)

**Default:** `LOG_LEVEL=info`

**By Default:**

- ❌ Function entry/exit logging disabled
- ✅ Business events logged
- ✅ Warnings and errors logged

**Conditional Debugging:**
Enable function tracing with:

```bash
ENABLE_FUNCTION_TRACE=true
```

When enabled:

- ✅ Function entry logs
- ✅ Function exit logs
- ✅ Execution duration logs

**Purpose:** Support QA investigations without excessive logs

### PRODUCTION (PROD)

**Default:** `LOG_LEVEL=info` or `warn`

**Enabled:**

- ✅ Business events
- ✅ Audit events
- ✅ Security events
- ✅ Warnings
- ✅ Errors
- ✅ Startup/shutdown events
- ✅ Infrastructure failures
- ✅ External integration failures

**Disabled:**

- ❌ Function entry/exit logging (use traces instead)
- ❌ Debug-level logging

**Temporary Debugging:**

```bash
LOG_LEVEL=debug
ENABLE_FUNCTION_TRACE=true
```

> ⚠️ Manual enable only. Must be disabled after incident investigation.

**Alternative:** Use OpenTelemetry traces to visualize execution flow

```
HTTP Request
 └─ createUser()
     ├─ validateUser()
     ├─ checkDepartment()
     └─ saveUser()
```

## Winston Logger Configuration

### Installation

```bash
npm install winston @logtail/node @logtail/winston
```

### Logger Initialization

```typescript
import { getEnhancedLogger, createModuleLogger } from "./helper/logger.enhanced";

const logger = getEnhancedLogger(); // Global logger
const moduleLogger = createModuleLogger("module-name"); // Module-specific logger
```

### Required Fields in Every Log Entry

Every log entry automatically includes:

- `timestamp` - ISO 8601 timestamp
- `environment` - DEV/UAT/PROD
- `serviceName` - Service identifier (e.g., "hris-api")
- `traceId` - OpenTelemetry trace ID
- `spanId` - OpenTelemetry span ID
- `requestId` - Request identifier
- `userId` - Authenticated user (if available)
- `correlationId` - Request correlation ID
- `hostname` - Server hostname
- `applicationVersion` - Service version

### Log Entry Examples

#### Business Event (INFO)

```typescript
logger.info("user.created", {
	event: "user.created",
	userId: 123,
	email: "user@example.com",
	department: "Engineering",
});
```

Output in Loki:

```json
{
	"timestamp": "2024-01-15T10:30:45.123Z",
	"level": "info",
	"message": "user.created",
	"service": {
		"name": "hris-api",
		"version": "1.0.122"
	},
	"environment": "production",
	"host": { "name": "api-server-01" },
	"trace": {
		"id": "4bf92f3577b34da6a3ce929d0e0e4736",
		"span_id": "00f067aa0ba902b7"
	},
	"request": {
		"id": "req_abc123",
		"correlation_id": "corr_123456"
	},
	"user": { "id": 123 },
	"fields": {
		"email": "user@example.com",
		"department": "Engineering"
	}
}
```

#### Warning Event (WARN)

```typescript
logger.warn("invalid.login.attempt", {
	event: "invalid.login.attempt",
	username: "sample",
	ipAddress: "192.168.1.100",
	attemptCount: 3,
});
```

#### Error Event (ERROR)

```typescript
logger.error("database.timeout", {
	event: "database.timeout",
	error: "connection timeout after 30s",
	query: "SELECT * FROM users WHERE id = ?",
	duration_ms: 30000,
});
```

## OpenTelemetry Configuration

### Installation

```bash
npm install \
  @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express \
  @opentelemetry/instrumentation-prisma
```

### Configuration

Environment variables:

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=hris-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_DEBUG=false  # Set to true to debug OTel issues
```

### Initialization

In your application entry point:

```typescript
import {
	initializeEnhancedTelemetry,
	shutdownEnhancedTelemetry,
} from "./helper/telemetry.enhanced";

await initializeEnhancedTelemetry();

// ... start your app ...

process.on("SIGTERM", async () => {
	await shutdownEnhancedTelemetry();
	process.exit(0);
});
```

### Instrumented Components

The framework automatically instruments:

- ✅ HTTP requests
- ✅ Express middleware
- ✅ Database queries (Prisma, MySQL, PostgreSQL)
- ✅ Redis operations
- ✅ External API calls
- ✅ File system operations

## Correlation ID and Context Management

### Usage

The correlation ID middleware is automatically applied and tracks request context:

```typescript
import {
	correlationIdMiddleware,
	getRequestContext,
	getRequestId,
	getCorrelationId,
} from "./middleware/correlationId";

// In your Express app:
app.use(correlationIdMiddleware);

// Access in your services:
const ctx = getRequestContext();
console.log(ctx?.requestId); // Request ID
console.log(ctx?.correlationId); // Correlation ID
console.log(ctx?.userId); // User ID (if authenticated)
console.log(ctx?.ipAddress); // Client IP address
console.log(ctx?.traceId); // OpenTelemetry trace ID
```

### Context Propagation

Context automatically propagates through:

- Async/await chains (via AsyncLocalStorage)
- Express request/response lifecycle
- Manual background jobs (via `runInRequestContext`)

### Response Headers

Correlation IDs are automatically added to response headers:

```
X-Request-ID: req_4a5c3e8d9f2b1c7e
X-Correlation-ID: corr_8b9e2c1a6f3d5e7f
X-Trace-ID: 4bf92f3577b34da6a3ce929d0e0e4736
```

## Function Tracing

### Using Decorators

```typescript
import { Trace } from "./middleware/functionTracing";

class UserService {
	@Trace
	async createUser(userData: { email: string; name: string }) {
		// Function automatically logged with entry, exit, duration
	}
}
```

### Using Inline Tracing

```typescript
import { traceAsync } from "./middleware/functionTracing";

async function processData() {
	return traceAsync(
		async () => {
			// Function body
			return data;
		},
		"processData",
		"DataService",
	);
}
```

### Behavior by Environment

| Aspect                 | DEV | UAT                   | PROD                  |
| ---------------------- | --- | --------------------- | --------------------- |
| Function entry         | ✅  | ENABLE_FUNCTION_TRACE | ❌                    |
| Function exit          | ✅  | ENABLE_FUNCTION_TRACE | ❌                    |
| Duration               | ✅  | ENABLE_FUNCTION_TRACE | ENABLE_FUNCTION_TRACE |
| Min duration threshold | 0ms | 0ms                   | 10ms                  |

### Example Output (DEV)

```
08:15:23 DEBUG [user-service] [trace_id=abc123] Enter createUser()
08:15:23 DEBUG [user-service] [trace_id=abc123] Exit createUser() Duration=45ms
```

## Service Instrumentation

### Example: UserService

```typescript
import { createModuleLogger } from "./logger.enhanced";
import { Trace } from "./middleware/functionTracing";
import { getRequestContext } from "./middleware/correlationId";

class UserService {
	private logger = createModuleLogger("UserService");

	@Trace
	async createUser(userData: { email: string; name: string }) {
		const ctx = getRequestContext();

		// Log business event
		this.logger.info("user.created", {
			event: "user.created",
			email: userData.email,
			requestId: ctx?.requestId,
			userId: ctx?.userId,
		});

		// Business logic
		const user = await this.saveUser(userData);

		return user;
	}

	@Trace
	async getUserById(userId: string) {
		const ctx = getRequestContext();

		this.logger.debug("user.fetch.start", {
			event: "user.fetch.start",
			userId,
			requestId: ctx?.requestId,
		});

		try {
			const user = await this.database.findUser(userId);

			this.logger.info("user.fetch.success", {
				event: "user.fetch.success",
				userId,
				email: user?.email,
				requestId: ctx?.requestId,
			});

			return user;
		} catch (error) {
			this.logger.error("user.fetch.error", {
				event: "user.fetch.error",
				userId,
				error: error instanceof Error ? error.message : String(error),
				requestId: ctx?.requestId,
			});

			throw error;
		}
	}

	private async saveUser(userData: any) {
		// Implementation
	}
}
```

## Error Handling

### Automatic Error Capture

The framework automatically captures:

- ❌ Unhandled exceptions → `process.uncaughtException`
- ❌ Unhandled promise rejections → `process.unhandledRejection`
- ❌ Database errors
- ❌ HTTP 4xx/5xx responses
- ❌ External API failures

### Manual Error Logging

```typescript
import {
	logUnexpectedException,
	logHttpError,
	logDatabaseError,
	logExternalServiceError,
	logValidationError,
	logSecurityEvent,
} from "./helper/error-handling";

// Unexpected error
try {
	await someOperation();
} catch (error) {
	logUnexpectedException(error, {
		location: "SomeModule",
		action: "someOperation",
	});
}

// Database error
try {
	await db.query(sql);
} catch (error) {
	logDatabaseError(error, sql, [param1, param2]);
}

// HTTP error
try {
	const response = await fetch(url);
} catch (error) {
	logHttpError(500, "/api/endpoint", "GET", error);
}

// Validation error
logValidationError("email", "Invalid email format", userInput.email);

// Security event
logSecurityEvent("unauthorized_access", {
	attemptedResource: "/admin/users",
	reason: "insufficient_permissions",
});
```

### Express Error Handler

```typescript
import { errorHandlerMiddleware } from "./helper/error-handling";

app.use(errorHandlerMiddleware);
```

All unhandled errors are:

- ✅ Logged with full context
- ✅ Tagged with trace IDs
- ✅ Sent to Loki/Grafana
- ✅ Returned with appropriate HTTP status

## LGTM Stack Setup

### Docker Compose

Start the full LGTM stack:

```bash
docker-compose -f docker-compose.lgtm.yml up -d
```

Services:

- **Loki** (3100) - Log aggregation
- **Tempo** (3200) - Trace backend
- **Mimir** (9009) - Metrics backend
- **Prometheus** (9090) - Metrics scraper
- **Grafana** (3000) - Visualization
- **OpenTelemetry Collector** (4317/4318) - Data pipeline
- **Alertmanager** (9093) - Alert routing

### Health Checks

```bash
# Loki
curl http://localhost:3100/ready

# Tempo
curl http://localhost:3200/status

# Mimir
curl http://localhost:9009/status/ready

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3000/api/health
```

## Grafana Dashboards

### Available Dashboards

1. **API Health Dashboard** (uid: `api-health`)
    - Request volume and latency
    - Error rates by status code
    - In-flight requests
    - Endpoint performance

2. **Infrastructure Dashboard** (uid: `infrastructure`)
    - CPU, memory, disk usage
    - Network I/O
    - Disk I/O
    - System load

3. **Database Dashboard** (uid: `database`)
    - Query count and duration
    - Slow queries (>1s)
    - Connection pool usage
    - Transaction metrics

4. **Error Dashboard** (uid: `errors`)
    - Error rate by endpoint
    - HTTP 4xx vs 5xx
    - Top failing endpoints
    - Recent error logs

5. **Trace Dashboard** (uid: `traces`)
    - Slow requests (>1s)
    - Request waterfall
    - Service dependency map
    - Trace analysis

6. **Business Dashboard** (uid: `business`)
    - User registrations
    - Transactions completed
    - Orders created
    - LMS activity
    - Performance evaluations

### Default Credentials

- **URL:** http://localhost:3000
- **Username:** admin
- **Password:** admin

### Accessing Logs in Grafana

Query logs using Loki:

```
{job="hris-api"} | json | level="error"
```

Filter by trace ID:

```
{job="hris-api"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

### Accessing Traces in Grafana

1. Go to Tempo data source
2. Search by trace ID
3. View service map and waterfall diagram

## Metrics

### Application Metrics

Automatically collected:

- `hris_api_http_requests_total` - Total HTTP requests by method, route, status
- `hris_api_http_request_duration_seconds` - HTTP request duration histogram
- `hris_api_http_in_flight_requests` - Current in-flight requests

### Business Metrics (Custom)

Create custom metrics in your services:

```typescript
import { getMeter } from "./helper/telemetry.enhanced";

const meter = getMeter("business");

// Counter: increments by 1
const userCounter = meter.createCounter("users.created", {
	description: "Total users created",
});
userCounter.add(1, { department: "Engineering" });

// Histogram: tracks distribution
const processingTime = meter.createHistogram("payroll.processing_ms", {
	description: "Payroll processing duration",
});
processingTime.record(1234, { period: "monthly" });

// Gauge: point-in-time measurement
const activeConnections = meter.createUpDownCounter("db.connections.active", {
	description: "Active database connections",
});
activeConnections.add(1);
activeConnections.add(-1); // When connection closes
```

## Logging Standards

### Log Level Usage

- **ERROR** - System failures, exceptions, critical issues
- **WARN** - Warnings, potential problems, security events
- **INFO** - Business events, operational events, state changes
- **DEBUG** - Detailed information for debugging

### Event Naming Convention

Use dot-separated lowercase names:

- `user.created`
- `user.login.success`
- `auth.login.failure`
- `database.query.error`
- `payment.processed`

### Field Naming Convention

Use snake_case for field names:

```typescript
logger.info("order.created", {
	event: "order.created",
	order_id: "12345",
	customer_id: "67890",
	order_amount: 199.99,
	payment_method: "credit_card",
});
```

### Audit Logging

Log all security-sensitive events:

```typescript
logger.info("user.password.changed", {
	event: "user.password.changed",
	userId: user.id,
	timestamp: new Date().toISOString(),
	ipAddress: ctx?.ipAddress,
	userAgent: ctx?.userAgent,
});

logger.info("admin.action.executed", {
	event: "admin.action.executed",
	action: "user.role.updated",
	actorId: admin.id,
	targetId: user.id,
	newRole: "manager",
	timestamp: new Date().toISOString(),
});
```

## Tracing Standards

### Span Naming

- HTTP handlers: `http.method path` (e.g., `http.get /api/users`)
- Service methods: `service.method` (e.g., `user.create`)
- Database queries: `db.operation table` (e.g., `db.query users`)
- External calls: `external.service` (e.g., `external.payment_gateway`)

### Span Attributes

```typescript
span.setAttribute("http.method", "POST");
span.setAttribute("http.status_code", 200);
span.setAttribute("http.url", "/api/users");
span.setAttribute("db.operation", "INSERT");
span.setAttribute("db.statement", "INSERT INTO users...");
span.setAttribute("user.id", "12345");
```

## Troubleshooting

### OTel Collector Not Receiving Data

1. Check OTLP endpoint configuration

    ```bash
    echo $OTEL_EXPORTER_OTLP_ENDPOINT
    ```

2. Verify collector is running

    ```bash
    curl http://localhost:13133
    ```

3. Enable OTel debugging

    ```bash
    OTEL_DEBUG=true
    ```

4. Check logs
    ```bash
    docker logs otel-collector
    ```

### No Traces in Tempo

1. Verify Tempo is receiving data

    ```bash
    curl http://localhost:3200/status
    ```

2. Check OpenTelemetry Collector logs

    ```bash
    docker logs otel-collector
    ```

3. Ensure application is exporting traces
    ```bash
    OTEL_ENABLED=true
    ```

### High Memory Usage

Reduce sampling or adjust batch size:

```yaml
# otel-collector-config.yml
processors:
    batch:
        send_batch_size: 50 # Default: 100
        timeout: 5s # Default: 10s
```

## Performance Considerations

### Log Sampling

Reduce logs in production:

```bash
HTTP_METRICS_SAMPLE_RATE=0.1  # Sample 10% of HTTP metrics
```

### Trace Sampling

Sample traces to reduce storage:

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
```

### Retention Policies

Configure retention in LGTM:

- **Loki:** 30 days (configurable)
- **Tempo:** 30 days (configurable)
- **Mimir:** 30 days (configurable)

## Security

### Sensitive Data Redaction

The logger automatically redacts:

- Request bodies containing `password`, `token`, `secret`, `api_key`
- Authorization headers
- API keys in URLs

### HIPAA Compliance

Log PII carefully:

```typescript
// ❌ DON'T: Log full PII
logger.info("user.created", { email: user.email, ssn: user.ssn });

// ✅ DO: Log identifiers, not values
logger.info("user.created", { userId: user.id });
```

## Implementation Checklist

- [ ] Install dependencies (Winston, OpenTelemetry, LGTM)
- [ ] Set up Docker Compose LGTM stack
- [ ] Initialize enhanced telemetry in application
- [ ] Add correlation ID middleware to Express app
- [ ] Replace logger calls with getEnhancedLogger
- [ ] Add @Trace decorators to service methods
- [ ] Set up error handlers (setupGlobalErrorHandlers)
- [ ] Configure logging policies per environment
- [ ] Import Grafana dashboards
- [ ] Configure alert rules
- [ ] Test in DEV environment
- [ ] Test ENABLE_FUNCTION_TRACE=true in UAT
- [ ] Deploy to production
- [ ] Monitor dashboards

## Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [Mimir Documentation](https://grafana.com/docs/mimir/latest/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
