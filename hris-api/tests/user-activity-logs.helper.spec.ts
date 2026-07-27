import { expect } from "chai";
import type { NextFunction, Response } from "express";
import requireUserActivityLogAccess from "../middleware/requireUserActivityLogAccess";
import { buildUserActivityFeed } from "../helper/user-activity-logs.helper";

type LogSeed = {
	id: string;
	user?: any;
	employees: any[];
	activityLogs: any[];
	auditLogs: any[];
	requestTransactions: any[];
	scheduleHistory: any[];
};

const createResponseMock = () => {
	let statusCode = 200;
	let payload: any;
	const res: Partial<Response> = {
		status(code: number) {
			statusCode = code;
			return res as Response;
		},
		json(data: any) {
			payload = data;
			return res as Response;
		},
	};

	return { res: res as Response, getStatusCode: () => statusCode, getPayload: () => payload };
};

const createPrismaMock = (seed: Partial<LogSeed> = {}) => {
	const state: LogSeed = {
		id: seed.id || "user-1",
		user: seed.user || {
			id: "user-1",
			email: "employee@example.test",
			userName: "employee.one",
			role: "hris-employee",
			status: "active",
			organizationId: "org-1",
			lastLogin: new Date("2026-06-01T09:00:00.000Z"),
			loginMethod: "email",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-06-01T00:00:00.000Z"),
			metadata: {},
		},
		employees: seed.employees || [],
		activityLogs: seed.activityLogs || [],
		auditLogs: seed.auditLogs || [],
		requestTransactions: seed.requestTransactions || [],
		scheduleHistory: seed.scheduleHistory || [],
	};

	const matchesEmployee = (where: any, employee: any) => {
		if (!where?.OR) return false;
		return where.OR.some((clause: any) => {
			if (clause.userId) return clause.userId === employee.userId;
			if (clause.id) return clause.id === employee.id;
			if (clause.employeeId) {
				return (
					clause.employeeId === employee.employeeId &&
					(!clause.organizationId || clause.organizationId === employee.organizationId)
				);
			}
			return false;
		});
	};

	const prisma: any = {
		user: {
			findFirst: async ({ where }: any) => {
				if (where?.id !== state.user.id) return null;
				return state.user;
			},
		},
		employee: {
			findFirst: async ({ where }: any) => {
				const employee = state.employees.find((item) => matchesEmployee(where, item));
				return employee || null;
			},
		},
		activityLogging: {
			findMany: async () => state.activityLogs,
		},
		auditLogging: {
			findMany: async () => state.auditLogs,
		},
		requestTransaction: {
			findMany: async () => state.requestTransactions,
		},
		employeeScheduleHistory: {
			findMany: async () => state.scheduleHistory,
		},
	};

	return { prisma, state };
};

describe("requireUserActivityLogAccess", () => {
	it("rejects roles outside the HR allowlist", () => {
		const { res, getStatusCode, getPayload } = createResponseMock();
		const next = () => undefined;

		requireUserActivityLogAccess(
			{ role: "employee" } as any,
			res,
			next as NextFunction,
		);

		expect(getStatusCode()).to.equal(403);
		expect(getPayload()).to.include({ status: "error", message: "Not authorized", code: 403 });
	});

	it("allows HR users to access the route", () => {
		const { res } = createResponseMock();
		let nextCalled = false;

		requireUserActivityLogAccess(
			{ role: "hris-hr-user" } as any,
			res,
			(() => {
				nextCalled = true;
			}) as NextFunction,
		);

		expect(nextCalled).to.equal(true);
	});
});

