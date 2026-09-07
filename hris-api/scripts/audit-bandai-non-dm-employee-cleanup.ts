import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const CONFIRM_TOKEN = "REMOVE_NON_DM_BANDAI_LOCAL";

type CandidateSelector = {
	allNonDm: boolean;
	employeeIds: string[];
	dbIds: string[];
	emails: string[];
	nameQuery: string | null;
	apply: boolean;
	confirm: string | null;
	allowPrivileged: boolean;
};

type Candidate = {
	id: string;
	employeeId: string;
	name: string;
	email: string | null;
	role: string;
	employmentStatus: string;
	userId: string | null;
	personId: string | null;
	employeeMetadata: unknown;
	personMetadata: unknown;
	isDmBacked: boolean;
	isPrivileged: boolean;
	counts: Record<string, number>;
	blockers: string[];
};

const getArgValue = (args: string[], name: string) => {
	const prefix = `${name}=`;
	const match = args.find((arg) => arg.startsWith(prefix));
	return match ? match.slice(prefix.length).trim() : null;
};

const splitCsv = (value: string | null) =>
	value
		? value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];

const parseArgs = (): CandidateSelector => {
	const args = process.argv.slice(2);
	return {
		allNonDm: args.includes("--all-non-dm"),
		employeeIds: splitCsv(getArgValue(args, "--employee-id")),
		dbIds: splitCsv(getArgValue(args, "--id")),
		emails: splitCsv(getArgValue(args, "--email")).map((item) => item.toLowerCase()),
		nameQuery: getArgValue(args, "--name")?.toLowerCase() || null,
		apply: args.includes("--apply"),
		confirm: getArgValue(args, "--confirm"),
		allowPrivileged: args.includes("--allow-privileged"),
	};
};

const readPath = (value: unknown, path: string[]) =>
	path.reduce<unknown>((current, key) => {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		return (current as Record<string, unknown>)[key];
	}, value);

const normalize = (value: unknown) => String(value || "").trim();

const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();

const isDm3Source = (metadata: unknown) => {
	const sourceOfTruthStage = normalizeUpper(readPath(metadata, ["sourceOfTruth", "stage"]));
	const sourceOfTruthStep = normalizeUpper(readPath(metadata, ["sourceOfTruth", "step"]));
	const importRecordStage = normalizeUpper(readPath(metadata, ["importRecord", "stage"]));
	const importSource = normalizeUpper(readPath(metadata, ["importSource"]));

	return (
		sourceOfTruthStage === "DM3" ||
		sourceOfTruthStep === "DM3.1 EMPLOYEES" ||
		importRecordStage === "DM3" ||
		importSource.includes("DM3")
	);
};

const getFullName = (personalInfo: unknown) => {
	const info = personalInfo && typeof personalInfo === "object" ? personalInfo as Record<string, unknown> : {};
	const explicit = normalize(info.fullName);
	if (explicit) return explicit;
	return [info.firstName, info.middleName, info.lastName].map(normalize).filter(Boolean).join(" ");
};

const getEmail = (contactInfo: unknown) => {
	const info = contactInfo && typeof contactInfo === "object" ? contactInfo as Record<string, unknown> : {};
	return normalize(info.email) || null;
};

const isPrivilegedRole = (role: string) => {
	const normalized = role.toLowerCase();
	return (
		normalized.includes("admin") ||
		normalized.includes("hr-manager") ||
		normalized.includes("hr-user") ||
		normalized === "hr" ||
		normalized.includes("manager")
	);
};

const mergeMetadata = (current: unknown, cleanupMetadata: Record<string, unknown>) => ({
	...(current && typeof current === "object" && !Array.isArray(current)
		? current as Record<string, unknown>
		: {}),
	...cleanupMetadata,
});

