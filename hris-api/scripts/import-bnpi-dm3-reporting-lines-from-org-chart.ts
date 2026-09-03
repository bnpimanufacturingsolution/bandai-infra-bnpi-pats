import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import { importDm3ReportingLines } from "../app/migration/dm3-workbook-import.service";

const prisma = new PrismaClient();

type OrgChartNode = {
	employeeId: string;
	name: string;
	department: string;
	section: string;
	role: string;
	roleRank: number;
	sourceSheet: string;
	sourceRow: number;
	sourceColumn: number;
};

type ReportingLineRow = {
	EMP_ID: string;
	REPORT_TO_EMP_ID: string;
	EFFECTIVE_FROM: string;
	NOTES: string;
	SOURCE_ROW: number;
};

type OrgChartAudit = {
	totalManpower: number | null;
	typedUniqueEmployeeIds: number;
	typedEmployeeIds: string[];
	nodeUniqueEmployeeIds: number;
	generatedReportingLines: number;
	parserCoveragePercent: number;
	totalManpowerCoveragePercent: number | null;
	isCredibleForApply: boolean;
	blockers: string[];
};

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute") || args.has("--apply");
const writeCsvRequested = args.has("--write-csv");
const forceReviewedPartial = args.has("--force-reviewed-partial");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="))?.split("=")[1];
const sheetArg = process.argv.find((arg) => arg.startsWith("--sheet="))?.split("=")[1] || "Updated Org Chart";
const orgArg = process.argv.find((arg) => arg.startsWith("--org="))?.split("=")[1] || "";
const orgCodeArg = process.argv.find((arg) => arg.startsWith("--orgCode="))?.split("=")[1] || "bnei";
const effectiveFrom =
	process.argv.find((arg) => arg.startsWith("--effectiveFrom="))?.split("=")[1] || "2026-03-31";

const projectRoot = path.resolve(__dirname, "..", "..");
const sourcePath = sourceArg
	? path.resolve(projectRoot, sourceArg)
	: path.resolve(projectRoot, "docs", "FY2025_BNPI Organization Chart - as of March 31, 2026.xlsx");
const csvPath = path.resolve(projectRoot, "data", "import", "reporting-lines-import.csv");

const clean = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").trim();
const normalizeEmployeeId = (value: unknown) => {
	const text = clean(value);
	if (/^\d+$/.test(text)) return text.padStart(5, "0");
	return text;
};

const roleRank = (label: string) => {
	const normalized = label.toLowerCase();
	if (normalized.includes("senior manager")) return 10;
	if (normalized === "manager" || normalized.includes(" manager")) return 20;
	if (normalized.includes("asst")) return 30;
	if (normalized.includes("senior supervisor")) return 40;
	if (normalized === "supervisor" || normalized.includes(" supervisor")) return 50;
	if (normalized.includes("jr. supervisor") || normalized.includes("jr supervisor")) return 60;
	if (normalized.includes("senior engineer")) return 70;
	if (normalized === "engineer" || normalized.includes(" engineer")) return 80;
	if (normalized.includes("jr. engineer") || normalized.includes("jr engineer")) return 90;
	if (normalized.includes("staff engineer")) return 95;
	if (normalized.includes("senior staff")) return 100;
	if (normalized === "staff" || normalized.includes(" staff")) return 110;
	if (normalized.includes("senior operator")) return 120;
	if (normalized === "operator" || normalized.includes(" operator")) return 130;
	if (normalized.includes("senior expert")) return 25;
	return 999;
};

const isDateLike = (value: string) =>
	/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(value) ||
	/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(value);

const extractEmployeeEntries = (cell: unknown) => {
	const text = clean(cell);
	if (!text) return [];
	if (isDateLike(text)) return [];
	const match = text.match(/^0*(\d{2,6})(?:\s+|\r?\n)(.+)$/s);
	if (!match) return [];
	return [
		{
			employeeId: normalizeEmployeeId(match[1]),
			name: clean(match[2]).replace(/\s+/g, " "),
		},
	];
};

const csvEscape = (value: unknown) => {
	const text = clean(value);
	if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
};

