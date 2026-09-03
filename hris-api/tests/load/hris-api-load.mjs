import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const isSoak = args.has("--soak");
const isDryRun = args.has("--dry-run");
const baseUrl = (process.env.LOAD_TEST_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const paths = (process.env.LOAD_TEST_PATHS || "/health,/api/status")
	.split(",")
	.map((path) => path.trim())
	.filter(Boolean);

const durationSeconds = Number(
	process.env.LOAD_TEST_DURATION_SECONDS || (isSoak ? "1800" : "15"),
);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || (isSoak ? "3" : "5"));
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE || "0.01");
const maxP95Ms = Number(process.env.LOAD_TEST_MAX_P95_MS || (isSoak ? "1500" : "1000"));
const requestTimeoutMs = Number(process.env.LOAD_TEST_REQUEST_TIMEOUT_MS || "10000");
const reportPath =
	process.env.LOAD_TEST_REPORT_PATH ||
	`test-results/load/${isSoak ? "soak" : "load"}-${new Date()
		.toISOString()
		.replace(/[:.]/g, "-")}.json`;
const bearerToken = process.env.LOAD_TEST_BEARER_TOKEN || "";

const sharedEnvironmentPattern = /hris-api-(dev|uat|prod|production)-\d+.*\.run\.app/i;

if (sharedEnvironmentPattern.test(baseUrl) && process.env.ALLOW_SHARED_ENV_LOAD_TESTS !== "true") {
	console.error(
		`Refusing to load test shared API environment ${baseUrl}. Set ALLOW_SHARED_ENV_LOAD_TESTS=true only after approval.`,
	);
	process.exit(1);
}

if (!paths.length) {
	console.error("LOAD_TEST_PATHS did not contain any paths.");
	process.exit(1);
}

if (
	!Number.isFinite(durationSeconds) ||
	durationSeconds <= 0 ||
	!Number.isFinite(concurrency) ||
	concurrency <= 0 ||
	!Number.isFinite(maxErrorRate) ||
	maxErrorRate < 0 ||
	!Number.isFinite(maxP95Ms) ||
	maxP95Ms <= 0 ||
	!Number.isFinite(requestTimeoutMs) ||
	requestTimeoutMs <= 0
) {
	console.error("Invalid load-test numeric configuration.");
	process.exit(1);
}

const durations = [];
const statusCounts = new Map();
const pathCounts = new Map();
const pathFailures = new Map();
let total = 0;
let failed = 0;

const percentile = (values, p) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[index];
};

const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1);

const buildHeaders = () => {
	const headers = { Accept: "application/json" };
	if (bearerToken) {
		headers.Authorization = `Bearer ${bearerToken}`;
	}
	return headers;
};

const runRequest = async (path) => {
	const startedAt = performance.now();
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
	try {
		const response = await fetch(`${baseUrl}/${path.replace(/^\/+/, "")}`, {
			headers: buildHeaders(),
			signal: controller.signal,
		});
		const durationMs = performance.now() - startedAt;
		durations.push(durationMs);
		total += 1;
		increment(pathCounts, path);
		increment(statusCounts, String(response.status));

		if (!response.ok) {
			failed += 1;
			increment(pathFailures, path);
		}
	} catch (error) {
		durations.push(performance.now() - startedAt);
		total += 1;
		failed += 1;
		increment(pathCounts, path);
		increment(pathFailures, path);
		increment(statusCounts, error?.name === "AbortError" ? "timeout" : "network_error");
	} finally {
		clearTimeout(timeoutId);
	}
};

const worker = async (workerIndex, endAt) => {
	let iteration = 0;
	while (Date.now() < endAt) {
		const path = paths[(workerIndex + iteration) % paths.length];
		await runRequest(path);
		iteration += 1;
	}
};

const configSummary = {
	mode: isSoak ? "soak" : "load",
	dryRun: isDryRun,
	baseUrl,
	paths,
	durationSeconds,
	concurrency,
	requestTimeoutMs,
	maxErrorRate,
	maxP95Ms,
	reportPath,
	usesBearerToken: Boolean(bearerToken),
};

console.log(JSON.stringify(configSummary, null, 2));

if (isDryRun) {
	process.exit(0);
}

const endAt = Date.now() + durationSeconds * 1000;
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index, endAt)));

const errorRate = total === 0 ? 1 : failed / total;
const p95Ms = percentile(durations, 95);
const p99Ms = percentile(durations, 99);
const summary = {
	...configSummary,
	total,
	failed,
	errorRate: Number(errorRate.toFixed(4)),
	p95Ms: Number(p95Ms.toFixed(1)),
	p99Ms: Number(p99Ms.toFixed(1)),
	statusCounts: Object.fromEntries(statusCounts.entries()),
	pathCounts: Object.fromEntries(pathCounts.entries()),
	pathFailures: Object.fromEntries(pathFailures.entries()),
	thresholdsPassed: errorRate <= maxErrorRate && p95Ms <= maxP95Ms,
};

console.log(JSON.stringify(summary, null, 2));
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (!summary.thresholdsPassed) {
	console.error(
		`Load threshold failed: errorRate=${summary.errorRate}, p95Ms=${summary.p95Ms}.`,
	);
	process.exit(1);
}
