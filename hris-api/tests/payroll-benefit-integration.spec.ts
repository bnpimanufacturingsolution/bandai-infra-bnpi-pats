import assert from "node:assert/strict";
import { CreateEmployeeBenefitSchema } from "../zod/employeebenefit.zod";
import {
	markPayrollBenefitInstallmentsDeducted,
	buildPayrollSourceAmountsByEmployeeId,
} from "../helper/payroll-period.helper";

const period = {
	id: "period-1",
	startDate: new Date("2026-01-01T00:00:00.000Z"),
	endDate: new Date("2026-01-15T23:59:59.999Z"),
};

const source = (overrides: Record<string, unknown> = {}) => ({
	id: "benefit-1",
	organizationId: "org-1",
	employeeId: "employee-1",
	status: "ACTIVE",
	isActive: true,
	isDeleted: false,
	amount: 1000,
	startDate: period.startDate,
	endDate: period.endDate,
	benefitType: {
		code: "HEALTH",
		name: "Health benefit",
		payrollDirection: "DEDUCTION",
		reconciliationAction: "UFD",
		isTaxable: false,
		isDeleted: false,
	},
	installments: [],
	...overrides,
});

const prismaFor = (benefits: unknown[], timesheets: unknown[] = []) => ({
	employeeBenefit: { findMany: async () => benefits },
	employeeLoan: { findMany: async () => [] },
	timesheet: { findMany: async () => timesheets },
	payrollPeriod: {
		findUnique: async () => ({
			id: period.id,
			periodNumber: 1,
			payFrequency: "SEMI_MONTHLY",
			startDate: period.startDate,
			endDate: period.endDate,
		}),
		count: async () => 1,
	},
	payrollCycleConfig: {
		findFirst: async () => null,
	},
	employeeBenefitInstallment: {
		create: async (args: any) => ({ id: `created-${Date.now()}`, ...args.data }),
		update: async (args: any) => ({ id: args.where.id, ...args.data }),
	},
}) as any;

