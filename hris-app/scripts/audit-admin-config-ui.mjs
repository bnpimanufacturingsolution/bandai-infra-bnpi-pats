import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configDir = path.join(root, "app", "routes", "admin", "configuration");
const appDir = path.join(root, "app");
const defaultBaselineNames = ["departments", "sections", "levels"];
const nonCrudVisiblePages = {
	"company-profile.tsx":
		"Visible Company Profile settings form; no DataTable admin configuration list.",
	"migration.tsx":
		"Visible DM migration/import control center; no DataTable admin configuration list.",
};

const args = parseArgs(process.argv.slice(2));
const json = args.json;
const strict = args.strict;

const checks = [
	{
		key: "dataTable",
		label: "DataTable list",
		required: true,
		applicable: () => true,
		test: (source) => /\bDataTable\b/.test(source),
	},
	{
		key: "urlState",
		label: "URL modal/search state",
		required: true,
		applicable: (_source, metrics) => metrics.modalCount > 0 || metrics.createActionPresent,
		test: (source) => /useSearchParams/.test(source) && /action\s*=|searchParams\.get\("action"\)/.test(source),
	},
	{
		key: "serverSearch",
		label: "URL-backed search",
		required: true,
		applicable: () => true,
		test: (source) => /searchParams\.get\("search"\)/.test(source) && /onSearch=/.test(source),
	},
	{
		key: "pagination",
		label: "URL-backed pagination",
		required: true,
		applicable: () => true,
		test: (source) =>
			/searchParams\.get\("page"\)/.test(source) &&
			/searchParams\.get\("limit"\)/.test(source) &&
			/onPageChange=/.test(source),
	},
	{
		key: "filters",
		label: "DataTable filters",
		required: false,
		applicable: (source, metrics) =>
			metrics.filterControlPresent ||
			/\bFilterOption\b/.test(source) ||
			/filters=\{/.test(source) ||
			/onFilterChange=/.test(source),
		test: (source) =>
			/\bFilterOption\b/.test(source) &&
			/(const|let)\s+\w*filter\w*\s*:\s*FilterOption\[\]/i.test(source) &&
			/filters=\{/.test(source),
	},
	{
		key: "zodResolver",
		label: "Zod or schema-equivalent validation",
		required: false,
		applicable: (_source, metrics) => metrics.formBindingPresent,
		test: (source) =>
			/zodResolver/.test(source) ||
			/schema-equivalent validation|register\([^)]*\{[^}]*required|toast\.error|sonnerToast\.error|setValueAs|valueAsNumber/.test(source),
	},
	{
		key: "constraintTokens",
		label: "Constraint tokens",
		required: false,
		applicable: (_source, metrics) => metrics.formBindingPresent && metrics.modalCount > 0,
		test: (source) => /ConstraintTokenRow/.test(source),
	},
	{
		key: "fieldAnchors",
		label: "Inline validation anchors",
		required: false,
		applicable: (_source, metrics) => metrics.formBindingPresent && metrics.modalCount > 0,
		test: (source) =>
			/data-field-path=/.test(source) && (/aria-invalid=/.test(source) || /error=\{/.test(source)),
	},
	{
		key: "modalClass",
		label: "Shared modal sizing",
		required: false,
		applicable: (_source, metrics) => metrics.modalCount > 0,
		test: (source) => /HR_MODAL_(WIDE|STANDARD)_CLASS|admin-configuration-modal/.test(source),
	},
	{
		key: "dropdownActions",
		label: "Compact row actions",
		required: false,
		applicable: (_source, metrics) => metrics.rowActionsPresent,
		test: (source) => /DropdownMenu/.test(source) && /MoreVertical/.test(source),
	},
	{
		key: "emptyGuide",
		label: "Config empty guide",
		required: false,
		applicable: (_source, metrics) => metrics.createActionPresent,
		test: (source) => /ConfigurationEmptyGuide/.test(source),
	},
	{
		key: "csvExport",
		label: "CSV export",
		required: false,
		applicable: (source) => /onExportCSV=|downloadCsvFile|Export/.test(source),
		test: (source) => /onExportCSV=|downloadCsvFile|onExportPDF=|onExportExcel=/.test(source),
	},
	{
		key: "genericImport",
		label: "Generic import modal",
		required: false,
		applicable: (_source, metrics) => metrics.importActionPresent,
		test: (source) => /GenericImportModal/.test(source),
	},
	{
		key: "manualImportUi",
		label: "No manual import UI",
		required: false,
		applicable: (source) => /onDragOver|isDragging|file-upload-|Import Instructions|bg-gradient-to/.test(source),
		test: (source) => !/onDragOver|isDragging|file-upload-|Import Instructions|bg-gradient-to/.test(source),
	},
	{
		key: "noConsoleActions",
		label: "No placeholder console actions",
		required: false,
		applicable: (source) => /console\.log/.test(source),
		test: (source) => !/console\.log\(".*(Archive|Download|position|level)/.test(source),
	},
];

const routeFiles = readdirSync(configDir)
	.filter((file) => file.endsWith(".tsx"))
	.sort();
const auditRouteMap = loadAuditRouteMap();
const visibleRouteMap = auditRouteMap.filter((item) => item.visible);
const auditedFiles = auditRouteMap
	.filter((item) => item.shouldAudit)
	.map((item) => item.file);

const availableFiles = new Set(routeFiles);
const targetFile = args.target ? resolveRouteFile(args.target, "target") : null;
const baselineFiles = resolveBaselineFiles(args.baseline);

const scanFiles = targetFile
	? Array.from(new Set([targetFile, ...baselineFiles]))
	: auditedFiles;
const results = scanFiles.map((file) => analyzeFile(file));
const resultByFile = new Map(results.map((result) => [result.file, result]));

if (targetFile) {
	const targetResult = resultByFile.get(targetFile);
	const baselineResults = baselineFiles
		.map((file) => resultByFile.get(file))
		.filter(Boolean);
	const comparison = compareTarget(targetResult, baselineResults);
	targetResult.hardGaps = comparison.hardGaps;
	targetResult.softDrift = comparison.softDrift;
	targetResult.patternScore = scorePattern(
		targetResult.statuses,
		targetResult.hardGaps,
		targetResult.softDrift,
	);
	targetResult.baselineComparison = baselineResults.map((result) => ({
		file: result.file,
		patternScore: result.patternScore,
		checklistScore: result.score,
		checklistTotal: result.total,
	}));
	targetResult.suggestedReferences = suggestedReferences(baselineResults);
}

if (json) {
	console.log(
		JSON.stringify(
			{
				checks: checks.map(({ key, label, required }) => ({ key, label, required })),
				target: targetFile,
				baseline: baselineFiles,
				scope: targetFile ? "target" : "visible-admin-configuration",
				routeMap: auditRouteMap,
				visibleRouteMap,
				results,
			},
			null,
			2,
		),
	);
} else if (targetFile) {
	printTargetReport(resultByFile.get(targetFile));
} else {
	printAllFilesReport(results);
}

const strictResults = targetFile ? [resultByFile.get(targetFile)] : results;
const hasStrictFailures = strictResults.some(
	(result) => result.requiredFailures.length > 0 || result.hardGaps.length > 0 || result.softDrift.length > 0 || result.patternScore < 100,
);
if (strict && hasStrictFailures) {
	process.exitCode = 1;
}

function parseArgs(argv) {
	const parsed = {
		target: npmConfigValue("target"),
		baseline: npmConfigValue("baseline"),
		json: process.env.npm_config_json === "true",
		strict: process.env.npm_config_strict === "true",
	};
	const positional = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--strict") {
			parsed.strict = true;
			continue;
		}
		if (arg === "--target") {
			parsed.target = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg.startsWith("--target=")) {
			parsed.target = arg.slice("--target=".length);
			continue;
		}
		if (arg === "--baseline") {
			parsed.baseline = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg.startsWith("--baseline=")) {
			parsed.baseline = arg.slice("--baseline=".length);
			continue;
		}
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		fail(`Unknown argument: ${arg}`);
	}

	if (!parsed.target && positional.length > 0) {
		parsed.target = positional[0];
	}
	if (!parsed.baseline && positional.length > 1) {
		parsed.baseline = positional.slice(1).join(",");
	}

	if (parsed.target === "") fail("--target requires a page name.");
	if (parsed.baseline === "") fail("--baseline requires at least one page name.");
	return parsed;
}

function npmConfigValue(key) {
	const value = process.env[`npm_config_${key}`];
	return value && value !== "true" ? value : null;
}

function normalizeRouteName(value) {
	const trimmed = String(value || "").trim();
	if (!trimmed) return "";
	const basename = path.basename(trimmed);
	return basename.endsWith(".tsx") ? basename : `${basename}.tsx`;
}

function resolveRouteFile(value, label) {
	const file = normalizeRouteName(value);
	if (!file || !availableFiles.has(file) || !existsSync(path.join(configDir, file))) {
		fail(
			`Invalid ${label}: ${value}. Expected one of: ${routeFiles
				.map((routeFile) => routeFile.replace(/\.tsx$/, ""))
				.join(", ")}`,
		);
	}
	return file;
}

function resolveBaselineFiles(value) {
	const names = value
		? String(value)
				.split(/[,\s]+/)
				.map((item) => item.trim())
				.filter(Boolean)
		: defaultBaselineNames;

	if (names.length === 0) {
		fail("--baseline requires at least one page name.");
	}

	return names.map((name) => resolveRouteFile(name, "baseline"));
}

function analyzeFile(file) {
	const resolved = readResolvedRouteSource(file);
	const source = resolved.source;
	const metrics = extractMetrics(source);
	const statuses = checks.map((check) => ({
		key: check.key,
		label: check.label,
		required: check.required,
		applicable: check.applicable(source, metrics),
		pass: check.applicable(source, metrics) ? check.test(source, metrics) : true,
	}));
	const requiredFailures = statuses.filter((status) => status.applicable && status.required && !status.pass);
	const warnings = statuses.filter((status) => status.applicable && !status.required && !status.pass);
	const applicableStatuses = statuses.filter((status) => status.applicable);
	const score = applicableStatuses.filter((status) => status.pass).length;
	const total = applicableStatuses.length;
	const hardGaps = buildStandaloneHardGaps(statuses, metrics);
	const softDrift = buildStandaloneSoftDrift(metrics);
	const patternScore = scorePattern(statuses, hardGaps, softDrift);

	return {
		file,
		resolvedFiles: resolved.files,
		score,
		total,
		patternScore,
		requiredFailures,
		warnings,
		statuses,
		metrics,
		hardGaps,
		softDrift,
		baselineComparison: [],
		suggestedReferences: [],
	};
}

function loadAuditRouteMap() {
	const navPath = path.join(appDir, "lib", "admin-navigation.ts");
	const routesPath = path.join(appDir, "routes.ts");
	const navSource = readFileSync(navPath, "utf8");
	const routesSource = readFileSync(routesPath, "utf8");
	const visibleByPath = new Map();
	const routeEntries = [];
	const routePattern = /route\("([^"]+)",\s*"routes\/admin\/configuration\/([^"]+\.tsx)"/g;
	let routeMatch;

	while ((routeMatch = routePattern.exec(routesSource))) {
		routeEntries.push({
			path: `/admin/configuration/${routeMatch[1]}`,
			file: routeMatch[2],
		});
	}

	const itemPattern =
		/id:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?path:\s*"([^"]+)"/g;
	let itemMatch;
	while ((itemMatch = itemPattern.exec(navSource))) {
		const [, id, label, routePath] = itemMatch;
		if (!routePath.startsWith("/admin/configuration/")) continue;
		visibleByPath.set(routePath, { id, label });
	}

	const byFile = new Map();
	for (const entry of routeEntries) {
		if (!entry.file || byFile.has(entry.file)) continue;
		byFile.set(entry.file, buildRouteMapItem(entry, visibleByPath.get(entry.path)));
	}

	for (const file of routeFiles) {
		if (byFile.has(file)) continue;
		const resolved = readResolvedRouteSource(file);
		if (!/\bDataTable\b/.test(resolved.source)) continue;
		byFile.set(file, buildRouteMapItem({ path: null, file }, null));
	}

	return Array.from(byFile.values()).sort((a, b) => {
		if (a.visible !== b.visible) return a.visible ? -1 : 1;
		return (a.path || a.file).localeCompare(b.path || b.file);
	});
}

function buildRouteMapItem(entry, visibleItem) {
	const resolved = readResolvedRouteSource(entry.file);
	const containsDataTable = /\bDataTable\b/.test(resolved.source);
	const excludeReason = !containsDataTable
		? nonCrudVisiblePages[entry.file] || "No DataTable admin configuration list detected."
		: null;

	return {
		sidebarLabel: visibleItem ? "Configuration" : null,
		submenuLabel: visibleItem?.label || null,
		path: entry.path,
		file: entry.file,
		resolvedFiles: resolved.files,
		visible: Boolean(visibleItem),
		containsDataTable,
		crudLike: containsDataTable,
		shouldAudit: containsDataTable,
		excludeReason,
	};
}

function readResolvedRouteSource(file) {
	const filePath = path.join(configDir, file);
	const source = readFileSync(filePath, "utf8");
	if (!isThinRouteWrapper(source)) {
		return { source, files: [path.relative(root, filePath)] };
	}

	const imports = [];
	const files = [path.relative(root, filePath)];
	const importPattern = /import\s+(?:[\w*{}\s,]+)\s+from\s+["']([^"']+)["']/g;
	let match;
	while ((match = importPattern.exec(source))) {
		const resolved = resolveSourceImport(filePath, match[1]);
		if (resolved) {
			imports.push(readFileSync(resolved, "utf8"));
			files.push(path.relative(root, resolved));
		}
	}

	const reExportPattern = /export\s+\{\s*default\s*\}\s+from\s+["']([^"']+)["']/g;
	let reExportMatch;
	while ((reExportMatch = reExportPattern.exec(source))) {
		const resolved = resolveSourceImport(filePath, reExportMatch[1]);
		if (resolved) {
			imports.push(readFileSync(resolved, "utf8"));
			files.push(path.relative(root, resolved));
		}
	}

	return { source: [source, ...imports].join("\n"), files };
}

function isThinRouteWrapper(source) {
	const lineCount = source.split(/\r?\n/).filter((line) => line.trim()).length;
	if (lineCount > 40) return false;
	return (
		/export\s+\{\s*default\s*\}\s+from/.test(source) ||
		/return\s*\(?\s*<\w+/.test(source) ||
		/<Navigate\b/.test(source)
	);
}

function resolveSourceImport(fromFile, specifier) {
	if (!specifier.startsWith("~") && !specifier.startsWith("@") && !specifier.startsWith(".")) {
		return null;
	}

	const basePath =
		specifier.startsWith("~/") || specifier.startsWith("@/")
			? path.join(appDir, specifier.slice(2))
			: path.resolve(path.dirname(fromFile), specifier);
	const candidates = [
		basePath,
		`${basePath}.tsx`,
		`${basePath}.ts`,
		path.join(basePath, "index.tsx"),
		path.join(basePath, "index.ts"),
	];

	return candidates.find((candidate) => existsSync(candidate)) || null;
}

function extractMetrics(source) {
	return {
		lineCount: source.split(/\r?\n/).length,
		dataTableCount: countMatches(source, /<DataTable\b/g),
		modalCount: countMatches(source, /<Modal\b/g),
		genericImportModalPresent: /<GenericImportModal\b|GenericImportModal/.test(source),
		configurationEmptyGuidePresent: /ConfigurationEmptyGuide/.test(source),
		constraintTokenRowCount: countMatches(source, /<ConstraintTokenRow\b/g),
		badgeCount: countMatches(source, /<Badge\b/g),
		badgeClassNameOverrideCount: countMatches(source, /<Badge\b(?=[^>]*\bclassName=)[^>]*>/g),
		nativeSelectCount: countMatches(source, /<select\b/g),
		sharedSelectPrimitivePresent:
			/import\s+\{[^}]*\bSelect\b[^}]*\}\s+from\s+["']~\/components\/atoms\/Select["']/.test(source) ||
			/import\s+\{[^}]*\bSelect\b[^}]*\}\s+from\s+["']~\/components\/ui\/select["']/.test(source),
		useSearchParamsPresent: /useSearchParams/.test(source),
		searchParamUsage: {
			search: /searchParams\.get\("search"\)/.test(source),
			page: /searchParams\.get\("page"\)/.test(source),
			limit: /searchParams\.get\("limit"\)/.test(source),
			status: /searchParams\.get\("status"\)/.test(source),
		},
		onSearchPresent: /onSearch=/.test(source),
		onFilterChangePresent: /onFilterChange=/.test(source),
		onPageChangePresent: /onPageChange=/.test(source),
		dropdownRowActionsPresent: /DropdownMenu/.test(source) && /MoreVertical/.test(source),
		hrModalWidthConstantsPresent: /HR_MODAL_(WIDE|STANDARD)_CLASS/.test(source),
		zodResolverUsage: /zodResolver/.test(source),
		ariaInvalidCount: countMatches(source, /aria-invalid=/g),
		dataFieldPathCount: countMatches(source, /data-field-path=/g),
		formSectionCount: countMatches(
			source,
			/className=["'][^"']*rounded-(?:lg|xl)[^"']*border[^"']*bg-white[^"']*p-[34][^"']*["']/g,
		),
		helperParagraphCount: countMatches(source, /<p\s+className=["'][^"']*text-xs[^"']*(?:gray|slate|emerald|red)[^"']*["']/g),
		suspiciousDecorativeClassCount: countMatches(
			source,
			/bg-gradient-to|shadow-\[|shadow-(?:lg|xl|2xl)|rounded-(?:2xl|3xl|full)|from-|to-|via-|backdrop-blur|glass|drop-shadow/gi,
		),
		customPolicyStatusClassCount: countMatches(
			source,
			/get[A-Za-z]*(?:Badge|Policy|Status)[A-Za-z]*Class|TABLE_BADGE_CLASS|className=\{get[A-Za-z]*(?:Badge|Policy|Status)/g,
		),
		viewModalFieldCount: countViewModalFields(source),
		createActionPresent: /onAdd=\{|openCreate|action"\s*,\s*"create"|action',\s*'create'/.test(source),
		importActionPresent: /onImport=\{|openImport|action"\s*,\s*"import"|action',\s*'import'/.test(source),
		actionParamPresent: /searchParams\.get\("action"\)/.test(source),
		formBindingPresent: /useForm|<form\b|register\(|onSubmit=|handleSubmit/.test(source),
		filterControlPresent: /filterOptions|filterValues|filters=\{|onFilterChange=|searchParams\.get\("status"\)/.test(source),
		rowActionsPresent: /renderActions|onEdit=|onDelete=|onView=/.test(source),
	};
}

function scorePattern(statuses, hardGaps, softDrift) {
	const applicableStatuses = statuses.filter((status) => status.applicable);
	if (!applicableStatuses.length) return 0;
	if (hardGaps.length || softDrift.length) {
		const passCount = applicableStatuses.filter((status) => status.pass).length;
		return Math.max(0, Math.min(99, Math.round((passCount / applicableStatuses.length) * 100)));
	}
	const failed = applicableStatuses.filter((status) => !status.pass).length;
	if (failed) {
		const passCount = applicableStatuses.length - failed;
		return Math.round((passCount / applicableStatuses.length) * 100);
	}
	return 100;
}

function buildStandaloneHardGaps(statuses, metrics) {
	const gaps = statuses
		.filter((status) => status.applicable && status.required && !status.pass)
		.map((status) => `Missing ${status.label}.`);

	if (metrics.nativeSelectCount > 0) {
		gaps.push(`Uses native <select> ${metrics.nativeSelectCount} time(s) in admin configuration UI.`);
	}
	if (metrics.createActionPresent && !metrics.configurationEmptyGuidePresent) {
		gaps.push("Create action exists but ConfigurationEmptyGuide is missing from the empty state.");
	}
	if (metrics.importActionPresent && !metrics.genericImportModalPresent) {
		gaps.push("Import action exists but GenericImportModal is missing.");
	}
	if (!metrics.actionParamPresent && metrics.modalCount > 0) {
		gaps.push("Modals exist but action query-param handling was not detected.");
	}
	if (metrics.importActionPresent && metrics.suspiciousDecorativeClassCount > 0 && !metrics.genericImportModalPresent) {
		gaps.push("Import flow appears to use custom decorative/manual UI instead of the shared import modal.");
	}

	return Array.from(new Set(gaps));
}

function buildStandaloneSoftDrift(metrics) {
	const drift = [];
	if (metrics.badgeClassNameOverrideCount > 8) {
		drift.push(`Badge className overrides are high (${metrics.badgeClassNameOverrideCount}); prefer Badge variants when possible.`);
	}
	if (metrics.helperParagraphCount > 8) {
		drift.push(`Helper paragraph count is high (${metrics.helperParagraphCount}); labels/tokens may already carry the context.`);
	}
	if (metrics.suspiciousDecorativeClassCount > 8) {
		drift.push(`Decorative/heavy classes are elevated (${metrics.suspiciousDecorativeClassCount}).`);
	}
	return drift;
}

function compareTarget(target, baselines) {
	const hardGaps = [...target.hardGaps];
	const softDrift = [];
	const baselineMedians = medianMetrics(baselines.map((result) => result.metrics));
	const baselinePassedKeys = new Set(
		checks
			.filter((check) =>
				check.required && baselines.length > 0
					? baselines.every((result) => result.statuses.find((status) => status.key === check.key)?.pass)
					: false,
			)
			.map((check) => check.key),
	);

	for (const status of target.statuses) {
		if (status.required && !status.pass && baselinePassedKeys.has(status.key)) {
			hardGaps.push(`Target fails ${status.label}, while every selected baseline passes it.`);
		}
	}

	const targetUsesSchemaValidation = target.statuses.find((status) => status.key === "zodResolver")?.pass;
	if (!targetUsesSchemaValidation && baselineMedians.zodResolverUsage > 0) {
		softDrift.push("Missing zodResolver while the selected baseline set mostly uses schema-backed forms.");
	}
	if (!target.metrics.hrModalWidthConstantsPresent && baselineMedians.hrModalWidthConstantsPresent > 0) {
		softDrift.push("Missing shared HR modal width constants used by baseline pages.");
	}
	if (target.metrics.badgeClassNameOverrideCount > Math.max(1, baselineMedians.badgeClassNameOverrideCount + 1)) {
		softDrift.push(
			`Badge className overrides are high (${target.metrics.badgeClassNameOverrideCount}) versus baseline median ${baselineMedians.badgeClassNameOverrideCount}. Prefer Badge variants when possible.`,
		);
	}
	if (target.metrics.badgeCount > Math.max(4, baselineMedians.badgeCount * 1.5)) {
		softDrift.push(
			`Badge count is high (${target.metrics.badgeCount}) versus baseline median ${baselineMedians.badgeCount}; policy/status rendering may be visually heavier than sibling pages.`,
		);
	}
	if (target.metrics.formSectionCount > Math.max(3, baselineMedians.formSectionCount + 1)) {
		softDrift.push(
			`Form/view section count is high (${target.metrics.formSectionCount}) versus baseline median ${baselineMedians.formSectionCount}; check for dense modal grouping.`,
		);
	}
	if (target.metrics.helperParagraphCount > Math.max(3, baselineMedians.helperParagraphCount + 1)) {
		softDrift.push(
			`Helper paragraph count is high (${target.metrics.helperParagraphCount}) versus baseline median ${baselineMedians.helperParagraphCount}; labels/tokens may already carry the context.`,
		);
	}
	if (target.metrics.customPolicyStatusClassCount > baselineMedians.customPolicyStatusClassCount + 1) {
		softDrift.push("Custom policy/status class helpers exceed the baseline pattern; inspect for class-heavy badge rendering.");
	}
	if (target.metrics.viewModalFieldCount > Math.max(8, baselineMedians.viewModalFieldCount * 1.5)) {
		softDrift.push(
			`View modal appears denser (${target.metrics.viewModalFieldCount} label/value fields) than baseline median ${baselineMedians.viewModalFieldCount}.`,
		);
	}
	if (target.metrics.suspiciousDecorativeClassCount > Math.max(2, baselineMedians.suspiciousDecorativeClassCount + 2)) {
		softDrift.push(
			`Decorative/heavy classes are elevated (${target.metrics.suspiciousDecorativeClassCount}) versus baseline median ${baselineMedians.suspiciousDecorativeClassCount}.`,
		);
	}

	return {
		hardGaps: Array.from(new Set(hardGaps)),
		softDrift: Array.from(new Set([...target.softDrift, ...softDrift])),
	};
}

function medianMetrics(metricsList) {
	const keys = [
		"badgeClassNameOverrideCount",
		"badgeCount",
		"formSectionCount",
		"helperParagraphCount",
		"customPolicyStatusClassCount",
		"viewModalFieldCount",
		"suspiciousDecorativeClassCount",
	];
	const output = {};

	for (const key of keys) {
		output[key] = median(metricsList.map((metrics) => metrics[key] || 0));
	}

	output.zodResolverUsage = median(metricsList.map((metrics) => (metrics.zodResolverUsage ? 1 : 0)));
	output.hrModalWidthConstantsPresent = median(
		metricsList.map((metrics) => (metrics.hrModalWidthConstantsPresent ? 1 : 0)),
	);

	return output;
}

function suggestedReferences(baselineResults) {
	const available = new Set(baselineResults.map((result) => result.file));
	const suggestions = [];
	if (available.has("departments.tsx")) {
		suggestions.push("departments.tsx for full admin configuration architecture");
	}
	if (available.has("levels.tsx")) {
		suggestions.push("levels.tsx for compact hierarchy-style modal/table pattern");
	}
	if (available.has("sections.tsx")) {
		suggestions.push("sections.tsx for relationship fields and shared row actions");
	}
	for (const result of baselineResults) {
		if (!suggestions.some((item) => item.startsWith(result.file))) {
			suggestions.push(`${result.file} for selected baseline comparison`);
		}
	}
	return suggestions;
}

function printAllFilesReport(scanResults) {
	console.log("Admin configuration UI audit\n");
	for (const result of scanResults) {
		const requiredMark = result.requiredFailures.length ? "FAIL" : "OK";
		console.log(`${requiredMark} ${result.file} ${result.score}/${result.total} (${result.patternScore}/100)`);
		if (result.requiredFailures.length) {
			console.log(
				`  required: ${result.requiredFailures.map((item) => item.label).join(", ")}`,
			);
		}
		if (result.warnings.length) {
			console.log(`  watch: ${result.warnings.map((item) => item.label).join(", ")}`);
		}
	}
}

function printTargetReport(result) {
	console.log(`${result.file}`);
	console.log(`Pattern score: ${result.patternScore}/100`);
	console.log(`Checklist: ${result.score}/${result.total}`);
	console.log("");

	printList("Hard gaps", result.hardGaps);
	printList("Soft drift", result.softDrift);

	console.log("Baseline comparison:");
	for (const baseline of result.baselineComparison) {
		console.log(
			`- ${baseline.file}: ${baseline.patternScore}/100 (${baseline.checklistScore}/${baseline.checklistTotal})`,
		);
	}
	console.log("");

	printList("Suggested reference", result.suggestedReferences);

	console.log("Metrics:");
	console.log(
		[
			`- lines: ${result.metrics.lineCount}`,
			`DataTable: ${result.metrics.dataTableCount}`,
			`Modal: ${result.metrics.modalCount}`,
			`ConstraintTokenRow: ${result.metrics.constraintTokenRowCount}`,
			`Badge overrides: ${result.metrics.badgeClassNameOverrideCount}`,
			`native select: ${result.metrics.nativeSelectCount}`,
			`form sections: ${result.metrics.formSectionCount}`,
			`helper paragraphs: ${result.metrics.helperParagraphCount}`,
		].join(", "),
	);
}

function printList(label, items) {
	console.log(`${label}:`);
	if (!items.length) {
		console.log("- None");
		console.log("");
		return;
	}
	for (const item of items) {
		console.log(`- ${item}`);
	}
	console.log("");
}

function countMatches(source, regex) {
	return source.match(regex)?.length || 0;
}

function countViewModalFields(source) {
	const viewModalMatch = source.match(/open=\{action === "view"\}[\s\S]*?(?=<Modal|\n\s*<GenericImportModal|\n\s*<\/div>\n\s*\);)/);
	if (!viewModalMatch) return 0;
	return countMatches(viewModalMatch[0], /<label\b|className=["'][^"']*uppercase tracking-wider/g);
}

function median(values) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2) return sorted[middle];
	return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function fail(message) {
	console.error(`Admin configuration UI audit error: ${message}`);
	process.exit(1);
}
