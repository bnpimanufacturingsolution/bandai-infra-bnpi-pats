import * as fs from "fs";
import * as path from "path";

const APP_DIR = path.join(__dirname, "..", "app");
const OUTPUT_FILE = path.join(__dirname, "..", "docs", "logging-audit.md");
const API_BASE = "/api";

type LoggingFlags = {
	activity: boolean;
	audit: boolean;
	delegated: boolean;
	domainAudit: boolean;
};

type EndpointRow = {
	method: string;
	route: string;
	handler: string;
	logging: LoggingFlags;
	notes: string[];
};

type ControllerAudit = {
	name: string;
	filePath: string;
	relativePath: string;
	basePath: string;
	endpoints: EndpointRow[];
	handlers: Map<string, LoggingFlags>;
};

const HTTP_METHODS = ["get", "post", "patch", "put", "delete"] as const;

function walkDir(dir: string, pattern: RegExp, results: string[] = []): string[] {
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkDir(fullPath, pattern, results);
		} else if (pattern.test(entry.name)) {
			results.push(fullPath);
		}
	}
	return results;
}

function findMatchingBraceEnd(source: string, openBraceIndex: number): number {
	let depth = 0;
	let inString: "'" | '"' | "`" | null = null;
	let escaped = false;

	for (let i = openBraceIndex; i < source.length; i++) {
		const ch = source[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === inString) {
				inString = null;
			}
			continue;
		}

		if (ch === "'" || ch === '"' || ch === "`") {
			inString = ch;
			continue;
		}

		if (ch === "{") depth++;
		if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}

	return source.length - 1;
}

