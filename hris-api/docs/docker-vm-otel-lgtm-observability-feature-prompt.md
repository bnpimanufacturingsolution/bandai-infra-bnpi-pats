# Docker/VM OpenTelemetry And LGTM Observability Feature Prompt

Use this prompt to implement the HRIS on-prem Docker/VM observability system.

````text
You are working in `c:\uzaro\bandai-infra`.

Goal:
Implement a Docker/VM-safe HRIS observability system using OpenTelemetry plus an LGTM stack:
- Loki for logs
- Grafana for dashboards
- Tempo for traces
- Metrics through Prometheus, with Mimir optional only if long-term/high-cardinality metrics storage is explicitly needed later

The app runs in Docker on an on-prem VM. The implementation must improve the existing observability setup instead of replacing it blindly.

Important:
This is not application analytics and not business reporting. This feature is for operational observability: logs, metrics, traces, dashboards, alerts, and runbooks.
It must also support user accountability/audit visibility for the application: which authenticated user called which API, when, from where, and whether it succeeded. Keep this as an audit/activity trail, not as high-cardinality Prometheus labels.

Research notes to preserve:
- Grafana's single-image `grafana/otel-lgtm` is useful for development, demos, and testing, but it is not the production default for this VM setup.
- For on-prem production-style use, prefer separate persisted services under `hris-api/infrastructure/onprem/observability`, plus an OpenTelemetry Collector or Grafana Alloy as the telemetry gateway.
- Grafana recommends a Collector distribution, especially Grafana Alloy, for production observability pipelines because it can receive, process, redact, batch, retry, and route telemetry.
- OpenTelemetry OTLP endpoints should support:
  - gRPC on `4317`
  - HTTP/protobuf on `4318`
- OpenTelemetry Node.js instrumentation must start before application code when possible. This repo already has `hris-api/helper/telemetry.ts`; validate whether startup ordering is sufficient for Express/HTTP/Prisma instrumentation and fix it if needed.

Repo context:
- API: `hris-api`
- Frontend: `hris-app`
- Docker/VM compose: `appliance/docker-compose.yml`
- Environment compose: `appliance/docker-compose.environments.yml`
- Existing observability stack: `hris-api/infrastructure/onprem/observability`
- Existing API Prometheus middleware: `hris-api/middleware/observability.ts`
- Existing telemetry initializer: `hris-api/helper/telemetry.ts`
- Existing API entrypoint: `hris-api/index.ts`
- Existing cron worker: `hris-api/cron-entry.ts`
- Existing API logger helper: `hris-api/helper/logger.helper.ts`
- Existing monitoring doc: `hris-api/wiki-template/base/08-operations/monitoring.md`

Current baseline to account for:
- `hris-api/package.json` already includes OpenTelemetry packages.
- The API already exposes `/metrics` using `prom-client`.
- The API already has `ActivityLogging` and `AuditLogging` modules plus helpers in `hris-api/utils/activityLogger.ts` and `hris-api/utils/auditLogger.ts`.
- Existing activity/audit logging is not guaranteed to cover every route unless each controller calls the helper; implement or verify a universal coverage strategy.
- `hris-api/infrastructure/onprem/observability/docker-compose.yml` already includes Grafana, Prometheus, Alertmanager, Loki, Promtail, cAdvisor, node-exporter, blackbox-exporter, and backup helpers.
- The current stack does not yet provide full Tempo trace storage, OpenTelemetry Collector/Alloy routing, or trace/log/metric correlation as the required target state.

Target architecture:

Application containers:
- `hris-api-*`
- `hris-api-cron-*`
- `hris-app-*`
- `hris-postgres-*`

Observability containers:
- `grafana`
- `prometheus`
- `alertmanager`
- `loki`
- `tempo`
- `otel-collector` or `alloy`
- `promtail` or Alloy Docker log collection
- `node-exporter`
- `cadvisor`
- `blackbox-exporter`

Telemetry flow:
- API and cron emit OTLP traces to collector/alloy:
  - `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`
  - or `http://alloy:4318`
- API exposes Prometheus metrics at `/metrics`.
- Prometheus scrapes:
  - API `/metrics`
  - Grafana `/metrics`
  - Loki `/metrics`
  - Tempo `/metrics`
  - collector/alloy `/metrics`
  - cAdvisor
  - node-exporter
  - blackbox exporter
