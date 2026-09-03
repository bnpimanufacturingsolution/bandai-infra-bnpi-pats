// @ts-nocheck
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";
import {
	JsxAttribute,
	Node,
	Project,
	QuoteKind,
	SyntaxKind,
	type JsxSelfClosingElement,
	type JsxOpeningElement,
	type SourceFile,
} from "ts-morph";

type Scope = "visible" | "hierarchy" | "all";
type PageType =
	| "crud-table"
	| "settings-form"
	| "import-workbench"
	| "redirect-wrapper"
	| "documentation";

interface CliArgs {
	target?: string;
	scope: Scope;
	apply: boolean;
	json: boolean;
	strict: boolean;
	visual: boolean;
}

interface NavItem {
	id: string;
	label: string;
	path: string;
	file?: string;
	visible: boolean;
}

interface Finding {
	severity: "hard" | "drift" | "info";
	code: string;
	message: string;
}

interface PageReport {
	file: string;
	label: string;
	path: string;
	pageType: PageType;
	score: number;
	findings: Finding[];
	metrics: Record<string, unknown>;
	fixes: string[];
}

const appRoot = process.cwd();
const configDir = path.join(appRoot, "app", "routes", "admin", "configuration");
const dataTableSourcePath = path.join(appRoot, "app", "components", "atoms", "DataTable.tsx");
const args = parseArgs(process.argv.slice(2));
const hierarchyFiles = new Set(["departments.tsx", "sections.tsx", "positions.tsx", "levels.tsx"]);
const configurationCrudTableIds = new Set([
	"users",
	"employees",
	"departments",
	"sections",
	"positions",
	"levels",
	"schedule-templates",
	"leave-types",
	"document-201-types",
	"benefit-types",
	"agencies",
	"holidays",
	"payroll-periods",
	"devices",
]);

const project = new Project({
	tsConfigFilePath: path.join(appRoot, "tsconfig.json"),
	manipulationSettings: {
		quoteKind: QuoteKind.Double,
		useTrailingCommas: true,
	},
	skipAddingFilesFromTsConfig: true,
});

const dataTableImplementationText = existsSync(dataTableSourcePath)
	? readFileSync(dataTableSourcePath, "utf8")
	: "";
const hasContainedScrollImplementation = [
	"containedScroll?: boolean",
	"containedTableHeaderViewportClassName",
	"containedTableBodyViewportClassName",
	"data-datatable-header-viewport",
	"data-datatable-body-viewport",
	"syncContainedHeaderScroll",
	"CardContent className={cardContentClassName}",
].every((pattern) => dataTableImplementationText.includes(pattern));
const hasLegacySingleScrollTableHeader = /data-datatable-body-viewport[\s\S]{0,1200}<thead\b/.test(
	dataTableImplementationText,
);
const hasPaginationMarker = /data-datatable-pagination/.test(dataTableImplementationText);
const hasPaginationInsideBodyScroller =
	/data-datatable-body-viewport[^>]*>\s*data-datatable-pagination/.test(
		dataTableImplementationText,
	);
