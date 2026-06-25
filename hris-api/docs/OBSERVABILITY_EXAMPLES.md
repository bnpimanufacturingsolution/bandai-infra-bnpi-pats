# Environment-Specific Observability Configuration

This document demonstrates how the observability framework behaves in different environments.

## Development Environment

**Configuration:**

```bash
NODE_ENV=development
LOG_LEVEL=debug
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
ENABLE_FUNCTION_TRACE=false
HTTP_METRICS_SAMPLE_RATE=1
```

**Behavior:**

### Console Output

```
08:15:23 DEBUG [user-service] [trace_id=abc123 span_id=xyz789 req_id=req_001] Enter createUser()
08:15:23 DEBUG [user-service] [trace_id=abc123 span_id=xyz789] Validating request
08:15:24 DEBUG [user-service] [trace_id=abc123 span_id=xyz789 user_id=123] Exit createUser() Duration=45ms
```

### Loki Logs

```
query: {job="hris-api"}

Results:
- timestamp: 2024-01-15T08:15:23Z, level: DEBUG, message: "Enter createUser()"
- timestamp: 2024-01-15T08:15:23Z, level: DEBUG, message: "Validating request"
- timestamp: 2024-01-15T08:15:24Z, level: DEBUG, message: "Exit createUser() Duration=45ms"
```

### Tempo Traces

```
Span: function.entry.createUser
├─ Attributes: function=createUser, duration_ms=45
└─ Status: OK

Child Span: database.insert
├─ Attributes: db.statement="INSERT INTO users..."
└─ Duration: 10ms
```

### Available Information

- ✅ Full function flow visible in logs and traces
- ✅ Execution timing for every method
- ✅ Debug statements and intermediate states
- ✅ Perfect for development and debugging

---

## UAT Environment

**Configuration:**

```bash
NODE_ENV=uat
LOG_LEVEL=info
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENABLE_FUNCTION_TRACE=false  # Default: no function logs
HTTP_METRICS_SAMPLE_RATE=1
```

### Scenario 1: Normal Operation

**Console Output:**

```
08:15:24 INFO [user-service] [trace_id=abc123 req_id=req_001 user_id=123] User login successful
08:15:25 INFO [user-service] [trace_id=abc123 req_id=req_001 user_id=123] User profile updated
```

### Scenario 2: Debugging Issue - Enable Function Trace

**Configuration Change:**

```bash
# QA team suspects issue with user creation, enables tracing
ENABLE_FUNCTION_TRACE=true
LOG_LEVEL=debug  # Optional, for extra detail
```

**Console Output:**

```
08:15:23 DEBUG [user-service] [trace_id=abc123] Enter createUser()
08:15:23 DEBUG [user-service] [trace_id=abc123] Validating email format
08:15:23 DEBUG [user-service] [trace_id=abc123] Checking email uniqueness
08:15:23 DEBUG [user-service] [trace_id=abc123] Saving to database
08:15:24 DEBUG [user-service] [trace_id=abc123 user_id=456] Exit createUser() Duration=45ms
08:15:24 INFO [user-service] [trace_id=abc123 user_id=456] User created successfully
```

**Loki Query:**

```
{job="hris-api", traceId="abc123"} | json | line_format "{{.timestamp}} {{.level}} {{.message}}"
```

**Results:**

```
2024-01-15T08:15:23Z DEBUG Enter createUser()
2024-01-15T08:15:23Z DEBUG Validating email format
2024-01-15T08:15:23Z DEBUG Checking email uniqueness
2024-01-15T08:15:23Z DEBUG Saving to database
2024-01-15T08:15:24Z DEBUG Exit createUser() Duration=45ms
2024-01-15T08:15:24Z INFO User created successfully
```

**Tempo Trace:**

```
HTTP POST /api/users (duration: 120ms)
├─ createUser() (duration: 45ms)
│  ├─ validateEmail() (duration: 5ms)
│  ├─ checkEmailUniqueness() (duration: 8ms, database query)
│  └─ database.insert.users (duration: 15ms)
└─ sendWelcomeEmail() (duration: 60ms, external API)
```

**Grafana Dashboard:**

- Request waterfall shows entire call stack
- Each function is a separate span
- External API call is clearly visible
- Total time: 120ms

### Available Information

- ✅ Business events logged
- ✅ Warnings and errors captured
- ✅ Temporary debugging available via ENABLE_FUNCTION_TRACE
- ✅ No function noise by default
- ✅ Full traces available for analysis

---

## Production Environment

**Configuration:**

```bash
NODE_ENV=production
LOG_LEVEL=warn
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENABLE_FUNCTION_TRACE=false
HTTP_METRICS_SAMPLE_RATE=0.1  # Sample 10% of metrics
```

### Scenario 1: Normal Operation

**Console Output:**

```
08:15:24 INFO [user-service] [trace_id=abc123 req_id=req_001 user_id=123] User login successful
08:15:25 INFO [user-service] [trace_id=abc123 req_id=req_001 user_id=123] User profile updated
08:15:26 INFO [payment-service] [trace_id=def456 req_id=req_002] Payment processed successfully
```

**NO Debug or Function Entry/Exit Logs**

- ✅ Clean logs with only business events
- ✅ Reduced storage and network overhead
- ✅ Full visibility via traces and metrics

### Scenario 2: Production Issue Investigation

**Error Occurs:**

```
08:30:15 ERROR [user-service] [trace_id=ghi789 req_id=req_003 user_id=789]
Database connection timeout after 30s
```

**Automatic Capture:**

1. Error logged with full context
2. Trace ID: ghi789 recorded
3. Stack trace captured
4. Attempt count included

**Investigation in Grafana:**

