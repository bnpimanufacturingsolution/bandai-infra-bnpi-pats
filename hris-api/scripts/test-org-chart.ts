/**
 * Test script for employee organization chart hierarchy
 * Run with:
 *   npm run test:org-chart
 *   npm run test:org-chart -- --json
 *   npm run test:org-chart -- --show-ids
 *   npm run test:org-chart -- --root 31
 *   npm run test:org-chart -- --status ACTIVE
 */

import { PrismaClient, type EmploymentStatus } from "../generated/prisma";

const prisma = new PrismaClient();

type OrgEmployee = {
	id: string;
	employeeId: string;
	reportToId: string | null;
	role: string;
	employmentStatus: EmploymentStatus;
	isManager: boolean;
	isHrManager: boolean;
	person: {
		personalInfo: {
			firstName: string | null;
			lastName: string | null;
		} | null;
	} | null;
	department: {
		name: string;
		code: string | null;
	} | null;
	position: {
		title: string;
		code: string | null;
	} | null;
	level: {
		name: string;
		rank: number | null;
	} | null;
};

type OrgNode = {
	employee: OrgEmployee;
	children: OrgNode[];
	cycleDetected?: boolean;
};

type ScriptOptions = {
	json: boolean;
	showIds: boolean;
	root: string | null;
	status: EmploymentStatus | null;
	help: boolean;
};

type BuildTreeResult = {
	roots: OrgNode[];
	orphanRoots: OrgEmployee[];
	cycleRoots: OrgEmployee[];
	cycleWarnings: string[];
};

const EMPLOYMENT_STATUSES = new Set<EmploymentStatus>([
	"ACTIVE",
	"RESIGNATION_REQUESTED",
	"SERVING_NOTICE",
	"OFFBOARDING",
	"ONBOARDING",
	"INACTIVE",
	"TERMINATED",
	"RESIGNED",
	"FORMER_EMPLOYEE",
	"RETIRED",
	"ON_LEAVE",
]);

