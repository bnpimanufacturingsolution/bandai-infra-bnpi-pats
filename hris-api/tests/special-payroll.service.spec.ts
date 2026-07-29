import assert from "node:assert/strict";
import {
	buildSpecialPayrollPreview,
	clearSpecialPayrollPreviewCacheForTests,
	createSpecialPayrollRun,
	cancelSpecialPayrollRun,
	releaseSpecialPayrollRun,
} from "../app/specialPayroll/special-payroll.service";

type MockStore = {
	periods: any[];
	employees: any[];
	benefitTypes: any[];
	runs: any[];
	lines: any[];
	payslips: any[];
};

function makePrisma(store: MockStore) {
	const api: any = {
		payrollPeriod: {
			findFirst: async ({ where }: any) => {
				return (
					store.periods.find((p) => {
						if (where.id && p.id !== where.id) return false;
						if (where.code && p.code !== where.code) return false;
						if (where.organizationId && p.organizationId !== where.organizationId)
							return false;
						if (where.isDeleted === false && p.isDeleted) return false;
						return true;
					}) || null
				);
			},
		},
		employee: {
			findMany: async ({ where }: any) => {
				const ids: string[] = where.employeeId?.in || [];
				return store.employees.filter(
					(e) =>
						e.organizationId === where.organizationId &&
						!e.isDeleted &&
						ids.includes(e.employeeId),
				);
			},
		},
		benefitType: {
			findMany: async ({ where }: any) => {
				const codes: string[] = where.code?.in || [];
				return store.benefitTypes.filter(
					(b) =>
						b.organizationId === where.organizationId &&
						!b.isDeleted &&
						codes.includes(b.code),
				);
			},
		},
		specialPayrollLine: {
			findMany: async ({ where }: any) => {
				return store.lines.filter((line) => {
					if (line.organizationId !== where.organizationId) return false;
					const run = store.runs.find((r) => r.id === line.runId);
					if (!run || run.isDeleted) return false;
					if (where.run?.status?.not && run.status === where.run.status.not) return false;
					if (
						where.run?.contextPayrollPeriodId &&
						run.contextPayrollPeriodId !== where.run.contextPayrollPeriodId
					) {
						return false;
					}
					return true;
				});
			},
			createMany: async ({ data }: any) => {
				for (const row of data) {
					store.lines.push({ id: `line_${store.lines.length + 1}`, ...row });
				}
				return { count: data.length };
			},
		},
		specialPayrollPayslip: {
			create: async ({ data }: any) => {
				const payslip = { id: `ps_${store.payslips.length + 1}`, ...data };
				store.payslips.push(payslip);
				return payslip;
			},
			updateMany: async ({ where, data }: any) => {
				let count = 0;
				for (const p of store.payslips) {
					if (p.runId === where.runId) {
						Object.assign(p, data);
						count += 1;
					}
				}
				return { count };
			},
			findMany: async () => store.payslips,
			findFirst: async ({ where }: any) =>
				store.payslips.find((p) => p.id === where.id) || null,
		},
		specialPayrollRun: {
			findFirst: async ({ where, include }: any) => {
				const run =
					store.runs.find((r) => {
						if (where.id && r.id !== where.id) return false;
						if (where.organizationId && r.organizationId !== where.organizationId)
							return false;
						if (where.idempotencyKey && r.idempotencyKey !== where.idempotencyKey)
							return false;
						if (
							where.sourceFingerprint &&
							r.sourceFingerprint !== where.sourceFingerprint
						)
							return false;
						if (where.isDeleted === false && r.isDeleted) return false;
						if (where.status?.not && r.status === where.status.not) return false;
						return true;
					}) || null;
				if (!run) return null;
				if (include?.lines || include?.payslips) {
					return {
						...run,
						lines: store.lines.filter((l) => l.runId === run.id),
						payslips: store.payslips.filter((p) => p.runId === run.id),
					};
				}
				return run;
			},
			findFirstOrThrow: async ({ where, include }: any) => {
				const run = await api.specialPayrollRun.findFirst({ where, include });
				if (!run) throw new Error("not found");
				return run;
			},
			create: async ({ data }: any) => {
				const run = {
					id: `run_${store.runs.length + 1}`,
					...data,
					isDeleted: false,
				};
				store.runs.push(run);
				return run;
			},
			update: async ({ where, data }: any) => {
				const run = store.runs.find((r) => r.id === where.id);
				Object.assign(run, data);
				return {
					...run,
					lines: store.lines.filter((l) => l.runId === run.id),
					payslips: store.payslips.filter((p) => p.runId === run.id),
				};
			},
			count: async () => store.runs.length,
			findMany: async () => store.runs,
		},
		$transaction: async (fn: any) => fn(api),
	};
	return api;
}

