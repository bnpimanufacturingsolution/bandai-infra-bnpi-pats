/**
 * Provision the two hris-timekeeper kiosk seed accounts (timekeeper1/2@seed.local)
 * into a runtime database WITHOUT running the full general employee seeder.
 *
 * Why: the GitOps db-init Job is schema-only (`prisma-postgres:push`) and the full
 * `prisma-seed` must never run against runtime DEV/UAT/PROD data. These two
 * accounts were added to the shared seeder but never materialized in any runtime
 * DB, so /time-logging logins return 401 (no such user).
 *
 * Idempotent: safe to re-run. Creates only missing Person/User/Employee rows and
 * links them; never deletes or resets attendance/timesheet/payroll data.
 *
 * Dry-run by default:
 *   npx tsx scripts/provision-timekeeper-accounts.ts
 * Execute:
 *   npx tsx scripts/provision-timekeeper-accounts.ts --execute
 * Optional password reset on existing users:
 *   npx tsx scripts/provision-timekeeper-accounts.ts --execute --reset-password
 *
 * Target DB (default is the canonical K3s DEV forward):
 *   PROJECT_TRUTH_DEV_PG_DATABASE_URL or --database-url
 */

import { PrismaClient } from "../generated/prisma";
import * as bcrypt from "bcryptjs";

const TIMEKEEPER_PASSWORD = "password123";

interface TimekeeperDefinition {
	firstName: string;
	lastName: string;
	email: string;
	employeeCode: string;
	role: string;
	salary: number;
}

const TIMEKEEPER_DEFINITIONS: TimekeeperDefinition[] = [
	{
		firstName: "Rosa",
		lastName: "Aquino",
		email: "timekeeper1@seed.local",
		employeeCode: "EMP-HR-TK-001",
		role: "hris-timekeeper",
		salary: 18000,
	},
	{
		firstName: "Pedro",
		lastName: "Castro",
		email: "timekeeper2@seed.local",
		employeeCode: "EMP-HR-TK-002",
		role: "hris-timekeeper",
		salary: 18000,
	},
];

function resolveDatabaseUrl(): string {
	const args = process.argv.slice(2);
	const urlFlagIndex = args.indexOf("--database-url");
	if (urlFlagIndex >= 0 && args[urlFlagIndex + 1]) {
		return args[urlFlagIndex + 1];
	}
	if (process.env.PROJECT_TRUTH_DEV_PG_DATABASE_URL) {
		return process.env.PROJECT_TRUTH_DEV_PG_DATABASE_URL;
	}
	return "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
}

function buildSeedEmployer() {
	return {
		tin: "000-123-456-000",
		name: "Bandai Namco Entertainment Philippines",
		address: "Quezon City, Metro Manila, Philippines",
		rdoCode: "042",
		metadata: { source: "generalEmployeeSeeder" },
		branchCode: "BR-001",
		isVerified: true,
	};
}

