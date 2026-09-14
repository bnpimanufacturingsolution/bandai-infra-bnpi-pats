/**
 * Backfill Training & Performance access from the legacy static role mapping.
 *
 * Phase 3 rollout dependency (frozen): employees whose HRIS role implicitly
 * granted LMS admin + epmr_admin under the old mapping keep that access as
 * EXPLICIT configuration before the resolver replaces the static mapping.
 *
 * Legacy implicit access (mapHrisRoleToExternal, external-handoff.service.ts):
 *   hris-admin | admin | super_admin | superadmin -> lmsAccess ADMIN + epmr_admin
 *   hris-hr-manager / hris-employee / hris-hr-user / hris-employee-manager
 *     -> defaults cover or no EPMR access existed; nothing to preserve.
 *
 * Rules:
 *   - Rows with NO existing explicit configuration (or absent rows) are created
 *     with { lmsRoleOverride: "admin", epmrGrants: ["epmr_admin"] }.
 *   - Rows with ANY existing explicit configuration are NEVER touched.
 *   - Idempotent: re-running produces zero changes.
 *   - Organization scoped; soft-deleted rows and employees are skipped.
 *
 * Default is dry-run. Pass --execute to WRITE.
 */
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";

const apiRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env.development.local"), override: true });

/** HRIS roles that implicitly received LMS admin + epmr_admin under the legacy mapping. */
const BACKFILL_HRIS_ROLES = ["hris-admin", "admin", "super_admin", "superadmin"] as const;

const BACKFILL_LMS_ROLE_OVERRIDE = "admin";
const BACKFILL_EPMR_GRANT = "epmr_admin";

type CliOptions = { execute: boolean; organizationId?: string; help: boolean };

function parseArgs(argv = process.argv.slice(2)): CliOptions {
	const flags = new Set(argv.filter((arg) => !arg.includes("=")));
	const getFlagValue = (name: string): string | undefined => {
		const index = argv.indexOf(`--${name}`);
		return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")
			? argv[index + 1].trim()
			: undefined;
	};
	return {
		execute: flags.has("--execute"),
		organizationId: getFlagValue("organizationId"),
		help: flags.has("--help") || flags.has("-h"),
	};
}

function hasExplicitConfig(row: {
	lmsRoleOverride: string | null;
	epmrGrants: string[];
	epmrRemovals: string[];
}): boolean {
	return Boolean(
		row.lmsRoleOverride ||
			(Array.isArray(row.epmrGrants) && row.epmrGrants.length > 0) ||
			(Array.isArray(row.epmrRemovals) && row.epmrRemovals.length > 0),
	);
}

async function main() {
	const options = parseArgs();
	if (options.help) {
		console.log(
			"Usage: tsx scripts/backfill-application-access.ts [--organizationId=<id>] [--execute]\n" +
				"Default is dry-run. --execute writes changes.",
		);
		return;
	}

	const prisma = new PrismaClient();
	try {
		// Employee -> User is a loose userId link (no Prisma relation on either
		// tree), so resolve the admin users first, then fetch their employees.
		const adminUsers = await prisma.user.findMany({
			where: { role: { in: [...BACKFILL_HRIS_ROLES] }, isDeleted: false },
			select: { id: true, role: true },
		});
		const adminUserIds = adminUsers.map((u) => u.id);

		const employees = adminUserIds.length
			? await prisma.employee.findMany({
					where: {
						isDeleted: false,
						userId: { in: adminUserIds },
						...(options.organizationId ? { organizationId: options.organizationId } : {}),
					},
					select: {
						id: true,
						employeeId: true,
						organizationId: true,
						userId: true,
					},
				})
			: [];

		console.log(
			`[backfill] Found ${employees.length} employee(s) with legacy-admin HRIS roles` +
				`${options.execute ? " — EXECUTE mode" : " — DRY RUN"}`,
		);

		const existingRows = await prisma.employeeApplicationAccess.findMany({
			where: {
				organizationId: { in: [...new Set(employees.map((e) => e.organizationId))] },
				isDeleted: false,
			},
		});
		const rowsByEmployee = new Map(existingRows.map((row) => [row.employeeId, row]));

		let created = 0;
		let skippedExistingConfig = 0;
		let alreadyConfigured = 0;

		for (const employee of employees) {
			const existing = employee.id ? rowsByEmployee.get(employee.id) : undefined;

			if (existing && hasExplicitConfig(existing)) {
				skippedExistingConfig += 1;
				console.log(
					`[backfill] SKIP (explicit config exists) employee=${employee.employeeId} row=${existing.id}`,
				);
				continue;
			}

			if (existing) {
				// Telemetry-only row (created by launch upsert): fill explicit config.
				alreadyConfigured += 1;
				if (options.execute) {
					await prisma.employeeApplicationAccess.update({
						where: { id: existing.id },
						data: {
							lmsRoleOverride: BACKFILL_LMS_ROLE_OVERRIDE,
							epmrGrants: [
								...new Set([...(existing.epmrGrants || []), BACKFILL_EPMR_GRANT]),
							],
							provisioningStatus: "PENDING",
						},
					});
				}
				console.log(
					`[backfill] ${options.execute ? "UPDATED" : "WOULD UPDATE"} telemetry-only row employee=${employee.employeeId}`,
				);
				continue;
			}

			created += 1;
			if (options.execute) {
				await prisma.employeeApplicationAccess.create({
					data: {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						lmsRoleOverride: BACKFILL_LMS_ROLE_OVERRIDE,
						epmrGrants: [BACKFILL_EPMR_GRANT],
						epmrRemovals: [],
						provisioningStatus: "PENDING",
					},
				});
			}
			console.log(
				`[backfill] ${options.execute ? "CREATED" : "WOULD CREATE"} explicit config employee=${employee.employeeId} org=${employee.organizationId}`,
			);
		}

		console.log(
			`[backfill] Summary: total=${employees.length} ` +
				`created=${created} updatedTelemetryOnly=${alreadyConfigured} skippedExplicit=${skippedExistingConfig}`,
		);
		if (!options.execute) {
			console.log("[backfill] Dry run complete. Re-run with --execute to write changes.");
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error("[backfill] Failed:", error);
	process.exit(1);
});