describe("special-payroll.service", () => {
	beforeEach(() => {
		clearSpecialPayrollPreviewCacheForTests();
	});

	const baseStore = (): MockStore => ({
		periods: [
			{
				id: "period1",
				organizationId: "org1",
				code: "PP-20260726-20260811",
				name: "Jul 26 - Aug 11 2026",
				startDate: new Date("2026-07-26T00:00:00.000Z"),
				endDate: new Date("2026-08-11T00:00:00.000Z"),
				payDate: new Date("2026-08-15T00:00:00.000Z"),
				isDeleted: false,
			},
		],
		employees: [
			{
				id: "emp1",
				organizationId: "org1",
				employeeId: "01466",
				employmentStatus: "ACTIVE",
				isDeleted: false,
				person: {
					personalInfo: {
						firstName: "Angelica",
						middleName: "N.",
						lastName: "Leyesa",
					},
				},
			},
			{
				id: "emp2",
				organizationId: "org1",
				employeeId: "02000",
				employmentStatus: "TERMINATED",
				isDeleted: false,
				person: {
					personalInfo: { firstName: "Former", lastName: "Worker" },
				},
			},
		],
		benefitTypes: [
			{
				id: "bt1",
				organizationId: "org1",
				code: "AINC",
				name: "Annual Incentive",
				payrollDirection: "COMPENSATION",
				isTaxable: true,
				isActive: true,
				isDeleted: false,
			},
			{
				id: "bt2",
				organizationId: "org1",
				code: "LOAN",
				name: "Loan Deduction",
				payrollDirection: "DEDUCTION",
				isTaxable: false,
				isActive: true,
				isDeleted: false,
			},
		],
		runs: [],
		lines: [],
		payslips: [],
	});

	it("previews valid manual rows with gross=net and blocks inactive employees", async () => {
		const store = baseStore();
		const prisma = makePrisma(store);

		const ok = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Annual Incentive 2026",
			contextPayrollPeriodId: "period1",
			rows: [
				{
					employeeNumber: "01466",
					compensationCode: "AINC",
					amount: 1000,
					employeeName: "Leyesa, Angelica",
				},
			],
		});
		assert.equal(ok.valid, true);
		assert.equal(ok.totals.totalGross, 1000);
		assert.equal(ok.totals.totalNet, 1000);
		assert.equal(ok.rows[0].gross, ok.rows[0].net);

		const inactive = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Bad",
			contextPayrollPeriodId: "period1",
			rows: [
				{
					employeeNumber: "02000",
					compensationCode: "AINC",
					amount: 100,
				},
			],
		});
		assert.equal(inactive.valid, false);
		assert.equal(inactive.errors[0].code, "EMPLOYEE_INACTIVE");
	});

	it("rejects name mismatch, deduction direction, and duplicate employee+code", async () => {
		const store = baseStore();
		const prisma = makePrisma(store);

		const mismatch = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Mismatch",
			contextPayrollPeriodId: "period1",
			rows: [
				{
					employeeNumber: "01466",
					compensationCode: "AINC",
					amount: 100,
					employeeName: "Completely Wrong Name",
				},
			],
		});
		assert.equal(mismatch.errors[0].code, "NAME_MISMATCH");

		const direction = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Direction",
			contextPayrollPeriodId: "period1",
			rows: [
				{
					employeeNumber: "01466",
					compensationCode: "LOAN",
					amount: 100,
				},
			],
		});
		assert.equal(direction.errors[0].code, "COMPENSATION_DIRECTION");

		const dup = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Dup",
			contextPayrollPeriodId: "period1",
			rows: [
				{ employeeNumber: "01466", compensationCode: "AINC", amount: 100 },
				{ employeeNumber: "01466", compensationCode: "AINC", amount: 200 },
			],
		});
		assert.equal(dup.errors.some((e) => e.code === "DUPLICATE_IN_RUN"), true);
	});

	it("creates immediately, supports idempotent create, release, cancel rules", async () => {
		const store = baseStore();
		const prisma = makePrisma(store);

		const preview = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Annual Incentive 2026",
			contextPayrollPeriodId: "period1",
			rows: [
				{ employeeNumber: "01466", compensationCode: "AINC", amount: 1500 },
			],
		});
		assert.equal(preview.valid, true);

		const created = await createSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			previewId: preview.previewId,
			idempotencyKey: "idem-key-001",
			createdByUserId: "user1",
		});
		assert.equal(created.reused, false);
		assert.equal(created.run.status, "FINALIZED");
		assert.equal(store.lines.length, 1);
		assert.equal(store.payslips.length, 1);
		assert.equal(store.payslips[0].grossPay, 1500);
		assert.equal(store.payslips[0].netPay, 1500);

		const again = await createSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			previewId: preview.previewId,
			idempotencyKey: "idem-key-001",
		});
		// preview was consumed; first idempotent path returns existing before preview check
		// Second call: existing by idempotency key
		assert.equal(again.reused, true);
		assert.equal(again.run.id, created.run.id);

		const released = await releaseSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			runId: created.run.id,
			releasedByUserId: "user1",
		});
		assert.equal(released.run.status, "RELEASED");
		assert.equal(store.payslips[0].isReleased, true);

		let cancelError: any = null;
		try {
			await cancelSpecialPayrollRun(prisma as any, {
				organizationId: "org1",
				runId: created.run.id,
			});
		} catch (e) {
			cancelError = e;
		}
		assert.equal(cancelError?.code, "RUN_RELEASED_IMMUTABLE");
	});

	it("allows cancel before release and replacement after cancel", async () => {
		const store = baseStore();
		const prisma = makePrisma(store);

		const preview1 = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Bonus v1",
			contextPayrollPeriodId: "period1",
			rows: [
				{ employeeNumber: "01466", compensationCode: "AINC", amount: 500 },
			],
		});
		const created = await createSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			previewId: preview1.previewId,
			idempotencyKey: "idem-key-cancel-1",
		});
		const cancelled = await cancelSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			runId: created.run.id,
			reason: "Wrong amount",
		});
		assert.equal(cancelled.run.status, "CANCELLED");

		const preview2 = await buildSpecialPayrollPreview(prisma, {
			organizationId: "org1",
			label: "Bonus v2",
			contextPayrollPeriodId: "period1",
			rows: [
				{ employeeNumber: "01466", compensationCode: "AINC", amount: 750 },
			],
		});
		assert.equal(preview2.valid, true, JSON.stringify(preview2.errors));
		const replacement = await createSpecialPayrollRun(prisma as any, {
			organizationId: "org1",
			previewId: preview2.previewId,
			idempotencyKey: "idem-key-cancel-2",
		});
		assert.equal(replacement.reused, false);
		assert.equal(replacement.run.status, "FINALIZED");
		assert.equal(replacement.run.totalGross, 750);
	});
});
