import { expect } from "chai";
import express from "express";
import request from "supertest";
import { controller } from "../app/employeepayroll/employeepayroll.controller";

describe("employee payroll snapshot lock API contract", () => {
	const userId = "507f1f77bcf86cd799439011";

	function buildApp(prisma: any) {
		const app = express();
		const employeePayrollController = controller(prisma);
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).userId = userId;
			(req as any).organizationId = "org-1";
			(req as any).role = "hris-hr-manager";
			next();
		});
		app.patch("/employee-payroll/:id", (req, res, next) =>
			employeePayrollController.update(req, res, next),
		);
		app.post("/employee-payroll/debug/reset-generated-payrolls", (req, res, next) =>
			employeePayrollController.resetGeneratedPayrolls(req as any, res, next),
		);
		return app;
	}

	it("rejects earnings edits once payroll is paid", async () => {
		const updateCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => ({ id: "payroll-1", isPaid: true }),
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", ...args.data };
				},
			},
		});

		const response = await request(app)
			.patch("/employee-payroll/payroll-1")
			.send({ basicPay: 12000 })
			.expect(409);

		expect(response.body.status).to.equal("error");
		expect(response.body.message).to.contain("Paid payroll snapshots are locked");
		expect(response.body.errors).to.deep.include({
			field: "basicPay",
			message: "PAYROLL_SNAPSHOT_LOCKED",
		});
		expect(updateCalls).to.have.length(0);
	});

	it("rejects timesheet snapshot rewrites once payroll is paid", async () => {
		const updateCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => ({ id: "payroll-1", isPaid: true }),
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", ...args.data };
				},
			},
		});

		const response = await request(app)
			.patch("/employee-payroll/payroll-1")
			.send({ timesheetSnapshot: { totalRegularHours: "160:00" } })
			.expect(409);

		expect(response.body.errors).to.deep.include({
			field: "timesheetSnapshot",
			message: "PAYROLL_SNAPSHOT_LOCKED",
		});
		expect(updateCalls).to.have.length(0);
	});

	it("allows payment reference fields to be maintained on paid payroll", async () => {
		const updateCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => ({ id: "payroll-1", isPaid: true }),
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", isPaid: true, ...args.data };
				},
			},
		});

		const response = await request(app)
			.patch("/employee-payroll/payroll-1")
			.send({
				notes: "Released through bank batch 42",
				paymentMethod: "BANK_TRANSFER",
				referenceNumber: "REF-42",
			})
			.expect(200);

		expect(updateCalls).to.have.length(1);
		expect(updateCalls[0].data).to.deep.equal({
			notes: "Released through bank batch 42",
			paymentMethod: "BANK_TRANSFER",
			referenceNumber: "REF-42",
		});
		expect(response.body.status).to.equal("success");
		expect(response.body.data.employeePayroll).to.include({
			id: "payroll-1",
			isPaid: true,
			referenceNumber: "REF-42",
		});
	});

	it("locks payroll snapshots when unpaid payroll is marked paid", async () => {
		const updateCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => ({ id: "payroll-1", isPaid: false }),
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", ...args.data };
				},
			},
		});

		await request(app)
			.patch("/employee-payroll/payroll-1")
			.send({ isPaid: true })
			.expect(200);

		expect(updateCalls).to.have.length(1);
		expect(updateCalls[0].data.isPaid).to.equal(true);
		expect(updateCalls[0].data.paidAt).to.be.instanceOf(Date);
		expect(updateCalls[0].data.snapshotLockedAt).to.be.instanceOf(Date);
		expect(updateCalls[0].data.snapshotLockedBy).to.equal(userId);
		expect(updateCalls[0].data.snapshotLockReason).to.equal("PAYROLL_MARKED_PAID");
	});

	it("preserves caller-provided lock metadata when marking payroll paid", async () => {
		const updateCalls: any[] = [];
		const explicitPaidAt = "2026-05-15T04:00:00.000Z";
		const explicitLockedAt = "2026-05-15T05:00:00.000Z";
		const explicitLockedBy = "507f1f77bcf86cd799439012";
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => ({ id: "payroll-1", isPaid: false }),
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", ...args.data };
				},
			},
		});

		await request(app)
			.patch("/employee-payroll/payroll-1")
			.send({
				isPaid: true,
				paidAt: explicitPaidAt,
				snapshotLockedAt: explicitLockedAt,
				snapshotLockedBy: explicitLockedBy,
				snapshotLockReason: "PAYROLL_RUN_FINALIZED",
			})
			.expect(200);

		expect(updateCalls[0].data.paidAt.toISOString()).to.equal(explicitPaidAt);
		expect(updateCalls[0].data.snapshotLockedAt.toISOString()).to.equal(explicitLockedAt);
		expect(updateCalls[0].data.snapshotLockedBy).to.equal(explicitLockedBy);
		expect(updateCalls[0].data.snapshotLockReason).to.equal("PAYROLL_RUN_FINALIZED");
	});

	it("returns not found without creating payroll when the target record is missing", async () => {
		const updateCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				findFirst: async () => null,
				update: async (args: any) => {
					updateCalls.push(args);
					return { id: "payroll-1", ...args.data };
				},
			},
		});

		const response = await request(app)
			.patch("/employee-payroll/missing-payroll")
			.send({ notes: "No-op" })
			.expect(404);

		expect(response.body.status).to.equal("error");
		expect(updateCalls).to.have.length(0);
	});

	it("resets generated employee payroll data without touching future draft periods", async () => {
		const transactionCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				count: async (args: any) => {
					transactionCalls.push(["countPayrolls", args]);
					return 2;
				},
			},
			payrollPeriod: {
				findMany: async (args: any) => {
					transactionCalls.push(["findResetPeriods", args]);
					return [
						{
							id: "period-1",
							name: "Past Period",
							code: "PP-PAST",
							status: "COMPLETED",
							startDate: new Date("2026-05-01T00:00:00.000Z"),
							endDate: new Date("2026-05-15T00:00:00.000Z"),
						},
					];
				},
			},
			$transaction: async (callback: any) =>
				callback({
					employeePayroll: {
						findMany: async (args: any) => {
							transactionCalls.push(["findPayrollIds", args]);
							return [{ id: "payroll-1" }, { id: "payroll-2" }];
						},
						deleteMany: async (args: any) => {
							transactionCalls.push(["deletePayrolls", args]);
							return { count: 2 };
						},
					},
					sOALineItem: {
						updateMany: async (args: any) => {
							transactionCalls.push(["unlinkSoa", args]);
							return { count: 1 };
						},
					},
					payrollPeriod: {
						updateMany: async (args: any) => {
							transactionCalls.push(["resetPeriods", args]);
							return { count: 1 };
						},
					},
				}),
		});

		const response = await request(app)
			.post("/employee-payroll/debug/reset-generated-payrolls")
			.set("Content-Type", "application/json")
			.send({ confirm: "DELETE_EMPLOYEE_PAYROLLS" })
			.expect(200);

		const resetPeriods = transactionCalls.find(([name]) => name === "resetPeriods")?.[1];
		expect(resetPeriods.where.status.in).to.deep.equal(["PROCESSING", "COMPLETED", "CLOSED"]);
		expect(resetPeriods.where.status.in).to.not.include("DRAFT");
		expect(resetPeriods.where.startDate.lte).to.be.instanceOf(Date);
		expect(resetPeriods.data.status).to.equal("OPEN");
		expect(response.body.data).to.include({
			deletedEmployeePayrolls: 2,
			resetPayrollPeriods: 1,
			unlinkedSoaLineItems: 1,
			preservedFutureDraftPeriods: true,
		});
	});

	it("rejects reset requests without the explicit confirmation token", async () => {
		const transactionCalls: any[] = [];
		const app = buildApp({
			employeePayroll: {
				count: async () => 0,
			},
			payrollPeriod: {
				findMany: async () => [],
			},
			$transaction: async () => {
				transactionCalls.push("transaction");
			},
		});

		const response = await request(app)
			.post("/employee-payroll/debug/reset-generated-payrolls")
			.send({})
			.expect(400);

		expect(response.body.message).to.contain("Confirmation token");
		expect(transactionCalls).to.have.length(0);
	});
});
