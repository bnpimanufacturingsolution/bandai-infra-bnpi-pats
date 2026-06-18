import { expect } from "chai";
import {
	buildTimesheetDaySnapshotMetadata,
	writeEffectiveTimesheetLine,
} from "../helper/timesheet-line-version.helper";

describe("timesheet-line-version.helper", () => {
	it("builds snapshot metadata with immutable source identity", () => {
		const metadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: { breakMinutes: 60 },
			source: {
				type: "ATTENDANCE_OBLIGATION",
				id: "obligation-1",
				status: "PRESENT",
				reason: "PayrollPeriodOpened",
				requestId: null,
			},
			marker: "HOURS",
			schedule: { startTime: "08:00", endTime: "17:00" },
			snapshottedAt: new Date("2026-05-15T04:00:00.000Z"),
		});

		expect(metadata.snapshotVersion).to.equal(1);
		expect(metadata.snapshotType).to.equal("TIMESHEET_DAY");
		expect(metadata.snapshottedAt).to.equal("2026-05-15T04:00:00.000Z");
		expect(metadata.source).to.deep.equal({
			type: "ATTENDANCE_OBLIGATION",
			id: "obligation-1",
			status: "PRESENT",
			reason: "PayrollPeriodOpened",
			requestId: null,
		});
		expect(metadata.day.marker).to.equal("HOURS");
		expect(metadata.day.schedule).to.deep.equal({ startTime: "08:00", endTime: "17:00" });
		expect(metadata.breakMinutes).to.equal(60);
	});

	it("derives leave metadata from legacy leave entries when marker is LEAVE", () => {
		const metadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: {
				leaveEntries: [
					{
						id: "request-legacy",
						leaveType: "Vacation Leave",
						durationUnit: "FULL_DAY",
						title: "Approved vacation",
					},
				],
			},
			source: {
				type: "ATTENDANCE_OBLIGATION",
				id: "obligation-1",
				status: "LEAVE",
				reason: "LEAVE_REQUEST",
				requestId: "request-1",
			},
			marker: "LEAVE",
			snapshottedAt: new Date("2026-05-15T04:00:00.000Z"),
		});

		expect(metadata.day.leave).to.deep.include({
			requestId: "request-1",
			type: "Vacation Leave",
			durationUnit: "FULL_DAY",
			title: "Approved vacation",
		});
		expect(metadata.day.holiday).to.equal(null);
	});

	it("derives holiday metadata from legacy holiday entries when marker is HOLIDAY", () => {
		const metadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: {
				holidayEntries: [
					{
						calendarItemId: "holiday-1",
						title: "Founding Day",
						holidayType: "REGULAR",
					},
				],
			},
			source: {
				type: "ATTENDANCE_OBLIGATION",
				id: "obligation-1",
				status: "HOLIDAY",
				reason: "HOLIDAY",
				requestId: null,
			},
			marker: "HOLIDAY",
			snapshottedAt: new Date("2026-05-15T04:00:00.000Z"),
		});

		expect(metadata.day.holiday).to.deep.equal({
			calendarItemId: "holiday-1",
			title: "Founding Day",
			type: "REGULAR",
		});
		expect(metadata.day.leave).to.equal(null);
	});

	it("preserves explicit revision metadata for corrected timesheet days", () => {
		const metadata = buildTimesheetDaySnapshotMetadata({
			source: {
				type: "MANUAL_BREAKDOWN",
				id: null,
				status: "PRESENT",
				reason: "CORRECTION",
				requestId: "request-1",
			},
			marker: "HOURS",
			revision: {
				editedAt: "2026-05-15T05:00:00.000Z",
				editedBy: "manager-1",
				reason: "Approved correction",
			},
			snapshottedAt: new Date("2026-05-15T04:00:00.000Z"),
		});

		expect(metadata.revision).to.deep.equal({
			editedAt: "2026-05-15T05:00:00.000Z",
			editedBy: "manager-1",
			reason: "Approved correction",
		});
		expect(metadata.primaryMarker).to.equal("HOURS");
	});

	it("creates revision-one effective lines when no current effective line exists", async () => {
		const createCalls: any[] = [];
		const prisma = {
			timesheetline: {
				findFirst: async () => null,
				create: async (args: any) => {
					createCalls.push(args);
					return { id: "line-1", ...args.data };
				},
			},
		} as any;

		const result = await writeEffectiveTimesheetLine(prisma, {
			organizationId: "org-1",
			timesheetId: "timesheet-1",
			date: new Date("2026-05-15T00:00:00.000Z"),
			data: { status: "PRESENT" },
		});

		expect(createCalls).to.have.length(1);
		expect(result).to.include({
			id: "line-1",
			status: "PRESENT",
			revisionNo: 1,
			isEffective: true,
			ledgerType: "SNAPSHOT",
		});
	});

	it("updates the current effective line without creating a correction version by default", async () => {
		const calls: any[] = [];
		const prisma = {
			timesheetline: {
				findFirst: async () => ({ id: "line-1", revisionNo: 3, ledgerType: "SNAPSHOT" }),
				update: async (args: any) => {
					calls.push(args);
					return { id: args.where.id, ...args.data };
				},
			},
		} as any;

		const result = await writeEffectiveTimesheetLine(prisma, {
			organizationId: "org-1",
			timesheetId: "timesheet-1",
			date: new Date("2026-05-15T00:00:00.000Z"),
			data: { status: "PRESENT", hoursWorked: "8:00" },
		});

		expect(calls).to.have.length(1);
		expect(calls[0].where).to.deep.equal({ id: "line-1" });
		expect(result).to.include({
			id: "line-1",
			status: "PRESENT",
			hoursWorked: "8:00",
			revisionNo: 3,
			isEffective: true,
			ledgerType: "SNAPSHOT",
		});
	});

	it("creates a correction revision and supersedes the previous effective line in version mode", async () => {
		const calls: any[] = [];
		const prisma = {
			timesheetline: {
				findFirst: async () => ({ id: "line-1", revisionNo: 1 }),
				create: async (args: any) => {
					calls.push(["create", args]);
					return { id: "line-2", ...args.data };
				},
				update: async (args: any) => {
					calls.push(["update", args]);
					return { id: args.where.id, ...args.data };
				},
			},
		} as any;

		const result = await writeEffectiveTimesheetLine(prisma, {
			organizationId: "org-1",
			timesheetId: "timesheet-1",
			date: new Date("2026-05-15T00:00:00.000Z"),
			versionMode: "version",
			editedBy: "manager-1",
			editReason: "Approved correction",
			data: {
				status: "PRESENT",
				hoursWorked: "7:30",
				editedAt: new Date("2026-05-15T05:00:00.000Z"),
			},
		});

		expect(result).to.include({
			id: "line-2",
			revisionNo: 2,
			isEffective: true,
			ledgerType: "CORRECTION",
			supersedesLineId: "line-1",
			editedBy: "manager-1",
			editReason: "Approved correction",
		});
		expect(result.metadata.revision).to.deep.equal({
			editedAt: "2026-05-15T05:00:00.000Z",
			editedBy: "manager-1",
			reason: "Approved correction",
		});
		expect(calls[1][0]).to.equal("update");
		expect(calls[1][1]).to.deep.include({
			where: { id: "line-1" },
		});
		expect(calls[1][1].data.isEffective).to.equal(false);
		expect(calls[1][1].data.supersededById).to.equal("line-2");
	});

	it("updates a colliding existing line when a stale MongoDB day-level unique index rejects create", async () => {
		const calls: any[] = [];
		const existingLine = {
			id: "line-1",
			revisionNo: 1,
			ledgerType: "SNAPSHOT",
		};
		const prisma = {
			timesheetline: {
				findFirst: async (args: any) => {
					calls.push(["findFirst", args]);
					if (args.where.isEffective === true) return null;
					return existingLine;
				},
				create: async () => {
					const error: any = new Error(
						"Unique constraint failed on the constraint: `timesheet_lines_organizationId_timesheetId_date_key`",
					);
					error.code = "P2002";
					throw error;
				},
				update: async (args: any) => {
					calls.push(["update", args]);
					return { id: args.where.id, ...args.data };
				},
			},
		} as any;

		const result = await writeEffectiveTimesheetLine(prisma, {
			organizationId: "org-1",
			timesheetId: "timesheet-1",
			date: new Date("2026-05-15T00:00:00.000Z"),
			versionMode: "update",
			data: {
				organizationId: "org-1",
				employeeId: "employee-1",
				payrollPeriodId: "period-1",
				timesheetId: "timesheet-1",
				date: new Date("2026-05-15T00:00:00.000Z"),
				status: "ABSENT",
			},
		});

		expect(result).to.include({
			id: "line-1",
			isDeleted: false,
			isEffective: true,
			revisionNo: 1,
			ledgerType: "SNAPSHOT",
			status: "ABSENT",
		});
		const updateCall = calls.find(([name]) => name === "update");
		expect(updateCall?.[1].where).to.deep.equal({ id: "line-1" });
	});

	it("rethrows unique constraint errors in version mode instead of overwriting history", async () => {
		const prisma = {
			timesheetline: {
				findFirst: async () => null,
				create: async () => {
					const error: any = new Error("Unique constraint failed");
					error.code = "P2002";
					throw error;
				},
			},
		} as any;

		let thrown: unknown;
		try {
			await writeEffectiveTimesheetLine(prisma, {
				organizationId: "org-1",
				timesheetId: "timesheet-1",
				date: new Date("2026-05-15T00:00:00.000Z"),
				versionMode: "version",
				data: { status: "PRESENT" },
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).to.be.instanceOf(Error);
		expect(String((thrown as Error).message)).to.contain("Unique constraint failed");
	});
});