function parseArgs(args: string[]): ScriptOptions {
	const options: ScriptOptions = {
		json: false,
		showIds: false,
		root: null,
		status: null,
		help: false,
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];

		if (arg === "--json") {
			options.json = true;
			continue;
		}

		if (arg === "--show-ids") {
			options.showIds = true;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--root") {
			const value = args[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --root");
			}
			options.root = value;
			i += 1;
			continue;
		}

		if (arg === "--status") {
			const value = args[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --status");
			}

			const normalized = value.toUpperCase() as EmploymentStatus;
			if (!EMPLOYMENT_STATUSES.has(normalized)) {
				throw new Error(
					`Invalid employment status "${value}". Valid values: ${Array.from(EMPLOYMENT_STATUSES).join(", ")}`,
				);
			}

			options.status = normalized;
			i += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function printUsage() {
	console.log("=== EMPLOYEE ORG CHART TEST ===\n");
	console.log("Usage:");
	console.log("  npm run test:org-chart");
	console.log("  npm run test:org-chart -- --json");
	console.log("  npm run test:org-chart -- --show-ids");
	console.log("  npm run test:org-chart -- --root 31");
	console.log("  npm run test:org-chart -- --status ACTIVE\n");
	console.log("Flags:");
	console.log("  --json         Print hierarchy as JSON");
	console.log("  --show-ids     Include internal employee id and reportToId");
	console.log("  --root <id>    Print only one branch by employeeId or internal id");
	console.log("  --status <s>   Filter employees by employment status");
	console.log("  --help         Show this help\n");
}

function getEmployeeName(employee: OrgEmployee): string {
	const firstName = employee.person?.personalInfo?.firstName?.trim() || "";
	const lastName = employee.person?.personalInfo?.lastName?.trim() || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || employee.employeeId || employee.id;
}

function getEmployeeLabel(employee: OrgEmployee, showIds: boolean): string {
	const parts = [
		`${getEmployeeName(employee)} (${employee.employeeId})`,
		employee.position?.title || "No Position",
		employee.department?.name || "No Department",
	];

	if (employee.level?.name) {
		parts.push(employee.level.name);
	}

	if (employee.isHrManager) {
		parts.push("HR Manager");
	} else if (employee.isManager) {
		parts.push("Manager");
	}

	parts.push(employee.employmentStatus);

	if (showIds) {
		parts.push(`id=${employee.id}`);
		parts.push(`reportToId=${employee.reportToId || "null"}`);
	}

	return parts.join(" | ");
}

function sortEmployees(employees: OrgEmployee[]): OrgEmployee[] {
	return [...employees].sort((a, b) => {
		const employeeIdCompare = String(a.employeeId).localeCompare(String(b.employeeId), undefined, {
			numeric: true,
			sensitivity: "base",
		});
		if (employeeIdCompare !== 0) return employeeIdCompare;
		return getEmployeeName(a).localeCompare(getEmployeeName(b), undefined, {
			sensitivity: "base",
		});
	});
}

function buildTree(employees: OrgEmployee[]): BuildTreeResult {
	const byId = new Map<string, OrgEmployee>();
	const childrenMap = new Map<string, OrgEmployee[]>();
	const orphanRoots: OrgEmployee[] = [];
	const cycleRoots: OrgEmployee[] = [];
	const cycleWarnings: string[] = [];
	const cycleWarningSet = new Set<string>();

	employees.forEach((employee) => {
		byId.set(employee.id, employee);
	});

	employees.forEach((employee) => {
		if (!employee.reportToId) return;

		if (!byId.has(employee.reportToId)) {
			orphanRoots.push(employee);
			return;
		}

		const siblings = childrenMap.get(employee.reportToId) || [];
		siblings.push(employee);
		childrenMap.set(employee.reportToId, siblings);
	});

	childrenMap.forEach((children, managerId) => {
		childrenMap.set(managerId, sortEmployees(children));
	});

	const cycleMemo = new Map<string, boolean>();
	const cycleVisit = (employeeId: string, chain: string[] = []): boolean => {
		if (cycleMemo.has(employeeId)) {
			return cycleMemo.get(employeeId) || false;
		}

		if (chain.includes(employeeId)) {
			const cycleStartIndex = chain.indexOf(employeeId);
			const cyclePath = [...chain.slice(cycleStartIndex), employeeId];
			const formatted = cyclePath
				.map((id) => {
					const employee = byId.get(id);
					return employee ? `${getEmployeeName(employee)} (${employee.employeeId})` : id;
				})
				.join(" -> ");

			if (!cycleWarningSet.has(formatted)) {
				cycleWarningSet.add(formatted);
				cycleWarnings.push(formatted);
			}

			cycleMemo.set(employeeId, true);
			return true;
		}

		const employee = byId.get(employeeId);
		const managerId = employee?.reportToId;

		if (!managerId || !byId.has(managerId)) {
			cycleMemo.set(employeeId, false);
			return false;
		}

		const result = cycleVisit(managerId, [...chain, employeeId]);
		cycleMemo.set(employeeId, result);
		return result;
	};

	const buildNode = (employee: OrgEmployee, ancestry: Set<string>): OrgNode => {
		if (ancestry.has(employee.id)) {
			return {
				employee,
				children: [],
				cycleDetected: true,
			};
		}

		const nextAncestry = new Set(ancestry);
		nextAncestry.add(employee.id);

		const children = (childrenMap.get(employee.id) || []).map((child) =>
			buildNode(child, nextAncestry),
		);

		return {
			employee,
			children,
		};
	};

	const roots = employees.filter((employee) => {
		if (!employee.reportToId) return true;
		if (!byId.has(employee.reportToId)) return true;
		if (cycleVisit(employee.id)) {
			cycleRoots.push(employee);
			return true;
		}
		return false;
	});

	const uniqueRoots = Array.from(new Map(sortEmployees(roots).map((root) => [root.id, root])).values());

	if (uniqueRoots.length === 0 && employees.length > 0) {
		cycleRoots.push(employees[0]);
		uniqueRoots.push(sortEmployees(employees)[0]);
	}

	return {
		roots: uniqueRoots.map((root) => buildNode(root, new Set<string>())),
		orphanRoots: Array.from(
			new Map(orphanRoots.map((employee) => [employee.id, employee])).values(),
		),
		cycleRoots: Array.from(
			new Map(cycleRoots.map((employee) => [employee.id, employee])).values(),
		),
		cycleWarnings,
	};
}

function renderTreeLines(
	nodes: OrgNode[],
	showIds: boolean,
	prefix = "",
	isRootLevel = true,
): string[] {
	const lines: string[] = [];

	nodes.forEach((node, index) => {
		const isLast = index === nodes.length - 1;
		const connector = isRootLevel ? "" : isLast ? "└─ " : "├─ ";
		const line = `${prefix}${connector}${getEmployeeLabel(node.employee, showIds)}${
			node.cycleDetected ? " [cycle detected]" : ""
		}`;
		lines.push(line);

		if (node.children.length > 0) {
			const childPrefix = isRootLevel
				? prefix
				: `${prefix}${isLast ? "   " : "│  "}`;
			lines.push(...renderTreeLines(node.children, showIds, childPrefix, false));
		}
	});

	return lines;
}

function serializeNode(node: OrgNode) {
	return {
		id: node.employee.id,
		employeeId: node.employee.employeeId,
		name: getEmployeeName(node.employee),
		position: node.employee.position?.title || null,
		department: node.employee.department?.name || null,
		level: node.employee.level?.name || null,
		role: node.employee.role,
		employmentStatus: node.employee.employmentStatus,
		reportToId: node.employee.reportToId,
		isManager: node.employee.isManager,
		isHrManager: node.employee.isHrManager,
		cycleDetected: !!node.cycleDetected,
		children: node.children.map(serializeNode),
	};
}

async function fetchEmployees(status: EmploymentStatus | null): Promise<OrgEmployee[]> {
	return prisma.employee.findMany({
		where: {
			isDeleted: false,
			...(status ? { employmentStatus: status } : {}),
		},
		select: {
			id: true,
			employeeId: true,
			reportToId: true,
			role: true,
			employmentStatus: true,
			isManager: true,
			isHrManager: true,
			person: {
				select: {
					personalInfo: {
						select: {
							firstName: true,
							lastName: true,
						},
					},
				},
			},
			department: {
				select: {
					name: true,
					code: true,
				},
			},
			position: {
				select: {
					title: true,
					code: true,
				},
			},
			level: {
				select: {
					name: true,
					rank: true,
				},
			},
		},
		orderBy: [{ employeeId: "asc" }],
	});
}

function findRootByOption(nodes: OrgNode[], root: string): OrgNode | null {
	for (const node of nodes) {
		if (node.employee.id === root || node.employee.employeeId === root) {
			return node;
		}

		const childMatch = findRootByOption(node.children, root);
		if (childMatch) return childMatch;
	}

	return null;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));

	if (options.help) {
		printUsage();
		return;
	}

	console.log("=".repeat(88));
	console.log("EMPLOYEE ORG CHART TEST");
	console.log("=".repeat(88));
	console.log();

	if (options.status) {
		console.log(`Filter: employmentStatus = ${options.status}`);
	}
	if (options.root) {
		console.log(`Branch Root Filter: ${options.root}`);
	}
	console.log();

	const employees = await fetchEmployees(options.status);

	if (employees.length === 0) {
		console.log("No employees found for the current filter.");
		return;
	}

	const result = buildTree(sortEmployees(employees));
	const displayedRoots = options.root
		? (() => {
				const matched = findRootByOption(result.roots, options.root as string);
				if (!matched) {
					throw new Error(`Root employee "${options.root}" was not found in the hierarchy.`);
				}
				return [matched];
			})()
		: result.roots;

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					summary: {
						totalEmployees: employees.length,
						rootCount: displayedRoots.length,
						orphanRootCount: result.orphanRoots.length,
						cycleCount: result.cycleWarnings.length,
						statusFilter: options.status,
						rootFilter: options.root,
					},
					roots: displayedRoots.map(serializeNode),
					orphanRoots: result.orphanRoots.map((employee) => ({
						id: employee.id,
						employeeId: employee.employeeId,
						name: getEmployeeName(employee),
						reportToId: employee.reportToId,
					})),
					cycleWarnings: result.cycleWarnings,
				},
				null,
				2,
			),
		);
		return;
	}

	console.log("Summary");
	console.log("-".repeat(88));
	console.log(`Total employees      : ${employees.length}`);
	console.log(`Root nodes shown     : ${displayedRoots.length}`);
	console.log(`Orphan roots         : ${result.orphanRoots.length}`);
	console.log(`Cycle warnings       : ${result.cycleWarnings.length}`);
	console.log();

	if (result.orphanRoots.length > 0) {
		console.log("Orphaned Employees");
		console.log("-".repeat(88));
		result.orphanRoots.forEach((employee, index) => {
			console.log(
				`${index + 1}. ${getEmployeeName(employee)} (${employee.employeeId}) -> missing manager ${employee.reportToId}`,
			);
		});
		console.log();
	}

	if (result.cycleWarnings.length > 0) {
		console.log("Cycle Warnings");
		console.log("-".repeat(88));
		result.cycleWarnings.forEach((warning, index) => {
			console.log(`${index + 1}. ${warning}`);
		});
		console.log();
	}

	console.log("Organization Chart");
	console.log("-".repeat(88));
	const treeLines = renderTreeLines(displayedRoots, options.showIds);
	treeLines.forEach((line) => console.log(line));
	console.log();
	console.log("Done.");
}

main()
	.catch((error) => {
		console.error("Error running org chart test:", error.message || error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