function buildMergedRoleColumnMap(sheet: XLSX.WorkSheet, rows: any[][], headerIndex: number) {
	const header = rows[headerIndex];
	const directRoleColumns = header
		.map((value, index) => ({ index, label: clean(value) }))
		.filter((column) => column.index > 2 && column.label)
		.map((column) => ({ ...column, rank: roleRank(column.label) }))
		.filter((column) => column.rank < 999);
	const roleColumnByIndex = new Map(directRoleColumns.map((column) => [column.index, column]));
	for (const merge of sheet["!merges"] || []) {
		if (merge.s.r !== headerIndex || merge.e.r !== headerIndex) continue;
		const label = clean(rows[merge.s.r]?.[merge.s.c]);
		const rank = roleRank(label);
		if (rank >= 999) continue;
		for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
			roleColumnByIndex.set(columnIndex, { index: columnIndex, label, rank });
		}
	}
	return roleColumnByIndex;
}

function extractTypedEmployeeIds(rows: any[][]) {
	const ids = new Set<string>();
	for (const row of rows) {
		for (const cell of row || []) {
			const text = clean(cell);
			const matches = Array.from(text.matchAll(/(?:^|\s|\n)0*(\d{2,6})(?=\s|\n|$)/g));
			for (const match of matches) ids.add(normalizeEmployeeId(match[1]));
		}
	}
	return Array.from(ids).sort();
}

function readTotalManpower(rows: any[][]) {
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex] || [];
		for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
			if (!/TOTAL MANPOWER/i.test(clean(row[columnIndex]))) continue;
			for (let scanColumn = columnIndex + 1; scanColumn < Math.min(row.length, columnIndex + 6); scanColumn += 1) {
				const numeric = Number(clean(row[scanColumn]).replace(/,/g, ""));
				if (Number.isFinite(numeric) && numeric > 0) return numeric;
			}
		}
	}
	return null;
}

function auditOrgChart(rows: any[][], nodes: OrgChartNode[], reportingLines: ReportingLineRow[]): OrgChartAudit {
	const typedEmployeeIds = extractTypedEmployeeIds(rows);
	const nodeIds = new Set(nodes.map((node) => node.employeeId));
	const totalManpower = readTotalManpower(rows);
	const parserCoveragePercent = typedEmployeeIds.length
		? Math.round((nodeIds.size / typedEmployeeIds.length) * 1000) / 10
		: 0;
	const totalManpowerCoveragePercent = totalManpower
		? Math.round((typedEmployeeIds.length / totalManpower) * 1000) / 10
		: null;
	const blockers: string[] = [];
	if (typedEmployeeIds.length > 0 && parserCoveragePercent < 90) {
		blockers.push(
			`Parser mapped ${nodeIds.size} of ${typedEmployeeIds.length} typed numeric employee IDs (${parserCoveragePercent}%).`,
		);
	}
	if (totalManpower && totalManpowerCoveragePercent !== null && totalManpowerCoveragePercent < 90) {
		blockers.push(
			`Workbook says TOTAL MANPOWER ${totalManpower}, but only ${typedEmployeeIds.length} unique typed numeric employee IDs were found in cells (${totalManpowerCoveragePercent}%). Remaining manpower may be image-only, total-only, or not individually listed.`,
		);
	}
	return {
		totalManpower,
		typedUniqueEmployeeIds: typedEmployeeIds.length,
		typedEmployeeIds,
		nodeUniqueEmployeeIds: nodeIds.size,
		generatedReportingLines: reportingLines.length,
		parserCoveragePercent,
		totalManpowerCoveragePercent,
		isCredibleForApply: blockers.length === 0,
		blockers,
	};
}

