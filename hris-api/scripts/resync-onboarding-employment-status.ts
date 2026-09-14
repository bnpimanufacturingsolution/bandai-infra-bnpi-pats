import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { syncEmployeeEmploymentStatus } from "../helper/boarding-documents.helper";
import { recomputeOnboardingChecklistProgress } from "../app/onboarding/onboardingLifecycle.helper";
import {
	ACTIONABLE_ONBOARDING_ITEM_FILTER,
} from "../app/onboarding/onboardingAccess.helper";

/**
 * One-off resync for the "no responsible = section row" gate change: ONBOARDING employees
 * who are blocked ONLY by section rows (no responsible department) or by stale stored
 * progress numbers get re-evaluated. Dry-run by default (read-only emulation of the
 * shared gate); --execute performs the recompute + real syncEmployeeEmploymentStatus.
 */

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
		organizationCode: readArg("--orgCode") || DEFAULT_ORG_CODE,
		organizationId: readArg("--org"),
	};
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

	const employees = await prisma.employee.findMany({
		where: { organizationId: organization.id, employmentStatus: "ONBOARDING", isDeleted: false },
		select: { id: true, employeeId: true },
		orderBy: { employeeId: "asc" },
	});

	console.log(
		`[resync-onboarding-employment-status] org=${organization.code} ONBOARDING employees=${employees.length} mode=${args.execute ? "EXECUTE" : "DRY-RUN"}`,
	);

	let wouldPromote = 0;
	let promoted = 0;
	let staysOnboarding = 0;
	let errored = 0;

	for (const employee of employees) {
		try {
			const [pendingActionable, pendingTotal, checklists] = await Promise.all([
				prisma.onboardingItem.count({
					where: {
						status: "PENDING",
						isDeleted: false,
						...ACTIONABLE_ONBOARDING_ITEM_FILTER,
						section: { isDeleted: false, checklist: { employeeId: employee.id, isDeleted: false } },
					},
				}),
				prisma.onboardingItem.count({
					where: {
						status: "PENDING",
						isDeleted: false,
						section: { isDeleted: false, checklist: { employeeId: employee.id, isDeleted: false } },
					},
				}),
				prisma.onboardingChecklist.findMany({
					where: { employeeId: employee.id, isDeleted: false },
					select: { id: true, completionPercentage: true, status: true },
				}),
			]);
			const sectionOnlyPending = pendingTotal - pendingActionable;

			// Dry-run emulation of syncEmployeeEmploymentStatus (read-only).
			const activeLegacy = await prisma.boardingProcess.findMany({
				where: {
					employeeId: employee.id,
					type: "ONBOARDING",
					status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
					isDeleted: false,
				},
				select: {
					id: true,
					checklistItems: {
						where: { isDeleted: false, status: { not: "COMPLETED" } },
						select: { id: true },
					},
				},
			});
			const hasPendingLegacy = activeLegacy.some((p) => p.checklistItems.length > 0);
			const gateWouldClear = !hasPendingLegacy && pendingActionable === 0;
			if (gateWouldClear) wouldPromote += 1;
			else staysOnboarding += 1;

			const line = {
				employeeNumber: employee.employeeId,
				dedicatedChecklists: checklists.length,
				pendingActionable,
				sectionOnlyPending,
				storedProgress: checklists.map((c) => `${c.completionPercentage}%/${c.status}`),
				legacyPending: hasPendingLegacy,
				...(gateWouldClear ? { outcome: args.execute ? "promote->ACTIVE" : "would promote" } : { outcome: "stays ONBOARDING" }),
			};
			console.log(JSON.stringify(line));

			if (args.execute) {
				for (const checklist of checklists) {
					await recomputeOnboardingChecklistProgress(prisma, checklist.id);
				}
				const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: employee.id });
				if (result?.employmentStatus === "ACTIVE") promoted += 1;
			}
		} catch (error) {
			errored += 1;
			console.error(`ERROR ${employee.employeeId}: ${error}`);
		}
	}

	console.log(
		`[summary] scanned=${employees.length} ${args.execute ? `promoted=${promoted}` : `wouldPromote=${wouldPromote}`} staysOnboarding=${staysOnboarding} errored=${errored}${args.execute ? "" : " (pass --execute to apply)"}`,
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
