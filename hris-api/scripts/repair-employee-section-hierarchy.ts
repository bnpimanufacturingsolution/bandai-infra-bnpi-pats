import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";

type GapEntry = {
	employeeId: string;
	rawSection: string;
	departmentName: string;
};

type SectionRef = {
	id: string;
	name: string;
	departmentId: string;
	departmentName: string;
};

const prisma = new PrismaClient();

const normalize = (value?: string | null) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/maintenance/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const stripTrailingNumber = (value: string) => normalize(value).replace(/\s+\d+$/, "");

const parseArgs = () => {
	const args = new Set(process.argv.slice(2));
	return {
		execute: args.has("--execute"),
		organizationId:
			process.argv.find((arg) => arg.startsWith("--org="))?.split("=")[1] || null,
	};
};

const parseGapEntries = (projectRoot: string): GapEntry[] => {
	const gapsPath = path.join(projectRoot, "data", "import", "employee-mapping-gaps.md");
	if (!fs.existsSync(gapsPath)) return [];

	const content = fs.readFileSync(gapsPath, "utf8");
	const entries: GapEntry[] = [];
	const patterns = [
		/EMP_ID\s+(\d+): source section "([^"]+)".*?DEPARTMENT set to ([^.;]+)[.;]/g,
		/EMP_ID\s+(\d+): legacy "([^"]+)" -> department "([^"]+)"/g,
		/EMP_ID\s+(\d+): "([^"]+)" matched section "([^"]+)" under department "([^"]+)"/g,
		/EMP_ID\s+(\d+): source section "([^"]+)" -> section "([^"]+)"/g,
	];

	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content))) {
			const [, employeeId, rawSection, matchedOrDepartment, departmentMaybe] = match;
			entries.push({
				employeeId,
				rawSection: departmentMaybe ? matchedOrDepartment : rawSection,
				departmentName: departmentMaybe || matchedOrDepartment,
			});
		}
	}

	return entries;
};

const chooseDeterministic = <T>(items: T[], employeeId: string): T | null => {
	if (!items.length) return null;
	const numeric = Number(String(employeeId).replace(/\D/g, ""));
	const index = Number.isFinite(numeric) ? numeric % items.length : 0;
	return items[index] || items[0];
};

const resolveSection = (
	params: {
		employeeId: string;
		departmentId?: string | null;
		departmentName?: string | null;
		rawSection?: string | null;
	},
	sectionsByDepartment: Map<string, SectionRef[]>,
): { section: SectionRef | null; reason: string } => {
	const departmentSections = sectionsByDepartment.get(String(params.departmentId || "")) || [];
	if (!departmentSections.length) return { section: null, reason: "no-department-sections" };

	const raw = normalize(params.rawSection);
	if (raw) {
		const exact = departmentSections.find(
			(section) => normalize(section.name) === raw || normalize(section.name) === normalize(params.rawSection),
		);
		if (exact) return { section: exact, reason: "exact-gap-match" };

		const byBase = departmentSections.filter((section) => {
			const sectionBase = stripTrailingNumber(section.name);
			return sectionBase === raw || sectionBase.includes(raw) || raw.includes(sectionBase);
		});
		const chosen = chooseDeterministic(
			byBase.sort((left, right) => left.name.localeCompare(right.name)),
			params.employeeId,
		);
		if (chosen) return { section: chosen, reason: "deterministic-gap-match" };
	}

	if (departmentSections.length === 1) {
		return { section: departmentSections[0], reason: "single-section-department" };
	}

	return {
		section: chooseDeterministic(
			departmentSections.sort((left, right) => left.name.localeCompare(right.name)),
			params.employeeId,
		),
		reason: "department-round-robin",
	};
};

async function main() {
	const { execute, organizationId } = parseArgs();
	const projectRoot = path.resolve(process.cwd(), "..");
	const organization =
		(organizationId
			? await prisma.organization.findFirst({
					where: { id: organizationId, isDeleted: false },
					select: { id: true, name: true, code: true },
				})
			: null) ||
		(await prisma.organization.findFirst({
			where: { isDeleted: false },
			orderBy: { createdAt: "asc" },
			select: { id: true, name: true, code: true },
		}));

	if (!organization) throw new Error("No organization found.");

	const gapEntries = parseGapEntries(projectRoot);
	const gapByEmployeeId = new Map(gapEntries.map((entry) => [entry.employeeId, entry]));
	const sections = await prisma.section.findMany({
		where: { organizationId: organization.id, isDeleted: false },
		select: {
			id: true,
			name: true,
			departmentId: true,
			department: { select: { name: true } },
		},
	});

	const sectionsByDepartment = new Map<string, SectionRef[]>();
	for (const section of sections) {
		const current = sectionsByDepartment.get(section.departmentId) || [];
		current.push({
			id: section.id,
			name: section.name,
			departmentId: section.departmentId,
			departmentName: section.department?.name || "",
		});
		sectionsByDepartment.set(section.departmentId, current);
	}

	const employees = await prisma.employee.findMany({
		where: { organizationId: organization.id, isDeleted: false, sectionId: null },
		select: {
			id: true,
			employeeId: true,
			departmentId: true,
			positionId: true,
			department: { select: { name: true } },
		},
		orderBy: { employeeId: "asc" },
	});

	const updates: Array<{
		id: string;
		employeeId: string;
		departmentName: string;
		sectionId: string;
		sectionName: string;
		reason: string;
	}> = [];
	const skipped: Record<string, number> = {};

	for (const employee of employees) {
		const gap = gapByEmployeeId.get(employee.employeeId);
		const { section, reason } = resolveSection(
			{
				employeeId: employee.employeeId,
				departmentId: employee.departmentId,
				departmentName: employee.department?.name,
				rawSection: gap?.rawSection,
			},
			sectionsByDepartment,
		);

		if (!section) {
			skipped[reason] = (skipped[reason] || 0) + 1;
			continue;
		}

		updates.push({
			id: employee.id,
			employeeId: employee.employeeId,
			departmentName: employee.department?.name || "",
			sectionId: section.id,
			sectionName: section.name,
			reason,
		});
	}

	if (execute) {
		for (const update of updates) {
			await prisma.employee.update({
				where: { id: update.id },
				data: { sectionId: update.sectionId },
			});
		}
	}

	const afterEmployeesWithoutSection = execute
		? await prisma.employee.count({
				where: { organizationId: organization.id, isDeleted: false, sectionId: null },
			})
		: null;

	console.log(
		JSON.stringify(
			{
				mode: execute ? "execute" : "dry-run",
				organization,
				employeesWithoutSectionBefore: employees.length,
				plannedEmployeeUpdates: updates.length,
				employeesWithoutSectionAfter: afterEmployeesWithoutSection,
				skipped,
				byReason: updates.reduce<Record<string, number>>((acc, update) => {
					acc[update.reason] = (acc[update.reason] || 0) + 1;
					return acc;
				}, {}),
				sample: updates.slice(0, 20).map(({ employeeId, departmentName, sectionName, reason }) => ({
					employeeId,
					departmentName,
					sectionName,
					reason,
				})),
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