- Docker logs are shipped to Loki using Promtail or Alloy.
- Traces are routed to Tempo.
- Grafana provisions datasources for Prometheus, Loki, Tempo, and Alertmanager.
- Grafana dashboards must link metrics, logs, and traces using consistent labels:
  - `service.name`
  - `deployment.environment`
  - `container_name`
  - `compose_service`
  - `app_env`
  - `trace_id` where available

Required persistent host paths:

Use VM-mounted persistent storage. Do not store observability state only in container filesystems.

Recommended host layout:

```text
/srv/hris/observability/
  grafana/
  prometheus/
  loki/
  tempo/
  alertmanager/
  collector/
  backups/
```

Container mount patterns:
- Grafana data: `/var/lib/grafana`
- Prometheus data: `/prometheus`
- Loki data: `/loki`
- Tempo data: `/var/tempo`
- Alertmanager data: `/alertmanager`
- Observability backups: `/backups`

Environment variables:

```env
OBSERVABILITY_ENABLED=true
OBSERVABILITY_NETWORK=hris-observability

GRAFANA_HOST_PORT=53000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=
GRAFANA_ROOT_URL=http://localhost:53000

PROMETHEUS_HOST_PORT=9091
PROMETHEUS_RETENTION=30d

LOKI_HOST_PORT=3110
LOKI_RETENTION=30d

TEMPO_HOST_PORT=3200
TEMPO_OTLP_GRPC_HOST_PORT=4317
TEMPO_OTLP_HTTP_HOST_PORT=4318
TEMPO_RETENTION=168h

OTEL_COLLECTOR_GRPC_HOST_PORT=4317
OTEL_COLLECTOR_HTTP_HOST_PORT=4318
OTEL_COLLECTOR_METRICS_HOST_PORT=8889

OTEL_ENABLED=true
OTEL_SERVICE_NAME=hris-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev,service.namespace=hris
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_DEBUG=false

HTTP_METRICS_SAMPLE_RATE=1
LOG_HTTP_REQUESTS=false
LOG_LEVEL=info
```

Do not log secrets:
- Never log `GRAFANA_ADMIN_PASSWORD`.
- Never log database passwords from `PG_DATABASE_URL`, `DATABASE_URL`, `WRITE_DATABASE_URL`, or related variables.
- Never log bearer tokens, cookies, session IDs, or raw authorization headers.

Docker/VM requirements:
1. Observability data must survive container rebuilds/restarts.
2. Use named Docker volumes only for local development if host bind mounts are not available.
3. For VM/on-prem deployment, mount `/srv/hris/observability/*` into the observability containers.
4. The app, cron worker, and observability services must share a Docker network or otherwise be able to resolve collector/alloy by service name.
5. Do not expose internal ports publicly unless required.
6. Grafana, Prometheus, Alertmanager, Loki, Tempo, and collector ports should be firewall-restricted to admin networks on the VM.
7. Include health checks for observability services where practical.

Implementation requirements:

1. Extend existing observability compose
- Update `hris-api/infrastructure/onprem/observability/docker-compose.yml`.
- Add Tempo with persistent storage and config file.
- Add OpenTelemetry Collector or Grafana Alloy.
- Keep existing Grafana, Prometheus, Loki, Alertmanager, cAdvisor, node-exporter, blackbox-exporter unless there is a concrete reason to replace them.
- Prefer explicit version-pinned images.
- Add `.env.example` entries for every new configurable port/path/retention setting.

2. Collector/Alloy config
- Add config under:
  - `hris-api/infrastructure/onprem/observability/otel-collector/otel-collector.yml`
  - or `hris-api/infrastructure/onprem/observability/alloy/config.alloy`
- Receive OTLP traces, metrics, and logs over gRPC and HTTP.
- Batch telemetry before export.
- Add memory limiting if supported.
- Add resource attributes for environment/service namespace where missing.
- Export traces to Tempo.
- Export logs to Loki if using OTLP logs.
- Expose collector/alloy internal metrics for Prometheus scrape.
- Redact or drop sensitive attributes:
  - `authorization`
  - `cookie`
  - `set-cookie`
  - `password`
  - `token`
  - `secret`
  - full database URLs

3. Tempo config
- Add `hris-api/infrastructure/onprem/observability/tempo/tempo.yml`.
- Enable OTLP receivers through collector/alloy rather than sending app traffic directly to Tempo by default.
- Persist trace blocks to mounted storage.
- Configure retention.
- Expose metrics for Prometheus.

4. Grafana provisioning
- Update `hris-api/infrastructure/onprem/observability/grafana/provisioning/datasources/datasources.yml`.
- Add Tempo datasource.
- Configure trace-to-logs linking where possible:
  - use Loki labels such as `service_name`, `service`, `container_name`, `compose_service`, or `app_env`
  - include `trace_id` in structured logs where possible