function parseOrgChart() {
	if (!fs.existsSync(sourcePath)) {
		throw new Error(`Source workbook not found: ${sourcePath}`);
	}
	const workbook = XLSX.readFile(sourcePath, { raw: false, cellDates: false, sheets: [sheetArg] });
	const sheet = workbook.Sheets[sheetArg] || workbook.Sheets[workbook.SheetNames[0]];
	if (!sheet) throw new Error(`Sheet ${sheetArg} was not found.`);
	const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
	const headerIndex = rows.findIndex((row) => clean(row[0]).toLowerCase() === "department" && clean(row[2]).toLowerCase() === "section");
	if (headerIndex < 0) throw new Error("Could not find Department/Section header row in org chart workbook.");
	const roleColumnByIndex = buildMergedRoleColumnMap(sheet, rows, headerIndex);

	const nodes: OrgChartNode[] = [];
	let department = "";
	let section = "";
	for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex] || [];
		const departmentValue = clean(row[0]);
		const sectionValue = clean(row[2]);
		if (departmentValue) department = departmentValue;
		if (sectionValue) section = sectionValue;

		for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
			const roleColumn = roleColumnByIndex.get(columnIndex);
			const cellText = clean(row[columnIndex]);
			const inferredLeadershipRole = !roleColumn && /\b(?:GM|DGM)\b/i.test(cellText)
				? { index: columnIndex, label: "Senior Manager", rank: 10 }
				: null;
			const effectiveRole = roleColumn || inferredLeadershipRole;
			if (!effectiveRole) continue;
			for (const employee of extractEmployeeEntries(row[columnIndex])) {
				nodes.push({
					employeeId: employee.employeeId,
					name: employee.name,
					department,
					section,
					role: effectiveRole.label,
					roleRank: effectiveRole.rank,
					sourceSheet: sheetArg,
					sourceRow: rowIndex + 1,
					sourceColumn: effectiveRole.index + 1,
				});
			}
		}
	}
	return { rows, nodes };
}

function chooseManager(
	node: OrgChartNode,
	rowNodes: OrgChartNode[],
	sectionLeaders: Map<string, OrgChartNode>,
	departmentLeaders: Map<string, OrgChartNode>,
) {
	const eligibleSameRow = rowNodes
		.filter((candidate) => candidate.employeeId !== node.employeeId && candidate.roleRank < node.roleRank)
		.sort((a, b) => b.roleRank - a.roleRank || Math.abs(a.sourceColumn - node.sourceColumn) - Math.abs(b.sourceColumn - node.sourceColumn));
	if (eligibleSameRow[0]) return eligibleSameRow[0];

	for (const rank of Array.from(sectionLeaders.keys()).map(Number).sort((a, b) => b - a)) {
		const candidate = sectionLeaders.get(String(rank));
		if (candidate && rank < node.roleRank && candidate.employeeId !== node.employeeId) return candidate;
	}
	for (const rank of Array.from(departmentLeaders.keys()).map(Number).sort((a, b) => b - a)) {
		const candidate = departmentLeaders.get(String(rank));
		if (candidate && rank < node.roleRank && candidate.employeeId !== node.employeeId) return candidate;
	}
	return null;
}

function buildReportingLines(nodes: OrgChartNode[]): ReportingLineRow[] {
	const bySectionAndRow = new Map<string, OrgChartNode[]>();
	for (const node of nodes) {
		const key = `${node.department}::${node.section}::${node.sourceRow}`;
		const rowNodes = bySectionAndRow.get(key) || [];
		rowNodes.push(node);
		bySectionAndRow.set(key, rowNodes);
	}

	const sectionLeaders = new Map<string, Map<string, OrgChartNode>>();
	const departmentLeaders = new Map<string, Map<string, OrgChartNode>>();
	const rowByEmployeeId = new Map<string, ReportingLineRow>();
	for (const node of nodes.sort((a, b) => a.sourceRow - b.sourceRow || a.roleRank - b.roleRank)) {
		const sectionKey = `${node.department}::${node.section}`;
		const departmentKey = node.department;
		const sectionMap = sectionLeaders.get(sectionKey) || new Map<string, OrgChartNode>();
		const departmentMap = departmentLeaders.get(departmentKey) || new Map<string, OrgChartNode>();
		const sameRowNodes = bySectionAndRow.get(`${node.department}::${node.section}::${node.sourceRow}`) || [];
		const manager = chooseManager(node, sameRowNodes, sectionMap, departmentMap);
		if (manager && !rowByEmployeeId.has(node.employeeId)) {
			rowByEmployeeId.set(node.employeeId, {
				EMP_ID: node.employeeId,
				REPORT_TO_EMP_ID: manager.employeeId,
				EFFECTIVE_FROM: effectiveFrom,
				NOTES: `BNPI organization chart ${node.sourceSheet} row ${node.sourceRow}; ${node.department || "No department"} / ${node.section || "No section"}; ${node.role}; source employee ${node.employeeId} ${node.name}; reports to ${manager.employeeId} ${manager.name}`,
				SOURCE_ROW: node.sourceRow,
			});
		}
		if (!sectionMap.has(String(node.roleRank))) sectionMap.set(String(node.roleRank), node);
		if (!departmentMap.has(String(node.roleRank))) departmentMap.set(String(node.roleRank), node);
		sectionLeaders.set(sectionKey, sectionMap);
		departmentLeaders.set(departmentKey, departmentMap);
	}
	return Array.from(rowByEmployeeId.values()).sort((a, b) => a.EMP_ID.localeCompare(b.EMP_ID));
}

