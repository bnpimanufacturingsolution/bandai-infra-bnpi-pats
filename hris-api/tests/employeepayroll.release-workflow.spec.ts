import { expect } from "chai";
import express from "express";
import request from "supertest";
import {
	controller,
	__resetEmployeePayrollControllerDependenciesForTests,
	__setEmployeePayrollControllerDependenciesForTests,
} from "../app/employeepayroll/employeepayroll.controller";

describe("employee payroll release workflow and authorization", () => {
	const hrEmployeeId = "507f1f77bcf86cd799439011";
	const employeeSelfId = "507f1f77bcf86cd799439012";
	const otherEmployeeId = "507f1f77bcf86cd799439013";

	afterEach(() => {
		__resetEmployeePayrollControllerDependenciesForTests();
	});

	function buildApp(prisma: any, authOverrides: Record<string, any> = {}) {
		const app = express();
		const employeePayrollController = controller(prisma);
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).userId = authOverrides.userId || hrEmployeeId;
			(req as any).organizationId = authOverrides.organizationId || "org-1";
			(req as any).role = authOverrides.role || "hris-hr-manager";
			(req as any).metadata = authOverrides.metadata || {
				employee: { id: hrEmployeeId },
			};
			next();
		});
		app.get("/employee-payroll/:id", (req, res, next) =>
			employeePayrollController.getById(req, res, next),
		);
		app.get("/employee-payroll/:id/breakdown", (req, res, next) =>
			employeePayrollController.getBreakdown(req, res, next),
		);
		app.get("/employee-payroll/:id/payslip", (req, res, next) =>
			employeePayrollController.generatePayslipPdf(req, res, next),
		);
		app.post("/employee-payroll/period/:payrollPeriodId/publish", (req, res, next) =>
			employeePayrollController.publishPayrollPeriod(req as any, res, next),
		);
		app.post(
			"/employee-payroll/period/:payrollPeriodId/payslip-release/generate-payslips",
			(req, res, next) => employeePayrollController.generatePayslipsForPeriod(req as any, res, next),
		);
		app.post("/employee-payroll/period/:payrollPeriodId/payslip-release/release", (req, res, next) =>
			employeePayrollController.releasePayslipsForPeriod(req as any, res, next),
		);
		app.post("/employee-payroll/:id/payment-issue", (req, res, next) =>
			employeePayrollController.flagPayrollPaymentIssue(req as any, res, next),
		);
		return app;
	}

	const basePayroll = {
		id: "payroll-1",
		organizationId: "org-1",
		employeeId: employeeSelfId,
		payrollPeriodId: "period-1",
		isPublished: false,
		publishedAt: null,
		payslipGeneratedAt: null,
		payslipReleasedAt: null,
		hasPaymentIssue: false,
		metadata: {},
		employee: {
			id: employeeSelfId,
			employeeId: "EMP-001",
			role: "hris-employee",
			person: {
				personalInfo: {
					firstName: "Employee",
					lastName: "Self",
				},
			},
		},
		payrollPeriod: {
			id: "period-1",
			name: "Period 2 - June 2026",
			status: "COMPLETED",
			payDate: new Date("2026-06-30T00:00:00.000Z"),
			payslipReleaseAttachmentUrl: null,
		},
	};

	it("prevents an employee from fetching another employee payroll record", async () => {
		const app = buildApp(
			{
				employeePayroll: {
					findFirst: async () => ({
						...basePayroll,
						employeeId: otherEmployeeId,
						employee: {
							...basePayroll.employee,
							id: otherEmployeeId,
							employeeId: "EMP-OTHER",
						},
					}),
				},
			},
			{
				role: "hris-employee",
				userId: "employee-user",
				metadata: { employee: { id: employeeSelfId } },
			},
		);

		const response = await request(app).get("/employee-payroll/payroll-1").expect(403);

		expect(response.body.status).to.equal("error");
		expect(response.body.message).to.contain("not allowed");
	});

	it("prevents an employee from downloading another employee payslip", async () => {
		__setEmployeePayrollControllerDependenciesForTests({
			fetchImpl: async () =>
				({
					ok: true,
					arrayBuffer: async () => Buffer.from("pdf-bytes"),
				}) as any,
		});

		const app = buildApp(
			{
				employeePayroll: {
					findFirst: async () => ({
						...basePayroll,
						employeeId: otherEmployeeId,
						employee: {
							...basePayroll.employee,
							id: otherEmployeeId,
							employeeId: "EMP-OTHER",
						},
						payrollPeriod: {
							...basePayroll.payrollPeriod,
						},
						metadata: {
							payslip: {
								documentNumber: "PS-001",
							},
						},
					}),
				},
				document: {
					findFirst: async () => ({
						fileUrl: "https://files.example.test/payslip.pdf",
						ext: "pdf",
					}),
				},
			},
			{
				role: "hris-employee",
				userId: "employee-user",
				metadata: { employee: { id: employeeSelfId } },
			},
		);

		const response = await request(app).get("/employee-payroll/payroll-1/payslip").expect(403);

		expect(response.body.status).to.equal("error");
		expect(response.body.message).to.contain("not allowed");
	});

	it("rejects payslip release before payslip generation is completed", async () => {
		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
					payslipReleaseAttachmentUrl: "https://files.example.test/release-memo.pdf",
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
						payslipGeneratedAt: null,
					},
				],
			},
		});

		const response = await request(app)
			.post("/employee-payroll/period/period-1/payslip-release/release")
			.send({})
			.expect(409);

		expect(response.body.message).to.contain("before payslip generation");
	});

	it("rejects payslip release before the required release attachment is uploaded", async () => {
		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
					payslipReleaseAttachmentUrl: null,
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
						payslipGeneratedAt: new Date("2026-06-26T00:00:00.000Z"),
						metadata: {
							payslip: {
								documentId: "document-1",
								fileUrl: "https://files.example.test/payslip.pdf",
							},
						},
					},
				],
			},
		});

		const response = await request(app)
			.post("/employee-payroll/period/period-1/payslip-release/release")
			.send({})
			.expect(409);

		expect(response.body.message).to.contain("attachment");
	});

	it("rejects payslip release when generated payslip document metadata is missing", async () => {
		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
					payslipReleaseAttachmentUrl: "https://files.example.test/release-memo.pdf",
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
						payslipGeneratedAt: new Date("2026-06-26T00:00:00.000Z"),
						metadata: {},
					},
				],
			},
		});

		const response = await request(app)
			.post("/employee-payroll/period/period-1/payslip-release/release")
			.send({})
			.expect(409);

		expect(response.body.message).to.contain("document metadata");
	});

	it("does not publish payroll notifications before the explicit publish action", async () => {
		const notificationCalls: any[] = [];
		__setEmployeePayrollControllerDependenciesForTests({
			publishPayrollPublishedNotificationImpl: async (_prisma: any, _io: any, params: any) => {
				notificationCalls.push(params);
				return null;
			},
		});

		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
					payslipReleaseAttachmentUrl: "https://files.example.test/release-memo.pdf",
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
						payslipGeneratedAt: new Date("2026-06-26T00:00:00.000Z"),
						metadata: {
							payslip: {
								documentId: "document-1",
								fileUrl: "https://files.example.test/payslip.pdf",
							},
						},
					},
				],
				update: async ({ where, data }: any) => ({ id: where.id, ...data }),
			},
		});

		await request(app)
			.post("/employee-payroll/period/period-1/payslip-release/release")
			.send({})
			.expect(200);

		expect(notificationCalls).to.have.length(0);
	});

	it("creates payroll published notifications only after the explicit publish action", async () => {
		const notificationCalls: any[] = [];
		__setEmployeePayrollControllerDependenciesForTests({
			publishPayrollPublishedNotificationImpl: async (_prisma: any, _io: any, params: any) => {
				notificationCalls.push(params);
				return null;
			},
		});

		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
					},
				],
				update: async ({ where, data }: any) => ({ id: where.id, ...data }),
			},
		});

		await request(app)
			.post("/employee-payroll/period/period-1/publish")
			.send({})
			.expect(200);

		expect(notificationCalls).to.have.length(1);
		expect(notificationCalls[0].employeePayrollId).to.equal("payroll-1");
	});

	it("creates payslip available notifications only after the explicit release action", async () => {
		const notificationCalls: any[] = [];
		__setEmployeePayrollControllerDependenciesForTests({
			publishPayslipAvailableNotificationImpl: async (_prisma: any, _io: any, params: any) => {
				notificationCalls.push(params);
				return null;
			},
		});

		const app = buildApp({
			payrollPeriod: {
				findFirst: async () => ({
					id: "period-1",
					organizationId: "org-1",
					status: "COMPLETED",
					payslipReleaseAttachmentUrl: "https://files.example.test/release-memo.pdf",
				}),
			},
			employeePayroll: {
				findMany: async () => [
					{
						...basePayroll,
						payslipGeneratedAt: new Date("2026-06-26T00:00:00.000Z"),
						metadata: {
							payslip: {
								documentId: "document-1",
								fileUrl: "https://files.example.test/payslip.pdf",
							},
						},
					},
				],
				update: async ({ where, data }: any) => ({ id: where.id, ...data }),
			},
		});

		await request(app)
			.post("/employee-payroll/period/period-1/payslip-release/release")
			.send({})
			.expect(200);

		expect(notificationCalls).to.have.length(1);
		expect(notificationCalls[0].employeePayrollId).to.equal("payroll-1");
	});
});
