# Where to See Debug Logs in Grafana

## 🔍 **Option 1: Function Tracing & Debug Dashboard** (RECOMMENDED)

This is the easiest way to see function entry/exit logs with performance metrics.

### **Access:**

```
http://localhost:53001  (DEV)
or
http://localhost:53002  (UAT)

→ Dashboards
→ BNPI PATS Observability folder
→ Function Tracing & Debug
```

### **What You'll See:**

**Panel 1: Function Entry/Exit Logs** (Top Left)

```
[timestamp] [level] [module] [message] (functionName)

Examples:
2026-06-24 10:54:26.496  DEBUG  [user-service]  function.entry  (createUser)
2026-06-24 10:54:26.502  DEBUG  [user-service]  function.exit  (validateUser)
2026-06-24 10:54:26.521  DEBUG  [user-service]  function.exit  (saveUser)
```

**Panel 2: Function Exit Duration Summary** (Top Right)

```
Shows SAME logs as Panel 1 but sortable by:
- Module > Function name
- Duration (with color coding)
- Trace ID (CLICKABLE - jumps to Tempo!)
```

**Panel 3: Function Entry Call Count** (Bottom Left)

```
Gauge showing total function calls in last hour
```

**Panel 4: Function Call Rate by Module** (Center)

```
Time series chart showing which modules are most active
```

**Panel 5: Top 20 Slowest Functions** (Right Side)

```
Functions sorted by duration, slowest first
Format: module > function_name | duration_ms | trace_id
```

---

## 🔎 **Option 2: Explore → Loki** (ADVANCED)

Direct log search without a dashboard.

### **Access:**

```
http://localhost:53001
→ Explore (left sidebar)
→ Select "Loki" datasource
→ Click "Code" tab
```

### **Search Queries:**

**Find all debug logs:**

```logql
{level="debug"}
```

**Find logs from specific module:**

```logql
{module="user-service"}
```

**Find function entry/exit logs:**

```logql
{message=~"function\\.(entry|exit)"}
```

**Find slow functions (>100ms):**

```logql
{level="debug", message="function.exit"} | json | duration > 100
```

**Find logs from specific request:**

```logql
{trace_id="YOUR_TRACE_ID_HERE"} | json
```

**Find errors:**

```logql
{level=~"error|warn"}
```

**Search by correlation ID:**

```logql
{correlation_id="CORRELATION_ID_HERE"}
```

---

## 📊 **Option 3: Error Dashboard** (For Error Logs)

If you want to see error-level logs specifically:

### **Access:**

```
http://localhost:53001
→ Dashboards
→ BNPI PATS Observability
→ Errors Dashboard
```

**Shows:**

- Error rate by endpoint
- Error distribution by type
- Recent error logs with stack traces

---

## 🔗 **Option 4: Traces Dashboard + Tempo**

For tracing function flow through services:

### **Access:**

```
http://localhost:53001
→ Dashboards
→ BNPI PATS Observability
→ Traces Dashboard
```

**What you get:**

- Complete service dependency map
- Waterfall view of all function calls
- Exact timing for each function
- Links to jump to specific functions

**Example:**

```
POST /api/users (850ms)
├─ createUser() (45ms)
│  ├─ validateUser() (5ms)
│  └─ saveUser() (40ms)
└─ sendWelcomeEmail() (750ms) ← Click to see logs in Loki
```

---

## 💡 **Quick Comparison**

| Feature             | Dashboard | Explore Loki | Error Dashboard  | Traces       |
| ------------------- | --------- | ------------ | ---------------- | ------------ |
| See logs            | ✅ Yes    | ✅ Yes       | ✅ Yes           | ✅ Via links |
| Filter/Search       | Limited   | ✅ Powerful  | Limited          | Limited      |
| Performance metrics | ✅ Yes    | No           | ✅ Yes           | ✅ Yes       |
| Function entry/exit | ✅ Yes    | ✅ Yes       | No               | ✅ Yes       |
| Error tracking      | Limited   | ✅ Yes       | ✅ Yes           | ✅ Yes       |
| Trace correlation   | ✅ Yes    | ✅ Yes       | ✅ Yes           | ✅ Yes       |
| Best for            | Overview  | Deep search  | Debugging errors | Performance  |