- Configure logs-to-traces linking where possible using trace IDs.
- Keep Prometheus as default datasource.

5. Prometheus config and alerts
- Update `hris-api/infrastructure/onprem/observability/prometheus/prometheus.yml`.
- Scrape:
  - `hris-api` `/metrics`
  - `hris-api-cron` metrics if exposed
  - `otel-collector` or `alloy`
  - `tempo`
  - `loki`
  - `grafana`
  - `prometheus`
  - `alertmanager`
  - `cadvisor`
  - `node-exporter`
  - `blackbox-exporter`
- Update alert rules for:
  - API down
  - frontend down
  - cron worker down or no recent heartbeat if heartbeat metric is implemented
  - PostgreSQL down
  - elevated API 5xx rate
  - high p95/p99 API latency
  - high container memory/CPU
  - frequent container restarts
  - disk usage high on `/srv/hris`
  - Loki ingest/write failures
  - Tempo ingest/write failures
  - collector dropped spans/logs/metrics
  - no traces received for API after expected traffic

6. API OpenTelemetry hardening
- Review `hris-api/helper/telemetry.ts`.
- Ensure instrumentation starts before Express/HTTP/Prisma modules are initialized when possible.
- If needed, introduce an instrumentation preload file such as:
  - `hris-api/instrumentation.ts`
  - compiled to `dist/instrumentation.js`
  - loaded with `NODE_OPTIONS=--import ./dist/instrumentation.js` for Node 20+
