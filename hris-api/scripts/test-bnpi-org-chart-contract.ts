import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

type OrgChartEmployeeRow = {
	id: string;
	employeeId: string;
	reportToId: string | null;
	personPersonalInfo: any;
	managerId: string | null;
	managerEmployeeId: string | null;
	managerPersonalInfo: any;
	departmentId: string | null;
	departmentName: string | null;
	positionTitle: string | null;
	levelName: string | null;
};

type OrgChartEmployee = {
	id: string;
	employeeId: string;
	reportToId: string | null;
	person: { personalInfo: any };
	reportTo: { id: string; employeeId: string | null; person: { personalInfo: any } } | null;
	department: { id: string; name: string | null } | null;
	position: { title: string | null } | null;
	level: { name: string | null } | null;
};

type TreeNode = {
	employee: OrgChartEmployee;
	children: TreeNode[];
	level: number;
};

const args = new Set(process.argv.slice(2));
const focusIndex = process.argv.findIndex((arg) => arg === "--focus");
const focusId = focusIndex >= 0 ? process.argv[focusIndex + 1] : null;
const visualize = args.has("--visualize") || args.has("--tree");

function buildTree(employees: OrgChartEmployee[]) {
	const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
	const childrenMap = new Map<string, OrgChartEmployee[]>();

	for (const employee of employees) {
		const managerId = employee.reportTo?.id || employee.reportToId;
		if (!managerId || !employeeMap.has(managerId)) continue;
		const siblings = childrenMap.get(managerId) || [];
		siblings.push(employee);
		childrenMap.set(managerId, siblings);
	}

	const constructNode = (
		employee: OrgChartEmployee,
		level: number,
		visited = new Set<string>(),
	): TreeNode => {
		if (visited.has(employee.id)) return { employee, level, children: [] };
		const nextVisited = new Set(visited);
		nextVisited.add(employee.id);
		const children = childrenMap.get(employee.id) || [];
		return {
			employee,
			level,
			children: children.map((child) => constructNode(child, level + 1, nextVisited)),
		};
	};

	const roots = employees.filter((employee) => {
		const managerId = employee.reportTo?.id || employee.reportToId;
		return !managerId || !employeeMap.has(managerId);
	});

	return {
		roots: roots.map((root) => constructNode(root, 0)),
		employeeMap,
		childrenMap,
	};
}

function flatten(nodes: TreeNode[]) {
	const result: TreeNode[] = [];
	const queue = [...nodes];
	while (queue.length > 0) {
		const node = queue.shift();
		if (!node) continue;
		result.push(node);
		queue.push(...node.children);
	}
	return result;
}

function findBranch(nodes: TreeNode[], targetId: string): TreeNode[] {
	for (const node of nodes) {
		if (node.employee.id === targetId) return [node];
		const childBranch = findBranch(node.children, targetId);
		if (childBranch.length > 0) return [{ ...node, children: childBranch }];
	}
	return [];
}

function countNodes(nodes: TreeNode[]) {
	return flatten(nodes).length;
}

function getNearestManagerId(
	employeeId: string | null,
	employeeMap: Map<string, OrgChartEmployee>,
	childrenMap: Map<string, OrgChartEmployee[]>,
) {
	if (!employeeId) return null;
	if ((childrenMap.get(employeeId) || []).length > 0) return employeeId;

	const seen = new Set<string>();
	let current = employeeMap.get(employeeId);
	while (current?.reportTo?.id && employeeMap.has(current.reportTo.id)) {
		const managerId = current.reportTo.id;
		if (seen.has(managerId)) break;
		if ((childrenMap.get(managerId) || []).length > 0) return managerId;
		seen.add(managerId);
		current = employeeMap.get(managerId);
	}
	return null;
}

function getDescendants(rootId: string, childrenMap: Map<string, OrgChartEmployee[]>) {
	const descendants = new Set<string>();
	const queue = [...(childrenMap.get(rootId) || []).map((employee) => employee.id)];
	while (queue.length > 0) {
		const nextId = queue.shift();
		if (!nextId || descendants.has(nextId)) continue;
		descendants.add(nextId);
		queue.push(...(childrenMap.get(nextId) || []).map((employee) => employee.id));
	}
	return descendants;
}