1. **Error Dashboard shows:**

    ```
    Error Rate: 0.5% (5 errors per 1000 requests)
    Top Failing Endpoint: POST /api/users
    Status: 500
    ```

2. **Enable Temporary Debugging:**

    ```bash
    LOG_LEVEL=debug
    ENABLE_FUNCTION_TRACE=true
    # Restart application or update via ConfigMap
    ```

3. **Capture Additional Detail:**

    ```
    08:30:15 DEBUG [user-service] Enter validateUser()
    08:30:15 DEBUG [user-service] Exit validateUser() Duration=2ms
    08:30:15 DEBUG [database-service] Enter executeQuery()
    08:30:15 DEBUG [database-service] Database connection timeout - retrying
    08:30:20 DEBUG [database-service] Database connection timeout - retry 2
    08:30:25 DEBUG [database-service] Database connection timeout - retry 3
    08:30:30 ERROR [database-service] Exit executeQuery() Duration=30000ms
    ```

4. **Trace Shows:**

    ```
    HTTP POST /api/users (duration: 30120ms)
    ├─ validateUser() (duration: 2ms) ✓
    ├─ checkDepartment() (duration: 4ms) ✓
    ├─ database.query.insert (duration: 30000ms, TIMEOUT) ✗
    │  └─ retry_1 (10s)
    │  └─ retry_2 (10s)
    │  └─ retry_3 (10s)
    └─ error: connection timeout
    ```

5. **Root Cause Identified:**
    - Database connection pool exhausted
    - No available connections
    - Too many long-running queries

**Disable Debugging:**

```bash
LOG_LEVEL=warn
ENABLE_FUNCTION_TRACE=false
# Restart application
```

### Available Information

- ✅ Zero function-level noise in normal operation
- ✅ Business events still visible
- ✅ Full traces available for any request
- ✅ Metrics show health trends
- ✅ Quick temporary debugging when needed
- ✅ Automatic recovery after debugging

---

## Comparison Table

| Aspect               | DEV       | UAT         | PROD                   |
| -------------------- | --------- | ----------- | ---------------------- |
| LOG_LEVEL            | debug     | info        | warn                   |
| Function Entry/Exit  | ✅ Always | ⚙️ Optional | ❌ Never               |
| Business Events      | ✅ Yes    | ✅ Yes      | ✅ Yes                 |
| Debug Statements     | ✅ Yes    | ⚙️ Optional | ❌ Unless Debugging    |
| Log Volume           | High      | Medium      | Low                    |
| Storage Cost         | High      | Medium      | Low                    |
| Debugging Capability | Easy      | Medium      | Manual Override Needed |
| Traces               | ✅ 100%   | ✅ 100%     | ✅ 10% Sampled         |

---

## Real-World Scenarios

### Scenario 1: Slow Payroll Processing

**Observation:**

- Grafana shows payroll processing taking 5 minutes instead of normal 1 minute

**Investigation:**

1. **Check Metrics:**
    - Error Dashboard: No errors
    - Database Dashboard: Query count normal
    - Latency increased

2. **View Trace in Grafana:**

    ```
    Query: traceId="abc123"

    Span: payroll.process (duration: 300000ms)
    ├─ fetchEmployees() (5ms) ✓
    ├─ calculatePayroll() × 500 iterations (290000ms) ⚠️
    │  └─ database.insert_batch (50ms each)
    │  └─ validations (10ms each)
    │  └─ external_api_call (external: 100ms each) ✗
    └─ notifyCompletion() (2000ms)
    ```

3. **Root Cause:**
    - External API (notification service) is slow: 100ms per employee
    - 500 employees × 100ms = 50 seconds of external calls
    - Solution: Batch notifications or call asynchronously

### Scenario 2: Memory Leak Detection

**Observation:**

- Memory usage continuously increasing

**Investigation:**

1. **Check Infrastructure Dashboard:**
    - Memory usage: 50% → 60% → 75% → 85% → 90%
    - Trend is upward over time

2. **Check Trace Sampling:**
    - Which spans are created most frequently?
    - Loki query: Count logs by function_name

3. **Result:**

    ```
    top_function_names:
    - database.query (5000/min) ✓ Normal
    - http.request (1000/min) ✓ Normal
    - user_session.track (500/min) ← Leaked connections
    ```

4. **Root Cause:**
    - User sessions not being closed properly
    - Connection pool not released

---

## Log Volume Estimation

### Development Environment

- ~100 debug logs per request
- 100 req/sec = 10,000 logs/sec
- Daily: ~864M logs

### UAT Environment (with ENABLE_FUNCTION_TRACE=false)

- ~5 info logs per request
- 100 req/sec = 500 logs/sec
- Daily: ~43M logs

### Production Environment

- ~2 info logs per request (business events)
- 1000 req/sec = 2,000 logs/sec
- Daily: ~172M logs
- With 10% metrics sampling: ~17M events/sec

**Storage Costs:**

- DEV: ~100GB/month (local only)
- UAT: ~5GB/month
- PROD: ~20GB/month

---

## Recommendations

### Development

- Use DEV configuration always
- Enable all traces and logs
- Iterate quickly with full visibility

### UAT

- Use UAT configuration
- ENABLE_FUNCTION_TRACE only when debugging specific issues
- Monitor and baseline performance
- Test alert rules

### Production

- Use PROD configuration
- Monitor via Grafana dashboards
- Set alerts for critical metrics
- Enable function trace only for incident investigation
- Always disable after investigation

### Ongoing Optimization

- Monthly review of:
    - Log volume trends
    - Trace sampling effectiveness
    - Storage costs
    - Performance impact
- Adjust sampling rates based on usage
- Archive old data according to retention policy
