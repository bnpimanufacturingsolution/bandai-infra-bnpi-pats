# Quick Verification Checklist

## ✅ Dashboard Now Visible

The **Function Tracing & Debug** dashboard should now appear automatically in your Grafana instances.

### Access Points:

**DEV:**

```
http://localhost:53001/dashboards
→ HRIS Observability folder
→ Function Tracing & Debug
```

**UAT:**

```
http://localhost:53002/dashboards
→ HRIS Observability folder
→ Function Tracing & Debug
```

---

## What You Should See

### Dashboard Panels (if you have function logs):

1. **Function Entry/Exit Logs** - Real-time log stream
2. **Function Exit Duration Summary** - With trace ID links
3. **Function Entry Call Count** - Gauge (0 if no functions traced)
4. **Function Call Rate by Module** - Time series graph
5. **Top 20 Slowest Functions** - Performance list
6. **Average Function Duration** - Performance gauge
7. **Function Call Count by Module** - Bar chart

---

## To Generate Test Data

Make an API request to trigger function logging:

```bash
# Test the API (generates logs if tracing is enabled)
curl -X GET http://localhost:3001/api/health
```

Then refresh the dashboard to see logs appear.

---

## Key Features

✅ **Auto-Provisioned** - Dashboards load automatically on container startup
✅ **Clickable Trace Links** - Click any trace ID to view full waterfall in Tempo
✅ **Real-Time Updates** - Auto-refreshes every 10 seconds
✅ **Color-Coded Performance** - Green (fast), Yellow (moderate), Red (slow)
✅ **No Manual Import Needed** - File-based provisioning

---

## If Dashboards Don't Show

**Step 1: Verify files are in place**

```bash
ls hris-api/infrastructure/onprem/observability/grafana/provisioning-dev/dashboards/
# Should show: grafana-dashboard-function-tracing.json + others
```

**Step 2: Check Grafana logs**

```bash
docker logs hris-grafana-dev | tail -50
```

**Step 3: Restart container**

```bash
docker-compose restart hris-grafana-dev
docker-compose restart hris-grafana-uat
```

**Step 4: Clear browser cache**

- Press Ctrl+Shift+R in browser
- Or Cmd+Shift+R on Mac

---

## Next: Generate Function Logs

To see the dashboard in action, you need function logs. Enable in your API:

**.env.local (Development)**

```bash
ENABLE_FUNCTION_TRACE=false  # Always on in DEV code
LOG_LEVEL=debug
OTEL_ENABLED=true
```

**.env.uat (UAT/Debugging)**

```bash
ENABLE_FUNCTION_TRACE=true  # Activate entry/exit
LOG_LEVEL=info
OTEL_ENABLED=true
```

**Then restart API and make requests** - logs will appear in dashboard within 10 seconds.

---

**All done! The dashboard is now auto-provisioned and ready to use.** 🎉