function getBranchStats(
	employees: OrgChartEmployee[],
	childrenMap: Map<string, OrgChartEmployee[]>,
) {
	return employees
		.map((employee) => {
			const directReports = childrenMap.get(employee.id) || [];
			const descendants = getDescendants(employee.id, childrenMap);
			return {
				id: employee.id,
				employee,
				directReports: directReports.length,
				descendants: descendants.size,
			};
		})
		.filter((branch) => branch.directReports > 0)
		.sort(
			(a, b) =>
				b.descendants - a.descendants ||
				b.directReports - a.directReports ||
				a.employee.employeeId.localeCompare(b.employee.employeeId),
		);
}

function getName(employee?: OrgChartEmployee | null) {
	const info = employee?.person?.personalInfo || {};
	return `${info.firstName || ""} ${info.lastName || ""}`.trim() || employee?.employeeId || "-";
}

function getNodeLabel(node: TreeNode) {
	const title = node.employee.position?.title || "No position";
	const department = node.employee.department?.name || "No department";
	const childCount = node.children.length;
	return `${node.employee.employeeId} ${getName(node.employee)} - ${title} / ${department}${childCount ? ` (${childCount})` : ""}`;
}

function renderAsciiTree(nodes: TreeNode[], options: { maxDepth?: number; maxChildren?: number } = {}) {
	const maxDepth = options.maxDepth ?? 4;
	const maxChildren = options.maxChildren ?? 12;
	const lines: string[] = [];

	const renderNode = (node: TreeNode, prefix: string, isLast: boolean) => {
		const connector = prefix ? (isLast ? "`-- " : "|-- ") : "";
		lines.push(`${prefix}${connector}${getNodeLabel(node)}`);
		const childPrefix = prefix ? `${prefix}${isLast ? "    " : "|   "}` : "    ";

		if (node.level >= maxDepth) {
			if (node.children.length > 0) {
				lines.push(`${childPrefix}... ${node.children.length} more below`);
			}
			return;
		}

		const visibleChildren = node.children.slice(0, maxChildren);
		visibleChildren.forEach((child, index) => {
			renderNode(
				child,
				childPrefix,
				index === visibleChildren.length - 1 && node.children.length <= maxChildren,
			);
		});
		if (node.children.length > maxChildren) {
			lines.push(
				`${childPrefix}\`-- ... ${node.children.length - maxChildren} more direct reports`,
			);
		}
	};

	nodes.forEach((node, index) => renderNode(node, "", index === nodes.length - 1));
	return lines.join("\n");
}