function buildDefaultLeaveBalances() {
	const periodStart = new Date("2026-01-01T00:00:00.000Z");
	const periodEnd = new Date("2026-12-31T00:00:00.000Z");
	return [
		{
			leaveType: "VACATION",
			totalEntitled: 15,
			available: 15,
			used: 0,
			pending: 0,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
		{
			leaveType: "SICK",
			totalEntitled: 10,
			available: 10,
			used: 0,
			pending: 0,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
		{
			leaveType: "PERSONAL",
			totalEntitled: 5,
			available: 5,
			used: 0,
			pending: 0,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
	];
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const execute = args.includes("--execute");
	const resetPassword = args.includes("--reset-password");
	const databaseUrl = resolveDatabaseUrl();

	const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

	try {
		const anchorUser = await prisma.user.findFirst({
			where: { email: "hr-manager@seed.local", isDeleted: false },
			select: { id: true, organizationId: true },
		});
		const fallbackAnchor = anchorUser
			? null
			: await prisma.user.findFirst({
					where: { email: "admin@bandai.local", isDeleted: false },
					select: { id: true, organizationId: true },
				});
		const anchor = anchorUser ?? fallbackAnchor;
		if (!anchor || !anchor.organizationId) {
			throw new Error(
				"No anchor org user found (hr-manager@seed.local / admin@bandai.local). Cannot resolve organizationId.",
			);
		}
		const organizationId = anchor.organizationId;

		const seedManager = await prisma.employee.findFirst({
			where: { employeeId: "EMP-HR-MGR-001", organizationId, isDeleted: false },
			select: {
				id: true,
				departmentId: true,
				sectionId: true,
				positionId: true,
				levelId: true,
			},
		});

		let departmentId = seedManager?.departmentId ?? null;
		let sectionId = seedManager?.sectionId ?? null;
		let positionId = seedManager?.positionId ?? null;
		let levelId = seedManager?.levelId ?? null;
		let reportToId = seedManager?.id ?? null;

		if (!departmentId) {
			const department = await prisma.department.findFirst({
				where: { organizationId, code: "HR", isDeleted: false },
				select: { id: true },
			});
			departmentId = department?.id ?? null;
		}
		if (!sectionId) {
			const section = await prisma.section.findFirst({
				where: { organizationId, code: "HR-OPS", isDeleted: false },
				select: { id: true },
			});
			sectionId = section?.id ?? null;
		}
		if (!positionId) {
			const position = await prisma.position.findFirst({
				where: { organizationId, code: "HR-GEN", isDeleted: false },
				select: { id: true },
			});
			positionId = position?.id ?? null;
		}
		if (!levelId) {
			const level = await prisma.level.findFirst({
				where: { organizationId, name: "Entry", isDeleted: false },
				select: { id: true },
			});
			levelId = level?.id ?? null;
		}

		if (!departmentId || !positionId) {
			throw new Error(
				`Missing org refs for timekeepers: departmentId=${departmentId} positionId=${positionId} (org ${organizationId}).`,
			);
		}

		console.log(
			JSON.stringify(
				{
					mode: execute ? "execute" : "dry-run",
					databaseUrl: databaseUrl.replace(/\/\/[^@]+@/, "//***@"),
					organizationId,
					orgRefs: { departmentId, sectionId, positionId, levelId, reportToId },
					resetPassword,
				},
				null,
				2,
			),
		);

		const results: Array<Record<string, unknown>> = [];

		for (const definition of TIMEKEEPER_DEFINITIONS) {
			const existingUser = await prisma.user.findUnique({
				where: { email: definition.email },
			});
			const existingEmployee = await prisma.employee.findFirst({
				where: { employeeId: definition.employeeCode, organizationId },
			});

			const plan: Record<string, unknown> = {
				email: definition.email,
				employeeCode: definition.employeeCode,
				userExists: Boolean(existingUser),
				employeeExists: Boolean(existingEmployee),
				willCreateUser: !existingUser,
				willResetPassword: Boolean(existingUser && resetPassword),
				willCreateEmployee: !existingEmployee,
				willRelink: Boolean(
					(existingUser && (!existingEmployee || existingEmployee.userId !== existingUser.id)) ||
						(existingEmployee && (!existingUser || existingEmployee.personId === null)),
				),
			};

			if (!execute) {
				results.push(plan);
				continue;
			}

			const passwordHash = await bcrypt.hash(TIMEKEEPER_PASSWORD, 10);

			const user =
				existingUser ??
				(await prisma.user.create({
					data: {
						userName: definition.email.split("@")[0],
						email: definition.email,
						password: passwordHash,
						role: definition.role,
						status: "active",
						isDeleted: false,
						loginMethod: "email",
						organizationId,
						metadata: {
							requirePasswordChange: false,
							isFirstLogin: false,
						},
					},
				}));

			const userUpdate: Record<string, unknown> = {};
			if (resetPassword || !existingUser) {
				userUpdate.password = passwordHash;
			}
			if (existingUser && existingUser.role !== definition.role) {
				userUpdate.role = definition.role;
			}
			if (existingUser && existingUser.organizationId !== organizationId) {
				userUpdate.organizationId = organizationId;
			}
			if (existingUser && existingUser.isDeleted) {
				userUpdate.isDeleted = false;
			}
			if (Object.keys(userUpdate).length > 0) {
				await prisma.user.update({ where: { id: user.id }, data: userUpdate as never });
			}

			let personId = existingEmployee?.personId ?? null;
			if (!personId) {
				const person = await prisma.person.create({
					data: {
						organizationId,
						userId: user.id,
						personalInfo: {
							prefix: "Mr.",
							firstName: definition.firstName,
							middleName: "Seed",
							lastName: definition.lastName,
							placeOfBirth: "Metro Manila",
							nationality: "Filipino",
							primaryLanguage: "English",
							gender: "male",
							currency: "PHP",
						},
						contactInfo: {
							email: definition.email,
							phones: [
								{
									type: "mobile",
									countryCode: "+63",
									number: "9170000000",
									isPrimary: true,
								},
							],
							address: [
								{
									street: "123 Seed Street",
									city: "Quezon City",
									state: "Metro Manila",
									country: "Philippines",
								},
							],
						},
						metadata: { isActive: true, isDeleted: false },
					},
				});
				personId = person.id;
			} else {
				const person = await prisma.person.findUnique({ where: { id: personId } });
				if (person && person.userId !== user.id) {
					await prisma.person.update({ where: { id: personId }, data: { userId: user.id } });
				}
			}

			const employmentHireDate = new Date("2026-01-01T00:00:00.000Z");
			const employmentStartDate = new Date();

			let employeeId: string;
			if (existingEmployee) {
				const updated = await prisma.employee.update({
					where: { id: existingEmployee.id },
					data: {
						personId,
						userId: user.id,
						role: definition.role,
						reportToId: reportToId ?? existingEmployee.reportToId ?? null,
						departmentId,
						sectionId,
						positionId,
						levelId,
						isDeleted: false,
					},
				});
				employeeId = updated.id;
			} else {
				const created = await prisma.employee.create({
					data: {
						organizationId,
						employeeId: definition.employeeCode,
						personId,
						userId: user.id,
						role: definition.role,
						reportToId,
						departmentId,
						sectionId,
						positionId,
						levelId,
						basicSalary: definition.salary,
						employmentHireDate,
						employmentStartDate,
						employmentStatus: "ACTIVE",
						employmentType: "PROBATIONARY",
						workLocation: "ONSITE",
						currency: "PHP",
						payFrequency: "SEMI_MONTHLY",
						workforceSource: "DIRECT",
						employer: buildSeedEmployer(),
						employmentHistory: [],
						leaveBalances: buildDefaultLeaveBalances(),
						leaveBalancesLastUpdated: new Date(),
						deviceEmpId: definition.employeeCode,
						metadata: {
							isFirstLogin: false,
							requirePasswordChange: false,
							source: "provision-timekeeper-accounts",
						},
					} as never,
				});
				employeeId = created.id;
			}

			results.push({
				email: definition.email,
				employeeCode: definition.employeeCode,
				userId: user.id,
				personId,
				employeeDbId: employeeId,
				action: existingEmployee ? "updated" : "created",
			});
		}

		console.log(JSON.stringify(results, null, 2));
		if (!execute) {
			console.log("DRY-RUN ONLY — no writes performed. Re-run with --execute to apply.");
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
