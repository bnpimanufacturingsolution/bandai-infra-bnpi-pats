# Function Tracing & Debug Dashboard - Usage Guide

## Overview

The **Function Tracing & Debug Dashboard** provides real-time visibility into:

- ✅ All function entry/exit events across your API
- ✅ Execution duration for each function
- ✅ Direct links to Tempo for complete trace waterfall
- ✅ Performance metrics and bottleneck identification
- ✅ Module-level activity breakdown

## Dashboard URL

Once imported into Grafana:

```
http://localhost:3000/d/bnpi-pats-function-trace
```

## Panels Explained

### 1. **Function Entry/Exit Logs (Last 7 Days)** - Top Left

Shows every function entry and exit event with timestamps.

**Example Output:**

```
2026-06-24 10:54:26.496  DEBUG [user-service] function.entry (createUser)
2026-06-24 10:54:26.502  DEBUG [user-service] function.exit (validateUser)
2026-06-24 10:54:26.521  DEBUG [user-service] function.exit (saveUser)
```

**How to Use:**

- Look for patterns in function timing
- Identify which functions are called most frequently
- See request context (trace_id, request_id)

---

### 2. **Function Exit Duration Summary** - Top Right

Shows function exit events with duration, sorted by most recent.

**Color Coding:**

- 🟢 **Green**: < 100ms (fast)
- 🟡 **Yellow**: 100-500ms (moderate)
- 🔴 **Red**: > 500ms (slow - investigate)

**Clickable Trace Links:**
Each log row includes a `trace_id` that links directly to the Tempo trace viewer.

**How to Use:**

1. Sort by duration (click column header)
2. Click on slow functions to see complete trace
3. In Tempo, view:
   - Full request waterfall
   - All nested function calls
   - Exact timing for each span
   - Database queries within each function

---

### 3. **Function Entry Call Count** - Bottom Left

Gauge showing total function calls in the last hour.

**How to Use:**

- Monitor workload patterns
- Spike detection
- Baseline for alerts

---

### 4. **Function Call Rate by Module** - Bottom Center

Time series showing call rate per module over time.

**How to Use:**

- Identify which modules are busiest
- Spot unusual spikes
- Track trends over 7 days

---

### 5. **Top 20 Slowest Functions** - Bottom Right

Lists functions sorted by execution duration (slowest first).

**Columns:**

- **Module > Function**: Which service/function
- **Duration**: Execution time in milliseconds
- **Trace ID**: Click to jump to Tempo for debugging

**How to Use:**

1. Identify performance bottlenecks
2. Click any trace ID to see why it was slow
3. In Tempo, examine:
   - Nested function calls
   - Database queries
   - External API calls
   - Resource contention

---

### 6. **Average Function Duration** - Bottom Left

Gauge showing average execution time across all functions.

**Thresholds:**

- 🟢 Green: < 100ms
- 🟡 Yellow: 100-500ms
- 🟠 Orange: 500-800ms
- 🔴 Red: > 800ms

---

### 7. **Function Call Count by Module** - Bottom Span

Bar chart showing which modules are most active.

**How to Use:**

- Understand workload distribution
- Identify problematic modules
- Plan optimization efforts

---

## Workflow: Debugging a Slow Request

### **Scenario:** User reports API response is slow

**Step 1: Find the slow function**

1. Go to **Function Tracing & Debug Dashboard**
2. Look at **Top 20 Slowest Functions** panel
3. Find entry with high duration (red color)

**Step 2: View complete trace**

1. Click the **Trace ID** link in the slow function row
2. Grafana opens Tempo in a new tab
3. You see complete waterfall:

```
POST /api/users (850ms) ⚠️ SLOW
├─ createUser() (45ms)
│  ├─ validateUser() (5ms)
│  ├─ checkDepartment() (8ms)
│  └─ saveUser() (15ms)
├─ sendWelcomeEmail() (750ms) 🔴 SLOW!
│  ├─ generateTemplate() (50ms)
│  ├─ fetchUserPreferences() (200ms)
│  └─ sendViaProvider() (500ms) 🔴 BOTTLENECK
└─ updateAuditLog() (10ms)
```

