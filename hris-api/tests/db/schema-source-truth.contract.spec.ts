import { readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "chai";

const schemaSurfaces = [
	{ name: "Postgres", dir: "prisma/schema-postgres" },
	{ name: "MongoDB", dir: "prisma/schema" },
];

function readSchema(surface: (typeof schemaSurfaces)[number], fileName: string) {
	return readFileSync(path.join(process.cwd(), surface.dir, fileName), "utf8");
}

function expectSchemaToContain(schema: string, expectedSnippets: string[]) {
	for (const snippet of expectedSnippets) {
		expect(schema, `schema should contain: ${snippet}`).to.contain(snippet);
	}
}

describe("Prisma source-of-truth schema contracts", () => {
	for (const surface of schemaSurfaces) {
		describe(surface.name, () => {
			it("keeps AttendanceObligation as the operational attendance truth model", () => {
				const schema = readSchema(surface, "attendanceObligation.prisma");

				expectSchemaToContain(schema, [
					"model AttendanceObligation",
					"employeeId",
					"payrollPeriodId",
					"businessDate String",
					'status       String   @default("EXPECTED")',
					'phase        String   @default("PLANNED")',
					"attendanceId",
					"timesheetId",
					"timesheetlineId",
					"scheduleSnapshot",
					"source",
					"metadata",
					"@@unique([organizationId, employeeId, payrollPeriodId, date])",
					'@@map("attendance_obligations")',
				]);
				expect(schema).to.not.contain("ledgerType");
				expect(schema).to.not.contain("timesheetSnapshot");
			});

			it("keeps Attendance as the raw/effective clock ledger model", () => {
				const schema = readSchema(surface, "attendance.prisma");

				expectSchemaToContain(schema, [
					"enum AttendanceLedgerType",
					"RAW",
					"CORRECTION",
					"model Attendance",
					"ledgerType",
					"sourceRequestId",
					"supersedesAttendanceId",
					"isEffective",
					"totalMinutesWorked",
					"regularMinutes",
					"overtimeMinutes",
					"undertimeMinutes",
					"breakMinutes",
					"timesheetlines",
					"attendanceObligations",
					"@@index([organizationId, employeeId, date, isEffective])",
					'@@map("attendances")',
				]);
				expect(schema).to.not.contain("timesheetSnapshot");
			});

			it("keeps Timesheetline as the effective historical totals and approved OT model", () => {
				const schema = readSchema(surface, "timesheetline.prisma");

				expectSchemaToContain(schema, [
					"model Timesheetline",
					"employeeId",
					"timesheetId",
					"payrollPeriodId",
					"attendanceId",
					"regularHours",
					"overtimeHours",
					"undertimeHours",
					"metadata",
					"primaryMarker",
					"revisionNo",
					"isEffective",
					"ledgerType",
					"supersedesLineId",
					"supersededById",
					"editedBy",
					"@@unique([organizationId, timesheetId, date, revisionNo])",
					"@@index([organizationId, timesheetId, date, isEffective])",
					"@@index([organizationId, employeeId, date, isEffective])",
					'@@map("timesheet_lines")',
				]);
				expect(schema).to.not.contain("timesheetSnapshot");
			});

			it("keeps EmployeePayroll paid history pinned to snapshot and lock fields", () => {
				const schema = readSchema(surface, "employeepayroll.prisma");

				expectSchemaToContain(schema, [
					"model EmployeePayroll",
					"employeeId",
					"payrollPeriodId",
					"timesheetId",
					"timesheetSnapshot Json?",
					"isPaid",
					"paidAt",
					"snapshotLockedAt",
					"snapshotLockedBy",
					"snapshotLockReason",
					"generationRunId",
					"generationKey",
					"@@unique([employeeId, payrollPeriodId])",
					"@@index([organizationId, payrollPeriodId, isPaid, isDeleted])",
					'@@map("employee_payrolls")',
				]);
				expect(schema).to.not.contain("ledgerType");
			});

			it("keeps the four source-of-truth models physically separated", () => {
				const schemas = {
					attendance: readSchema(surface, "attendance.prisma"),
					attendanceObligation: readSchema(surface, "attendanceObligation.prisma"),
					employeePayroll: readSchema(surface, "employeepayroll.prisma"),
					timesheetline: readSchema(surface, "timesheetline.prisma"),
				};

				expect(schemas.attendanceObligation).to.contain('@@map("attendance_obligations")');
				expect(schemas.attendance).to.contain('@@map("attendances")');
				expect(schemas.timesheetline).to.contain('@@map("timesheet_lines")');
				expect(schemas.employeePayroll).to.contain('@@map("employee_payrolls")');
				expect(schemas.attendanceObligation).to.contain("attendance      Attendance?");
				expect(schemas.attendance).to.contain("attendanceObligations AttendanceObligation[]");
				expect(schemas.timesheetline).to.contain("attendanceObligations   AttendanceObligation[]");
				expect(schemas.employeePayroll).to.contain("timesheetSnapshot Json?");
			});
		});
	}
});