describe("buildUserActivityFeed", () => {
	it("resolves an employee from user metadata.employeeId and returns a merged, sorted timeline", async () => {
		const { prisma } = createPrismaMock({
			user: {
				id: "user-1",
				email: "jane.santos@example.test",
				userName: "jane.santos",
				role: "hris-employee",
				status: "active",
				organizationId: "org-1",
				lastLogin: new Date("2026-06-01T09:00:00.000Z"),
				loginMethod: "email",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-06-01T00:00:00.000Z"),
				metadata: {
					employee: {
						employeeId: "EMP-1001",
					},
				},
			},
			employees: [
				{
					id: "emp-1",
					employeeId: "EMP-1001",
					userId: null,
					organizationId: "org-1",
					role: "hris-employee",
					person: { personalInfo: { firstName: "Jane", lastName: "Santos" } },
					department: { name: "People Operations" },
					position: { title: "HR Officer" },
					level: { name: "Level 1" },
				},
			],
			activityLogs: [
				{
					id: "activity-1",
					action: "timesheet submitted",
					description: "Timesheet submitted for the pay period",
					createdAt: new Date("2026-06-02T10:00:00.000Z"),
					path: "/api/timesheets",
					method: "POST",
					entityType: "Timesheet",
					payload: { entityId: "timesheet-1" },
					organizationId: "org-1",
					employee: {
						person: { personalInfo: { firstName: "Jane", lastName: "Santos" } },
						role: "hris-employee",
					},
				},
			],
			auditLogs: [
				{
					id: "audit-1",
					type: "UPDATE",
					description: "Updated employee profile",
					timestamp: new Date("2026-06-05T12:00:00.000Z"),
					severity: "MEDIUM",
					entity: { type: "EmployeeProfile", id: "profile-1" },
					changes: { before: { title: "HR Assistant" }, after: { title: "HR Officer" } },
					metadata: { path: "/api/users/user-1", method: "PATCH" },
					employee: {
						person: { personalInfo: { firstName: "Jane", lastName: "Santos" } },
						role: "hris-employee",
					},
				},
			],
			requestTransactions: [
				{
					id: "request-1",
					organizationId: "org-1",
					request: {
						id: "leave-1",
						code: "LV-001",
						type: "LEAVE",
						description: "Vacation leave request",
						requesterId: "emp-1",
						targetEmployeeId: "emp-1",
					},
					eventCategory: "WORKFLOW",
					eventKey: "STEP_APPROVED",
					eventSource: "workflow",
					actorType: "HR",
					actorRole: "hris-hr-manager",
					actorDisplayName: "Rene Lopez",
					title: "Leave approved",
					description: "Leave request approved",
					comments: "Approved by HR",
					visibility: "SHARED",
					isSystemGenerated: false,
					occurredAt: new Date("2026-06-04T10:00:00.000Z"),
					fieldChanges: { status: { before: "SUBMITTED", after: "APPROVED" } },
					actorEmployee: {
						person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
						role: "hris-hr-manager",
					},
				},
			],
			scheduleHistory: [
				{
					id: "schedule-1",
					organizationId: "org-1",
					employeeId: "emp-1",
					action: "shift changed",
					reason: "Adjusted coverage",
					effectiveAt: new Date("2026-06-03T08:00:00.000Z"),
					actor: {
						person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
						role: "hris-hr-manager",
					},
					employee: {
						person: { personalInfo: { firstName: "Jane", lastName: "Santos" } },
						role: "hris-employee",
					},
				},
			],
		});

		const feed = await buildUserActivityFeed(prisma, {
			userId: "user-1",
			page: 1,
			limit: 2,
			sort: "occurredAt",
			order: "desc",
		});

		expect(feed.user.email).to.equal("jane.santos@example.test");
		expect(feed.employee?.employeeId).to.equal("EMP-1001");
		expect(feed.total).to.equal(4);
		expect(feed.activityLogs.map((item) => item.source)).to.deep.equal(["audit", "request"]);
		expect(feed.activityLogs.map((item) => item.title)).to.deep.equal([
			"UPDATE",
			"Leave approved",
		]);
	});

	it("filters by source, category, search text, and date range", async () => {
		const { prisma } = createPrismaMock({
			user: {
				id: "user-2",
				email: "employee2@example.test",
				userName: "employee.two",
				role: "hris-employee",
				status: "active",
				organizationId: "org-1",
				lastLogin: null,
				loginMethod: "email",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-06-01T00:00:00.000Z"),
				metadata: {},
			},
			employees: [
				{
					id: "emp-2",
					employeeId: "EMP-2001",
					userId: "user-2",
					organizationId: "org-1",
					role: "hris-employee",
					person: { personalInfo: { firstName: "Kyle", lastName: "Dizon" } },
					department: { name: "Operations" },
					position: { title: "Coordinator" },
				},
			],
			activityLogs: [
				{
					id: "activity-2",
					action: "leave requested",
					description: "Leave request created",
					createdAt: new Date("2026-06-07T08:00:00.000Z"),
					entityType: "LeaveRequest",
					employee: {
						person: { personalInfo: { firstName: "Kyle", lastName: "Dizon" } },
						role: "hris-employee",
					},
				},
			],
			requestTransactions: [
				{
					id: "request-2",
					organizationId: "org-1",
					request: {
						id: "leave-2",
						code: "LV-002",
						type: "LEAVE",
						description: "Vacation leave request",
						requesterId: "emp-2",
						targetEmployeeId: "emp-2",
					},
					eventCategory: "WORKFLOW",
					eventKey: "STEP_APPROVED",
					actorType: "HR",
					actorRole: "hris-hr-manager",
					actorDisplayName: "Manager User",
					title: "Leave approved",
					description: "Approved by manager",
					comments: "Approved",
					visibility: "SHARED",
					isSystemGenerated: false,
					occurredAt: new Date("2026-06-08T10:00:00.000Z"),
					fieldChanges: null,
					actorEmployee: {
						person: { personalInfo: { firstName: "Manager", lastName: "User" } },
						role: "hris-hr-manager",
					},
				},
			],
			auditLogs: [],
			scheduleHistory: [],
		});

		const feed = await buildUserActivityFeed(prisma, {
			userId: "user-2",
			page: 1,
			limit: 10,
			query: "manager",
			source: "request",
			category: "leave",
			from: "2026-06-08",
			to: "2026-06-08",
			sort: "occurredAt",
			order: "desc",
		});

		expect(feed.total).to.equal(1);
		expect(feed.activityLogs).to.have.length(1);
		expect(feed.activityLogs[0].source).to.equal("request");
		expect(feed.activityLogs[0].category).to.equal("leave");
		expect(feed.activityLogs[0].actorName).to.equal("Manager User");
	});

	it("returns an empty feed when the user has no matching employee record", async () => {
		const { prisma } = createPrismaMock({
			user: {
				id: "user-3",
				email: "no.employee@example.test",
				userName: "no.employee",
				role: "hris-employee",
				status: "active",
				organizationId: "org-1",
				lastLogin: null,
				loginMethod: "email",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-06-01T00:00:00.000Z"),
				metadata: {},
			},
			employees: [],
		});

		const feed = await buildUserActivityFeed(prisma, {
			userId: "user-3",
			page: 1,
			limit: 10,
		});

		expect(feed.employee).to.equal(null);
		expect(feed.activityLogs).to.deep.equal([]);
		expect(feed.total).to.equal(0);
	});
});
