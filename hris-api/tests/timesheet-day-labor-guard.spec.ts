import { expect } from "chai";
import { isDayLaborOnlyBreakdownChange } from "../helper/timesheet-day-labor-guard.helper";

const line = (dateKey: string, overrides: Record<string, unknown> = {}) => ({
	date: new Date(`${dateKey}T00:00:00.000Z`),
	timeIn: new Date(`${dateKey}T08:00:00.000Z`),
	timeOut: new Date(`${dateKey}T17:00:00.000Z`),
	status: "PRESENT",
	hoursWorked: "8:00",
	regularHours: "8:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
	employeeNotes: null,
	approverNotes: null,
	...overrides,
});

const makePrisma = (lines: ReturnType<typeof line>[]) =>
	({
		timesheetline: {
			findMany: async () => lines,
		},
	}) as any;

describe("isDayLaborOnlyBreakdownChange", () => {
	it("allows a day-labor-only tag change", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [{ date: "2026-09-07", dayLaborType: "DIRECT" }],
		});
		expect(result.ok).to.equal(true);
	});

	it("allows a tag-only day with no stored line (tag on empty day)", async () => {
		const prisma = makePrisma([]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [{ date: "2026-09-08", dayLaborType: "INDIRECT" }],
		});
		expect(result.ok).to.equal(true);
	});

	it("rejects a punch time change", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [
				{
					date: "2026-09-07",
					dayLaborType: "DIRECT",
					timeIn: new Date("2026-09-07T09:00:00.000Z"),
				},
			],
		});
		expect(result.ok).to.equal(false);
		expect(result.reason).to.equal("non_day_labor_change");
		expect(result.field).to.equal("timeIn");
	});

	it("rejects an hours change", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [{ date: "2026-09-07", overtimeHours: "2:00" }],
		});
		expect(result.ok).to.equal(false);
		expect(result.field).to.equal("overtimeHours");
	});

	it("rejects a status change", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [{ date: "2026-09-07", status: "REST_DAY" }],
		});
		expect(result.ok).to.equal(false);
		expect(result.field).to.equal("status");
	});

	it("tolerates sub-minute time jitter (coerce round-trips)", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [
				{
					date: "2026-09-07",
					timeIn: "2026-09-07T08:00:30.000Z",
				},
			],
		});
		expect(result.ok).to.equal(true);
	});

	it("tolerates re-sending identical values (full-day save with tag)", async () => {
		const prisma = makePrisma([line("2026-09-07")]);
		const result = await isDayLaborOnlyBreakdownChange(prisma, {
			organizationId: "org-1",
			timesheetId: "ts-1",
			breakdown: [
				{
					date: "2026-09-07",
					timeIn: "2026-09-07T08:00:00.000Z",
					timeOut: "2026-09-07T17:00:00.000Z",
					status: "PRESENT",
					hoursWorked: "8:00",
					regularHours: "8:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					dayLaborType: "DIRECT",
				},
			],
		});
		expect(result.ok).to.equal(true);
	});
});
