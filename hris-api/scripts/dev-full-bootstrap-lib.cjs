const fs = require("fs");
const path = require("path");

/**
 * Pure helpers for scripts/run-dev-full.cjs (one-command dev bootstrap).
 * Kept require-able so tests/dev-full-bootstrap.spec.ts can unit-test the
 * startup decisions without spawning real processes.
 */

const DEFAULT_CLOUDFLARED_PATHS = [
	"C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
	"C:\\Program Files\\cloudflared\\cloudflared.exe",
];

const REQUIRED_ENV_KEYS = ["PORT", "JWT_SECRET"];

const REQUIRED_MODULE_FILES = [
	"tsx/dist/cli.mjs",
	"@prisma/client",
	"argon2",
	"express",
];

const TRYCLOUDFLARE_URL_PATTERN = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

/**
 * Extract the first trycloudflare quick-tunnel URL from cloudflared output
 * (printed into stderr as a box by `cloudflared tunnel --url ...`).
 */
function extractTryCloudflareUrl(text) {
	const match = TRYCLOUDFLARE_URL_PATTERN.exec(String(text || ""));
	return match ? match[0] : null;
}

function shouldSkipCloudflare(env = process.env) {
	if (env.HRIS_SKIP_CLOUDFLARE === "true") return true;
	if (env.HRIS_SKIP_CLOUDFLARE_TUNNEL === "true") return true;
	return env.HRIS_DEV_TUNNEL === "off" || env.HRIS_DEV_TUNNEL === "none";
}

/**
 * Resolve the cloudflared executable. ENV override wins, then explicit
 * candidate paths, then a PATH lookup result passed in by the caller.
 */
function resolveCloudflaredBin({ pathOverride, candidates, whereResult } = {}) {
	const override = String(pathOverride || "").trim();
	if (override) {
		return fs.existsSync(override) ? override : null;
	}
	for (const candidate of candidates || []) {
		if (!candidate) continue;
		const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
		if (fs.existsSync(resolved)) return resolved;
	}
	if (whereResult && fs.existsSync(whereResult)) return whereResult;
	return null;
}

/**
 * Env presence validation. Never returns values — only missing key names.
 */
function validateEnvPresence(env = process.env, requiredKeys = REQUIRED_ENV_KEYS) {
	const keys = Array.from(new Set(requiredKeys));
	const missing = keys.filter((key) => !String(env[key] || "").trim());
	return { ok: missing.length === 0, missing };
}

/** Readiness contract for GET /health on this repo. */
function isApiHealthy(statusCode, body) {
	if (statusCode !== 200) return false;
	// "unhealthy" contains "healthy" — match the status field, not a substring.
	return /"status"\s*:\s*"healthy"/i.test(String(body || ""));
}

/** Dependency-tree completeness from plain filesystem checks. */
function isDependencyTreeComplete(apiRoot, files = REQUIRED_MODULE_FILES, existsCheck = fs.existsSync) {
	return files.every((file) => existsCheck(path.join(apiRoot, "node_modules", file)));
}

/**
 * Banner without secrets (meta-prompt §13/§14).
 */
function buildBanner({ apiPort, tunnelUrl, skipCloudflare, bannerLines = [] } = {}) {
	const port = apiPort || 3001;
	const lines = [
		"==================================================",
		" HRIS API DEVELOPMENT ENVIRONMENT",
		"==================================================",
		"",
		" Local API:",
		`   http://localhost:${port}`,
		"",
		" Swagger:",
		`   http://localhost:${port}/api/swagger`,
		`   http://localhost:${port}/api/docs/swagger`,
		"",
	];
	for (const line of bannerLines) lines.push(line);
	if (tunnelUrl) {
		lines.push(" Cloudflare:", `   ${tunnelUrl}`, "");
	} else if (skipCloudflare) {
		lines.push(" Cloudflare:", "   disabled (HRIS_SKIP_CLOUDFLARE=true)", "");
	}
	lines.push(" Press Ctrl+C to stop everything.");
	lines.push("==================================================");
	return lines.join("\n");
}

module.exports = {
	DEFAULT_CLOUDFLARED_PATHS,
	REQUIRED_ENV_KEYS,
	REQUIRED_MODULE_FILES,
	buildBanner,
	extractTryCloudflareUrl,
	isApiHealthy,
	isDependencyTreeComplete,
	resolveCloudflaredBin,
	shouldSkipCloudflare,
	validateEnvPresence,
};