async function resolveOrganizationId() {
	if (orgArg) return orgArg;
	const organization = await (prisma as any).organization.findFirst({
		where: {
			OR: [
				{ code: { equals: orgCodeArg, mode: "insensitive" } },
				{ name: { contains: "Bandai", mode: "insensitive" } },
				{ name: { contains: "BNPI", mode: "insensitive" } },
			],
		},
		select: { id: true, name: true, code: true },
	});
	if (!organization?.id) throw new Error("Organization not found. Pass --org=<organizationId>.");
	return organization.id;
}

async function main() {
	const parsed = parseOrgChart();
	const nodes = parsed.nodes;
	const rows = buildReportingLines(nodes);
	const audit = auditOrgChart(parsed.rows, nodes, rows);
	if (execute && !audit.isCredibleForApply && !forceReviewedPartial) {
		throw new Error(`DM3 reporting lines apply blocked: ${audit.blockers.join(" ")}`);
	}
	if (writeCsvRequested && (audit.isCredibleForApply || forceReviewedPartial)) {
		fs.mkdirSync(path.dirname(csvPath), { recursive: true });
		const header = ["EMP_ID", "REPORT_TO_EMP_ID", "EFFECTIVE_FROM", "NOTES"];
		const csv = [
			header.join(","),
			...rows.map((row) => header.map((key) => csvEscape((row as any)[key])).join(",")),
		].join("\n");
		fs.writeFileSync(csvPath, `${csv}\n`, "utf8");
	}

	const organizationId = await resolveOrganizationId();
	const summary = await importDm3ReportingLines(
		{
			prisma,
			buffer: Buffer.alloc(0),
			organizationId,
			sourceWorkbook: path.relative(projectRoot, sourcePath).replace(/\\/g, "/"),
		},
		rows,
		undefined,
		{ dryRun: !execute },
	);
	if (execute && forceReviewedPartial) {
		(summary as any).reviewedPartialApply = {
			reason: "User-approved partial apply for typed employee-ID reporting lines while total-manpower gap remains documented.",
			auditBlockers: audit.blockers,
		};
	}

	const sample = rows.slice(0, 10).map((row) => ({
		employeeId: row.EMP_ID,
		reportToEmployeeId: row.REPORT_TO_EMP_ID,
		sourceRow: row.SOURCE_ROW,
	}));
	console.log(
		JSON.stringify(
			{
				mode: execute ? "execute" : "dry-run",
				source: path.relative(projectRoot, sourcePath).replace(/\\/g, "/"),
				sheet: sheetArg,
				organizationId,
				extractedEmployees: nodes.length,
				generatedReportingLines: rows.length,
				audit: {
					totalManpower: audit.totalManpower,
					typedUniqueEmployeeIds: audit.typedUniqueEmployeeIds,
					nodeUniqueEmployeeIds: audit.nodeUniqueEmployeeIds,
					parserCoveragePercent: audit.parserCoveragePercent,
					totalManpowerCoveragePercent: audit.totalManpowerCoveragePercent,
					isCredibleForApply: audit.isCredibleForApply,
					forceReviewedPartial,
					blockers: audit.blockers,
				},
				wroteCsv:
					writeCsvRequested && (audit.isCredibleForApply || forceReviewedPartial)
						? path.relative(projectRoot, csvPath).replace(/\\/g, "/")
						: null,
				summary,
				sample,
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
