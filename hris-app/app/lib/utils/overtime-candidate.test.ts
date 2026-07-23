import { describe, expect, it } from "vitest";
import {
	getOvertimeCandidateBadge,
	getOvertimeCandidateToneSurface,
	resolveOvertimeDayBadge,
	type OvertimeCandidateView,
} from "./overtime-candidate";

const baseCandidate = (
	overrides: Partial<OvertimeCandidateView> = {},
): OvertimeCandidateView => ({
	isCandidate: true,
	pendingOvertimeMinutes: 120,
	pendingOvertimeHours: "2:00",
	overtimeRequestId: null,
	overtimeApprovalStatus: "NONE",
	overtimeCandidateReason: "POST_SHIFT_EXCESS",
	...overrides,
});

describe("getOvertimeCandidateBadge", () => {
	it("marks unfiled candidates as green +OT", () => {
		expect(getOvertimeCandidateBadge(baseCandidate())).toEqual({
			label: "+OT",
			tone: "ot",
		});
	});

	it("marks REQUESTED / filed candidates as blue +OT (ot-filed)", () => {
		expect(
			getOvertimeCandidateBadge(
				baseCandidate({
					overtimeApprovalStatus: "REQUESTED",
					overtimeRequestId: "req-1",
				}),
			),
		).toEqual({ label: "+OT", tone: "ot-filed" });
	});

	it("marks approved candidates as emerald +OT", () => {
		expect(
			getOvertimeCandidateBadge(
				baseCandidate({ overtimeApprovalStatus: "APPROVED" }),
			),
		).toEqual({ label: "+OT", tone: "ot-approved" });
	});
});

describe("resolveOvertimeDayBadge", () => {
	it("prefers REQUESTED status over non-zero overtimeHours (does not show as approved)", () => {
		const badge = resolveOvertimeDayBadge({
			overtimeHours: "2:00",
			metadata: {
				overtimeCandidate: true,
				pendingOvertimeMinutes: 120,
				pendingOvertimeHours: "2:00",
				overtimeApprovalStatus: "REQUESTED",
				overtimeRequestId: "req-ot-1",
			},
		});
		expect(badge).toEqual({ label: "+OT", tone: "ot-filed" });
	});

	it("shows unfiled candidate as green +OT even when payable hours are still zero", () => {
		const badge = resolveOvertimeDayBadge({
			overtimeHours: "0:00",
			metadata: {
				overtimeCandidate: true,
				pendingOvertimeMinutes: 180,
				pendingOvertimeHours: "3:00",
				overtimeApprovalStatus: "NONE",
			},
		});
		expect(badge).toEqual({ label: "+OT", tone: "ot" });
	});

	it("treats legacy payable hours without request metadata as unfiled +OT candidates", () => {
		// readOvertimeCandidateFromDay synthesizes a candidate from overtimeHours.
		const badge = resolveOvertimeDayBadge({
			overtimeHours: "1:30",
			metadata: {},
		});
		expect(badge).toEqual({ label: "+OT", tone: "ot" });
	});

	it("shows approved tone when metadata status is APPROVED (even with request id)", () => {
		const badge = resolveOvertimeDayBadge({
			overtimeHours: "2:00",
			metadata: {
				overtimeCandidate: true,
				pendingOvertimeMinutes: 120,
				pendingOvertimeHours: "2:00",
				overtimeApprovalStatus: "APPROVED",
				overtimeRequestId: "req-ot-approved",
			},
		});
		expect(badge).toEqual({ label: "+OT", tone: "ot-approved" });
	});
});

describe("getOvertimeCandidateToneSurface", () => {
	it("keeps filed badge text and tooltip box in the same sky family", () => {
		const surface = getOvertimeCandidateToneSurface("ot-filed");
		expect(surface.badgeText).toContain("text-sky-600");
		expect(surface.box).toContain("bg-sky-50");
		expect(surface.title).toContain("text-sky-800");
	});

	it("keeps unfiled badge text and tooltip box in the same green family", () => {
		const surface = getOvertimeCandidateToneSurface("ot");
		expect(surface.badgeText).toContain("text-green-700");
		expect(surface.box).toContain("bg-green-50");
	});
});