- Preserve existing `initializeTelemetry()` behavior if it remains compatible.
- Keep `OTEL_ENABLED=false` as a clean opt-out.
- Use standard OpenTelemetry environment variables where possible:
  - `OTEL_SERVICE_NAME`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_PROTOCOL`
  - `OTEL_RESOURCE_ATTRIBUTES`
  - `OTEL_TRACES_SAMPLER`
  - `OTEL_TRACES_SAMPLER_ARG`
- Add resource attributes:
  - `service.name`
  - `service.namespace=hris`
  - `deployment.environment`
  - `service.version` from package version if available
  - `host.name` if available

7. Logging and trace correlation
- Review `hris-api/helper/logger.helper.ts`.
- Ensure structured logs include trace/span IDs when an active OpenTelemetry context exists.
- Do not break existing Winston/logging behavior.
- Ensure logs contain:
  - `event`
  - `module` where available
  - `level`
  - `timestamp`
  - `service.name`
  - `deployment.environment`
  - `trace_id` and `span_id` when available
- Do not log sensitive request bodies or credentials.
- Keep Docker stdout/stderr logs usable by Promtail/Loki.

8. Metrics improvements
- Keep existing `/metrics` endpoint in `hris-api/middleware/observability.ts`.
- Avoid high-cardinality labels:
  - no raw user IDs
  - no employee IDs
  - no request IDs
  - no raw URLs with IDs
  - no email addresses
- Preserve normalized route labels.
- Add focused business-operation health metrics only if low-cardinality:
  - backup success/failure timestamp if backup feature exists
  - cron last run timestamp
  - cron run duration
  - DB connectivity status
  - Redis connectivity status
- Do not duplicate every business report as Prometheus metrics.

9. User and API activity observability
- Implement reliable per-request activity visibility for authenticated API calls.
- This must answer:
  - Which user made the request?
  - Which employee/person is linked to that user, when available?
  - Which organization/tenant was in scope?
  - Which HTTP method and normalized API route was called?
  - Which concrete URL/path was called?
  - What status code was returned?
  - How long did the request take?
  - What IP/user-agent was used?
  - What trace ID/span ID links the record to Tempo and Loki?
  - Was the request successful, failed, unauthorized, or forbidden?
- Prefer a centralized Express middleware after authentication for request activity logging, with explicit exclusions for:
  - `/health`
  - `/metrics`
  - static assets
  - internal observability endpoints
  - high-volume polling endpoints if explicitly configured
- Keep controller-level `logAudit` for business/entity changes that need before/after state.
- Use request activity logging for every API call, and audit logging for sensitive mutations.
- Do not store raw passwords, authorization headers, cookies, reset tokens, uploaded file contents, or full request bodies.
- For request bodies, store only safe metadata when needed:
  - body field names
  - payload size
  - entity type
  - entity ID if safe and authorized
- Use a configurable allowlist for body fields if any body fields must be retained.
- Add environment controls:

```env
API_ACTIVITY_LOGGING_ENABLED=true
API_ACTIVITY_LOG_INCLUDE_READS=true
API_ACTIVITY_LOG_SAMPLE_RATE=1
API_ACTIVITY_LOG_EXCLUDED_PATHS=/health,/metrics
API_ACTIVITY_LOG_BODY_MODE=metadata
AUDIT_LOGGING_ENABLED=true
```

- Storage target:
  - Primary: database `ActivityLogging` and `AuditLogging` records for durable user accountability.
  - Secondary: structured application logs to stdout for Loki search.
  - Correlation: include `trace_id` and `span_id` in both database records and structured logs.
- Grafana/Loki dashboards may show user activity summaries, but avoid exposing sensitive PII by default.
- Prometheus metrics may aggregate user activity only with low-cardinality labels such as:
  - route
  - method
  - status class
  - module
  - organization count buckets if needed
- Prometheus metrics must not label by raw user ID, employee ID, email, session ID, or exact entity ID.
- Add admin-facing API/query guidance for activity investigation:
  - by user
  - by employee
  - by organization
  - by route/module
  - by status code
  - by trace ID
  - by date range
- Add retention guidance:
  - operational traces/logs can have shorter retention
  - audit/activity database records should follow HRIS compliance retention requirements
  - deletion/anonymization policies must be explicit, not accidental via Loki/Prometheus retention

10. Cron worker observability
- Instrument `hris-api/cron-entry.ts` and `hris-api/app/cron/cron.service.ts`.
- Add traces around scheduled jobs, especially backup jobs if present.
- Add counters/histograms for cron job success/failure/duration.
- Add a low-cardinality heartbeat metric or status file/endpoint so Prometheus can alert if the cron worker stops running.

11. Frontend observability
- Keep frontend scope conservative.
- At minimum:
  - blackbox probe `hris-app` `/health`
  - container logs to Loki
  - cAdvisor container metrics
- Optional later:
  - browser real-user monitoring with Grafana Faro or OpenTelemetry web instrumentation
- Do not add browser telemetry until privacy, PII redaction, sampling, and user consent requirements are documented.
- For "what the user is doing in the app", prefer backend-confirmed API activity and domain audit records first.
- Optional frontend event tracking may be added later for page views/clicks, but only after defining:
  - allowed events
  - PII redaction
  - sampling
  - retention
  - user consent/privacy notice
  - disabled-by-default configuration

12. PostgreSQL observability
- At minimum:
  - blackbox/container health
  - cAdvisor metrics
  - API DB connectivity health
- Optional:
  - add `postgres_exporter` if database-level metrics are needed
- If `postgres_exporter` is added:
  - use least-privileged monitoring user
  - do not log or commit DB credentials
  - scrape low-cardinality DB metrics

13. Dashboard requirements
Add or update Grafana dashboards under:
`hris-api/infrastructure/onprem/observability/grafana/provisioning/dashboards`

Required dashboards:
- HRIS Observability Overview
- HRIS API RED dashboard:
  - request rate
  - error rate
  - duration percentiles
  - top failing normalized routes
- HRIS Logs dashboard:
  - logs by service/container/environment
  - error logs
  - trace ID search
- HRIS Traces dashboard:
  - trace search by service
  - slow traces
  - error traces
- HRIS Infrastructure dashboard:
  - CPU, memory, disk, container restarts
- HRIS Cron and Backup dashboard:
  - cron heartbeat
  - backup success/failure
  - backup duration
  - latest successful backup timestamp
- HRIS User Activity and Audit dashboard:
  - API calls by normalized route/module
  - failed/forbidden/unauthorized calls
  - activity by user/employee lookup, behind admin authorization
  - activity by organization
  - mutation/audit events by severity
  - trace ID drilldown from activity/audit record to Tempo/Loki

14. Documentation
Update or add docs:
- `hris-api/infrastructure/onprem/observability/README.md`
- `hris-api/wiki-template/base/08-operations/monitoring.md`
- optional: `docs/OPERATIONS.md` or repo-level operational runbook if already used

Docs must explain:
- How to start the observability stack
- Required host directories under `/srv/hris/observability`
- Required firewall restrictions
- How to set Grafana admin password
- How to wire app containers to collector/alloy
- How to verify metrics, logs, and traces
- How to search logs by trace ID
- How to open a trace from a log entry
- How to view API p95 latency and 5xx rate
- How to check whether cron and backups are healthy
- How to investigate what a specific authenticated user did in the app
- How to distinguish request activity logs from mutation audit logs
- How to correlate a user activity record with Loki logs and Tempo traces
- How to back up and restore Grafana/Prometheus/Loki/Tempo observability data
- Known limits and retention settings

15. Security requirements
- No telemetry endpoint should expose secrets.
- Do not commit real Grafana passwords.
- Do not commit real Alertmanager webhooks, SMTP passwords, or tokens.
- Restrict Grafana, Prometheus, Loki, Tempo, Alertmanager, and collector ports at the VM firewall.
- Disable anonymous Grafana access.
- Set strong Grafana admin password through env/secrets.
- Redact sensitive HTTP headers and DB URLs before export.
- Avoid storing PII in span attributes.
- Avoid raw request/response body logging.
- Protect activity/audit query endpoints with admin/HR/security roles.
- Activity/audit logs must be append-only for normal app users; edits/deletes require explicit privileged maintenance flow and should themselves be audited.

16. Testing and verification
Add focused tests or verification scripts where practical.

Required verification:
1. `docker compose config` succeeds for the observability stack.
2. Grafana datasource provisioning includes Prometheus, Loki, Tempo, and Alertmanager.
3. Prometheus config includes scrape targets for API, collector/alloy, Tempo, Loki, Grafana, node-exporter, cAdvisor, and blackbox.
4. API `/metrics` remains reachable and returns Prometheus text format.
5. API emits at least one trace to collector/alloy when `OTEL_ENABLED=true`.
6. Tempo receives and stores traces.
7. Loki receives container logs for API, cron, frontend, and observability containers.
8. Logs include `trace_id` when request trace context exists.
9. Grafana can query Prometheus, Loki, and Tempo datasources.
10. Previous observability data survives container restart.
11. No logs include database passwords, authorization headers, cookies, or Grafana admin password.
12. Typecheck passes for API changes.
13. Existing focused tests for observability middleware pass or are added.
14. Authenticated API calls create activity records when enabled.
15. Mutating/sensitive API calls create audit records when configured.
16. Activity records include route, method, status code, duration, user ID, employee ID when available, organization ID when available, IP/user-agent, trace ID, and span ID.
17. Excluded paths such as `/health` and `/metrics` do not create noisy activity records.
18. Prometheus metrics do not include raw user IDs, employee IDs, emails, session IDs, or entity IDs as labels.
19. Activity/audit query endpoints are role-protected.

Manual verification commands:

```bash
cd hris-api/infrastructure/onprem/observability
cp .env.example .env
docker compose config
docker compose up -d
docker compose ps
curl -f http://localhost:9091/-/ready
curl -f http://localhost:53000/api/health
curl -f http://localhost:3110/ready
curl -f http://localhost:3200/ready
curl -f http://localhost:8889/metrics
curl -f http://localhost:3001/metrics
```

Acceptance criteria:
- On-prem observability stack runs from Docker Compose.
- Grafana, Prometheus, Loki, Tempo, Alertmanager, collector/alloy, cAdvisor, node-exporter, and blackbox-exporter are wired.
- Observability data is stored in persistent VM-mounted storage.
- API metrics still work at `/metrics`.
- API and cron traces are sent through OTLP to collector/alloy and visible in Tempo/Grafana.
- Docker logs are visible in Loki/Grafana.
- Grafana has provisioned Prometheus, Loki, Tempo, and Alertmanager datasources.
- Dashboards cover API health, logs, traces, infrastructure, cron, and backups.
- User activity/audit visibility shows what authenticated users did in the app without leaking secrets or polluting Prometheus with high-cardinality user labels.
- Alerts cover down services, high errors, high latency, resource pressure, collector drops, and missing traces.
- Sensitive data is redacted or excluded.
- Documentation includes start/stop, verification, dashboard usage, trace/log correlation, retention, backup/restore, and security guidance.
- Typecheck and focused verification pass.
````

## Sources Checked

- Grafana Docker OpenTelemetry LGTM documentation: identifies the single-image stack as suitable for self-managed development, demos, and testing, and notes persistence via `/data`.
- Grafana OpenTelemetry Collector documentation: recommends Grafana Alloy for most production environments and explains Collector benefits such as batching, retrying, redaction, routing, and reliability.
- Grafana Loki OpenTelemetry Collector tutorial: confirms OTLP receiver conventions for gRPC `4317` and HTTP `4318`, plus collector pipelines.
- OpenTelemetry Node.js documentation: documents Node SDK and auto-instrumentation setup.
- OpenTelemetry SDK environment variable specification: documents standard variables such as `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`.
