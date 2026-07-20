import { expect } from "chai";
import {
	applyOvertimeApprovalPolicyToTimekeepingFields,
	findUnfiledOvertimeCandidateLines,
	readOvertimeCandidateFromMetadata,
	requiresManagerApprovedOvertime,
} from "../helper/overtime-approval.helper";

describe("overtime approval helper", () => {
	it("defaults manager-approved overtime policy to enabled", () => {
		expect(requiresManagerApprovedOvertime({ requireManagerApprovedOvertime: true })).to.equal(
			true,
		);
		expect(requiresManagerApprovedOvertime({ requireManagerApprovedOvertime: false })).to.equal(
			false,
		);
		expect(requiresManagerApprovedOvertime(null)).to.equal(true);
	});

	it("zeros payable overtime while preserving pending candidate metadata", () => {
		const applied = applyOvertimeApprovalPolicyToTimekeepingFields({
			calc: {
				totalMinutesWorked: 600,
				regularMinutes: 480,
				overtimeMinutes: 120,
				undertimeMinutes: 0,
				lateMinutes: 0,
				earlyOutMinutes: 0,
				breakMinutes: 60,
			},
			requireManagerApprovedOvertime: true,
		});

		expect(applied.timekeepingFields.overtimeHours).to.equal("0:00");
		expect(applied.timekeepingFields.overtimeMinutes).to.equal(0);
		expect(applied.metadata.overtimeCandidate).to.equal(true);
		expect(applied.metadata.pendingOvertimeMinutes).to.equal(120);
		expect(applied.metadata.pendingOvertimeHours).to.equal("2:00");
	});

	it("finds unfiled overtime candidate lines for submit gate", () => {
		const violations = findUnfiledOvertimeCandidateLines([
			{
				date: "2026-03-10",
				metadata: {
					overtimeCandidate: true,
					pendingOvertimeMinutes: 90,
					pendingOvertimeHours: "1:30",
				},
			},
			{
				date: "2026-03-11",
				metadata: {
					overtimeCandidate: true,
					pendingOvertimeMinutes: 60,
					pendingOvertimeHours: "1:00",
					overtimeRequestId: "req-1",
					overtimeApprovalStatus: "REQUESTED",
				},
			},
		]);

		expect(violations).to.have.length(1);
		expect(violations[0].date).to.equal("2026-03-10");
		expect(violations[0].pendingOvertimeHours).to.equal("1:30");
	});

	it("reads overtime candidate metadata from line records", () => {
		const candidate = readOvertimeCandidateFromMetadata({
			overtimeCandidate: true,
			pendingOvertimeMinutes: 75,
			pendingOvertimeHours: "1:15",
			overtimeApprovalStatus: "REQUESTED",
			overtimeRequestId: "req-99",
		});

		expect(candidate.isCandidate).to.equal(true);
		expect(candidate.pendingOvertimeHours).to.equal("1:15");
		expect(candidate.overtimeRequestId).to.equal("req-99");
		expect(candidate.overtimeApprovalStatus).to.equal("REQUESTED");
	});
});