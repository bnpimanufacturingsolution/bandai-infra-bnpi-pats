import { expect } from "chai";
import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "../generated/prisma";
import { controller } from "../app/dashboard/dashboard.controller";

const TEST_TIMEOUT = 5000;

describe("Dashboard Controller", () => {
	let dashboardController: any;
	let prisma: any;
	let req: any;
	let res: Response;
	let next: NextFunction;
	let sentData: any;
	let statusCode: number;

	const buildDocumentType = (overrides?: Record<string, any>) => ({
		id: "doc-type-1",
		code: "medical_certificate",
		name: "Medical Certificate",
		category: "COMPLIANCE",
		uploadBy: "EMPLOYEE",
		isRequired: false,
		isEmployeeVisible: true,
		displayOrder: 1,
		fields: [],
		metadata: null,
		...overrides,
	});

	const buildEmployeeDocument = (overrides?: Record<string, any>) => ({
		id: "employee-doc-1",
		documentTypeId: "doc-type-1",
		type: "medical_certificate",
		name: "Medical Certificate",
		number: "DOC-001",
		issueDate: null,
		expiryDate: null,
		fileUrl: "https://example.com/document.pdf",
		ext: "pdf",
		fieldValues: {},
		...overrides,
	});

	beforeEach(() => {
		prisma = {
			employee: {
				findUnique: async () => ({
					id: "emp-1",
					organizationId: "org-1",
					departmentId: null,
					role: "hris-employee",
					employmentHireDate: new Date("2026-04-01T00:00:00.000Z"),
					employmentStatus: "ONBOARDING",
				}),
			},
			documentType: {
				findMany: async () => [],
			},
			document: {
				findMany: async () => [],
			},
			boardingProcess: {
				findFirst: async () => null,
				findMany: async () => [],
				update: async (data: any) => data,
			},
			payrollPeriod: {
				findFirst: async () => null,
			},
			timesheet: {
				findFirst: async () => null,
			},
			request: {
				findMany: async () => [],
			},
			notification: {
				findMany: async () => [],
			},
			checklistItem: {
				findMany: async () => [],
				create: async (data: any) => data,
				update: async (data: any) => data,
			},
			boardingTemplate: {
				findFirst: async () => null,
			},
		};

		dashboardController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;

		req = {
			query: {},
			params: {},
			body: {},
			organizationId: "org-1",
			role: "hris-employee",
			metadata: { employee: { id: "emp-1" } },
		} as unknown as Request;

		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			end: () => res,
		} as Response;

		next = () => {};
	});

	describe(".getActionNeeded()", () => {
		it("returns timesheet reminder when current period exists and no timesheet is submitted", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.payrollPeriod.findFirst = async () => ({
				id: "period-1",
				code: "2026-04-A",
				name: "Apr 1-15, 2026",
				startDate: new Date("2026-04-01T00:00:00.000Z"),
				endDate: new Date("2026-04-15T23:59:59.999Z"),
			});

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.items).to.be.an("array");
			expect(
				sentData.data.items.some((item: any) => item.kind === "TIMESHEET_REMINDER"),
			).to.equal(true);
		});

		it("returns salary change PAN approvals as actionable PAN items", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.request.findMany = async () => [
				{
					id: "req-pan-1",
					code: "REQ-00001",
					type: "SALARY_CHANGE",
					currentWorkflowStateKey: "FOR_APPROVAL",
					createdAt: new Date("2026-04-01T04:00:00.000Z"),
					endDate: null,
				},
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const panItems = sentData.data.items.filter(
				(item: any) => item.kind === "PAN_APPROVAL",
			);
			expect(panItems.length).to.equal(1);
			expect(panItems[0].metadata.requestId).to.equal("req-pan-1");
		});

		it("returns unread notifications only", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.notification.findMany = async () => [
				{
					id: "notif-unread",
					title: "Unread",
					description: "Unread message",
					type: "REMINDER",
					createdAt: new Date("2026-04-01T05:00:00.000Z"),
					recipients: {
						read: [],
						unread: [{ employeeId: "emp-1", readAt: null }],
					},
					category: "REMINDER",
				},
				{
					id: "notif-read",
					title: "Read",
					description: "Already read",
					type: "INFO",
					createdAt: new Date("2026-04-01T05:10:00.000Z"),
					recipients: {
						read: [{ employeeId: "emp-1", readAt: new Date("2026-04-01T05:20:00.000Z") }],
						unread: [],
					},
					category: "SYSTEM",
				},
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const notificationItems = sentData.data.items.filter(
				(item: any) => item.kind === "NOTIFICATION_UNREAD",
			);
			expect(notificationItems.length).to.equal(1);
			expect(notificationItems[0].metadata.notificationId).to.equal("notif-unread");
		});

		it("sorts mixed action-needed items by most recent createdAt overall", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.payrollPeriod.findFirst = async () => ({
				id: "period-1",
				code: "2026-04-A",
				name: "Apr 1-15, 2026",
				startDate: new Date("2026-04-01T00:00:00.000Z"),
				endDate: new Date("2026-04-15T23:59:59.999Z"),
			});
			prisma.request.findMany = async () => [
				{
					id: "req-approval-1",
					code: "REQ-10001",
					type: "PROMOTION",
					currentWorkflowStateKey: "FOR_APPROVAL",
					createdAt: new Date("2026-04-20T08:00:00.000Z"),
					endDate: null,
					metadata: {},
				},
				{
					id: "req-timesheet-1",
					code: "REQ-10002",
					type: "TIMESHEET",
					currentWorkflowStateKey: "OPEN",
					createdAt: new Date("2026-04-19T08:00:00.000Z"),
					endDate: null,
					metadata: {
						timesheetAction: "SUBMISSION",
						timesheetId: "timesheet-22",
					},
				},
			];
			prisma.notification.findMany = async () => [
				{
					id: "notif-newest",
					title: "Newest notification",
					description: "Most recent unread notification",
					type: "REMINDER",
					createdAt: new Date("2026-04-22T09:00:00.000Z"),
					recipients: {
						read: [],
						unread: [{ employeeId: "emp-1", readAt: null }],
					},
					category: "REMINDER",
					metadata: {},
				},
			];
			prisma.checklistItem.findMany = async () => [
				{
					id: "check-tin",
					processId: "process-1",
					title: "Upload your TIN ID",
					description: "TIN is required for onboarding compliance.",
					priority: "HIGH",
					status: "PENDING",
					dueDate: new Date("2026-04-30T00:00:00.000Z"),
					createdAt: new Date("2026-04-21T09:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-tin",
						documentCode: "tin_id",
						uploadBy: "EMPLOYEE",
					},
				},
			];
			prisma.documentType.findMany = async () => [
				buildDocumentType({
					id: "doc-type-tin",
					code: "tin_id",
					name: "TIN ID",
					isRequired: true,
				}),
				buildDocumentType({
					id: "doc-type-medical",
					code: "medical_certificate",
					name: "Medical Certificate",
					isRequired: false,
					displayOrder: 2,
				}),
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData.data.items.map((item: any) => item.id)).to.deep.equal([
				"notification-unread-notif-newest",
				"onboarding-document-check-tin",
				"pan-approval-req-approval-1",
				"pan-approval-req-timesheet-1",
				"timesheet-reminder-emp-1-period-1",
				"onboarding-document-doc-type-medical",
			]);
			expect(sentData.data.items[0].kind).to.equal("NOTIFICATION_UNREAD");
			expect(sentData.data.items[1].metadata.priorityState).to.equal("missing_required");
			expect(sentData.data.items[2].metadata.requestId).to.equal("req-approval-1");
			expect(sentData.data.items[3].metadata.timesheetAction).to.equal("SUBMISSION");
			expect(sentData.data.items[5].metadata.priorityState).to.equal("optional");
		});

		it("falls back to due date, then priority, then id when timestamps match", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.checklistItem.findMany = async () => [
				{
					id: "check-medium-earlier-due",
					processId: "process-1",
					title: "Medium earlier due",
					description: "Earlier due date should sort first when timestamps match.",
					priority: "MEDIUM",
					status: "PENDING",
					dueDate: new Date("2026-04-24T00:00:00.000Z"),
					createdAt: new Date("2026-04-10T08:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-passport",
						documentCode: "passport",
						uploadBy: "EMPLOYEE",
					},
				},
				{
					id: "check-high-later-due",
					processId: "process-1",
					title: "High later due",
					description: "Higher priority but later due date.",
					priority: "HIGH",
					status: "PENDING",
					dueDate: new Date("2026-04-25T00:00:00.000Z"),
					createdAt: new Date("2026-04-10T08:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-license",
						documentCode: "license",
						uploadBy: "EMPLOYEE",
					},
				},
				{
					id: "check-low-no-due",
					processId: "process-1",
					title: "Low no due",
					description: "No due date should fall behind due-dated items.",
					priority: "LOW",
					status: "PENDING",
					dueDate: null,
					createdAt: new Date("2026-04-10T08:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-id",
						documentCode: "company_id",
						uploadBy: "EMPLOYEE",
					},
				},
			];
			prisma.documentType.findMany = async () => [];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData.data.items.map((item: any) => item.id)).to.deep.equal([
				"onboarding-document-check-medium-earlier-due",
				"onboarding-document-check-high-later-due",
				"onboarding-document-check-low-no-due",
			]);
		});

		it("returns employee-actionable required onboarding documents", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				{
					id: "doc-type-1",
					code: "tin_id",
					name: "TIN ID",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					displayOrder: 1,
				},
				{
					id: "doc-type-2",
					code: "contract",
					name: "Employment Contract",
					category: "COMPLIANCE",
					uploadBy: "HR",
					isRequired: true,
					displayOrder: 2,
				},
			];
			prisma.checklistItem.findMany = async () => [
				{
					id: "check-1",
					processId: "process-1",
					title: "Upload your TIN ID",
					description: "TIN is required for onboarding compliance.",
					priority: "HIGH",
					status: "PENDING",
					dueDate: new Date("2026-04-30T00:00:00.000Z"),
					createdAt: new Date("2026-04-01T00:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-1",
						documentCode: "tin_id",
						uploadBy: "EMPLOYEE",
					},
				},
				{
					id: "check-2",
					processId: "process-1",
					title: "HR uploads contract",
					description: "HR-only document should not appear.",
					priority: "MEDIUM",
					status: "PENDING",
					dueDate: null,
					createdAt: new Date("2026-04-02T00:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-2",
						documentCode: "contract",
						uploadBy: "HR",
					},
				},
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems.length).to.equal(1);
			expect(documentItems[0].metadata.documentCode).to.equal("tin_id");
			expect(documentItems[0].targetPath).to.equal(
				"/employee/emp-1?tab=documents&action=add-doc&documentType=tin_id",
			);
			expect(documentItems[0].metadata.checklistItemId).to.equal("check-1");
		});

		it("returns missing mandated documents even without checklist rows", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				buildDocumentType({
					id: "doc-type-medical",
					isRequired: true,
				}),
			];
			prisma.checklistItem.findMany = async () => [];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems.length).to.equal(1);
			expect(documentItems[0].title).to.equal("Complete Medical Certificate");
			expect(documentItems[0].metadata.documentCode).to.equal("medical_certificate");
			expect(documentItems[0].metadata.checklistItemId).to.equal(null);
		});

		it("returns missing optional employee-uploadable documents as low-priority warnings", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [buildDocumentType()];
			prisma.checklistItem.findMany = async () => [];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems).to.have.length(1);
			expect(documentItems[0]).to.include({
				title: "Optional document recommended",
				description: "Medical Certificate: Add this when applicable.",
				priority: "low",
				statusLabel: "Upload",
				targetPath: "/employee/emp-1?tab=documents&action=add-doc&documentType=medical_certificate",
			});
			expect(documentItems[0].metadata).to.include({
				documentTypeId: "doc-type-1",
				documentCode: "medical_certificate",
				priorityState: "optional",
				isMandated: false,
				actionLabel: "Upload",
				actionDescription: "Add this when applicable",
			});
		});

		it("does not return dashboard items for missing HR-only optional documents", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				buildDocumentType({
					id: "doc-type-hr-only",
					uploadBy: "HR",
				}),
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems).to.have.length(0);
		});

		it("does not return optional documents that are already complete", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				buildDocumentType({
					fields: [
						{
							key: "licenseNumber",
							type: "text",
							required: true,
						},
					],
				}),
			];
			prisma.document.findMany = async () => [
				buildEmployeeDocument({
					fieldValues: {
						licenseNumber: "MC-42",
					},
				}),
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems).to.have.length(0);
		});

		it("returns incomplete optional saved documents as edit-flow warnings", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				buildDocumentType({
					fields: [
						{
							key: "licenseNumber",
							type: "text",
							required: true,
						},
					],
				}),
			];
			prisma.document.findMany = async () => [
				buildEmployeeDocument({
					number: "DOC-777",
					fieldValues: {},
				}),
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems).to.have.length(1);
			expect(documentItems[0]).to.include({
				title: "Optional document recommended",
				priority: "low",
				statusLabel: "Fill up",
				targetPath: "/employee/emp-1?tab=documents&action=edit-doc&documentNumber=DOC-777",
			});
			expect(documentItems[0].metadata.priorityState).to.equal("optional");
		});

		it("returns both mandated blockers and optional warnings in priority order", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				buildDocumentType({
					id: "doc-type-tin",
					code: "tin_id",
					name: "TIN ID",
					isRequired: true,
					displayOrder: 1,
				}),
				buildDocumentType({
					id: "doc-type-medical",
					code: "medical_certificate",
					name: "Medical Certificate",
					isRequired: false,
					displayOrder: 2,
				}),
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems).to.have.length(2);
			expect(documentItems.map((item: any) => item.metadata.documentCode)).to.deep.equal([
				"tin_id",
				"medical_certificate",
			]);
			expect(documentItems.map((item: any) => item.priority)).to.deep.equal(["high", "low"]);
		});

		it("dedupes checklist-backed and synthesized document tasks", async function () {
			this.timeout(TEST_TIMEOUT);

			prisma.documentType.findMany = async () => [
				{
					id: "doc-type-sss",
					code: "sss_id",
					name: "SSS ID",
					category: "COMPLIANCE",
					uploadBy: "BOTH",
					isRequired: true,
					displayOrder: 1,
				},
			];
			prisma.checklistItem.findMany = async () => [
				{
					id: "check-sss",
					processId: "process-1",
					title: "Complete SSS ID",
					description: "SSS ID still needs action.",
					priority: "HIGH",
					status: "PENDING",
					dueDate: new Date("2026-04-30T00:00:00.000Z"),
					createdAt: new Date("2026-04-01T00:00:00.000Z"),
					metadata: {
						isSystemGenerated: true,
						documentTypeId: "doc-type-sss",
						documentCode: "sss_id",
						uploadBy: "BOTH",
					},
				},
			];

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			const documentItems = sentData.data.items.filter(
				(item: any) => item.kind === "ONBOARDING_DOCUMENT",
			);
			expect(documentItems.length).to.equal(1);
			expect(documentItems[0].metadata.checklistItemId).to.equal("check-sss");
		});

		it("returns empty summary when no action-needed items are present", async function () {
			this.timeout(TEST_TIMEOUT);

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData.data.summary).to.deep.equal({
				total: 0,
				high: 0,
				medium: 0,
				low: 0,
			});
			expect(sentData.data.items).to.deep.equal([]);
		});

		it("returns 400 when employee auth context is missing", async function () {
			this.timeout(TEST_TIMEOUT);
			req.metadata = {};

			await dashboardController.getActionNeeded(req as Request, res, next);

			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});
	});
});