async function main() {
	const organization = await prisma.organization.findFirst({
		where: { isDeleted: false },
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true },
	});
	if (!organization) throw new Error("No organization found.");

	const rows = await prisma.$queryRaw<OrgChartEmployeeRow[]>`
		SELECT
			e.id,
			e."employeeId",
			e."reportToId",
			p."personalInfo" AS "personPersonalInfo",
			m.id AS "managerId",
			m."employeeId" AS "managerEmployeeId",
			mp."personalInfo" AS "managerPersonalInfo",
			d.id AS "departmentId",
			d.name AS "departmentName",
			pos.title AS "positionTitle",
			l.name AS "levelName"
		FROM employees e
		LEFT JOIN employees m ON m.id = e."reportToId" AND m."isDeleted" = false
		LEFT JOIN "Person" p ON p.id = e."personId"
		LEFT JOIN "Person" mp ON mp.id = m."personId"
		LEFT JOIN departments d ON d.id = e."departmentId"
		LEFT JOIN positions pos ON pos.id = e."positionId"
		LEFT JOIN levels l ON l.id = e."levelId"
		WHERE e."organizationId" = ${organization.id}
			AND e."isDeleted" = false
		ORDER BY e."employeeId" ASC
	`;

	const employees: OrgChartEmployee[] = rows.map((row) => ({
		id: row.id,
		employeeId: row.employeeId,
		reportToId: row.reportToId,
		person: { personalInfo: row.personPersonalInfo || {} },
		reportTo: row.managerId
			? {
					id: row.managerId,
					employeeId: row.managerEmployeeId,
					person: { personalInfo: row.managerPersonalInfo || {} },
				}
			: null,
		department: row.departmentId
			? { id: row.departmentId, name: row.departmentName }
			: null,
		position: row.positionTitle ? { title: row.positionTitle } : null,
		level: row.levelName ? { name: row.levelName } : null,
	}));

	const { roots, employeeMap, childrenMap } = buildTree(employees);
	const linkedEmployees = employees.filter((employee) => employee.reportTo?.id).length;
	const noManagerEmployees = employees.filter((employee) => !employee.reportTo?.id).length;
	const managerCount = [...childrenMap.keys()].length;
	const standaloneEmployees = employees.filter(
		(employee) => !employee.reportTo?.id && !(childrenMap.get(employee.id) || []).length,
	).length;
	const largestRoots = roots
		.map((root) => ({ root, nodes: countNodes([root]), children: root.children.length }))
		.sort((a, b) => b.nodes - a.nodes)
		.slice(0, 5);

	const branchStats = getBranchStats(employees, childrenMap);
	const fallbackManagerId = branchStats[0]?.id || null;
	const nearestManagerId = getNearestManagerId(focusId, employeeMap, childrenMap);
	const focusRootId = nearestManagerId || fallbackManagerId || focusId;
	const focusBranch = focusRootId ? findBranch(roots, focusRootId) : [];
	const focusEmployee = focusId ? employeeMap.get(focusId) : null;
	const focusRoot = focusRootId ? employeeMap.get(focusRootId) : null;
	const focusNodeCount = countNodes(focusBranch);
	const focusRootDirectReports = focusRootId ? (childrenMap.get(focusRootId) || []).length : 0;

	const proof = {
		organization,
		contract: {
			endpointShape: "GET /api/employee?document=true&pagination=true&count=false&limit=5000&fields=id,person.personalInfo,employeeId,department,departmentId,level,position,employmentStatus,reportToId,reportTo.person.personalInfo,reportTo.id",
			totalEmployeesFetched: employees.length,
			employeesWithReportToRelation: linkedEmployees,
			employeesWithoutManager: noManagerEmployees,
			standaloneEmployees,
			managerNodesWithChildren: managerCount,
			rootCount: roots.length,
		},
		tree: {
			recommendedBranches: branchStats.slice(0, 8).map((branch) => ({
				employeeId: branch.employee.employeeId,
				name: getName(branch.employee),
				descendants: branch.descendants,
				directReports: branch.directReports,
				position: branch.employee.position?.title || null,
				department: branch.employee.department?.name || null,
			})),
			largestRoots: largestRoots.map((item) => ({
				employeeId: item.root.employee.employeeId,
				name: getName(item.root.employee),
				nodes: item.nodes,
				directReports: item.children,
			})),
		},
		focus: focusId
			? {
					focusId,
					focusEmployeeId: focusEmployee?.employeeId || null,
					focusName: getName(focusEmployee),
					nearestManagerId,
					fallbackManagerId,
					branchRootId: focusRootId,
					branchRootEmployeeId: focusRoot?.employeeId || null,
					branchRootName: getName(focusRoot),
					branchNodeCount: focusNodeCount,
					branchRootDirectReports: focusRootDirectReports,
				}
			: null,
	};

	if (args.has("--json")) {
		console.log(JSON.stringify(proof, null, 2));
	} else {
		console.log(`Organization: ${organization.name} (${organization.id})`);
		console.log(`Contract rows: ${employees.length}`);
		console.log(`Employees with reportTo relation: ${linkedEmployees}`);
		console.log(`Employees without manager: ${noManagerEmployees}`);
		console.log(`Standalone employees: ${standaloneEmployees}`);
		console.log(`Managers with children: ${managerCount}`);
		console.log(`Roots: ${roots.length}`);
		console.log("Largest tree roots:");
		for (const item of proof.tree.largestRoots) {
			console.log(`- ${item.employeeId} ${item.name}: ${item.nodes} nodes, ${item.directReports} direct reports`);
		}
		console.log("Recommended branch roots:");
		for (const item of proof.tree.recommendedBranches) {
			console.log(`- ${item.employeeId} ${item.name}: ${item.descendants + 1} nodes, ${item.directReports} direct reports`);
		}
		if (proof.focus) {
			console.log(
				`Focus ${proof.focus.focusEmployeeId} ${proof.focus.focusName} renders from ${proof.focus.branchRootEmployeeId} ${proof.focus.branchRootName}: ${proof.focus.branchNodeCount} nodes, ${proof.focus.branchRootDirectReports} direct reports.`,
			);
		}
		if (visualize && focusBranch.length > 0) {
			console.log("\nTree preview:");
			console.log(renderAsciiTree(focusBranch));
		}
	}

	if (employees.length < 2000) throw new Error(`Org chart contract returned only ${employees.length} employees.`);
	if (linkedEmployees < 700) throw new Error(`Org chart contract has only ${linkedEmployees} reportTo links.`);
	if (managerCount < 100) throw new Error(`Org chart contract has only ${managerCount} managers with children.`);
	if (focusId && focusNodeCount <= 1) {
		throw new Error(`Focused org chart branch still renders only ${focusNodeCount} node.`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