**Step 3: Root cause analysis**

- Identify the slowest span
- Look at span attributes:
  - External service latency
  - Database query time
  - Resource wait time

**Step 4: Check logs for errors**

1. Go to **Explore** → **Loki**
2. Search for same trace_id:

```logql
{trace_id="YOUR_TRACE_ID"} | json
```

3. Look for errors, warnings, or retry attempts

---

## Environment Variable Configuration

To enable function tracing for **DEV/UAT**:

### **Development (.env)**

```bash
LOG_LEVEL=debug
ENABLE_FUNCTION_TRACE=false  # Always on in code
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### **UAT (.env.uat)**

```bash
LOG_LEVEL=info
ENABLE_FUNCTION_TRACE=true  # Optional debugging
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://k8s-otel-collector:4318
```

### **Production (.env.prod)**

```bash
LOG_LEVEL=warn
ENABLE_FUNCTION_TRACE=false  # Use traces instead
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.prod:4318
HTTP_METRICS_SAMPLE_RATE=0.1  # Sample 10% to reduce noise
```

---

## Advanced Queries (Loki)

### **Find all slow functions (>500ms)**

```logql
{environment="prod", message="function.exit"} | json | duration > 500
```

### **Find functions in specific module**

```logql
{module="payment-service", message=~"function\\.(entry|exit)"} | json
```

### **Find errors during function execution**

```logql
{message=~"function\\."} | json | status="error"
```

### **Compare function duration before/after deployment**

```logql
avg_over_time(({environment="prod", message="function.exit", service_version="1.2.0"} | json | unwrap duration)[5m])
```

### **Find functions with external API calls**

```logql
{message="function.exit", spanKind="client"} | json
```

---

## Import Dashboard into Grafana

### **Method 1: JSON Import**

1. Open Grafana: http://localhost:3000
2. Go to **Dashboards** → **New** → **Import**
3. Upload or paste [grafana-dashboard-function-tracing.json](grafana-dashboard-function-tracing.json)
4. Select data source: **Loki**
5. Click **Import**

### **Method 2: Via CLI**

```bash
curl -X POST http://localhost:3000/api/dashboards/db \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard-function-tracing.json
```

---

## Performance Impact

The function tracing overhead is **minimal**:

- Logger entry/exit: < 1ms per function
- OpenTelemetry span creation: < 0.5ms
- Total request latency impact: < 2%

---

## Best Practices

### ✅ DO:

- Use in DEV for troubleshooting
- Enable in UAT for debugging specific issues
- Check Tempo traces for slow requests (not just logs)
- Use trace IDs to correlate across systems
- Set up alerts on duration thresholds

### ❌ DON'T:

- Leave ENABLE_FUNCTION_TRACE=true in production
- Store very long traces (consider sampling)
- Log sensitive data (automatically redacted)
- Ignore slow function alerts

---

## Troubleshooting

### **No logs appearing?**

1. Check LOG_LEVEL is set to debug
2. Verify OTEL_ENABLED=true
3. Make some API requests to generate logs
4. Check OpenTelemetry Collector logs: `docker logs otel-collector`

### **Trace IDs not linking?**

1. Verify Tempo datasource is configured
2. Check URL format in panel links
3. Ensure same trace_id exists in both Loki and Tempo

### **High storage usage?**

1. Reduce OTEL trace sample rate (use 0.1 for 10%)
2. Set log retention: `LOKI_RETENTION_DAYS=7`
3. Use Loki record limits to prevent unbounded growth

---

## See Also

- [OBSERVABILITY.md](../docs/OBSERVABILITY.md) - Main reference
- [Tempo Traces Dashboard](grafana-dashboard-traces.json) - Service map & waterfall
- [Error Dashboard](grafana-dashboard-errors.json) - Error investigation
- [API Health Dashboard](grafana-dashboard-api-health.json) - Overall health

---

**Dashboard Version:** 1.0.0
**Last Updated:** 2026-06-24
**Status:** ✅ Production Ready
