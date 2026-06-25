# How to Import the Function Tracing Dashboard

## Quick Import Guide

### **Step 1: Open Grafana**

```
http://localhost:3000
Username: admin
Password: admin
```

### **Step 2: Import Dashboard**

**Option A - Via File Upload:**

1. Click **Dashboards** (left sidebar)
2. Click **New** → **Import**
3. Click **Upload JSON file**
4. Select: `appliance/observability/grafana-dashboard-function-tracing.json`
5. Click **Load**
6. Select data source: **Loki**
7. Click **Import**

**Option B - Via Grafana UI:**

1. Click **Dashboards** → **New** → **Import**
2. Paste JSON content from `grafana-dashboard-function-tracing.json`
3. Click **Load**
4. Select data source: **Loki**
5. Click **Import**

**Option C - Via Docker:**

```bash
# Copy dashboard file to Grafana provisioning folder
cp appliance/observability/grafana-dashboard-function-tracing.json \
   appliance/volumes/grafana/provisioning/dashboards/

# Restart Grafana
docker-compose -f appliance/docker-compose.lgtm.yml restart grafana
```

---

## What You'll See

### **Real-time Function Monitoring:**

```
Top 20 Slowest Functions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
user-service > saveUser()        | 450ms   | 🟡 YELLOW
email-service > sendViaProvider()| 750ms   | 🔴 RED
payment-service > processPayment()| 1250ms | 🔴 RED
auth-service > validateToken()   | 25ms    | 🟢 GREEN
```

### **Click any trace ID → See Complete Waterfall in Tempo**

```
HTTP POST /api/users (850ms)
├─ createUser() (45ms)
├─ validateUser() (5ms)
└─ sendWelcomeEmail() (750ms) ← Click to expand
   ├─ generateTemplate() (50ms)
   ├─ fetchUserPreferences() (200ms)
   └─ sendViaProvider() (500ms) ← BOTTLENECK HERE
```

---

## Dashboard Panels

1. **Function Entry/Exit Logs** - Real-time function calls
2. **Function Exit Duration Summary** - Clickable trace links
3. **Function Entry Call Count** - Workload gauge
4. **Function Call Rate by Module** - Activity over time
5. **Top 20 Slowest Functions** - Performance bottlenecks
6. **Average Function Duration** - Health gauge
7. **Function Call Count by Module** - Distribution chart

---

## Environment Setup

### **Enable Function Tracing**

**For Development:**

```bash
# .env.local
LOG_LEVEL=debug
ENABLE_FUNCTION_TRACE=false  # Always on in DEV code
```

**For UAT (when debugging):**

```bash
# .env.uat
LOG_LEVEL=info
ENABLE_FUNCTION_TRACE=true  # Activate entry/exit logging
```

**For Production:**

```bash
# .env.prod
LOG_LEVEL=warn
ENABLE_FUNCTION_TRACE=false  # Use traces instead
```

---

## Common Workflows

### **Find Slow API Endpoint**

1. Open Function Tracing Dashboard
2. Look at **Top 20 Slowest Functions** panel (red colored rows)
3. Click **Trace ID** link
4. In Tempo, see complete waterfall with all nested calls
5. Identify exact bottleneck

### **Debug Function Flow in UAT**

1. Set `ENABLE_FUNCTION_TRACE=true` in UAT environment
2. Make API request
3. Go to Function Tracing Dashboard
4. Search logs for your request `correlationId`
5. See full entry/exit sequence
6. Identify where time is spent

### **Monitor Real-time Activity**

1. Open Function Tracing Dashboard
2. Watch **Function Call Rate by Module** chart
3. See which services are most active
4. Click module in legend to filter down

---

## Next Steps

✅ Import dashboard into Grafana
✅ Make some API requests to generate logs
✅ Refresh dashboard (10 second auto-refresh)
✅ Click on slowest function trace ID
✅ View complete waterfall in Tempo

For detailed usage, see:

- [Function Tracing Dashboard Guide](FUNCTION_TRACING_DASHBOARD_GUIDE.md)
- [Main Observability Documentation](../docs/OBSERVABILITY.md)
- [Observability Setup Guide](../docs/OBSERVABILITY_SETUP.md)
