import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import {
	AUTO_APPROVE_SYSTEM_ACTOR,
	buildTimesheetAutoApprovalPatch,
	resolveTimesheetAutoApprovalEnabled,
} from "../helper/timesheet-config.helper";
import { EnterpriseMigrationDataSchema } from "../zod/migration.zod";

describe("resolveTimesheetAutoApprovalEnabled", () => {
	it("enables auto approval only for explicit true", () => {
		expect(resolveTimesheetAutoApprovalEnabled(true)).to.equal(true);
		expect(resolveTimesheetAutoApprovalEnabled(false)).to.equal(false);
		expect(resolveTimesheetAutoApprovalEnabled(undefined)).to.equal(false);
		expect(resolveTimesheetAutoApprovalEnabled(null)).to.equal(false);
		expect(resolveTimesheetAutoApprovalEnabled("true")).to.equal(false);
	});
});

describe("timesheet auto-approve defaults", () => {
	it("defaults migrated timesheet configs to auto-approved", () => {
		const parsed = EnterpriseMigrationDataSchema.parse({ timesheetConfigs: [{}] });
		expect(parsed.timesheetConfigs).to.have.lengthOf(1);
		expect(parsed.timesheetConfigs[0].enableAutoApprove).to.equal(true);
	});

	it("keeps an explicit opt-out through migration", () => {
		const parsed = EnterpriseMigrationDataSchema.parse({
			timesheetConfigs: [{ enableAutoApprove: false }],
		});
		expect(parsed.timesheetConfigs[0].enableAutoApprove).to.equal(false);
	});
});

describe("timesheet auto-approve default migration", () => {
	const migrationSql = fs.readFileSync(
		path.resolve(
			__dirname,
			"../prisma/schema-postgres/migrations/20260904_set_timesheet_auto_approve_default_true.sql",
		),
		"utf8",
	);

	it("sets the column default true and flips explicit false rows only", () => {
		expect(migrationSql).to.contain('"enableAutoApprove" SET DEFAULT true');
		expect(migrationSql).to.contain('SET "enableAutoApprove" = true');
		expect(migrationSql).to.contain('WHERE "enableAutoApprove" = false');
		expect(migrationSql).not.to.match(/DROP\s+TABLE\s+timesheet_configs/i);
		expect(migrationSql).not.to.match(/TRUNCATE\s+timesheet_configs/i);
	});
});

describe("buildTimesheetAutoApprovalPatch", () => {
	const now = new Date("2026-09-03T01:02:03.000Z");

	it("marks the submission approved by the system actor", () => {
		const patch = buildTimesheetAutoApprovalPatch(null, now);
		expect(patch.status).to.equal("APPROVED");
		expect(patch.approvedBy).to.equal(AUTO_APPROVE_SYSTEM_ACTOR);
		expect(patch.approvalDate).to.equal(now);
	});

	it("stamps auto-approval provenance on metadata", () => {
		const patch = buildTimesheetAutoApprovalPatch(null, now);
		const metadata = patch.metadata as Record<string, unknown>;
		expect(metadata.snapshotState).to.equal("APPROVED");
		expect(metadata.snapshotLockedAt).to.equal(now.toISOString());
		expect(metadata.snapshotLockedBy).to.equal(AUTO_APPROVE_SYSTEM_ACTOR);
		expect(metadata.snapshotType).to.equal("TIMESHEET_PERIOD");
		expect(metadata.autoApproved).to.equal(true);
		expect(metadata.autoApprovedAt).to.equal(now.toISOString());
	});

	it("preserves existing metadata", () => {
		const patch = buildTimesheetAutoApprovalPatch(
			{
				snapshotSubmittedAt: "2026-09-03T00:00:00.000Z",
				snapshotSubmittedBy: "employee-1",
				customFlag: "keep-me",
			},
			now,
		);
		const metadata = patch.metadata as Record<string, unknown>;
		expect(metadata.snapshotSubmittedAt).to.equal("2026-09-03T00:00:00.000Z");
		expect(metadata.snapshotSubmittedBy).to.equal("employee-1");
		expect(metadata.customFlag).to.equal("keep-me");
		expect(metadata.snapshotState).to.equal("APPROVED");
	});

	it("defaults the timestamp to now when omitted", () => {
		const before = Date.now();
		const patch = buildTimesheetAutoApprovalPatch(null);
		const approvalDate = (patch.approvalDate as Date).getTime();
		expect(approvalDate).to.be.at.least(before);
		expect(approvalDate).to.be.at.most(Date.now());
	});
});
