import { expect } from "chai";
import express from "express";
import request from "supertest";

import { controller as celebrationsController } from "../app/celebrations/celebrations.controller";
import { router as celebrationsRouter } from "../app/celebrations/celebrations.router";
import { controller as calendarItemController } from "../app/calendar-item/calendar-item.controller";
import { router as calendarItemRouter } from "../app/calendar-item/calendar-item.router";

describe("public kiosk feed contracts", () => {
	function buildCelebrationsApp(prisma: any) {
		const app = express();
		app.use(express.json());
		app.use("/api", celebrationsRouter(express.Router(), celebrationsController(prisma)));
		return app;
	}

	function buildCalendarApp(prisma: any) {
		const app = express();
		app.use(express.json());
		app.use("/api", calendarItemRouter(express.Router(), calendarItemController(prisma)));
		return app;
	}

	const organizationLookup = (id = "bandai-org", code = "bnei") => ({
		findFirst: async (args: any) => {
			if (args.where?.id === id) return { id };
			if (args.where?.code === code) return { id };
			return null;
		},
	});

	it("rejects public birthdays requests without organizationId or organizationCode", async () => {
		const app = buildCelebrationsApp({
			organization: organizationLookup(),
			employee: { findMany: async () => [] },
			user: { findMany: async () => [] },
			child: { findMany: async () => [] },
		});

		const response = await request(app)
			.get("/api/celebrations/public/birthdays?month=6&year=2026&type=ALL")
			.expect(400);

		expect(response.body.status).to.equal("error");
		expect(response.body.errors[0].message).to.match(
			/organizationId or organizationCode is required/,
		);
	});

	it("serves employee birthdays publicly without auth and scopes by organization", async () => {
		const employeeCalls: any[] = [];
		const userCalls: any[] = [];
		const app = buildCelebrationsApp({
			organization: organizationLookup(),
			employee: {
				findMany: async (args: any) => {
					employeeCalls.push(args);
					return [
						{
							id: "emp-1",
							userId: "user-1",
							person: {
								id: "person-1",
								isDeleted: false,
								personalInfo: {
									firstName: "Mina",
									lastName: "Santos",
									dateOfBirth: "1995-06-22T00:00:00.000Z",
								},
								metadata: { isActive: true, isDeleted: false },
							},
							department: { name: "HR" },
						},
					];
				},
			},
			user: {
				findMany: async (args: any) => {
					userCalls.push(args);
					return [
						{
							id: "user-1",
							metadata: {
								avatar: "https://cdn.example.com/avatars/mina.png",
							},
						},
					];
				},
			},
			child: { findMany: async () => [] },
		});

		const response = await request(app)
			.get(
				"/api/celebrations/public/birthdays?organizationId=bandai-org&month=6&year=2026&type=ALL",
			)
			.expect(200);

		expect(employeeCalls).to.have.length(1);
		expect(employeeCalls[0].where.organizationId).to.equal("bandai-org");
		expect(userCalls).to.have.length(1);
		expect(response.body.status).to.equal("success");
		expect(response.body.data.organizationId).to.equal("bandai-org");
		expect(response.body.data.resolvedBy).to.equal("id");
		expect(response.body.data.counts.total).to.equal(1);
		expect(response.body.data.items[0]).to.include({
			id: "EMP:person-1",
			displayName: "Mina Santos",
			department: "HR",
			avatar: "https://cdn.example.com/avatars/mina.png",
		});
	});

	it("resolves public birthdays by stable organizationCode after org id reset", async () => {
		const employeeCalls: any[] = [];
		const app = buildCelebrationsApp({
			organization: {
				findFirst: async (args: any) => {
					if (args.where?.code === "bnei") return { id: "fresh-org-after-reset" };
					return null;
				},
			},
			employee: {
				findMany: async (args: any) => {
					employeeCalls.push(args);
					return [
						{
							id: "emp-1",
							userId: "user-seed",
							person: {
								id: "person-1",
								isDeleted: false,
								personalInfo: {
									firstName: "Seed",
									lastName: "Employee",
									dateOfBirth: "1990-06-10T00:00:00.000Z",
								},
								metadata: { isActive: true },
							},
							department: { name: "Ops" },
						},
					];
				},
			},
			user: {
				findMany: async () => [{ id: "user-seed", metadata: { avatar: null } }],
			},
			child: { findMany: async () => [] },
		});

		const response = await request(app)
			.get(
				"/api/celebrations/public/birthdays?organizationCode=bnei&month=6&year=2026&type=ALL",
			)
			.expect(200);

		expect(employeeCalls[0].where.organizationId).to.equal("fresh-org-after-reset");
		expect(response.body.data.organizationId).to.equal("fresh-org-after-reset");
		expect(response.body.data.resolvedBy).to.equal("code");
		expect(response.body.data.counts.total).to.equal(1);
	});

	it("filters public birthdays to specific day when day is provided", async () => {
		const app = buildCelebrationsApp({
			organization: organizationLookup(),
			employee: {
				findMany: async () => [
					{
						id: "emp-1",
						userId: "user-1",
						person: {
							id: "person-1",
							isDeleted: false,
							personalInfo: {
								firstName: "Mina",
								lastName: "Santos",
								dateOfBirth: "1995-09-07T00:00:00.000Z",
							},
							metadata: { isActive: true, isDeleted: false },
						},
						department: { name: "HR" },
					},
				],
			},
			user: { findMany: async () => [{ id: "user-1", metadata: { avatar: null } }] },
			child: { findMany: async () => [] },
		});

		const response = await request(app)
			.get(
				"/api/celebrations/public/birthdays?organizationId=bandai-org&month=9&year=2026&type=EMPLOYEES&day=7",
			)
			.expect(200);

		expect(response.body.data.items).to.have.length(1);
		expect(response.body.data.items[0].day).to.equal(7);
		expect(response.body.data.counts.total).to.equal(1);
	});

	it("ignores invalid day outside 1-31 via zod", async () => {
		const app = buildCelebrationsApp({
			organization: organizationLookup(),
			employee: { findMany: async () => [] },
			user: { findMany: async () => [] },
			child: { findMany: async () => [] },
		});

		await request(app)
			.get(
				"/api/celebrations/public/birthdays?organizationId=bandai-org&month=9&year=2026&type=EMPLOYEES&day=32",
			)
			.expect(400);
	});

	it("returns only public-safe birthday fields for child celebrants", async () => {
		const app = buildCelebrationsApp({
			organization: organizationLookup(),
			employee: { findMany: async () => [] },
			user: { findMany: async () => [] },
			child: {
				findMany: async () => [
					{
						id: "child-1",
						firstName: "Kai",
						lastName: "Santos",
						dateOfBirth: "2018-06-05T00:00:00.000Z",
						parent: {
							id: "parent-person-1",
							personalInfo: {
								firstName: "Mina",
								lastName: "Santos",
							},
							employee: {
								id: "emp-2",
								department: { name: "Operations" },
							},
						},
					},
				],
			},
		});

		const response = await request(app)
			.get(
				"/api/celebrations/public/birthdays?organizationId=bandai-org&month=6&year=2026&type=ALL",
			)
			.expect(200);

		expect(response.body.data.items[0]).to.deep.equal({
			id: "CHILD:parent-person-1:0",
			type: "CHILD_BIRTHDAY",
			month: 6,
			day: 5,
			displayName: "Kai S.",
			personId: "parent-person-1",
			employeeId: "emp-2",
			parentDisplayName: "Mina Santos",
			department: "Operations",
			avatar: null,
		});
	});

	it("rejects public calendar kiosk requests without organizationId or organizationCode", async () => {
		const app = buildCalendarApp({
			organization: organizationLookup(),
			calendarItem: { findMany: async () => [] },
		});

		const response = await request(app).get("/api/calendar-item/public/kiosk").expect(400);

		expect(response.body.status).to.equal("error");
		expect(response.body.errors[0].field).to.equal("organizationId");
	});

	it("serves public kiosk calendar items without auth and scopes by organization and year", async () => {
		const findManyCalls: any[] = [];
		const app = buildCalendarApp({
			organization: organizationLookup(),
			calendarItem: {
				findMany: async (args: any) => {
					findManyCalls.push(args);
					return [
						{
							id: "event-1",
							organizationId: "bandai-org",
							year: 2026,
							title: "Annual Town Hall",
							description: "Main lobby",
							type: "COMPANY_EVENT",
							startDate: "2026-06-20T01:30:00.000Z",
							endDate: "2026-06-20T03:00:00.000Z",
							isAllDay: false,
							timezone: "Asia/Manila",
							status: "ACTIVE",
						},
					];
				},
			},
		});

		const response = await request(app)
			.get("/api/calendar-item/public/kiosk?organizationId=bandai-org&year=2026&limit=4")
			.expect(200);

		expect(findManyCalls).to.have.length(1);
		expect(findManyCalls[0].where.organizationId).to.equal("bandai-org");
		expect(findManyCalls[0].where.type).to.equal("COMPANY_EVENT");
		expect(findManyCalls[0].where.year).to.equal(2026);
		expect(findManyCalls[0].take).to.equal(4);
		expect(response.body.status).to.equal("success");
		expect(response.body.data.calendarItems).to.have.length(1);
		expect(response.body.data.pagination.limit).to.equal(4);
	});

	it("serves public kiosk calendar items by organizationCode (reset-safe)", async () => {
		const findManyCalls: any[] = [];
		const app = buildCalendarApp({
			organization: {
				findFirst: async (args: any) => {
					if (args.where?.code === "bnei") return { id: "fresh-org-after-reset" };
					return null;
				},
			},
			calendarItem: {
				findMany: async (args: any) => {
					findManyCalls.push(args);
					return [
						{
							id: "event-town-hall",
							organizationId: "fresh-org-after-reset",
							year: 2026,
							title: "Bandai Town Hall",
							description: "Quarterly leadership updates for all employees.",
							type: "COMPANY_EVENT",
							startDate: "2026-07-22T09:00:00.000Z",
							endDate: "2026-07-22T11:00:00.000Z",
							isAllDay: false,
							timezone: "Asia/Manila",
							status: "ACTIVE",
						},
					];
				},
			},
		});

		const response = await request(app)
			.get("/api/calendar-item/public/kiosk?organizationCode=bnei&year=2026&limit=8")
			.expect(200);

		expect(findManyCalls[0].where.organizationId).to.equal("fresh-org-after-reset");
		expect(findManyCalls[0].where.type).to.equal("COMPANY_EVENT");
		expect(response.body.data.resolvedBy).to.equal("code");
		expect(response.body.data.organizationId).to.equal("fresh-org-after-reset");
		expect(response.body.data.calendarItems[0].title).to.equal("Bandai Town Hall");
	});

	it("returns only kiosk display fields for public calendar items", async () => {
		const app = buildCalendarApp({
			organization: organizationLookup(),
			calendarItem: {
				findMany: async () => [
					{
						id: "event-1",
						organizationId: "bandai-org",
						year: 2026,
						title: "Annual Town Hall",
						description: "Main lobby",
						type: "COMPANY_EVENT",
						startDate: "2026-06-20T01:30:00.000Z",
						endDate: "2026-06-20T03:00:00.000Z",
						isAllDay: false,
						timezone: "Asia/Manila",
						status: "ACTIVE",
					},
				],
			},
		});

		const response = await request(app)
			.get("/api/calendar-item/public/kiosk?organizationId=bandai-org")
			.expect(200);

		expect(response.body.data.calendarItems[0]).to.deep.equal({
			id: "event-1",
			organizationId: "bandai-org",
			year: 2026,
			title: "Annual Town Hall",
			description: "Main lobby",
			type: "COMPANY_EVENT",
			startDate: "2026-06-20T01:30:00.000Z",
			endDate: "2026-06-20T03:00:00.000Z",
			isAllDay: false,
			timezone: "Asia/Manila",
			status: "ACTIVE",
		});
		expect(response.body.data.calendarItems[0]).to.not.have.property("createdAt");
		expect(response.body.data.calendarItems[0]).to.not.have.property("metadata");
	});
});