async function countOwnedRows(employeeId: string, organizationId: string) {
	const [
		attendances,
		attendanceObligations,
		timesheets,
		timesheetlines,
		requestsAsRequester,
		requestsAsTarget,
		documents,
		scheduleOverrides,
		employeePayrolls,
		paidEmployeePayrolls,
		directReports,
		managedDepartments,
		managedSections,
	] = await Promise.all([
		prisma.attendance.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.attendanceObligation.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.timesheet.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.timesheetline.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.request.count({ where: { organizationId, requesterId: employeeId, isDeleted: false } }),
		prisma.request.count({ where: { organizationId, targetEmployeeId: employeeId, isDeleted: false } }),
		prisma.document.count({ where: { employeeId, isDeleted: false } }),
		prisma.scheduleOverride.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.employeePayroll.count({ where: { organizationId, employeeId, isDeleted: false } }),
		prisma.employeePayroll.count({ where: { organizationId, employeeId, isDeleted: false, isPaid: true } }),
		prisma.employee.count({ where: { organizationId, reportToId: employeeId, isDeleted: false } }),
		prisma.department.count({ where: { organizationId, managerId: employeeId, isDeleted: false } }),
		prisma.section.count({ where: { organizationId, headId: employeeId, isDeleted: false } }),
	]);

	return {
		attendances,
		attendanceObligations,
		timesheets,
		timesheetlines,
		requestsAsRequester,
		requestsAsTarget,
		documents,
		scheduleOverrides,
		employeePayrolls,
		paidEmployeePayrolls,
		directReports,
		managedDepartments,
		managedSections,
	};
}

function matchesSelector(candidate: Candidate, selector: CandidateSelector) {
	if (selector.allNonDm && !candidate.isDmBacked) return true;
	if (selector.employeeIds.includes(candidate.employeeId)) return true;
	if (selector.dbIds.includes(candidate.id)) return true;
	if (candidate.email && selector.emails.includes(candidate.email.toLowerCase())) return true;
	if (selector.nameQuery && candidate.name.toLowerCase().includes(selector.nameQuery)) return true;
	return false;
}

async function loadCandidates(selector: CandidateSelector) {
	const organization = await prisma.organization.findFirst({
		where: { isDeleted: false, code: { equals: "bnei", mode: "insensitive" } },
		select: { id: true, name: true, code: true },
	});

	if (!organization) {
		throw new Error("Bandai organization with code bnei was not found.");
	}

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			employmentStatus: true,
			userId: true,
			personId: true,
			metadata: true,
			person: {
				select: {
					personalInfo: true,
					contactInfo: true,
					metadata: true,
				},
			},
		},
		orderBy: { employeeId: "asc" },
	});

	const candidates: Candidate[] = [];
	for (const employee of employees) {
		const isDmBacked = isDm3Source(employee.metadata) || isDm3Source(employee.person?.metadata);
		const name = getFullName(employee.person?.personalInfo);
		const email = getEmail(employee.person?.contactInfo);
		const role = employee.role || "";
		const counts = await countOwnedRows(employee.id, organization.id);
		const blockers: string[] = [];
		const privileged = isPrivilegedRole(role);

		if (isDmBacked) blockers.push("DM3-backed employee");
		if (privileged && !selector.allowPrivileged) blockers.push("privileged or manager role");
		if (counts.paidEmployeePayrolls > 0) blockers.push("has paid payroll snapshots");

		candidates.push({
			id: employee.id,
			employeeId: employee.employeeId,
			name,
			email,
			role,
			employmentStatus: employee.employmentStatus,
			userId: employee.userId,
			personId: employee.personId,
			employeeMetadata: employee.metadata,
			personMetadata: employee.person?.metadata,
			isDmBacked,
			isPrivileged: privileged,
			counts,
			blockers,
		});
	}

	return {
		organization,
		candidates: candidates.filter((candidate) => matchesSelector(candidate, selector)),
		allEmployees: employees.length,
	};
}