describe("payroll benefit integration", () => {
	it("defaults API-created employee enrollments to ACTIVE", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			organizationId: "org-1",
			employeeId: "550e8400-e29b-41d4-a716-446655440000",
			benefitTypeId: "550e8400-e29b-41d4-a716-446655440001",
			amount: 1000,
			startDate: period.startDate,
			endDate: period.endDate,
			agreedToTerms: true,
		});

		assert.equal(parsed.status, "ACTIVE");
		assert.equal(parsed.isActive, true);
		assert.throws(
			() => CreateEmployeeBenefitSchema.parse({
				organizationId: "org-1",
				benefitTypeId: "550e8400-e29b-41d4-a716-446655440001",
				amount: 1000,
				startDate: period.startDate,
				endDate: period.endDate,
				agreedToTerms: true,
			}),
		);
	});

	it("uses one due installment for a scheduled benefit", async () => {
		const result = await buildPayrollSourceAmountsByEmployeeId(
			prismaFor([
				source({
					amount: 6000,
					installments: [
						{ id: "i-1", amount: 1000, scheduledDate: period.startDate, status: "SCHEDULED" },
						{ id: "i-2", amount: 1000, scheduledDate: new Date("2026-01-16"), status: "SCHEDULED" },
					],
				}),
			] as any),
			{
				employeeIds: ["employee-1"],
				organizationId: "org-1",
				payrollPeriodId: period.id,
				startDate: period.startDate,
				endDate: period.endDate,
			},
		);

		assert.equal(result.get("employee-1")?.amounts.deductionBenefits, 1000);
		assert.deepEqual(result.get("employee-1")?.installmentIds, ["i-1"]);
	});

	it("keeps compensation and deduction benefits in separate payroll buckets", async () => {
		const result = await buildPayrollSourceAmountsByEmployeeId(
			prismaFor([
				source({ id: "comp-1", amount: 500, benefitType: { ...source().benefitType, payrollDirection: "COMPENSATION" } }),
				source({ id: "ded-1", amount: 200 }),
			] as any),
			{
				employeeIds: ["employee-1"],
				organizationId: "org-1",
				payrollPeriodId: period.id,
				startDate: period.startDate,
				endDate: period.endDate,
			},
		);

		assert.equal(result.get("employee-1")?.amounts.totalCompensationBenefits, 500);
		assert.equal(result.get("employee-1")?.amounts.deductionBenefits, 200);
	});

	it("excludes a scheduled installment linked to a different payroll period", async () => {
		const result = await buildPayrollSourceAmountsByEmployeeId(
			prismaFor([source({
				installments: [{
					id: "mismatched-cutoff",
					amount: 1000,
					scheduledDate: period.startDate,
					status: "SCHEDULED",
					payrollCutOffId: "period-2",
				}],
			})] as any),
			{
				employeeIds: ["employee-1"], organizationId: "org-1", payrollPeriodId: period.id, startDate: period.startDate, endDate: period.endDate,
			},
		);

		assert.equal(result.has("employee-1"), false);
	});

	it("persists a successful generated installment as deducted with its payroll period", async () => {
		const calls: any[] = [];
		const prisma = {
			employeeBenefitInstallment: {
				updateMany: async (args: any) => { calls.push(args); return { count: 1 }; },
				findFirst: async () => null,
			},
		} as any;

		const count = await markPayrollBenefitInstallmentsDeducted(prisma, ["persisted-installment"], {
			payrollPeriodId: period.id,
			payrollRunId: "run-1",
		});

		assert.equal(count, 1);
		assert.deepEqual(calls[0].where, { id: "persisted-installment", status: "SCHEDULED" });
		assert.equal(calls[0].data.status, "DEDUCTED");
		assert.equal(calls[0].data.payrollCutOffId, period.id);
	});

	it("reuses an installment already deducted for the same cutoff during a payroll rerun", async () => {
		const result = await buildPayrollSourceAmountsByEmployeeId(
			prismaFor([source({ installments: [
				{ id: "i-1", amount: 1000, scheduledDate: period.startDate, status: "DEDUCTED", payrollCutOffId: period.id },
			] })] as any),
			{
				employeeIds: ["employee-1"],
				organizationId: "org-1",
				payrollPeriodId: period.id,
				startDate: period.startDate,
				endDate: period.endDate,
			},
		);

		assert.equal(result.get("employee-1")?.amounts.deductionBenefits, 1000);
	});

	it("is idempotent when the same payroll cutoff is processed twice", async () => {
		let status: "SCHEDULED" | "DEDUCTED" = "SCHEDULED";
		const updateCalls: any[] = [];
		const findCalls: any[] = [];
		const prisma = {
			employeeBenefitInstallment: {
				updateMany: async (args: any) => {
					updateCalls.push(args);
					if (status !== "SCHEDULED") return { count: 0 };
					status = "DEDUCTED";
					return { count: 1 };
				},
				findFirst: async (args: any) => {
					findCalls.push(args);
					return status === "DEDUCTED" &&
						args.where.id === "i-1" &&
						args.where.status === "DEDUCTED" &&
						args.where.payrollCutOffId === period.id
						? { id: "i-1", status, payrollCutOffId: period.id }
						: null;
				},
			},
		} as any;

		const firstCount = await markPayrollBenefitInstallmentsDeducted(prisma, ["i-1"], {
			payrollPeriodId: period.id,
		});
		const secondCount = await markPayrollBenefitInstallmentsDeducted(prisma, ["i-1"], {
			payrollPeriodId: period.id,
		});

		assert.equal(firstCount, 1);
		assert.equal(secondCount, 0);
		assert.equal(updateCalls.length, 1);
		assert.equal(updateCalls[0].where.status, "SCHEDULED");
		assert.equal(updateCalls[0].data.payrollCutOffId, period.id);
		assert.equal(findCalls.length, 2);
	});

	it("lazy-creates a recurring installment for the payroll period when none exists", async () => {
		const created: any[] = [];
		const benefits = [
			source({
				id: "recurring-1",
				scheduleMode: "RECURRING",
				amount: 500,
				totalAmount: 500,
				installmentAmount: 500,
				endDate: null,
				installments: [],
			}),
		];
		const base = prismaFor(benefits);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => {
					const row = { id: `created-${created.length + 1}`, ...data };
					created.push(row);
					return row;
				},
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(created.length, 1);
		assert.equal(created[0].amount, 500);
		assert.equal(created[0].status, "SCHEDULED");
		assert.equal(result.get("employee-1")?.amounts.deductionBenefits, 500);
		assert.deepEqual(result.get("employee-1")?.installmentIds, ["created-1"]);
	});

	it("does not duplicate a recurring installment already present for the period", async () => {
		const created: any[] = [];
		const benefits = [
			source({
				scheduleMode: "RECURRING",
				amount: 500,
				installmentAmount: 500,
				endDate: null,
				installments: [
					{
						id: "i-existing",
						installmentNumber: 1,
						amount: 500,
						scheduledDate: period.startDate,
						status: "SCHEDULED",
					},
				],
			}),
		];
		const base = prismaFor(benefits);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => {
					created.push(data);
					return { id: "should-not-create", ...data };
				},
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(created.length, 0);
		assert.equal(result.get("employee-1")?.amounts.deductionBenefits, 500);
		assert.deepEqual(result.get("employee-1")?.installmentIds, ["i-existing"]);
	});

	it("skips recurring ensure when the benefit ends before the payroll period", async () => {
		const created: any[] = [];
		const benefits = [
			source({
				scheduleMode: "RECURRING",
				amount: 500,
				installmentAmount: 500,
				startDate: new Date("2025-01-01T00:00:00.000Z"),
				endDate: new Date("2025-12-31T00:00:00.000Z"),
				installments: [],
			}),
		];
		const base = prismaFor(benefits);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => {
					created.push(data);
					return { id: "x", ...data };
				},
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(created.length, 0);
		assert.equal(result.has("employee-1"), false);
	});

	it("zeros ATTENDANCE_QUALIFIED benefit when period has ABSENT", async () => {
		const updates: any[] = [];
		const benefits = [
			source({
				id: "pfa-1",
				scheduleMode: "RECURRING",
				eligibilityMode: "ATTENDANCE_QUALIFIED",
				eligibilityDisqualifyOnAbsent: true,
				eligibilityDisqualifyOnLate: false,
				eligibilityDisqualifyOnUndertime: false,
				eligibilityDisqualifyOnLeave: false,
				attendanceBased: false,
				amount: 1000,
				totalAmount: 1000,
				installmentAmount: 1000,
				endDate: null,
				benefitType: {
					...source().benefitType,
					payrollDirection: "COMPENSATION",
					code: "PFA",
					name: "Perfect Attendance",
					reconciliationAction: "KEEP_AS_BENEFIT",
				},
				installments: [
					{
						id: "i-pfa-1",
						installmentNumber: 1,
						amount: 1000,
						scheduledDate: period.startDate,
						status: "SCHEDULED",
					},
				],
			}),
		];
		const timesheets = [
			{
				employeeId: "employee-1",
				timesheetlines: [
					{ date: period.startDate, status: "PRESENT", lateHours: "0:00", undertimeHours: "0:00", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-02T00:00:00.000Z"), status: "ABSENT", lateHours: "0:00", undertimeHours: "0:00", isDeleted: false, isEffective: true },
				],
			},
		];
		const base = prismaFor(benefits, timesheets);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => ({ id: "new", ...data }),
				update: async (args: any) => {
					updates.push(args);
					return { id: args.where.id, ...args.data };
				},
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(updates.length, 1);
		assert.equal(updates[0].data.amount, 0);
		assert.equal(result.has("employee-1"), false);
	});

	it("pays full fixed amount when ATTENDANCE_QUALIFIED and period is clean", async () => {
		const benefits = [
			source({
				id: "pfa-2",
				scheduleMode: "RECURRING",
				eligibilityMode: "ATTENDANCE_QUALIFIED",
				eligibilityDisqualifyOnAbsent: true,
				eligibilityDisqualifyOnLate: true,
				eligibilityDisqualifyOnUndertime: true,
				eligibilityDisqualifyOnLeave: true,
				attendanceBased: false,
				amount: 500,
				totalAmount: 500,
				installmentAmount: 500,
				endDate: null,
				benefitType: {
					...source().benefitType,
					payrollDirection: "COMPENSATION",
					code: "PFA",
					name: "Perfect Attendance",
				},
				installments: [
					{
						id: "i-pfa-2",
						installmentNumber: 1,
						amount: 500,
						scheduledDate: period.startDate,
						status: "SCHEDULED",
					},
				],
			}),
		];
		const timesheets = [
			{
				employeeId: "employee-1",
				timesheetlines: [
					{ date: period.startDate, status: "PRESENT", lateHours: "0:00", undertimeHours: "0:00", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-02T00:00:00.000Z"), status: "PRESENT", lateHours: "0:00", undertimeHours: "0:00", isDeleted: false, isEffective: true },
				],
			},
		];
		const prisma = prismaFor(benefits, timesheets);

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		// amount already 500 — may skip update when unchanged
		assert.equal(result.get("employee-1")?.amounts.totalCompensationBenefits, 500);
	});

	it("computes PER_DAY attendance-based benefit as rate × present days", async () => {
		const updates: any[] = [];
		const benefits = [
			source({
				id: "att-day-1",
				scheduleMode: "RECURRING",
				attendanceBased: true,
				attendanceAmountBasis: "PER_DAY",
				amount: 50,
				totalAmount: 50,
				installmentAmount: 50,
				endDate: null,
				benefitType: {
					...source().benefitType,
					payrollDirection: "COMPENSATION",
					code: "MLA",
					name: "Meal Allowance",
				},
				installments: [
					{
						id: "i-att-1",
						installmentNumber: 1,
						amount: 50,
						scheduledDate: period.startDate,
						status: "SCHEDULED",
					},
				],
			}),
		];
		const timesheets = [
			{
				employeeId: "employee-1",
				timesheetlines: [
					{ date: period.startDate, status: "PRESENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-02T00:00:00.000Z"), status: "PRESENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-03T00:00:00.000Z"), status: "ABSENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-04T00:00:00.000Z"), status: "REST_DAY", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-05T00:00:00.000Z"), status: "LEAVE", isDeleted: false, isEffective: true },
				],
			},
		];
		const base = prismaFor(benefits, timesheets);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => ({ id: "new", ...data }),
				update: async (args: any) => {
					updates.push(args);
					return { id: args.where.id, ...args.data };
				},
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		// scheduled non-rest = 4 (PRESENT, PRESENT, ABSENT, LEAVE); absent = 1; present = 3
		// 50 × 3 = 150
		assert.equal(updates.length, 1);
		assert.equal(updates[0].data.amount, 150);
		assert.equal(result.get("employee-1")?.amounts.totalCompensationBenefits, 150);
	});

	it("computes PER_CUTOFF attendance-based benefit pro-rated for ABSENT only", async () => {
		const created: any[] = [];
		const benefits = [
			source({
				id: "att-cut-1",
				scheduleMode: "RECURRING",
				attendanceBased: true,
				attendanceAmountBasis: "PER_CUTOFF",
				amount: 500,
				totalAmount: 500,
				installmentAmount: 500,
				endDate: null,
				benefitType: {
					...source().benefitType,
					payrollDirection: "COMPENSATION",
					code: "MLA",
					name: "Meal Allowance",
				},
				installments: [],
			}),
		];
		const timesheets = [
			{
				employeeId: "employee-1",
				timesheetlines: [
					{ date: period.startDate, status: "PRESENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-02T00:00:00.000Z"), status: "PRESENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-03T00:00:00.000Z"), status: "ABSENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-04T00:00:00.000Z"), status: "PRESENT", isDeleted: false, isEffective: true },
					{ date: new Date("2026-01-05T00:00:00.000Z"), status: "PRESENT", isDeleted: false, isEffective: true },
				],
			},
		];
		const base = prismaFor(benefits, timesheets);
		const prisma = {
			...base,
			employeeBenefitInstallment: {
				create: async ({ data }: { data: any }) => {
					const row = { id: "created-att-1", ...data };
					created.push(row);
					return row;
				},
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
		} as any;

		const result = await buildPayrollSourceAmountsByEmployeeId(prisma, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		// present 4 / scheduled 5 × 500 = 400
		assert.equal(created.length, 1);
		assert.equal(created[0].amount, 400);
		assert.equal(result.get("employee-1")?.amounts.totalCompensationBenefits, 400);
	});
});
