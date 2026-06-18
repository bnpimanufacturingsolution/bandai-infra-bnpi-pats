import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { reconcileEmployeeOnboardingState } from "../helper/boarding-documents.helper";

const OPTIONAL_DM3_DOCUMENT_CODES = ["CONTRACT", "VALID_ID"] as const;
const DEFAULT_ORG_CODE = "bnei";

const prisma = new PrismaClient();

const readArg = (name: string) => {
	const prefix = `${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const parseArgs = () => {
	const flags = new Set(process.argv.slice(2));
	return {
		execute: flags.has("--execute"),
		allEmployees: flags.has("--all-employees"),
		organizationCode: readArg("--orgCode") || DEFAULT_ORG_CODE,
		organizationId: readArg("--org"),
	};
};

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase();

const getChecklistDocumentCode = (metadata: unknown) => {
	const record = metadata && typeof metadata === "object" ? (metadata as Record<string, any>) : {};
	return normalizeCode(record.documentCode || record.documentType);
};

const isDm3Employee = (metadata: unknown) => {
	const record = metadata && typeof metadata === "object" ? (metadata as Record<string, any>) : {};
	const importRecord = record.import && typeof record.import === "object" ? record.import : {};
	const sourceOfTruth =
		record.sourceOfTruth && typeof record.sourceOfTruth === "object"
			? record.sourceOfTruth
			: {};
	return (
		normalizeCode(importRecord.stage) === "DM3" ||
		normalizeCode(importRecord.step) === "DM3.1 EMPLOYEES" ||
		normalizeCode(sourceOfTruth.step) === "DM3.1 EMPLOYEES" ||
		normalizeCode(record.source) === "DM3.1 EMPLOYEES"
	);
};

async function resolveOrganization(args: ReturnType<typeof parseArgs>) {
	if (args.organizationId) {
		const organization = await prisma.organization.findFirst({
			where: { id: args.organizationId, isDeleted: false },
			select: { id: true, code: true, name: true },
		});
		if (!organization) throw new Error(`Organization ${args.organizationId} was not found.`);
		return organization;
	}

	const organization = await prisma.organization.findUnique({
		where: { code: args.organizationCode },
		select: { id: true, code: true, name: true },
	});
	if (!organization) throw new Error(`Organization code ${args.organizationCode} was not found.`);
	return organization;
}

async function main() {
	const args = parseArgs();
	const organization = await resolveOrganization(args);

	const documentTypesBefore = await prisma.documentType.findMany({
		where: {
			organizationId: organization.id,
			code: { in: [...OPTIONAL_DM3_DOCUMENT_CODES] },
			isDeleted: false,
		},
		select: { id: true, code: true, name: true, isRequired: true },
		orderBy: { displayOrder: "asc" },
	});

	if (args.execute) {
		await prisma.documentType.updateMany({
			where: {
				organizationId: organization.id,
				code: { in: [...OPTIONAL_DM3_DOCUMENT_CODES] },
				isDeleted: false,
			},
			data: { isRequired: false },
		});
	}

	const onboardingEmployees = await prisma.employee.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			employmentStatus: "ONBOARDING",
		},
		select: {
			id: true,
			employeeId: true,
			departmentId: true,
			role: true,
			employmentHireDate: true,
			metadata: true,
			person: { select: { metadata: true } },
		},
		orderBy: { employeeId: "asc" },
	});

	const scopedEmployees = args.allEmployees
		? onboardingEmployees
		: onboardingEmployees.filter(
				(employee) => isDm3Employee(employee.metadata) || isDm3Employee(employee.person?.metadata),
			);

	const processes = await prisma.boardingProcess.findMany({
		where: {
			employeeId: { in: scopedEmployees.map((employee) => employee.id) },
			type: "ONBOARDING",
			status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
			isDeleted: false,
		},
		select: {
			employeeId: true,
			checklistItems: {
				where: { isDeleted: false },
				select: {
					status: true,
					metadata: true,
				},
			},
		},
	});

	const processByEmployeeId = new Map(processes.map((process) => [process.employeeId, process]));
	const planned = scopedEmployees.map((employee) => {
		const items = processByEmployeeId.get(employee.id)?.checklistItems || [];
		const pendingItems = items.filter((item) => item.status !== "COMPLETED");
		const optionalTargetItems = pendingItems.filter((item) =>
			OPTIONAL_DM3_DOCUMENT_CODES.includes(getChecklistDocumentCode(item.metadata) as any),
		);
		const otherPendingItems = pendingItems.length - optionalTargetItems.length;
		return {
			id: employee.id,
			employeeId: employee.employeeId,
			optionalTargetItems: optionalTargetItems.length,
			otherPendingItems,
			wouldBecomeActive: pendingItems.length > 0 && otherPendingItems === 0,
		};
	});

	let reconciled = 0;
	if (args.execute) {
		for (const employee of scopedEmployees) {
			await reconcileEmployeeOnboardingState({
				prisma,
				organizationId: organization.id,
				employeeId: employee.id,
				targetDate: employee.employmentHireDate,
				departmentId: employee.departmentId,
				role: employee.role,
			});
			reconciled += 1;
		}
	}

	const documentTypesAfter = await prisma.documentType.findMany({
		where: {
			organizationId: organization.id,
			code: { in: [...OPTIONAL_DM3_DOCUMENT_CODES] },
			isDeleted: false,
		},
		select: { code: true, name: true, isRequired: true },
		orderBy: { displayOrder: "asc" },
	});

	const activeAfter = args.execute
		? await prisma.employee.count({
				where: {
					organizationId: organization.id,
					isDeleted: false,
					employmentStatus: "ACTIVE",
					id: { in: scopedEmployees.map((employee) => employee.id) },
				},
			})
		: null;

	const report = {
		mode: args.execute ? "execute" : "dry-run",
		organization,
		scope: args.allEmployees ? "all-onboarding-employees" : "dm3-onboarding-employees",
		optionalDocumentCodes: OPTIONAL_DM3_DOCUMENT_CODES,
		documentTypesBefore,
		documentTypesAfter,
		employees: {
			onboardingBefore: onboardingEmployees.length,
			scoped: scopedEmployees.length,
			wouldBecomeActive: planned.filter((item) => item.wouldBecomeActive).length,
			withOtherPendingItems: planned.filter((item) => item.otherPendingItems > 0).length,
			reconciled,
			activeAfter,
		},
		sample: planned.slice(0, 20).map(({ employeeId, optionalTargetItems, otherPendingItems, wouldBecomeActive }) => ({
			employeeId,
			optionalTargetItems,
			otherPendingItems,
			wouldBecomeActive,
		})),
		stopConditionMet: args.execute
			? documentTypesAfter.every((documentType) => documentType.isRequired === false)
			: documentTypesBefore.every((documentType) => documentType.isRequired === false),
	};

	console.log(JSON.stringify(report, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