async function softDeleteCandidate(candidate: Candidate, organizationId: string) {
	const now = new Date();
	const cleanupMetadata = {
		cleanup: {
			reason: "Non-DM Bandai turnover cleanup",
			source: "scripts/audit-bandai-non-dm-employee-cleanup.ts",
			appliedAt: now.toISOString(),
		},
	};

	await prisma.$transaction(async (tx) => {
		await tx.department.updateMany({
			where: { organizationId, managerId: candidate.id },
			data: { managerId: null },
		});
		await tx.section.updateMany({
			where: { organizationId, headId: candidate.id },
			data: { headId: null },
		});
		await tx.sectionLineLeader.deleteMany({
			where: { organizationId, employeeId: candidate.id },
		});
		await tx.employee.updateMany({
			where: { organizationId, reportToId: candidate.id },
			data: { reportToId: null },
		});

		await tx.attendanceObligation.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true },
		});
		await tx.timesheetline.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true, isEffective: false },
		});
		await tx.timesheet.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true },
		});
		await tx.attendance.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true, isEffective: false },
		});
		await tx.scheduleOverride.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true },
		});
		await tx.document.updateMany({
			where: { employeeId: candidate.id, isDeleted: false },
			data: { isDeleted: true },
		});
		await tx.request.updateMany({
			where: {
				organizationId,
				isDeleted: false,
				OR: [{ requesterId: candidate.id }, { targetEmployeeId: candidate.id }],
			},
			data: { isDeleted: true },
		});
		await tx.employeePayroll.updateMany({
			where: { organizationId, employeeId: candidate.id, isDeleted: false, isPaid: false },
			data: { isDeleted: true },
		});

		await tx.employee.update({
			where: { id: candidate.id },
			data: {
				isDeleted: true,
				employmentStatus: "FORMER_EMPLOYEE",
				employmentTerminationDate: now,
				reportToId: null,
				deviceId: null,
				metadata: mergeMetadata(candidate.employeeMetadata, cleanupMetadata),
			},
		});

		if (candidate.personId) {
			await tx.person.update({
				where: { id: candidate.personId },
				data: {
					isDeleted: true,
					metadata: mergeMetadata(candidate.personMetadata, cleanupMetadata),
				},
			});
		}
	});
}

async function main() {
	const selector = parseArgs();
	if (
		!selector.allNonDm &&
		selector.employeeIds.length === 0 &&
		selector.dbIds.length === 0 &&
		selector.emails.length === 0 &&
		!selector.nameQuery
	) {
		throw new Error(
			"Provide a selector: --all-non-dm, --employee-id=EMP001, --id=<db-id>, --email=<email>, or --name=<text>.",
		);
	}

	const result = await loadCandidates(selector);
	const blocked = result.candidates.filter((candidate) => candidate.blockers.length > 0);
	const removable = result.candidates.filter((candidate) => candidate.blockers.length === 0);

	console.log(JSON.stringify({
		mode: selector.apply ? "apply" : "dry-run",
		organization: result.organization,
		totalActiveEmployees: result.allEmployees,
		selectedCount: result.candidates.length,
		removableCount: removable.length,
		blockedCount: blocked.length,
		confirmRequiredForApply: CONFIRM_TOKEN,
		candidates: result.candidates,
	}, null, 2));

	if (!selector.apply) {
		console.log("\nDry run only. No data was changed.");
		return;
	}

	if (selector.confirm !== CONFIRM_TOKEN) {
		throw new Error(`Apply blocked. Re-run with --confirm=${CONFIRM_TOKEN}.`);
	}

	if (blocked.length > 0) {
		throw new Error(
			`Apply blocked because ${blocked.length} selected employee(s) have blockers. Run dry-run and narrow the selector, or pass --allow-privileged only if intentional.`,
		);
	}

	for (const candidate of removable) {
		await softDeleteCandidate(candidate, result.organization.id);
	}

	console.log(JSON.stringify({
		applied: removable.map((candidate) => ({
			id: candidate.id,
			employeeId: candidate.employeeId,
			name: candidate.name,
			email: candidate.email,
		})),
	}, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
