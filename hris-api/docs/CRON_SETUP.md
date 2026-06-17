# Dockerized Cron Service Setup

This project uses `node-cron` running in a separate Docker container to handle scheduled tasks. This keeps long-running or resource-intensive background jobs away from the main API server.

## Overview

- **Main API**: Runs in the `template-app` container on internal port `3001`, published to host port `58001` by default.
- **Cron Worker**: Runs in the `template-cron` container and does not expose an HTTP port.
- **Database**: Both services share the same database and Redis connections.

## File Structure

- `app/cron/cron.service.ts`: Define cron jobs here.
- `cron-entry.ts`: Entry point for the cron worker process.
- `webpack.config.js`: Builds both `server.js` (API) and `cron.js` (worker).
- `docker-compose.yml`: Defines the `app` and `cron` services.

## How to Add a New Job

1. Open `app/cron/cron.service.ts`.
2. Add a new `cron.schedule` block inside `initCronJobs`.

```typescript
// Example: Run every Monday at 9:00 AM
cron.schedule("0 9 * * 1", async () => {
	console.log("Running weekly report generation...");
	// Your logic here
});
```

## Running with Docker

To start the services including the cron worker:

```bash
docker compose up --build
```

Keep `localhost:3001` reserved for the Windows `npm run dev` API process. If Docker is running at the same time, leave `APP_HOST_PORT=58001` so the containerized API stays on `http://localhost:58001`.

You should see output indicating both services have started:

```text
template-app   | Server is running on port 3001
template-cron  | Starting Cron Worker Service...
template-cron  | Database connected successfully within Cron Worker
template-cron  | Initializing Cron Jobs...
```

## Monitoring

To view the logs specifically for the cron worker:

```bash
docker logs -f template-cron
```

## Important Notes

- **One Container, One Role**: The `cron` container runs only the scheduled tasks. It does not serve HTTP requests.
- **Shared Codebase**: Since both containers share the same image layers, code changes require rebuilding the image with `docker compose up --build`.
- **Port Guardrail**: Do not set `APP_HOST_PORT=3001` while the Windows `hris-api` dev server is in use. On some machines, `localhost` resolves to the Docker IPv6 listener first and causes auth/API requests to hit the wrong process.
- **Graceful Shutdown**: The worker handles `SIGINT` and `SIGTERM` so database connections can close cleanly before shutdown.
