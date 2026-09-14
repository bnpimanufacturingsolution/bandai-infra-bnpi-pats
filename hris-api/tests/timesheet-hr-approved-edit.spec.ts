import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

// Operator request 2026-09-09: HR must be able to update employee timesheets
// directly, including APPROVED (payroll-ready) sheets. Payroll auto-approval
// means most sheets in a live period are APPROVED, so the previous hard 400
// block for non-owner actors made day editing impossible from /hr/timesheets.
// The update controller now allows HR/admin breakdown-only edits on APPROVED
// timesheets (status stays APPROVED) while keeping:
//   - the payroll-locked 409 rejection (paid sheets),
//   - the SUBMITTED breakdown-only rule,
//   - the line-leader day-labor-only guard,
//   - versioning of changed days through the edit audit trail.

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);

const getUpdateBlock = () => {
	const start = controllerSource.indexOf("const update = async");
	const end = controllerSource.indexOf("const normalizeBreakdownPreview = async");
	return controllerSource.slice(start, end);
};

describe("timesheet HR APPROVED breakdown-edit contract", () => {
	it("allows HR/admin breakdown-only edits on APPROVED timesheets", () => {
		const block = getUpdateBlock();

		expect(block).to.include("isHrApprovedBreakdownEdit");
		expect(block).to.include("isHrOrAdminActor &&");
		expect(block).to.include("isBreakdownOnlyUpdate");
		expect(block).to.include('existingTimesheet.status === "APPROVED"');
	});

	it("keeps the APPROVED hard block for edits that are not HR breakdown-only", () => {
		const block = getUpdateBlock();

		expect(block).to.include("Cannot update timesheet in APPROVED status");
		expect(block).to.include("!isHrApprovedBreakdownEdit");
	});

	it("keeps SUBMITTED restricted to breakdown-only updates for non-owners", () => {
		const block = getUpdateBlock();

		expect(block).to.include(
			'existingTimesheet.status === "SUBMITTED" && !isBreakdownOnlyUpdate',
		);
	});

	it("keeps the payroll-locked 409 rejection before any APPROVED allowance", () => {
		const block = getUpdateBlock();

		const lockIndex = block.indexOf("paidPayrollLock");
		const approvedIndex = block.indexOf('existingTimesheet.status === "APPROVED"');
		expect(lockIndex).to.be.greaterThan(-1);
		expect(approvedIndex).to.be.greaterThan(lockIndex);
	});

	it("versions HR APPROVED edits through the line audit trail (CORRECTION ledger)", () => {
		const block = getUpdateBlock();

		// isEditAuditEligible must now also match HR/admin actors on APPROVED
		// sheets so changed days get versioned instead of overwritten in place.
		const auditEligibleIndex = block.indexOf("const isEditAuditEligible");
		expect(auditEligibleIndex).to.be.greaterThan(-1);
		const auditBlock = block.slice(
			auditEligibleIndex,
			block.indexOf("if (versionDayKeys?.size)", auditEligibleIndex),
		);
		expect(auditBlock).to.include("isHrOrAdminActor");
		expect(auditBlock).to.include('existingTimesheet.status === "APPROVED"');
	});

	it("keeps line-leader day-labor-only guard untouched", () => {
		const block = getUpdateBlock();

		expect(block).to.include("Line leaders can only tag day labor (Direct/Indirect)");
	});
});