const containedCardClipsPagination =
	/containedScroll\s*&&\s*["'`][^"'`]*overflow-hidden/.test(dataTableImplementationText);

const navItems = loadAdminConfigurationNavItems(project);
const targetItems = filterNavItems(navItems, args);
const reports = targetItems.map((item) => analyzePage(item));

if (args.visual) {
	await appendVisualReports(reports);
	for (const report of reports) {
		report.score = calculateScore(report.findings);
	}
}

if (args.apply) {
	for (const sourceFile of new Set(project.getSourceFiles())) {
		if (sourceFile.isSaved()) continue;
		sourceFile.saveSync();
	}
}

if (args.json) {
	console.log(JSON.stringify({ scope: args.scope, apply: args.apply, reports }, null, 2));
} else {
	printReport(reports, args.apply);
}

if (
	args.strict &&
	reports.some((report) => report.findings.some((finding) => finding.severity === "hard"))
) {
	process.exitCode = 1;
}

function parseArgs(argv: string[]): CliArgs {
	const parsed: CliArgs = {
		target: npmConfig("target"),
		scope: parseOptionalScope(npmConfig("scope")) || "visible",
		apply: npmFlag("apply"),
		json: npmFlag("json"),
		strict: npmFlag("strict"),
		visual: npmFlag("visual"),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--apply") {
			parsed.apply = true;
			continue;
		}
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--strict") {
			parsed.strict = true;
			continue;
		}
		if (arg === "--visual") {
			parsed.visual = true;
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
		if (arg === "--scope") {
			parsed.scope = parseScope(argv[index + 1]);
			index += 1;
			continue;
		}
		if (arg.startsWith("--scope=")) {
			parsed.scope = parseScope(arg.slice("--scope=".length));
			continue;
		}
		if (!arg.startsWith("--")) {
			parsed.target = arg;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return parsed;
}

function parseScope(value: string | undefined): Scope {
	if (value === "visible" || value === "hierarchy" || value === "all") return value;
	throw new Error(`Invalid scope "${value}". Use visible, hierarchy, or all.`);
}

function parseOptionalScope(value: string | undefined) {
	return value ? parseScope(value) : undefined;
}

function npmConfig(key: string) {
	const value = process.env[`npm_config_${key}`];
	return value && value !== "true" ? value : undefined;
}

function npmFlag(key: string) {
	return process.env[`npm_config_${key}`] === "true";
}

function loadAdminConfigurationNavItems(activeProject: Project): NavItem[] {
	const navFile = activeProject.addSourceFileAtPath(
		path.join(appRoot, "app", "lib", "admin-navigation.ts"),
	);
	const routesFile = activeProject.addSourceFileAtPath(path.join(appRoot, "app", "routes.ts"));
	const routeMap = new Map<string, string>();

	for (const call of routesFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
		if (call.getExpression().getText() !== "route") continue;
		const args = call.getArguments();
		const routePath = stripQuotes(args[0]?.getText() || "");
		const routeFile = stripQuotes(args[1]?.getText() || "");
		if (!routeFile.startsWith("routes/admin/configuration/")) continue;
		routeMap.set(`/admin/configuration/${routePath}`, path.basename(routeFile));
	}

	const declaration = navFile.getVariableDeclarationOrThrow("adminConfigurationItems");
	const initializer = declaration.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

	return initializer
		.getElements()
		.map((element) => {
			if (!Node.isObjectLiteralExpression(element)) return null;
			const id = getObjectStringProperty(element, "id");
			const label = getObjectStringProperty(element, "label");
			const routePath = getObjectStringProperty(element, "path");
			if (!id || !label || !routePath) return null;
			return {
				id,
				label,
				path: routePath,
				file: routeMap.get(routePath),
				visible: true,
			};
		})
		.filter(Boolean) as NavItem[];
}

function filterNavItems(items: NavItem[], cli: CliArgs): NavItem[] {
	const withFiles = items.filter(
		(item) => item.file && existsSync(path.join(configDir, item.file)),
	);
	const scoped =
		cli.scope === "hierarchy"
			? withFiles.filter((item) => item.file && hierarchyFiles.has(item.file))
			: cli.scope === "visible"
				? withFiles
				: withFiles;

	if (!cli.target) return scoped;
	const normalizedTarget = normalizeTarget(cli.target);
	const matches = scoped.filter(
		(item) =>
			normalizeTarget(item.id) === normalizedTarget ||
			normalizeTarget(item.label) === normalizedTarget ||
			normalizeTarget(item.file || "") === normalizedTarget,
	);
	if (!matches.length) {
		throw new Error(`No admin configuration page matched target "${cli.target}".`);
	}
	return matches;
}

function analyzePage(item: NavItem): PageReport {
	const file = item.file || "";
	const sourceFiles = resolveAnalysisSourceFiles(path.join(configDir, file));
	const dataTables = sourceFiles.flatMap((sourceFile) =>
		getJsxSelfClosingElements(sourceFile, "DataTable"),
	);
	const modals = sourceFiles.flatMap((sourceFile) => getJsxElements(sourceFile, "Modal"));
	const genericImportModals = sourceFiles.flatMap((sourceFile) =>
		getJsxSelfClosingElements(sourceFile, "GenericImportModal"),
	);
	const findings: Finding[] = [];
	const fixes: string[] = [];
	const sourceText = sourceFiles.map((sourceFile) => sourceFile.getFullText()).join("\n");
	const dataTable = dataTables[0];
	const dataTableProps = dataTable ? getJsxProps(dataTable) : new Set<string>();
	const dataTablesWithTitleActionDrift = dataTables.filter(hasTitleActionImportAddDrift);
	const pageType = classifyPage(item, sourceText, dataTables.length);
	const isConfigurationCrudTable =
		configurationCrudTableIds.has(item.id) && pageType === "crud-table";
	const isEmployeeDirectory = item.id === "employees";
	const hasCreateAction = dataTableProps.has("onAdd") || /openCreate/.test(sourceText);
	const hasImportAction = dataTableProps.has("onImport");
	const hasImportImplementation = /\b(openImport|GenericImportModal|onImport=)/.test(sourceText);
	const hasExportAction =
		dataTableProps.has("onExport") ||
		dataTableProps.has("onExportCSV") ||
		dataTableProps.has("onExportPDF") ||
		dataTableProps.has("onExportExcel");
	const hasActions = dataTableProps.has("renderActions") || /on(Edit|Delete|View)=/.test(sourceText);
	const usesSearchParams = /\buseSearchParams\b/.test(sourceText);
	const usesNativeSelect = /<select\b/.test(sourceText);
	const localModalConstantsByFile = sourceFiles
		.map((sourceFile) => ({
			sourceFile,
			names: findLocalModalConstantNames(sourceFile),
		}))
		.filter((entry) => entry.names.length > 0);
	const localModalConstants = localModalConstantsByFile.flatMap((entry) => entry.names);
	const importsSharedModal = sourceFiles.some((sourceFile) =>
		hasNamedImport(sourceFile, "~/lib/ui/admin-configuration-modal"),
	);
	const modalDescriptions = modals.filter((modal) => hasJsxProp(modal, "description")).length;
	const tableDescription = dataTable ? getJsxAttribute(dataTable, "description") : undefined;
	const rowActionsAreCompact = /DropdownMenu/.test(sourceText) && /MoreVertical/.test(sourceText);
	const usesSharedTablePresentationHelper =
		/AdminConfig(Chip|StatusBadge|MissingValue)/.test(sourceText) ||
		sourceFiles.some((sourceFile) =>
			hasNamedImport(sourceFile, "~/lib/ui/admin-configuration-table"),
		);
	const hasConstraintTokens = /ConstraintTokenRow/.test(sourceText);
	const hasFieldAnchors = /data-field-path=/.test(sourceText);
	const hasFilterControl = dataTableProps.has("filters") && dataTableProps.has("onFilterChange");
	const hasControlledFilterValues = dataTableProps.has("filterValues");
	const dataTablesMissingContainedScroll = dataTables.filter(
		(table) => !hasJsxProp(table, "containedScroll"),
	);
	const hasFilterIntent =
		dataTableProps.has("filters") ||
		/\bfilterOptions\b/.test(sourceText) ||
		/searchParams\.get\("status"\)/.test(sourceText) ||
		/searchParams\.get\("type"\)/.test(sourceText) ||
		/searchParams\.get\("category"\)/.test(sourceText);
	const hasUrlPagination =
		/searchParams\.get\("page"\)/.test(sourceText) &&
		/searchParams\.get\("limit"\)/.test(sourceText) &&
		dataTableProps.has("onPageChange");
	const hasUrlSearch =
		/searchParams\.get\("search"\)/.test(sourceText) && dataTableProps.has("onSearch");
	const hasUrlSort =
		/searchParams\.get\("sort"\)/.test(sourceText) &&
		/searchParams\.get\("order"\)/.test(sourceText) &&
		dataTableProps.has("onSort") &&
		dataTableProps.has("sortKey") &&
		dataTableProps.has("sortDirection");
	const hasServiceSortParams = /\bsort:\s*\w+/.test(sourceText) && /\border:\s*\w+/.test(sourceText);
	const hasExplicitSortableColumns = /sortable:\s*true/.test(sourceText);
	const hasServerPagination = dataTableProps.has("totalItems") || dataTableProps.has("currentPage");
	const hasColumnPriorityMetadata =
		/priority:\s*"(critical|high|medium|low)"/.test(sourceText) ||
		/hideBelow:\s*"(xl|lg|md|sm)"/.test(sourceText);
	const hasActionColumnPinning =
		/sticky right-0/.test(dataTableImplementationText) &&
		/data-datatable-action-column/.test(dataTableImplementationText);
	const usesRandomBadgeClasses =
		/<Badge[\s\S]{0,180}className=/.test(sourceText) &&
		!/AdminConfig(StatusBadge|CategoryChip|SourceChip|PriorityChip|PolicyChip|CodeChip|Chip)/.test(
			sourceText,
		);
	const hasRawMissingDash =
		!usesSharedTablePresentationHelper &&
		(/<(?:span|p|div)[^>]*>\s*-\s*<\/(?:span|p|div)>/.test(sourceText) ||
			/\|\|\s*["']-["']/.test(sourceText));
	const hasCodeLikeColumn = /label:\s*["'`](Code|Employee ID|Serial|Device Serial|Document Code)["'`]/i.test(
		sourceText,
	);
	const hasSharedCodeChip = /AdminConfig(CodeChip|Chip[^]*kind=["']code["'])/.test(sourceText);
	const hasDateLikeColumn = /label:\s*["'`](Updated|Date|Hire Date|Pay Date|Start Date|End Date)["'`]/i.test(
		sourceText,
	);
	const hasSharedDateText = /AdminConfigDateText|tabular-nums/.test(sourceText);
	const hasRelationLikeColumn =
		/label:\s*["'`](Department|Section|Manager|Section Head|Default Schedule|Schedule|Position|Level|Allowed Levels)["'`]/i.test(
			sourceText,
		);
	const hasRelationRenderer = /AdminConfigRelation(Link|Text)|renderConfigLink/.test(sourceText);
	const shouldCheckRelationRenderer = hasRelationLikeColumn && item.id !== "devices";
	const hasFakeRelationLink =
		/hover:underline/.test(sourceText) && !/AdminConfigRelationLink|renderConfigLink/.test(sourceText);
	const employeeListHasInvalidNameSort =
		item.id === "employees" &&
		(/sortParam\s*=\s*searchParams\.get\("sort"\)\s*\|\|\s*"name"/.test(sourceText) ||
			/next\.set\("sort",\s*key\)/.test(sourceText));
	const documentImportWithoutSupport =
		item.id === "document-201-types" &&
		/Import/.test(sourceText) &&
		!/\b(onImport|GenericImportModal|openImport|useImport)/.test(sourceText);

	if (pageType === "crud-table" && !dataTable) {
		findings.push(
			hard(
				"missing-datatable",
				"Visible configuration route does not use the shared DataTable.",
			),
		);
	}
	if (isConfigurationCrudTable && dataTablesMissingContainedScroll.length > 0) {
		findings.push(
			drift(
				"missing-contained-scroll",
				"Configuration CRUD DataTable is missing containedScroll for bounded internal row scrolling.",
			),
		);
		if (args.apply) {
			const fixedCount = addBooleanJsxAttribute(
				dataTablesMissingContainedScroll,
				"containedScroll",
			);
			if (fixedCount > 0) {
				fixes.push(`Added containedScroll to ${fixedCount} DataTable usage(s).`);
			}
		}
	}
	if (isConfigurationCrudTable && !hasContainedScrollImplementation) {
		findings.push(
			hard(
				"broken-contained-scroll-implementation",
				"DataTable containedScroll implementation is missing the split header/body viewport structure.",
			),
		);
	}
	if (isConfigurationCrudTable && hasLegacySingleScrollTableHeader) {
		findings.push(
			hard(
				"legacy-contained-scroll-header",
				"DataTable containedScroll still appears to place thead inside the vertical overflow container.",
			),
		);
	}
	if (isConfigurationCrudTable && !hasPaginationMarker) {
		findings.push(
			hard(
				"missing-pagination-marker",
				"DataTable pagination lacks a data-datatable-pagination marker for visual clipping checks.",
			),
		);
	}
	if (isConfigurationCrudTable && hasPaginationInsideBodyScroller) {
		findings.push(
			hard(
				"pagination-inside-row-scroller",
				"DataTable pagination appears inside or too near the row body scroller implementation.",
			),
		);
	}
	if (isConfigurationCrudTable && containedCardClipsPagination) {
		findings.push(
			hard(
				"pagination-card-clipped",
				"Contained DataTable card uses overflow-hidden and may clip pagination below the table frame.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && !hasUrlSearch) {
		findings.push(
			hard(
				"missing-url-search",
				"DataTable search is not URL-backed with searchParams + onSearch.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && !hasUrlPagination) {
		findings.push(
			hard(
				"missing-url-pagination",
				"DataTable pagination is not URL-backed with page/limit + onPageChange.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && hasServerPagination && hasExplicitSortableColumns) {
		if (!hasUrlSort) {
			findings.push(
				hard(
					"missing-url-sort",
					"Server-backed DataTable has sortable columns but sort/order are not URL-backed through DataTable onSort.",
				),
			);
		}
		if (!hasServiceSortParams) {
			findings.push(
				hard(
					"missing-service-sort",
					"Server-backed DataTable has sortable columns but sort/order are not passed to the service query params.",
				),
			);
		}
	}
	if (pageType === "crud-table" && modals.length > 0 && !usesSearchParams) {
		findings.push(
			hard(
				"missing-url-modal-state",
				"Modal state exists but useSearchParams was not detected.",
			),
		);
	}
	if (usesNativeSelect) {
		findings.push(hard("native-select", "Native <select> detected in admin configuration UI."));
	}
	if (
		pageType === "crud-table" &&
		!isEmployeeDirectory &&
		hasCreateAction &&
		!/ConfigurationEmptyGuide/.test(sourceText)
	) {
		findings.push(
			hard(
				"missing-empty-guide",
				"Create action exists but ConfigurationEmptyGuide is missing.",
			),
		);
	}
	if (isConfigurationCrudTable && dataTablesWithTitleActionDrift.length > 0) {
		findings.push(
			drift(
				"title-action-placement",
				"Import/Add controls appear in DataTable titleActions; keep Import/Add in the toolbar row via onImport/onAdd.",
			),
		);
	}
	if (
		pageType === "crud-table" &&
		dataTable &&
		!hasImportAction &&
		/Import/.test(getDataTableAttributeText(dataTable, "titleActions") || "")
	) {
		findings.push(
			hard(
				"unsupported-import-title-action",
				"Import appears in DataTable titleActions but the table has no real onImport capability.",
			),
		);
	}
	if (
		pageType === "crud-table" &&
		!isEmployeeDirectory &&
		hasImportAction &&
		genericImportModals.length === 0
	) {
		findings.push(
			hard(
				"missing-generic-import",
				"Import action exists but GenericImportModal is missing.",
			),
		);
	}
	if (
		pageType === "crud-table" &&
		dataTable &&
		!rowActionsAreCompact &&
		/renderActions|onEdit=|onDelete=|onView=/.test(sourceText)
	) {
		findings.push(
			drift("row-actions", "Row actions are not the compact MoreVertical dropdown pattern."),
		);
	}
	if (isConfigurationCrudTable && !hasActionColumnPinning) {
		findings.push(
			hard(
				"missing-action-column-pinning",
				"Shared DataTable does not expose a sticky right action column marker.",
			),
		);
	}
	if (isConfigurationCrudTable && dataTable && !hasColumnPriorityMetadata) {
		findings.push(
			drift(
				"missing-column-priority",
				"Configuration DataTable columns do not declare priority/hideBelow metadata for predictable responsive visibility.",
			),
		);
	}
	if (isConfigurationCrudTable && usesRandomBadgeClasses) {
		findings.push(
			drift(
				"badge-taxonomy-drift",
				"Page uses page-specific Badge class strings instead of the shared admin configuration badge taxonomy.",
			),
		);
	}
	if (isConfigurationCrudTable && hasRawMissingDash) {
		findings.push(
			drift(
				"raw-missing-dash",
				"Page appears to render missing values as raw '-' instead of AdminConfigMutedDash.",
			),
		);
	}
	if (isConfigurationCrudTable && hasCodeLikeColumn && !hasSharedCodeChip) {
		findings.push(
			drift("code-chip-missing", "Code-like columns should use AdminConfigCodeChip."),
		);
	}
	if (
		isConfigurationCrudTable &&
		hasDateLikeColumn &&
		!hasSharedDateText &&
		item.id !== "document-201-types"
	) {
		findings.push(
			drift("date-helper-missing", "Date-like columns should use AdminConfigDateText or tabular muted date styling."),
		);
	}
	if (isConfigurationCrudTable && shouldCheckRelationRenderer && !hasRelationRenderer) {
		findings.push(
			drift(
				"relation-renderer-missing",
				"Relation-like columns should use shared relation text/link rendering.",
			),
		);
	}
	if (isConfigurationCrudTable && hasFakeRelationLink) {
		findings.push(
			hard(
				"fake-relation-link",
				"Hover underline styling was found without the shared relation link renderer.",
			),
		);
	}
	if (employeeListHasInvalidNameSort) {
		findings.push(
			hard(
				"employee-invalid-name-sort",
				"EmployeeList can still send invalid backend sort keys such as name.",
			),
		);
	}
	if (documentImportWithoutSupport) {
		findings.push(
			hard(
				"document-import-without-support",
				"201 Document Types appears to expose Import text without real import support.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && tableDescription) {
		findings.push(
			drift(
				"datatable-subcaption",
				"DataTable has a description/subcaption; visible configuration CRUD tables should stay title-only unless product-specific.",
			),
		);
		if (args.apply && removeJsxAttribute(dataTable, "description")) {
			fixes.push("Removed redundant DataTable description/subcaption.");
		}
	}
	if (
		pageType !== "redirect-wrapper" &&
		modals.length > 0 &&
		modalDescriptions > Math.max(1, Math.ceil(modals.length / 2))
	) {
		findings.push(
			drift(
				"modal-helper-copy",
				`${modalDescriptions} Modal descriptions detected; prefer labels/tokens over repeated helper copy.`,
			),
		);
		if (args.apply) {
			const removedCount = removeModalDescriptions(modals);
			if (removedCount > 0) {
				fixes.push(`Removed ${removedCount} redundant Modal description prop(s).`);
			}
		}
	}
	if (pageType !== "redirect-wrapper" && modals.length > 0 && localModalConstants.length > 0) {
		findings.push(
			drift(
				"local-modal-constants",
				"Local HR modal constants duplicate the shared admin configuration modal shell.",
			),
		);
		if (args.apply) {
			for (const entry of localModalConstantsByFile) {
				if (applySharedModalConstantCutover(entry.sourceFile, entry.names)) {
					fixes.push(
						`Replaced local HR modal constants with shared admin-configuration-modal imports in ${path.relative(appRoot, entry.sourceFile.getFilePath())}.`,
					);
				}
			}
		}
	}
	if (
		pageType !== "redirect-wrapper" &&
		!isEmployeeDirectory &&
		modals.length > 0 &&
		!importsSharedModal &&
		localModalConstants.length === 0
	) {
		findings.push(
			drift(
				"untracked-modal-shell",
				"Modal class source is not the shared admin configuration modal helper.",
			),
		);
	}
	if (
		pageType === "crud-table" &&
		!isEmployeeDirectory &&
		hasCreateAction &&
		!hasConstraintTokens
	) {
		findings.push(
			drift(
				"missing-constraint-tokens",
				"Create/edit form exists without ConstraintTokenRow usage.",
			),
		);
	}
	if (pageType === "crud-table" && !isEmployeeDirectory && hasCreateAction && !hasFieldAnchors) {
		findings.push(
			drift(
				"missing-field-anchors",
				"Create/edit form lacks data-field-path anchors for validation navigation.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && hasFilterIntent && !hasFilterControl) {
		findings.push(
			drift(
				"missing-filter",
				"No DataTable filter control detected; confirm whether Status filtering is intentionally unavailable.",
			),
		);
	}
	if (pageType === "crud-table" && dataTable && hasFilterControl && !hasControlledFilterValues) {
		findings.push(
			drift(
				"missing-filter-values",
				"DataTable filters are wired without controlled filterValues, so URL filter state can drift from the visible control.",
			),
		);
	}

	const score = calculateScore(findings);

	return {
		file,
		label: item.label,
		path: item.path,
		pageType,
		score,
		findings,
		fixes,
		metrics: {
			resolvedFiles: sourceFiles.map((sourceFile) =>
				path.relative(appRoot, sourceFile.getFilePath()),
			),
			pageType,
			dataTables: dataTables.length,
			modals: modals.length,
			genericImportModals: genericImportModals.length,
			dataTableProps: Array.from(dataTableProps).sort(),
			dataTablesWithTitleActionDrift: dataTablesWithTitleActionDrift.length,
			actualCapabilities: {
				hasAdd: hasCreateAction,
				hasImport: hasImportAction,
				hasImportImplementation,
				hasExport: hasExportAction,
				hasActions,
			},
			defaultVisibleColumns: getColumnLabels(sourceText),
			hiddenResponsiveColumns: getResponsiveColumnLabels(sourceText),
			serverSortStatus: {
				hasServerPagination,
				hasExplicitSortableColumns,
				hasUrlSort,
				hasServiceSortParams,
			},
			horizontalOverflowStatus: hasColumnPriorityMetadata
				? "responsive-priority-declared"
				: "unbounded-default-columns",
			actionColumnVisibility: hasActionColumnPinning ? "pinned-right-marker-present" : "missing",
			badgeTaxonomyStatus: usesRandomBadgeClasses ? "drift" : "shared-or-neutral",
			cellTaxonomyStatus: usesSharedTablePresentationHelper ? "shared-helper" : "needs-review",
			modalDescriptions,
			hasUrlSearch,
			hasUrlPagination,
			hasFilterIntent,
			hasFilterControl,
			hasControlledFilterValues,
			dataTablesMissingContainedScroll: dataTablesMissingContainedScroll.length,
			hasContainedScrollImplementation,
			hasLegacySingleScrollTableHeader,
			usesSharedTablePresentationHelper,
			hasConstraintTokens,
			hasFieldAnchors,
			usesNativeSelect,
			localModalConstants,
			importsSharedModal,
		},
	};
}

function classifyPage(item: NavItem, sourceText: string, dataTableCount: number): PageType {
	if (item.id === "company-profile") return "settings-form";
	if (item.id === "migration") return "import-workbench";
	if (item.id === "guide") return "documentation";
	if (item.id === "employees" && dataTableCount > 0) return "crud-table";
	if (item.id === "employees") return "redirect-wrapper";
	if (/\b<Navigate\b/.test(sourceText) && dataTableCount === 0) return "redirect-wrapper";
	if (dataTableCount > 0) return "crud-table";
	return "settings-form";
}

function removeJsxAttribute(element: JsxSelfClosingElement | JsxOpeningElement, propName: string) {
	const attribute = getJsxAttribute(element, propName);
	if (!attribute) return false;
	attribute.remove();
	return true;
}

function removeModalDescriptions(modals: Array<JsxSelfClosingElement | JsxOpeningElement>) {
	let removed = 0;
	for (const modal of modals) {
		const description = getJsxAttribute(modal, "description");
		if (!description) continue;
		description.remove();
		removed += 1;
	}
	return removed;
}

function addBooleanJsxAttribute(elements: JsxSelfClosingElement[], propName: string) {
	let added = 0;
	for (const element of elements) {
		if (hasJsxProp(element, propName)) continue;
		element.addAttribute({ name: propName });
		added += 1;
	}
	return added;
}

function hasTitleActionImportAddDrift(element: JsxSelfClosingElement) {
	const titleActions = getJsxAttribute(element, "titleActions");
	if (!titleActions) return false;
	const text = titleActions.getText();
	return /\b(Import|Add)\b/.test(text);
}

function resolveAnalysisSourceFiles(entryPath: string) {
	const visited = new Set<string>();
	const queue = [entryPath];
	const sourceFiles: SourceFile[] = [];

	while (queue.length > 0 && sourceFiles.length < 12) {
		const current = queue.shift();
		if (!current || visited.has(current) || !existsSync(current)) continue;
		visited.add(current);

		const sourceFile = project.addSourceFileAtPath(current);
		sourceFiles.push(sourceFile);

		for (const specifier of getStructuralSpecifiers(sourceFile)) {
			const resolved = resolveLocalSourcePath(current, specifier);
			if (resolved && !visited.has(resolved)) queue.push(resolved);
		}
	}

	return sourceFiles;
}

function getStructuralSpecifiers(sourceFile: SourceFile) {
	const specifiers = [
		...sourceFile
			.getImportDeclarations()
			.map((declaration) => declaration.getModuleSpecifierValue()),
		...sourceFile
			.getExportDeclarations()
			.map((declaration) => declaration.getModuleSpecifierValue() || ""),
	];

	return specifiers.filter((specifier) => {
		return (
			specifier.startsWith("../") ||
			specifier.startsWith("./") ||
			specifier.startsWith("~/components/templates/") ||
			specifier.startsWith("~/components/shared/")
		);
	});
}

function resolveLocalSourcePath(fromFile: string, specifier: string) {
	const basePath = specifier.startsWith("~/")
		? path.join(appRoot, "app", specifier.slice(2))
		: path.resolve(path.dirname(fromFile), specifier);
	const candidates = [
		basePath,
		`${basePath}.tsx`,
		`${basePath}.ts`,
		path.join(basePath, "index.tsx"),
		path.join(basePath, "index.ts"),
	];
	return candidates.find((candidate) => existsSync(candidate));
}

function applySharedModalConstantCutover(sourceFile: SourceFile, localConstantNames: string[]) {
	const namesToImport = localConstantNames.filter((name) =>
		["HR_MODAL_STANDARD_CLASS", "HR_MODAL_WIDE_CLASS", "HR_MODAL_EMPLOYEE_CLASS"].includes(
			name,
		),
	);
	if (!namesToImport.length) return false;

	for (const name of ["HR_MODAL_BASE_CLASS", ...namesToImport]) {
		sourceFile.getVariableDeclaration(name)?.getVariableStatementOrThrow().remove();
	}

	const existingImport = sourceFile
		.getImportDeclarations()
		.find((item) => item.getModuleSpecifierValue() === "~/lib/ui/admin-configuration-modal");

	if (existingImport) {
		const existingNames = new Set(
			existingImport.getNamedImports().map((item) => item.getName()),
		);
		for (const name of namesToImport) {
			if (!existingNames.has(name)) existingImport.addNamedImport(name);
		}
		return true;
	}

	sourceFile.addImportDeclaration({
		moduleSpecifier: "~/lib/ui/admin-configuration-modal",
		namedImports: namesToImport.sort(),
	});
	return true;
}

function getJsxSelfClosingElements(sourceFile: SourceFile, tagName: string) {
	return sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).filter((element) => {
		return element.getTagNameNode().getText() === tagName;
	});
}

function getJsxElements(sourceFile: SourceFile, tagName: string) {
	return [
		...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
	].filter((element) => element.getTagNameNode().getText() === tagName);
}

function getJsxProps(element: JsxSelfClosingElement | JsxOpeningElement) {
	return new Set(
		element
			.getAttributes()
			.filter(Node.isJsxAttribute)
			.map((attribute) => attribute.getNameNode().getText()),
	);
}

function hasJsxProp(element: JsxSelfClosingElement | JsxOpeningElement, propName: string) {
	return getJsxAttribute(element, propName) !== undefined;
}

function getJsxAttribute(
	element: JsxSelfClosingElement | JsxOpeningElement,
	propName: string,
): JsxAttribute | undefined {
	return element
		.getAttributes()
		.find(
			(attribute): attribute is JsxAttribute =>
				Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === propName,
		);
}

function getDataTableAttributeText(
	element: JsxSelfClosingElement | JsxOpeningElement | undefined,
	propName: string,
) {
	return element ? getJsxAttribute(element, propName)?.getText() : undefined;
}

function getColumnLabels(sourceText: string) {
	return Array.from(sourceText.matchAll(/label:\s*["'`]([^"'`]+)["'`]/g))
		.map((match) => match[1])
		.filter((label, index, labels) => labels.indexOf(label) === index);
}

function getResponsiveColumnLabels(sourceText: string) {
	const labels: string[] = [];
	const blocks = sourceText.match(/\{[\s\S]{0,500}?label:\s*["'`][^"'`]+["'`][\s\S]{0,500}?hideBelow:\s*["'`](xl|lg|md|sm)["'`][\s\S]{0,120}?\}/g) || [];
	for (const block of blocks) {
		const label = block.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1];
		const hideBelow = block.match(/hideBelow:\s*["'`](xl|lg|md|sm)["'`]/)?.[1];
		if (label && hideBelow) labels.push(`${label} < ${hideBelow}`);
	}
	return labels;
}

function findLocalModalConstantNames(sourceFile: SourceFile) {
	return sourceFile
		.getVariableDeclarations()
		.map((declaration) => declaration.getName())
		.filter((name) => /^HR_MODAL_(BASE|STANDARD|WIDE|EMPLOYEE)_CLASS$/.test(name));
}

function hasNamedImport(sourceFile: SourceFile, moduleSpecifier: string) {
	return sourceFile
		.getImportDeclarations()
		.some((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);
}

function getObjectStringProperty(objectNode: Node, propertyName: string) {
	if (!Node.isObjectLiteralExpression(objectNode)) return null;
	const property = objectNode.getProperty(propertyName);
	if (!property || !Node.isPropertyAssignment(property)) return null;
	return stripQuotes(property.getInitializer()?.getText() || "");
}

function stripQuotes(value: string) {
	return value.replace(/^["'`]|["'`]$/g, "");
}

function normalizeTarget(value: string) {
	return value
		.toLowerCase()
		.replace(/\.tsx$/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function calculateScore(findings: Finding[]) {
	const hardCount = findings.filter((finding) => finding.severity === "hard").length;
	const driftCount = findings.filter((finding) => finding.severity === "drift").length;
	return Math.max(0, 100 - hardCount * 20 - driftCount * 8);
}

async function appendVisualReports(reports: PageReport[]) {
	let chromium: typeof import("playwright").chromium;
	try {
		({ chromium } = await import("playwright"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		for (const report of reports) {
			if (report.pageType !== "crud-table") continue;
			report.findings.push(
				hard("visual-audit-unavailable", `Playwright could not load: ${message}`),
			);
		}
		return;
	}

	const baseURL = process.env.ADMIN_CONFIG_VISUAL_BASE_URL || "http://localhost:5175";
	let browser: Awaited<ReturnType<typeof chromium.launch>>;
	try {
		browser = await chromium
			.launch({ channel: "chrome", headless: true })
			.catch(() => chromium.launch({ headless: true }));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		for (const report of reports) {
			if (report.pageType !== "crud-table") continue;
			report.findings.push(
				hard("visual-browser-unavailable", `Could not launch browser: ${message}`),
			);
		}
		return;
	}

	try {
		const visualViewports = [
			{ label: "1440x900", width: 1440, height: 900 },
			{ label: "1024x768", width: 1024, height: 768 },
			{ label: "390x800", width: 390, height: 800 },
		];
		const context = await browser.newContext({
			viewport: { width: visualViewports[0].width, height: visualViewports[0].height },
		});
		await context.addInitScript(() => {
			localStorage.setItem("authToken", "mock-admin-token");
			localStorage.setItem("userRole", "ADMIN");
			localStorage.setItem("userSubRole", "hris-admin");
		});
		await context.route("**/api/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(buildVisualMockPayload(route.request().url())),
			});
		});

		for (const report of reports) {
			if (report.pageType !== "crud-table") continue;
			const routeVisuals: Array<{
				viewport: string;
				path: string;
				tableCount: number;
				bodyText: string;
				checks: Array<Record<string, unknown>>;
			}> = [];
			for (const viewport of visualViewports) {
				const page = await context.newPage();
				try {
					await page.setViewportSize({ width: viewport.width, height: viewport.height });
					await page.goto(`${baseURL}${report.path}`, {
						waitUntil: "domcontentloaded",
						timeout: 30_000,
					});
					await page
						.waitForSelector("[data-datatable-table-shell], [data-datatable-pagination]", {
							timeout: 3_000,
						})
						.catch(() => undefined);
					const visual = await page.evaluate((viewportLabel) => {
					const shells = Array.from(
						document.querySelectorAll<HTMLElement>("[data-datatable-table-shell]"),
					).filter((shell) => {
						const rect = shell.getBoundingClientRect();
						const style = getComputedStyle(shell);
						return (
							style.display !== "none" &&
							style.visibility !== "hidden" &&
							rect.width > 0 &&
							rect.height > 0
						);
					});
					const visiblePagination = Array.from(
						document.querySelectorAll<HTMLElement>("[data-datatable-pagination]"),
					).find((element) => {
						const rect = element.getBoundingClientRect();
						const style = getComputedStyle(element);
						return (
							style.display !== "none" &&
							style.visibility !== "hidden" &&
							rect.width > 0 &&
							rect.height > 0
						);
					});
					const visiblePaginationRect = visiblePagination?.getBoundingClientRect();
					const checks = shells.map((shell) => {
						const header = shell.querySelector<HTMLElement>(
							"[data-datatable-header-viewport]",
						);
						const body = shell.querySelector<HTMLElement>(
							"[data-datatable-body-viewport]",
						);
						const root = shell.parentElement?.parentElement ?? document.body;
						const pagination =
							Array.from(
								root.querySelectorAll<HTMLElement>("[data-datatable-pagination]"),
							).find((element) => {
								const rect = element.getBoundingClientRect();
								const style = getComputedStyle(element);
								return (
									style.display !== "none" &&
									style.visibility !== "hidden" &&
									rect.width > 0 &&
									rect.height > 0
								);
							}) ?? null;
						const headerRow = header?.querySelector<HTMLElement>("tr");
						const actionButtons = Array.from(
							shell.querySelectorAll<HTMLButtonElement>("tbody button"),
						).filter((button) =>
							Boolean(button.querySelector("svg.lucide-ellipsis-vertical")),
						);
						const badges = Array.from(
							shell.querySelectorAll<HTMLElement>(".inline-flex, [class*='Badge']"),
						);
						if (body) {
							body.scrollTop = Math.min(80, body.scrollHeight);
							body.scrollLeft = Math.min(80, body.scrollWidth);
						}
						const headerRect = header?.getBoundingClientRect();
						const headerRowRect = headerRow?.getBoundingClientRect();
						const bodyRect = body?.getBoundingClientRect();
						const paginationRect = pagination?.getBoundingClientRect();
						const background = headerRow
							? getComputedStyle(headerRow).backgroundColor
							: header
								? getComputedStyle(header).backgroundColor
								: "";
						const alphaMatch = background.match(
							/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/,
						);
						const alpha = alphaMatch?.[4] ? Number(alphaMatch[4]) : 1;
						const compactActionButtons =
							actionButtons.length === 0 ||
							actionButtons.every((button) => {
								const rect = button.getBoundingClientRect();
								return rect.width <= 48 && rect.height <= 48;
							});
						return {
							viewport: viewportLabel,
							hasHeader: !!header,
							hasBody: !!body,
							headerBottom: headerRowRect?.bottom ?? headerRect?.bottom ?? null,
							bodyTop: bodyRect?.top ?? null,
							bodyBelowHeader:
								!!bodyRect &&
								!!(headerRowRect || headerRect) &&
								bodyRect.top >=
									(headerRowRect?.bottom ?? headerRect?.bottom ?? 0) - 1,
							bodyOverflow: body ? body.scrollHeight > body.clientHeight : false,
							onlyOneBodyScroller:
								shell.querySelectorAll("[data-datatable-body-viewport]").length ===
								1,
							headerOpaque: alpha >= 1,
							bodyScrollTop: body?.scrollTop ?? 0,
							headerVisible:
								!!headerRect && headerRect.height > 0 && headerRect.bottom > 0,
							paginationVisible:
								!!paginationRect &&
								paginationRect.height > 0 &&
								paginationRect.bottom <= window.innerHeight &&
								paginationRect.top >= 0,
							paginationBelowBody:
								!!paginationRect && !!bodyRect && paginationRect.top >= bodyRect.bottom - 1,
							bodyOverlapsPagination:
								!!paginationRect &&
								!!bodyRect &&
								bodyRect.right > paginationRect.left &&
								bodyRect.left < paginationRect.right &&
								bodyRect.bottom > paginationRect.top + 1,
							documentBodyIsRowScroller:
								document.documentElement.scrollHeight > window.innerHeight * 1.25,
							compactActionButtons,
							badgeCount: badges.length,
							background,
						};
					});
					return {
						viewport: viewportLabel,
						path: location.pathname,
						tableCount: shells.length,
						paginationVisible:
							!!visiblePaginationRect &&
							visiblePaginationRect.height > 0 &&
							visiblePaginationRect.bottom <= window.innerHeight &&
							visiblePaginationRect.top >= 0,
						paginationReachable:
							!!visiblePaginationRect &&
							visiblePaginationRect.height > 0 &&
							visiblePaginationRect.top < document.documentElement.scrollHeight,
						bodyText: document.body.innerText.slice(0, 500).replace(/\s+/g, " "),
						checks,
					};
				}, viewport.label);

				routeVisuals.push(visual);
				if (visual.tableCount === 0) {
					if (visual.bodyText) {
						if (!visual.paginationReachable) {
							report.findings.push(
								hard(
									"visual-no-datatable-shell",
									`Visual audit found no visible DataTable shell or reachable pagination at ${viewport.label}.`,
								),
							);
						}
					} else {
						report.findings.push(
							drift(
								"visual-route-empty",
								"Visual audit could not inspect the route because the rendered body was empty, likely from a dev-server route module load failure.",
							),
						);
					}
				}
				for (const [index, check] of visual.checks.entries()) {
					if (!check.hasHeader || !check.hasBody) {
						report.findings.push(
							hard(
								"visual-missing-split-scroll",
								`Table ${index + 1} is missing header/body viewport markers.`,
							),
						);
					}
					if (!check.bodyBelowHeader) {
						report.findings.push(
							hard(
								"visual-scrollbar-starts-at-header",
								`Table ${index + 1} body scroller does not start below the header.`,
							),
						);
					}
					if (!check.headerOpaque) {
						report.findings.push(
							hard(
								"visual-translucent-header",
								`Table ${index + 1} header background is not opaque (${check.background}).`,
							),
						);
					}
					if (!check.onlyOneBodyScroller) {
						report.findings.push(
							hard(
								"visual-nested-row-scroll",
								`Table ${index + 1} has more than one row scroll viewport.`,
							),
						);
					}
					if (!check.paginationVisible) {
						report.findings.push(
							hard(
								"visual-pagination-not-visible",
								`Table ${index + 1} pagination is not fully visible at ${check.viewport}.`,
							),
						);
					}
					if (!check.paginationBelowBody || check.bodyOverlapsPagination) {
						report.findings.push(
							hard(
								"visual-pagination-overlap",
								`Table ${index + 1} row scroller overlaps or covers pagination at ${check.viewport}.`,
							),
						);
					}
					if (!check.compactActionButtons) {
						report.findings.push(
							drift(
								"visual-row-action-size",
								`Table ${index + 1} row actions are not compact icon buttons.`,
							),
						);
					}
				}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					report.findings.push(
						hard(
							"visual-route-failed",
							`Visual route check failed at ${viewport.label}: ${message}`,
						),
					);
				} finally {
					await page.close();
				}
			}
			report.metrics.visual = routeVisuals;
		}
	} finally {
		await browser.close();
	}
}

function buildVisualMockPayload(url: string) {
	const data = buildVisualRows("config", 48);
	if (url.includes("/auth/me")) {
		return {
			data: {
				id: "u1",
				email: "admin@example.com",
				role: "ADMIN",
				subRole: "hris-admin",
				organizationId: "org-1",
				organization: { id: "org-1" },
			},
		};
	}
	if (url.includes("/system-provisioning/status")) {
		return { data: { isProvisioned: true, needsSetup: false } };
	}
	if (url.includes("/role"))
		return visualEnvelope("roles", [{ id: "role-1", name: "System Administrator" }]);
	if (url.includes("/employee")) return visualEnvelope("employees", data);
	if (url.includes("/users") || url.includes("/auth")) return visualEnvelope("users", data);
	if (url.includes("/department")) return visualEnvelope("departments", data);
	if (url.includes("/section")) return visualEnvelope("sections", data);
	if (url.includes("/position")) return visualEnvelope("positions", data);
	if (url.includes("/level")) return visualEnvelope("levels", data);
	if (url.includes("/schedule") || url.includes("/shift")) {
		return {
			...visualEnvelope("scheduleTemplates", data),
			shiftTypes: data,
			data: { scheduleTemplates: data, shiftTypes: data, pagination: visualPagination(data) },
		};
	}
	if (url.includes("/document")) return visualEnvelope("documentTypes", data);
	if (url.includes("/benefit")) return visualEnvelope("benefitTypes", data);
	if (url.includes("/agenc")) return visualEnvelope("agencies", data);
	if (url.includes("/holiday") || url.includes("/calendar")) {
		const pagination = visualPagination(data);
		return {
			...visualEnvelope("holidays", data),
			data: { items: data, holidays: data, pagination, total: data.length },
		};
	}
	if (url.includes("/payroll")) return visualEnvelope("payrollPeriods", data);
	if (url.includes("/device")) return visualEnvelope("devices", data);
	return visualEnvelope("items", data);
}

function buildVisualRows(prefix: string, count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `${prefix}-${index + 1}`,
		name: `${prefix} sample long operational name ${index + 1}`,
		title: `${prefix} title ${index + 1}`,
		code: `${prefix.slice(0, 3).toUpperCase()}${String(index + 1).padStart(3, "0")}`,
		email: `sample.${index + 1}@bandainamco.local`,
		userName: `sample.${index + 1}`,
		status: index % 4 === 0 ? "Onboarding" : "Active",
		isActive: index % 5 !== 0,
		active: index % 5 !== 0,
		role: { name: index % 2 ? "HR Staff" : "System Administrator" },
		roles: [{ name: "System Administrator" }],
		metadata: {
			employee: {
				personalInfo: { firstName: "Sample", lastName: `User ${index + 1}` },
				department: { name: "Production" },
				position: { title: "Operator" },
			},
			device: { access: { status: "enrolled" } },
		},
		description: `Long description for ${prefix} row ${index + 1} that should clamp.`,
		departmentId: "dept-1",
		department: { id: "dept-1", name: "Production" },
		departmentName: "Production",
		section: { id: "sec-1", name: "Assembly" },
		sectionName: "Assembly",
		position: { title: "Operator" },
		positionTitle: "Operator",
		employeeId: `EMP${String(index + 1).padStart(3, "0")}`,
		category: index % 2 ? "COMPLIANCE" : "PAYROLL",
		type: "HOLIDAY",
		priority: index % 3 ? "MEDIUM" : "HIGH",
		source: index % 2 ? "DIRECT" : "SYSTEM",
		workforceSource: index % 2 ? "DIRECT" : "AGENCY",
		enabled: true,
		isPaid: true,
		requiresApproval: true,
		minAdvanceNoticeDays: 1,
		maxDaysPerRequest: 5,
		allowHalfDay: false,
		requireAttachment: false,
		allowedEmploymentTypes: ["REGULAR"],
		cycleDays: 7,
		graceLateMinutes: 10,
		graceEarlyOutMinutes: 10,
		pattern: [
			{
				day: 1,
				shiftSnapshot: {
					name: "Regular Day",
					code: "REG",
					startTime: "08:00",
					endTime: "17:00",
					shiftHour: 8,
				},
			},
		],
		totalHour: 40,
		totalDay: 5,
		isDeleted: false,
		date: "2026-06-09",
		startDate: "2026-06-01",
		endDate: "2026-06-15",
		payDate: "2026-06-20",
		location: "Main Entrance",
		ipAddress: "192.168.110.24",
		address: "192.168.110.24",
		port: 80,
		protocol: "https",
		deviceType: "ZKTECO",
		serialNumber: `SN-${index + 1}`,
	}));
}

function visualPagination(data: unknown[]) {
	return { page: 1, limit: 10, total: data.length, totalPages: 2 };
}

function visualEnvelope(key: string, data: unknown[]) {
	const pagination = visualPagination(data);
	const commonLists = {
		users: data,
		employees: data,
		departments: data,
		sections: data,
		positions: data,
		levels: data,
		scheduleTemplates: data,
		shiftTypes: data,
		leaveTypes: data,
		leavetypes: data,
		documentTypes: data,
		benefitTypes: data,
		agencies: data,
		holidays: data,
		payrollPeriods: data,
		devices: data,
		items: data,
	};
	return {
		...commonLists,
		[key]: data,
		data: { ...commonLists, [key]: data, pagination, total: data.length },
		pagination,
		total: data.length,
		count: data.length,
	};
}

function hard(code: string, message: string): Finding {
	return { severity: "hard", code, message };
}

function drift(code: string, message: string): Finding {
	return { severity: "drift", code, message };
}

function printReport(reports: PageReport[], applied: boolean) {
	console.log(`Admin configuration pattern intelligence ${applied ? "(apply)" : "(dry run)"}`);
	console.log("");

	for (const report of reports) {
		const hardCount = report.findings.filter((finding) => finding.severity === "hard").length;
		const driftCount = report.findings.filter((finding) => finding.severity === "drift").length;
		const status = hardCount ? "FAIL" : driftCount ? "DRIFT" : "OK";
		console.log(
			`${status} ${report.label} ${report.path} -> ${report.file} (${report.score}/100)`,
		);
		console.log(`  - type: ${report.pageType}`);
		const capabilities = report.metrics.actualCapabilities as
			| {
					hasAdd?: boolean;
					hasImport?: boolean;
					hasExport?: boolean;
					hasActions?: boolean;
			  }
			| undefined;
		if (capabilities) {
			console.log(
				`  - capabilities: add=${Boolean(capabilities.hasAdd)} import=${Boolean(capabilities.hasImport)} export=${Boolean(capabilities.hasExport)} actions=${Boolean(capabilities.hasActions)}`,
			);
		}
		const sortStatus = report.metrics.serverSortStatus as
			| {
					hasServerPagination?: boolean;
					hasExplicitSortableColumns?: boolean;
					hasUrlSort?: boolean;
					hasServiceSortParams?: boolean;
			  }
			| undefined;
		if (sortStatus) {
			console.log(
				`  - server sort: server=${Boolean(sortStatus.hasServerPagination)} sortable=${Boolean(sortStatus.hasExplicitSortableColumns)} url=${Boolean(sortStatus.hasUrlSort)} service=${Boolean(sortStatus.hasServiceSortParams)}`,
			);
		}
		if (Array.isArray(report.metrics.defaultVisibleColumns)) {
			console.log(
				`  - default columns: ${(report.metrics.defaultVisibleColumns as string[]).slice(0, 10).join(", ") || "unknown"}`,
			);
		}
		if (Array.isArray(report.metrics.hiddenResponsiveColumns)) {
			console.log(
				`  - hidden responsive: ${(report.metrics.hiddenResponsiveColumns as string[]).join(", ") || "none declared"}`,
			);
		}
		console.log(`  - horizontal overflow: ${String(report.metrics.horizontalOverflowStatus || "unknown")}`);
		console.log(`  - action column: ${String(report.metrics.actionColumnVisibility || "unknown")}`);
		console.log(`  - badge taxonomy: ${String(report.metrics.badgeTaxonomyStatus || "unknown")}`);
		console.log(`  - cell taxonomy: ${String(report.metrics.cellTaxonomyStatus || "unknown")}`);
		if (report.metrics.visual && typeof report.metrics.visual === "object") {
			const visualReports = Array.isArray(report.metrics.visual)
				? (report.metrics.visual as Array<{
						viewport?: string;
						tableCount?: number;
						checks?: Array<{
							viewport?: string;
							bodyBelowHeader?: boolean;
							headerOpaque?: boolean;
							onlyOneBodyScroller?: boolean;
							compactActionButtons?: boolean;
							bodyOverflow?: boolean;
						}>;
					}>)
				: [
						report.metrics.visual as {
							viewport?: string;
							tableCount?: number;
							checks?: Array<{
								viewport?: string;
								bodyBelowHeader?: boolean;
								headerOpaque?: boolean;
								onlyOneBodyScroller?: boolean;
								compactActionButtons?: boolean;
								bodyOverflow?: boolean;
							}>;
						},
					];
			const visual = {
				tableCount: Math.max(0, ...visualReports.map((item) => item.tableCount ?? 0)),
				checks: visualReports.flatMap((item) => item.checks ?? []),
			} as {
				tableCount?: number;
				checks?: Array<{
					viewport?: string;
					bodyBelowHeader?: boolean;
					headerOpaque?: boolean;
					onlyOneBodyScroller?: boolean;
					compactActionButtons?: boolean;
					bodyOverflow?: boolean;
				}>;
			};
			console.log(`  - visual tables: ${visual.tableCount ?? 0}`);
			for (const [index, check] of (visual.checks || []).entries()) {
				console.log(
					`  - visual table ${index + 1}${check.viewport ? ` ${check.viewport}` : ""}: scrollBelowHeader=${Boolean(check.bodyBelowHeader)} headerOpaque=${Boolean(check.headerOpaque)} oneBodyScroller=${Boolean(check.onlyOneBodyScroller)} bodyOverflow=${Boolean(check.bodyOverflow)} compactActions=${Boolean(check.compactActionButtons)}`,
				);
			}
		}
		for (const finding of report.findings) {
			const mark = finding.severity === "hard" ? "hard" : finding.severity;
			console.log(`  - ${mark}: ${finding.message}`);
		}
		for (const fix of report.fixes) {
			console.log(`  - fixed: ${fix}`);
		}
	}
}