---

## 🚀 **Quick Start: See Logs in 2 Minutes**

### **Step 1: Enable Debug Logging**

Edit your `.env.local` or `.env.dev`:

```bash
LOG_LEVEL=debug
ENABLE_FUNCTION_TRACE=true
OTEL_ENABLED=true
```

### **Step 2: Restart API**

```bash
docker-compose restart bnpi-pats-api-dev
```

### **Step 3: Make a Request**

```bash
curl -X GET http://localhost:3101/api/health
```

### **Step 4: View in Grafana**

```
http://localhost:53001/d/bnpi-pats-function-trace
```

**Wait 10 seconds** for logs to appear (auto-refresh), then you should see:

- Function entry logs
- Function exit logs with duration
- Execution timings

---

## 📝 **Log Format Example**

When you enable function tracing, logs look like:

```
{
  "timestamp": "2026-06-24T10:54:26.496Z",
  "level": "debug",
  "message": "function.entry",
  "functionName": "createUser",
  "module": "user-service",
  "traceId": "7e4a2b5f8c9d3e1a",
  "spanId": "9c5b3d8e2f4a1c7e",
  "requestId": "req_001",
  "correlationId": "corr_001",
  "userId": "user_123",
  "environment": "dev",
  "hostname": "my-laptop"
}

{
  "timestamp": "2026-06-24T10:54:26.521Z",
  "level": "debug",
  "message": "function.exit",
  "functionName": "createUser",
  "module": "user-service",
  "duration": 45,
  "traceId": "7e4a2b5f8c9d3e1a",
  "spanId": "9c5b3d8e2f4a1c7e"
}
```

---

## 🔧 **Troubleshooting: No Logs Appearing?**

### **Check 1: Verify logging is enabled**

```bash
echo $LOG_LEVEL  # Should be "debug"
echo $ENABLE_FUNCTION_TRACE  # Should be "true"
```

### **Check 2: Restart API with new env vars**

```bash
docker-compose down
docker-compose up -d bnpi-pats-api-dev
```

### **Check 3: Make a request**

```bash
curl http://localhost:3101/api/health
```

### **Check 4: Check OpenTelemetry Collector**

```bash
docker logs otel-collector | grep -i error
```

### **Check 5: Verify Loki is receiving logs**

```bash
curl -s http://localhost:3100/api/v1/labels | head -20
```

---

## 🎯 **Best Practices**

### **Development Environment**

- ✅ Keep `ENABLE_FUNCTION_TRACE=true`
- ✅ Set `LOG_LEVEL=debug`
- ✅ Watch dashboard in real-time
- ✅ Click trace IDs to see full flow

### **UAT Environment**

- ✅ Set `ENABLE_FUNCTION_TRACE=true` only when debugging
- ✅ Use `LOG_LEVEL=info` normally
- ✅ Check Errors Dashboard first
- ✅ Then drill down to Function Tracing for deep analysis

### **Production Environment**

- ❌ Do NOT set `ENABLE_FUNCTION_TRACE=true`
- ✅ Keep `LOG_LEVEL=warn`
- ✅ Use Traces Dashboard and Error Dashboard
- ✅ Avoid function entry/exit logs (too noisy)

---

## 📚 **See Also**

- [Function Tracing Dashboard Guide](FUNCTION_TRACING_DASHBOARD_GUIDE.md) - Detailed panel breakdown
- [Main Observability Guide](../docs/OBSERVABILITY.md) - Complete reference
- [LGTM Stack Documentation](../docs/OBSERVABILITY_SETUP.md) - Architecture details