function detectLogging(body: string): LoggingFlags {
	const activity =
		/\blogActivity\s*\(/.test(body) ||
		/\blogMigrationActivity\s*\(/.test(body) ||
		/\blogAuthEvent\s*\(/.test(body) ||
		/activityLogger_\d+\.logActivity[\s\S]*?\(/.test(body);

	const audit =
		/\blogAudit\s*\(/.test(body) ||
		/\blogMigrationAudit\s*\(/.test(body) ||
		/\blogAuthEvent\s*\(/.test(body) ||
		/auditLogger_\d+\.logAudit[\s\S]*?\(/.test(body);

	const delegated =
		/\blogEmployeeCreation\s*\(/.test(body) ||
		/helpers\.logEmployeeCreation\s*\(/.test(body);

	const domainAudit = /terminationAuditLog\.create\s*\(/.test(body);

	return { activity, audit, delegated, domainAudit };
}

function parseControllerHandlers(controllerPath: string): Map<string, LoggingFlags> {
	const source = fs.readFileSync(controllerPath, "utf8");
	const handlers = new Map<string, LoggingFlags>();

	const handlerPatterns = [
		/(?:const|let|var)\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*=>\s*\{/g,
		/(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*__awaiter[\s\S]*?function\*\s*\(\)\s*\{/g,
	];

	for (const handlerRegex of handlerPatterns) {
		let match: RegExpExecArray | null;
		while ((match = handlerRegex.exec(source)) !== null) {
			const handlerName = match[1];
			if (handlers.has(handlerName)) continue;
			const openBraceIndex = match.index + match[0].length - 1;
			const closeBraceIndex = findMatchingBraceEnd(source, openBraceIndex);
			const body = source.slice(openBraceIndex, closeBraceIndex + 1);
			handlers.set(handlerName, detectLogging(body));
		}
	}

	// Handlers that call module-level helpers (e.g. auth logAuthEvent)
	for (const [name, flags] of [...handlers.entries()]) {
		const handlerStart = source.search(
			new RegExp(
				`(?:const|let|var)\\s+${name}\\s*=\\s*(?:async|\\([^)]*\\)\\s*=>\\s*__awaiter)`,
			),
		);
		if (handlerStart < 0) continue;

		const arrowIdx = source.indexOf("=>", handlerStart);
		const awaiterIdx = source.indexOf("__awaiter", handlerStart);
		const openBrace = source.indexOf(
			"{",
			awaiterIdx >= 0 && (arrowIdx < 0 || awaiterIdx < arrowIdx) ? awaiterIdx : arrowIdx,
		);
		if (openBrace < 0) continue;

		const closeBrace = findMatchingBraceEnd(source, openBrace);
		const body = source.slice(openBrace, closeBrace + 1);

		if (/\blogAuthEvent\s*\(/.test(body)) {
			handlers.set(name, { ...flags, audit: true });
		}
	}

	return handlers;
}

function extractRouterBasePath(routerSource: string): string {
	const pathMatch = routerSource.match(/const\s+path\s*=\s*["']([^"']+)["']/);
	return pathMatch?.[1] || "";
}

function joinRoutePaths(...segments: string[]): string {
	const cleaned = segments
		.filter(Boolean)
		.map((s) => s.replace(/\/+/g, "/"))
		.map((s) => (s.startsWith("/") ? s : `/${s}`));

	let result = "";
	for (const segment of cleaned) {
		if (!result) {
			result = segment;
			continue;
		}
		result = `${result.replace(/\/$/, "")}${segment}`;
	}

	return result.replace(/\/+/g, "/") || "/";
}

function parseRouterEndpoints(
	routerPath: string,
	parentBasePath = "",
): { basePath: string; endpoints: Array<{ method: string; subPath: string; handler: string }> } {
	const source = fs.readFileSync(routerPath, "utf8");
	const localBase = extractRouterBasePath(source);
	const basePath = joinRoutePaths(parentBasePath, localBase);

	const endpoints: Array<{ method: string; subPath: string; handler: string }> = [];

	for (const method of HTTP_METHODS) {
		const routeCallRegex = new RegExp(`(?:routes|mainRouter)\\.${method}\\s*\\(`, "g");
		let callMatch: RegExpExecArray | null;

		while ((callMatch = routeCallRegex.exec(source)) !== null) {
			const start = callMatch.index;
			const openParen = source.indexOf("(", start);
			const closeParen = findCallEnd(source, openParen);
			const callBody = source.slice(openParen + 1, closeParen);

			const pathMatch = callBody.match(/^\s*["'`]([^"'`]+)["'`]/);
			if (!pathMatch) continue;

			const handlerMatch = callBody.match(/controller\.(\w+)\s*\)?\s*$/m) ||
				callBody.match(/controller\.(\w+)/);
			if (!handlerMatch) continue;

			endpoints.push({
				method: method.toUpperCase(),
				subPath: pathMatch[1],
				handler: handlerMatch[1],
			});
		}
	}

	return { basePath, endpoints };
}

function findCallEnd(source: string, openParenIndex: number): number {
	let depth = 0;
	let inString: "'" | '"' | "`" | null = null;
	let escaped = false;

	for (let i = openParenIndex; i < source.length; i++) {
		const ch = source[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === inString) inString = null;
			continue;
		}

		if (ch === "'" || ch === '"' || ch === "`") {
			inString = ch;
			continue;
		}

		if (ch === "(") depth++;
		if (ch === ")") {
			depth--;
			if (depth === 0) return i;
		}
	}

	return source.length - 1;
}

function findRouterFilesForController(controllerPath: string): string[] {
	const dir = path.dirname(controllerPath);
	const baseName = path.basename(controllerPath, ".controller.ts");

	const candidates = [
		path.join(dir, `${baseName}.router.ts`),
		path.join(dir, `${baseName.replace(/([A-Z])/g, (m) => m.toLowerCase())}.router.ts`),
	];

	// Special naming mismatches
	const specialMap: Record<string, string> = {
		"boardingtemplate.controller.ts": "boardingtemplate.router.ts",
		"scheduleScheduleTemplate.controller.ts": "scheduleScheduleTemplate.router.ts",
		"rule.controller.ts": "rule.router.ts",
	};

	const fileName = path.basename(controllerPath);
	if (specialMap[fileName]) {
		candidates.unshift(path.join(dir, specialMap[fileName]));
	}

	// Hikvision uses routes/ subfolder
	if (controllerPath.includes("hikvision")) {
		const hikName = baseName.replace(".control", "");
		candidates.push(path.join(dir, "..", "routes", `${hikName}.router.ts`));
		candidates.push(path.join(dir, "..", "routes", `${baseName}.router.ts`));
	}

	const seen = new Set<string>();
	const unique: string[] = [];
	for (const candidate of candidates) {
		if (!fs.existsSync(candidate)) continue;
		const canonical = fs.realpathSync.native(candidate).toLowerCase();
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		unique.push(candidate);
	}
	return unique;
}

function getControllerName(controllerPath: string): string {
	const rel = path.relative(APP_DIR, controllerPath).replace(/\\/g, "/");
	return rel.replace(/\.controller\.ts$/, "").replace(/\//g, " / ");
}

function buildNotes(flags: LoggingFlags, method: string): string[] {
	const notes: string[] = [];

	if (flags.delegated) notes.push("delegated via logEmployeeCreation helper");
	if (flags.domainAudit) notes.push("domain-specific TerminationAuditLog");
	if (flags.activity && !flags.audit && method === "GET") notes.push("activity-only on read");
	if (flags.activity && !flags.audit && method !== "GET") notes.push("activity-only");
	if (!flags.activity && flags.audit) notes.push("audit-only");
	if (flags.audit && method === "GET") notes.push("audit call present (may be skipped for GET)");

	return notes;
}

function formatYesNo(value: boolean): string {
	return value ? "Yes" : "No";
}

function auditController(controllerPath: string): ControllerAudit {
	const name = getControllerName(controllerPath);
	const relativePath = path.relative(path.join(__dirname, ".."), controllerPath).replace(/\\/g, "/");
	const handlers = parseControllerHandlers(controllerPath);
	const routerFiles = findRouterFilesForController(controllerPath);

	let parentBase = "";
	if (controllerPath.includes(`${path.sep}hikvision${path.sep}`)) {
		parentBase = "/hikvision";
	}

	const endpoints: EndpointRow[] = [];
	let basePath = "";

	for (const routerFile of routerFiles) {
		const parsed = parseRouterEndpoints(routerFile, parentBase);
		basePath = parsed.basePath || basePath;

		for (const ep of parsed.endpoints) {
			const fullRoute = joinRoutePaths(API_BASE, parsed.basePath, ep.subPath);
			const logging = handlers.get(ep.handler) || {
				activity: false,
				audit: false,
				delegated: false,
				domainAudit: false,
			};

			if (logging.delegated) {
				logging.activity = true;
				logging.audit = true;
			}

			endpoints.push({
				method: ep.method,
				route: fullRoute,
				handler: ep.handler,
				logging,
				notes: buildNotes(logging, ep.method),
			});
		}
	}

	// Handlers without router mapping
	for (const [handlerName, logging] of handlers.entries()) {
		if (!endpoints.some((e) => e.handler === handlerName)) {
			endpoints.push({
				method: "—",
				route: "(unmapped)",
				handler: handlerName,
				logging,
				notes: [...buildNotes(logging, "—"), "handler not found in router"],
			});
		}
	}

	// Deduplicate endpoints (Windows may resolve case-variant router paths twice)
	const deduped = new Map<string, EndpointRow>();
	for (const ep of endpoints) {
		const key = `${ep.method}|${ep.route}|${ep.handler}`;
		if (!deduped.has(key)) deduped.set(key, ep);
	}
	const uniqueEndpoints = [...deduped.values()];

	const methodOrder: Record<string, number> = {
		GET: 0,
		POST: 1,
		PUT: 2,
		PATCH: 3,
		DELETE: 4,
		"—": 5,
	};
	uniqueEndpoints.sort((a, b) => {
		const methodDiff = (methodOrder[a.method] ?? 99) - (methodOrder[b.method] ?? 99);
		if (methodDiff !== 0) return methodDiff;
		return a.route.localeCompare(b.route);
	});

	return {
		name,
		filePath: controllerPath,
		relativePath,
		basePath: basePath ? joinRoutePaths(API_BASE, basePath) : "(unknown)",
		endpoints: uniqueEndpoints,
		handlers,
	};
}

function computeStats(controllers: ControllerAudit[]) {
	const totalControllers = controllers.length;
	const totalEndpoints = controllers.reduce((sum, c) => sum + c.endpoints.filter((e) => e.route !== "(unmapped)").length, 0);

	let withActivity = 0;
	let withAudit = 0;
	let withBoth = 0;
	let withNone = 0;
	let withDelegated = 0;
	let withDomain = 0;

	for (const controller of controllers) {
		for (const ep of controller.endpoints) {
			if (ep.route === "(unmapped)") continue;
			const { activity, audit, delegated, domainAudit } = ep.logging;
			if (delegated) withDelegated++;
			if (domainAudit) withDomain++;
			if (activity && audit) withBoth++;
			else if (activity) withActivity++;
			else if (audit) withAudit++;
			else if (!domainAudit) withNone++;
		}
	}

	const controllersWithAnyLogging = controllers.filter((c) =>
		c.endpoints.some(
			(e) =>
				e.logging.activity ||
				e.logging.audit ||
				e.logging.delegated ||
				e.logging.domainAudit,
		),
	).length;

	const controllersWithNoLogging = totalControllers - controllersWithAnyLogging;

	return {
		totalControllers,
		totalEndpoints,
		withActivity,
		withAudit,
		withBoth,
		withNone,
		withDelegated,
		withDomain,
		controllersWithAnyLogging,
		controllersWithNoLogging,
	};
}

function generateMarkdown(controllers: ControllerAudit[]): string {
	const stats = computeStats(controllers);
	const generatedAt = new Date().toISOString().slice(0, 10);

	const sorted = [...controllers].sort((a, b) => a.name.localeCompare(b.name));

	const lines: string[] = [];
	lines.push("# HRIS API — Logging Coverage Audit");
	lines.push("");
	lines.push(
		`> Generated: ${generatedAt} | Controllers: ${stats.totalControllers} | Mapped endpoints: ${stats.totalEndpoints}`,
	);
	lines.push("");
	lines.push("## Executive Summary");
	lines.push("");
	lines.push("| Metric | Count |");
	lines.push("|--------|------:|");
	lines.push(`| Total controllers | ${stats.totalControllers} |`);
	lines.push(`| Total mapped endpoints | ${stats.totalEndpoints} |`);
	lines.push(`| Controllers with any logging | ${stats.controllersWithAnyLogging} |`);
	lines.push(`| Controllers with zero logging | ${stats.controllersWithNoLogging} |`);
	lines.push(`| Endpoints with activity + audit | ${stats.withBoth} |`);
	lines.push(`| Endpoints with activity only | ${stats.withActivity} |`);
	lines.push(`| Endpoints with audit only | ${stats.withAudit} |`);
	lines.push(`| Endpoints with delegated logging | ${stats.withDelegated} |`);
	lines.push(`| Endpoints with domain audit (TerminationAuditLog) | ${stats.withDomain} |`);
	lines.push(`| Endpoints with no standard logging | ${stats.withNone} |`);
	lines.push("");

	const coveragePct = stats.totalEndpoints
		? Math.round(((stats.withBoth + stats.withActivity + stats.withAudit + stats.withDelegated + stats.withDomain) / stats.totalEndpoints) * 100)
		: 0;
	lines.push(
		`Overall endpoint logging coverage (any type): **${coveragePct}%** (${stats.withBoth + stats.withActivity + stats.withAudit + stats.withDelegated + stats.withDomain}/${stats.totalEndpoints})`,
	);
	lines.push("");

	lines.push("## How Logging Works");
	lines.push("");
	lines.push("Logging is **manual per handler** — no global middleware, decorator, or interceptor.");
	lines.push("");
	lines.push("| Utility | File | Storage |");
	lines.push("|---------|------|---------|");
	lines.push("| `logActivity()` | `utils/activityLogger.ts` | `ActivityLogging` |");
	lines.push("| `logAudit()` | `utils/auditLogger.ts` | `AuditLogging` |");
	lines.push("| `logAuthEvent()` | `app/auth/auth.controller.ts` | via `logAudit()` |");
	lines.push("| `logEmployeeCreation()` | `helper/employee.helper.ts` | both loggers |");
	lines.push("| `terminationAuditLog.create()` | `app/termination/termination.controller.ts` | `TerminationAuditLog` |");
	lines.push("");
	lines.push("**Audit skip rules:** `logAudit()` skips GET/HEAD/OPTIONS requests and `READ` actions.");
	lines.push("");
	lines.push("**Constants:** `config/constant.ts` → `config.ACTIVITY_LOG.*` and `config.AUDIT_LOG.*`");
	lines.push("");

	lines.push("## Per-Controller Endpoint Coverage");
	lines.push("");

	for (const controller of sorted) {
		const mapped = controller.endpoints.filter((e) => e.route !== "(unmapped)");
		const logged = mapped.filter(
			(e) =>
				e.logging.activity ||
				e.logging.audit ||
				e.logging.delegated ||
				e.logging.domainAudit,
		).length;

		lines.push(`### ${controller.name}`);
		lines.push("");
		lines.push(`- **File:** \`${controller.relativePath}\``);
		lines.push(`- **Base path:** \`${controller.basePath}\``);
		lines.push(`- **Endpoints:** ${mapped.length} mapped, ${logged} with logging`);
		lines.push("");

		if (mapped.length === 0) {
			lines.push("_No router mappings found._");
			lines.push("");
			continue;
		}

		lines.push("| HTTP | Route | Handler | Activity | Audit | Domain | Notes |");
		lines.push("|------|-------|---------|:--------:|:-----:|:------:|-------|");

		for (const ep of mapped) {
			const notes = ep.notes.length ? ep.notes.join("; ") : "—";
			lines.push(
				`| ${ep.method} | \`${ep.route}\` | ${ep.handler} | ${formatYesNo(ep.logging.activity || ep.logging.delegated)} | ${formatYesNo(ep.logging.audit || ep.logging.delegated)} | ${formatYesNo(ep.logging.domainAudit)} | ${notes} |`,
			);
		}

		const unmapped = controller.endpoints.filter((e) => e.route === "(unmapped)");
		if (unmapped.length > 0) {
			lines.push("");
			lines.push("<details><summary>Unmapped handlers</summary>");
			lines.push("");
			lines.push("| Handler | Activity | Audit | Domain |");
			lines.push("|---------|:--------:|:-----:|:------:|");
			for (const ep of unmapped) {
				lines.push(
					`| ${ep.handler} | ${formatYesNo(ep.logging.activity)} | ${formatYesNo(ep.logging.audit)} | ${formatYesNo(ep.logging.domainAudit)} |`,
				);
			}
			lines.push("");
			lines.push("</details>");
		}

		lines.push("");
	}

	const zeroLogging = sorted.filter(
		(c) =>
			!c.endpoints.some(
				(e) =>
					e.logging.activity ||
					e.logging.audit ||
					e.logging.delegated ||
					e.logging.domainAudit,
			),
	);

	lines.push("## Controllers With Zero Logging");
	lines.push("");
	if (zeroLogging.length === 0) {
		lines.push("_All controllers have at least one logged endpoint._");
	} else {
		lines.push(`**${zeroLogging.length} controllers** have no ` + "`logActivity`" + ", `" + "logAudit`" + ", delegated, or domain audit calls:");
		lines.push("");
		for (const c of zeroLogging) {
			const count = c.endpoints.filter((e) => e.route !== "(unmapped)").length;
			lines.push(`- **${c.name}** (${count} endpoints) — \`${c.relativePath}\``);
		}
	}
	lines.push("");

	// Create-only pattern detection
	const createOnlyModules = sorted.filter((c) => {
		const mapped = c.endpoints.filter((e) => e.route !== "(unmapped)");
		if (mapped.length === 0) return false;
		const logged = mapped.filter(
			(e) => e.logging.activity || e.logging.audit || e.logging.delegated || e.logging.domainAudit,
		);
		if (logged.length === 0) return false;
		const onlyCreate = logged.every((e) => e.handler === "create");
		const hasUnloggedMutations = mapped.some(
			(e) =>
				["POST", "PATCH", "PUT", "DELETE"].includes(e.method) &&
				e.handler !== "create" &&
				!e.logging.activity &&
				!e.logging.audit &&
				!e.logging.delegated &&
				!e.logging.domainAudit,
		);
		return onlyCreate && hasUnloggedMutations;
	});

	lines.push("## Partial Coverage Highlights");
	lines.push("");
	lines.push("### Create-only logging modules");
	lines.push("");
	if (createOnlyModules.length === 0) {
		lines.push("_None detected._");
	} else {
		for (const c of createOnlyModules) {
			lines.push(`- ${c.name}`);
		}
	}
	lines.push("");

	lines.push("### High-risk unlogged mutations (sample)");
	lines.push("");
	const highRiskPatterns = [
		/migration/i,
		/systemProvisioning/i,
		/payrollperiod/i,
		/employeepayroll/i,
		/termination/i,
		/workflowConfig/i,
		/auth/i,
	];
	for (const pattern of highRiskPatterns) {
		const controller = sorted.find((c) => pattern.test(c.relativePath));
		if (!controller) continue;
		const unlogged = controller.endpoints.filter(
			(e) =>
				e.route !== "(unmapped)" &&
				["POST", "PATCH", "PUT", "DELETE"].includes(e.method) &&
				!e.logging.activity &&
				!e.logging.audit &&
				!e.logging.delegated &&
				!e.logging.domainAudit,
		);
		if (unlogged.length > 0) {
			lines.push(`**${controller.name}** — ${unlogged.length} unlogged mutation(s):`);
			for (const ep of unlogged.slice(0, 8)) {
				lines.push(`- ${ep.method} \`${ep.route}\` (${ep.handler})`);
			}
			if (unlogged.length > 8) lines.push(`- ...and ${unlogged.length - 8} more`);
			lines.push("");
		}
	}

	lines.push("## Regenerating This Report");
	lines.push("");
	lines.push("```bash");
	lines.push("cd hris-api && npx tsx scripts/generate-logging-audit.ts");
	lines.push("```");
	lines.push("");

	return lines.join("\n");
}

function main() {
	const controllerFiles = walkDir(APP_DIR, /\.controller\.ts$/).sort();
	const audits = controllerFiles.map(auditController);
	const markdown = generateMarkdown(audits);

	fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
	fs.writeFileSync(OUTPUT_FILE, markdown, "utf8");

	const stats = computeStats(audits);
	console.log(`Wrote ${OUTPUT_FILE}`);
	console.log(`Controllers: ${stats.totalControllers}`);
	console.log(`Mapped endpoints: ${stats.totalEndpoints}`);
	console.log(`Controllers with logging: ${stats.controllersWithAnyLogging}`);
	console.log(`Controllers without logging: ${stats.controllersWithNoLogging}`);
}

main();