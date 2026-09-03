import { expect } from "chai";

import {
	buildKioskLoginSeedPlan,
	seedKioskLoginContent,
} from "../prisma/seeds/kioskLoginSeeder";

describe("kiosk login seeder", () => {
	const fixedNow = new Date("2026-06-16T08:00:00.000Z");
	const allowedChildUpdateKeys = ["isDeleted", "organizationId"];
	const allowedCalendarItemKeys = [
		"description",
		"endDate",
		"isAllDay",
		"organizationId",
		"startDate",
		"status",
		"timezone",
		"title",
		"type",
		"year",
	];

	const baseParentEmployee = {
		id: "emp-1",
		personId: "person-1",
		person: {
			id: "person-1",
			personalInfo: {
				firstName: "Seed",
				lastName: "Employee",
				dateOfBirth: "1990-01-01T00:00:00.000Z",
			},
			metadata: {},
		},
	};

	it("builds exactly one company event and one current-month birthday target", () => {
		const plan = buildKioskLoginSeedPlan(fixedNow);

		expect(plan.calendarItems).to.have.length(1);
		expect(plan.calendarItems[0].title).to.equal("Bandai Town Hall");
		expect(plan.calendarItems[0].year).to.equal(2026);
		expect(plan.calendarItems[0].startDate.getTime()).to.be.greaterThan(fixedNow.getTime());
		expect(plan.calendarItems[0].status).to.equal("ACTIVE");
		expect(plan.calendarItems[0].startDate.toISOString()).to.equal("2026-06-23T09:00:00.000Z");
		expect(plan.parentEmployeeBirthday.toISOString()).to.equal("2018-06-20T00:00:00.000Z");
		expect(plan.month).to.equal(6);
		expect(plan.retiredEventTitles).to.deep.equal(["Wellness Friday"]);
	});

	it("creates one calendar item and seeds one employee birthday", async () => {
		const calendarCreates: any[] = [];
		const personUpdates: any[] = [];
		const prisma = {
			employee: {
				findFirst: async () => baseParentEmployee,
			},
			person: {
				update: async (args: any) => {
					personUpdates.push(args);
					return { id: args.where.id };
				},
			},
			child: {
				findFirst: async () => null,
				create: async () => {
					throw new Error("create should not be called for minimal birthday set");
				},
				update: async () => {
					throw new Error("update should not be called");
				},
			},
			calendarItem: {
				findFirst: async () => null,
				create: async (args: any) => {
					calendarCreates.push(args);
					return { id: `cal-${calendarCreates.length}` };
				},
				update: async () => {
					throw new Error("update should not be called");
				},
			},
		};

		const summary = await seedKioskLoginContent(prisma as any, "org-1", fixedNow);

		expect(personUpdates).to.have.length(1);
		expect(personUpdates[0].data.personalInfo.dateOfBirth).to.equal("2018-06-20T00:00:00.000Z");
		expect(calendarCreates).to.have.length(1);
		expect(calendarCreates[0].data.title).to.equal("Bandai Town Hall");
		expect(Object.keys(calendarCreates[0].data).sort()).to.deep.equal(
			allowedCalendarItemKeys.slice().sort(),
		);
		expect(summary.createdCalendarItems).to.equal(1);
		expect(summary.updatedCalendarItems).to.equal(0);
		expect(summary.employeeBirthdaySeeded).to.equal(true);
		expect(summary.calendarItemsSeeded).to.equal(1);
	});

	it("soft-deletes the legacy kiosk child so only one birthday appears", async () => {
		const childUpdates: any[] = [];
		const prisma = {
			employee: {
				findFirst: async () => baseParentEmployee,
			},
			person: {
				update: async () => ({ id: "person-1" }),
			},
			child: {
				findFirst: async () => ({ id: "child-1" }),
				create: async () => {
					throw new Error("create should not be called");
				},
				update: async (args: any) => {
					childUpdates.push(args);
					return { id: "child-1" };
				},
			},
			calendarItem: {
				findFirst: async () => ({ id: "cal-1" }),
				create: async () => {
					throw new Error("create should not be called");
				},
				update: async () => ({ id: "cal-1" }),
			},
		};

		const summary = await seedKioskLoginContent(prisma as any, "org-1", fixedNow);

		expect(childUpdates).to.have.length(1);
		expect(childUpdates[0].data.isDeleted).to.equal(true);
		expect(Object.keys(childUpdates[0].data).sort()).to.deep.equal(
			allowedChildUpdateKeys.slice().sort(),
		);
		expect(summary.childSoftDeleted).to.equal(true);
	});

	it("cancels retired company events and keeps the single active town hall", async () => {
		const calendarUpdates: any[] = [];
		const lookups: any[] = [];
		const prisma = {
			employee: {
				findFirst: async () => baseParentEmployee,
			},
			person: {
				update: async () => ({ id: "person-1" }),
			},
			child: {
				findFirst: async () => null,
				create: async () => {
					throw new Error("create should not be called");
				},
				update: async () => {
					throw new Error("update should not be called");
				},
			},
			calendarItem: {
				findFirst: async (args: any) => {
					lookups.push(args);
					if (args.where?.title === "Wellness Friday") {
						return { id: "cal-wellness" };
					}
					if (args.where?.title === "Bandai Town Hall") {
						return { id: "cal-town-hall" };
					}
					return null;
				},
				create: async () => {
					throw new Error("create should not be called");
				},
				update: async (args: any) => {
					calendarUpdates.push(args);
					return { id: args.where.id };
				},
			},
		};

		const summary = await seedKioskLoginContent(prisma as any, "org-1", fixedNow);

		expect(lookups.some((lookup) => lookup.where?.title === "Wellness Friday")).to.equal(true);
		expect(
			calendarUpdates.some(
				(update) =>
					update.where.id === "cal-wellness" && update.data.status === "CANCELLED",
			),
		).to.equal(true);
		expect(
			calendarUpdates.some(
				(update) =>
					update.where.id === "cal-town-hall" && update.data.title === "Bandai Town Hall",
			),
		).to.equal(true);
		expect(summary.retiredCalendarItems).to.equal(1);
		expect(summary.updatedCalendarItems).to.equal(1);
		expect(summary.createdCalendarItems).to.equal(0);
	});
});
