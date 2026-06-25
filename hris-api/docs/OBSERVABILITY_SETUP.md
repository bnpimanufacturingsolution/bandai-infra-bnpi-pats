# Observability Framework Integration Guide

## Quick Start

### 1. Install Dependencies

Add to `package.json`:

```json
{
	"dependencies": {
		"winston": "^3.11.0",
		"@logtail/node": "^0.3.0",
		"@logtail/winston": "^0.3.0",
		"@opentelemetry/api": "^1.8.0",
		"@opentelemetry/sdk-node": "^0.50.0",
		"@opentelemetry/auto-instrumentations-node": "^0.43.0",
		"@opentelemetry/exporter-trace-otlp-http": "^0.50.0",
		"@opentelemetry/exporter-metrics-otlp-http": "^0.50.0",
		"@opentelemetry/sdk-metrics": "^0.50.0",
		"@opentelemetry/sdk-trace-node": "^0.50.0",
		"@opentelemetry/instrumentation-http": "^0.50.0",
		"@opentelemetry/instrumentation-express": "^0.32.0",
		"@opentelemetry/instrumentation-prisma": "^0.36.0",
		"@opentelemetry/resources": "^1.22.0",
		"@opentelemetry/semantic-conventions": "^1.22.0",
		"uuid": "^9.0.1"
	}
}
```

Install:

```bash
npm install
```

### 2. Start LGTM Stack

```bash
cd appliance
docker-compose -f docker-compose.lgtm.yml up -d
```

Verify all services are running:

```bash
docker ps | grep -E 'loki|tempo|mimir|prometheus|grafana|otel-collector|alertmanager'
```

### 3. Configure Application

Update your `index.ts` (or entry point):

```typescript
import "./helper/telemetry-autostart"; // Existing
import {
	initializeEnhancedTelemetry,
	shutdownEnhancedTelemetry,
} from "./helper/telemetry.enhanced";
import { getEnhancedLogger, createModuleLogger } from "./helper/logger.enhanced";
import { correlationIdMiddleware, attachContextMiddleware } from "./middleware/correlationId";
import { setupGlobalErrorHandlers, errorHandlerMiddleware } from "./helper/error-handling";
import express from "express";

// Initialize telemetry
await initializeEnhancedTelemetry();

// Setup error handlers
setupGlobalErrorHandlers();

const app = express();
const logger = getEnhancedLogger();

// Add correlation ID middleware early
app.use(correlationIdMiddleware);
app.use(attachContextMiddleware);

// ... other middleware ...

// Error handler (at the end)
app.use(errorHandlerMiddleware);

// Graceful shutdown
process.on("SIGTERM", async () => {
	logger.info("shutdown.initiated", { event: "shutdown.initiated" });
	await shutdownEnhancedTelemetry();
	process.exit(0);
});
```

### 4. Update Existing Logger Calls

Replace:

```typescript
import { getLogger } from "./helper/logger.helper";
const logger = getLogger();
```

With:

```typescript
import { getEnhancedLogger } from "./helper/logger.enhanced";
const logger = getEnhancedLogger();

// Or for module-specific logging:
import { createModuleLogger } from "./helper/logger.enhanced";
const logger = createModuleLogger("UserService");
```

### 5. Add Function Tracing

Add `@Trace` decorator to service methods:

```typescript
import { Trace } from "./middleware/functionTracing";

class UserService {
	@Trace
	async createUser(userData: any) {
		// Implementation
	}

	@Trace
	async getUserById(id: string) {
		// Implementation
	}
}
```

### 6. Environment Variables

Create `.env` or update existing:

**Development (.env.dev):**

```bash
NODE_ENV=development
LOG_LEVEL=debug
OTEL_ENABLED=true
OTEL_SERVICE_NAME=hris-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_DEBUG=false
ENABLE_FUNCTION_TRACE=false
HTTP_METRICS_SAMPLE_RATE=1
```

**UAT (.env.uat):**

```bash
NODE_ENV=uat
LOG_LEVEL=info
OTEL_ENABLED=true
OTEL_SERVICE_NAME=hris-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_DEBUG=false
ENABLE_FUNCTION_TRACE=false  # Can be enabled for debugging
HTTP_METRICS_SAMPLE_RATE=1
```

**Production (.env.prod):**

```bash
NODE_ENV=production
LOG_LEVEL=warn
OTEL_ENABLED=true
OTEL_SERVICE_NAME=hris-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_DEBUG=false
ENABLE_FUNCTION_TRACE=false
HTTP_METRICS_SAMPLE_RATE=0.1  # Sample 10% of metrics
```

### 7. Access Grafana

1. Open http://localhost:3000
2. Login with admin / admin
3. Import dashboards (if not auto-provisioned):
    - API Health Dashboard
    - Infrastructure Dashboard
    - Database Dashboard
    - Error Dashboard
    - Trace Dashboard
    - Business Dashboard

## File Structure

### New Files Created

