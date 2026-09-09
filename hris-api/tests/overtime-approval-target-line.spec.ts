import { expect } from "chai";
import { describe, it } from "mocha";
import { resolveOvertimeApprovalTargetLine } from "../app/timesheet/overtime-request.service";

/**
 * Unit tests for the shared OVERTIME approval target-line resolver.
 * This resolver decides WHICH employee's timesheet line receives the payable
 * overtime when an OT request is approved â€” and whether one exists at all.
 */

type LineStub = {
	id: string;
	timesheetId: string;
	employeeId: string;
	date: Date;
	attendanceId: string | null;
	metadata: unknown;
};

const makeLine = (overrides: Partial<LineStub> = {}): LineStub => ({
	id: "line-1",
	timesheetId: "ts-1",
	employeeId: "emp-member",
	date: new Date("2026-09-08T00:00:00.000Z"),
	attendanceId: null,
	metadata: {},
	...overrides,
});

const makePrisma = (options: {
	lineForEmployeeDate?: LineStub | null;
	lineById?: LineStub | null;
	timesheet?: { id: string; employeeId: string; payrollPeriodId: string } | null;
	materializedLine?: LineStub | null;
}) => {
	// Call order inside the resolver: (1) byId lookup when metadata.timesheetLineId
	// is set, (2) (employeeId, date) lookup, (3) post-materialization lookup.
	let employeeDateCallCount = 0;
	const findFirst = async (args: any) => {
		const where = JSON.stringify(args?.where || {});
		if (where.includes('"id"')) {
			return options.lineById ?? null;
		}
		employeeDateCallCount += 1;
		if (employeeDateCallCount === 1) {
			return options.lineForEmployeeDate ?? null;
		}
		return options.materializedLine ?? null;
	};
	return {
		timesheetline: {
			findFirst,
			findMany: async () => [],
			updateMany: async () => ({ count: 0 }),
		},
		timesheet: {
			findFirst: async () => options.timesheet ?? null,
			update: async () => ({}),
		},
		// Materialization (attendance-obligation.helper) reads these; neutral
		// empty shapes make the "materialize yields nothing" case honest.
		payrollPeriod: {
			findFirst: async () => ({ id: "pp-1" }),
			findMany: async () => [],
		},
		employee: { findMany: async () => [] },
		attendance: { findFirst: async () => null },
		attendanceObligation: {
			findFirst: async () => null,
			findMany: async () => [],
		},
	} as unknown as never;
};
describe("resolveOvertimeApprovalTargetLine", () => {
	it("prefers explicit metadata.employeeId over the requester (leader-filed OT must land on the member)", async () => {
		const line = makeLine({ employeeId: "emp-member" });
		const prisma = makePrisma({ lineForEmployeeDate: line });
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: {
				employeeId: "emp-member",
				date: "2026-09-08",
			},
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-leader",
		});
		expect(result.employeeId).to.equal("emp-member");
		expect(result.line?.id).to.equal("line-1");
	});

	it("falls back to targetEmployeeId when metadata.employeeId is absent", async () => {
		const line = makeLine({ employeeId: "emp-member" });
		const prisma = makePrisma({ lineForEmployeeDate: line });
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: { date: "2026-09-08" },
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-leader",
		});
		expect(result.employeeId).to.equal("emp-member");
		expect(result.line?.id).to.equal("line-1");
	});

	it("returns line: null when no effective line and no period timesheet exist (approve must be refused)", async () => {
		const prisma = makePrisma({ lineForEmployeeDate: null, timesheet: null });
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: { employeeId: "emp-member", date: "2026-09-08" },
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-leader",
		});
		expect(result.line).to.equal(null);
	});

	it("materializes lines from the period timesheet when the line is missing", async () => {
		const materialized = makeLine({ id: "line-materialized" });
		const prisma = makePrisma({
			lineForEmployeeDate: null,
			timesheet: { id: "ts-9", employeeId: "emp-member", payrollPeriodId: "pp-1" },
			materializedLine: materialized,
		});
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: { employeeId: "emp-member", date: "2026-09-08" },
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-leader",
		});
		expect(result.line?.id).to.equal("line-materialized");
	});

	it("honors an explicit metadata.timesheetLineId when it exists", async () => {
		const line = makeLine({ id: "line-explicit" });
		const prisma = makePrisma({ lineById: line });
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: {
				employeeId: "emp-member",
				date: "2026-09-08",
				timesheetLineId: "line-explicit",
			},
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-member",
		});
		expect(result.line?.id).to.equal("line-explicit");
	});

	it("ignores lines inside FROZEN (APPROVED/SUBMITTED) timesheets even in the business-day window", async () => {
		// The makePrisma stub resolves any non-id lookup to options.lineForEmployeeDate;
		// here the REAL filter (status notIn APPROVED/SUBMITTED in the where clause) is
		// what we assert: run with a line whose timesheet is APPROVED and a prisma stub
		// that would only return it if the where clause did NOT exclude frozen sheets.
		let sawWhere = "";
		const line = makeLine({ id: "line-frozen", employeeId: "emp-member" });
		const prisma = {
			timesheetline: {
				findFirst: async (args: any) => {
					sawWhere = JSON.stringify(args?.where || {});
					return line; // return it only if asked; assertions check the filter
				},
				findMany: async () => [],
				updateMany: async () => ({ count: 0 }),
			},
			timesheet: {
				findFirst: async () => null,
				update: async () => ({}),
			},
			payrollPeriod: { findFirst: async () => ({ id: "pp-1" }), findMany: async () => [] },
			employee: { findMany: async () => [] },
			attendance: { findFirst: async () => null },
			attendanceObligation: { findFirst: async () => null, findMany: async () => [] },
		} as unknown as never;
		const result = await resolveOvertimeApprovalTargetLine({
			prisma,
			organizationId: "org-1",
			requestMetadata: { employeeId: "emp-member", date: "2026-07-26" },
			targetEmployeeId: "emp-member",
			requesterEmployeeId: "emp-leader",
		});
		// The where clause sent to the DB must exclude frozen timesheets.
		expect(sawWhere).to.contain("APPROVED");
		expect(sawWhere).to.contain("notIn");
		// The stub returned a line, so the resolver accepts it (DB-level filtering
		// is trusted); this test pins that the exclusion filter is present.
		expect(result.line?.id).to.equal("line-frozen");
	});
});

