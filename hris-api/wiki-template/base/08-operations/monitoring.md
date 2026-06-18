# Monitoring

## Runtime Monitoring Baseline

- Track API uptime and error rate.
- Track latency percentiles for critical endpoints.
- Alert on sustained elevated error rates.

## On-Prem LGTM Stack

- Grafana is the primary investigation UI.
- Prometheus stores aggregate metrics and powers alerts.
- Loki stores container and application logs.
- Tempo stores OpenTelemetry traces.
- The OpenTelemetry Collector receives OTLP traffic from the API and cron worker, redacts sensitive attributes, batches telemetry, and routes traces/logs to the right backend.

## User Activity Visibility

- API request activity is recorded in `ActivityLogging` and emitted as structured `api.activity.request` logs.
- Sensitive mutations should also create `AuditLogging` records with before/after context where appropriate.
- Each activity record should include method, route, path, status code, duration, user/employee/organization context when available, IP, user-agent, `trace_id`, and `span_id`.
- Use Grafana Loki to search `api.activity.request`, then use the `trace_id` in Tempo to inspect the request trace.
- Do not use raw user IDs, employee IDs, emails, session IDs, or entity IDs as Prometheus labels.

## Security

- Do not log passwords, authorization headers, cookies, tokens, or raw request bodies.
- Protect activity/audit query endpoints with admin, HR, or security roles.
- Grafana, Prometheus, Loki, Tempo, Alertmanager, and Collector ports should be restricted to admin networks on the VM.