```
hris-api/
├── helper/
│   ├── logger.enhanced.ts              # Enhanced Winston logger
│   ├── telemetry.enhanced.ts           # Enhanced OpenTelemetry setup
│   └── error-handling.ts               # Error capture and logging
├── middleware/
│   ├── correlationId.ts                # Correlation ID & context
│   └── functionTracing.ts              # Function entry/exit logging
├── lib/
│   └── instrumentation.examples.ts     # Service instrumentation examples
└── docs/
    └── OBSERVABILITY.md                # Comprehensive documentation

appliance/
├── observability/
│   ├── otel-collector-config.yml       # OpenTelemetry Collector
│   ├── loki-config.yml                 # Loki configuration
│   ├── tempo-config.yml                # Tempo configuration
│   ├── mimir-config.yml                # Mimir configuration
│   ├── prometheus-config.yml           # Prometheus configuration
│   ├── alertmanager-config.yml         # Alert routing
│   ├── grafana-datasources.yml         # Grafana data sources
│   ├── grafana-dashboard-*.json        # Grafana dashboards (6 total)
│   └── docker-compose.lgtm.yml         # LGTM stack
```

### Modified Files

- `index.ts` - Add telemetry initialization and error handlers
- `package.json` - Add new dependencies

## Testing the Setup

### 1. Test Logger

```typescript
import { getEnhancedLogger } from "./helper/logger.enhanced";

const logger = getEnhancedLogger();

logger.info("test.info", { event: "test.info", message: "This is a test" });
logger.warn("test.warn", { event: "test.warn", message: "This is a warning" });
logger.error("test.error", { event: "test.error", message: "This is an error" });
```

Check Grafana Loki: http://localhost:3000 → Explore → Loki → Query: `{job="hris-api"}`

### 2. Test OpenTelemetry

```bash
curl http://localhost:3200/status
```

Should return 200 OK.

### 3. Test Metrics

```bash
curl http://localhost:9090/api/v1/targets
```

Should show Prometheus scrape targets.

### 4. Test End-to-End

1. Make API request: `curl http://localhost:3000/api/users`
2. Check Grafana dashboards:
    - Metrics: http://localhost:3000 → API Health Dashboard
    - Logs: http://localhost:3000 → Explore → Loki
    - Traces: http://localhost:3000 → Explore → Tempo

## Troubleshooting

### OTel Collector Not Starting

```bash
docker logs otel-collector
```

Common issues:

- Port 4317/4318 already in use
- Configuration file syntax error
- Network connectivity issues

### Logs Not Appearing in Loki

1. Verify application is running: `docker logs hris-api`
2. Check OTel Collector: `docker logs otel-collector`
3. Verify Loki is receiving data:
    ```bash
    docker exec loki curl -s http://localhost:3100/loki/api/v1/query --get -d 'query={job="hris-api"}'
    ```

### Traces Not Appearing in Tempo

1. Ensure `OTEL_ENABLED=true`
2. Check telemetry initialization: `OTEL_DEBUG=true`
3. Verify Tempo is receiving traces:
    ```bash
    docker logs tempo | grep "received"
    ```

### Memory Issues with LGTM Stack

Adjust container limits in `docker-compose.lgtm.yml`:

```yaml
services:
    tempo:
        # ... existing config ...
        deploy:
            resources:
                limits:
                    memory: 512M
                reservations:
                    memory: 256M
```

## Production Deployment

### Kubernetes Deployment

1. Create ConfigMaps for collector config:

    ```bash
    kubectl create configmap otel-collector-config --from-file=observability/otel-collector-config.yml
    ```

2. Deploy LGTM stack in separate namespace:

    ```bash
    kubectl apply -f gitops/base/observability/
    ```

3. Configure OTEL_EXPORTER_OTLP_ENDPOINT to point to Kubernetes service:
    ```bash
    OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.observability:4318
    ```

### Managed Services

Consider using managed observability services:

- **Google Cloud:** Cloud Trace, Cloud Logging, Cloud Monitoring
- **AWS:** X-Ray, CloudWatch
- **Azure:** Application Insights, Monitor

## Metrics and Alerting

### Create Alert Rule

In Prometheus:

```yaml
groups:
    - name: api_alerts
      rules:
          - alert: HighErrorRate
            expr: sum(rate(hris_api_http_requests_total{status_code=~"5.."}[5m])) > 0.05
            for: 5m
            annotations:
                summary: "High error rate detected"
                description: "Error rate is {{ $value }}"
```

### Send Alerts to Slack

Update `alertmanager-config.yml`:

```yaml
global:
    slack_api_url: ${SLACK_WEBHOOK_URL}

receivers:
    - name: slack
      slack_configs:
          - channel: "#alerts"
```

## Performance Optimization

### 1. Reduce Log Volume

```bash
LOG_LEVEL=warn              # Only warn and error in production
HTTP_METRICS_SAMPLE_RATE=0.1  # Sample 10% of metrics
```

### 2. Enable Trace Sampling

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
```

### 3. Batch Processing

OpenTelemetry Collector batch settings in `otel-collector-config.yml`:

```yaml
processors:
    batch:
        send_batch_size: 50
        timeout: 5s
```

## Next Steps

1. ✅ Install dependencies
2. ✅ Start LGTM stack
3. ✅ Integrate observability into application
4. ✅ Test in development environment
5. ✅ Deploy to UAT
6. ✅ Configure production alerts
7. ✅ Deploy to production
8. ✅ Monitor Grafana dashboards
9. ✅ Set up on-call alerts
10. ✅ Document custom dashboards

## Support and Documentation

- Full documentation: [hris-api/docs/OBSERVABILITY.md](./OBSERVABILITY.md)
- Examples: [hris-api/lib/instrumentation.examples.ts](./instrumentation.examples.ts)
- Error handling: [hris-api/helper/error-handling.ts](./error-handling.ts)
- OpenTelemetry docs: https://opentelemetry.io/docs/
