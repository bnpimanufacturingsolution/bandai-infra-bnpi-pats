import { expect } from "chai";
import {
	buildBandaiOtLinePatch,
	hasAnyApprovedPayBucket,
	isScheduledRestDay,
	type BandaiOtSourceRow,
} from "../helper/bandai-ot-line-patch.helper";

const zeroSource = (overrides: Partial<BandaiOtSourceRow> = {}): BandaiOtSourceRow => ({
	rowNumber: 1,
	date: "2026-06-29",
	employeeNo: "01792",
	regularDays: 0,
	regOtHrs: 0,
	regNdHrs: 0,
	spclHrs: 0,
	spclOtHrs: 0,
	rholHrs: 0,
	rholOtHrs: 0,
	rdHrs: 0,
	rdOtHrs: 0,
	...overrides,
});

const otSource = (regOtHrs: number): BandaiOtSourceRow =>
	zeroSource({
		date: "2026-06-27",
		regularDays: 1,
		regOtHrs,
	});

describe("bandai-ot-line-patch.helper", () => {
	describe("isScheduledRestDay", () => {
		it("reads scheduleSnapshot.isOff", () => {
			expect(isScheduledRestDay({ scheduleSnapshot: { isOff: true } })).to.equal(true);
			expect(isScheduledRestDay({ scheduleSnapshot: { isOff: false } })).to.equal(false);
		});

		it("does not treat status=REST_DAY alone as schedule off (avoids absense mislabel)", () => {
			expect(isScheduledRestDay({ status: "REST_DAY" })).to.equal(false);
			expect(isScheduledRestDay({ status: "PRESENT" })).to.equal(false);
			expect(isScheduledRestDay({ scheduleSnapshot: { code: "OFF" } })).to.equal(true);
		});
	});

	describe("buildBandaiOtLinePatch", () => {
		it("marks no-show scheduled workday with zero pay buckets as ABSENT (not REST_DAY)", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "REST_DAY",
					// note: status REST_DAY but schedule says work (Alexa defect shape)
					scheduleSnapshot: { isOff: false, code: "WS_0815_1615" },
					overtimeHours: "0:00",
					metadata: null,
				},
				source: zeroSource(),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(patch!.changes.status).to.equal("ABSENT");
			expect(patch!.changes.primaryMarker).to.equal("ABSENT");
			expect(patch!.changes.hoursWorked).to.equal("0:00");
			expect(patch!.changes.overtimeHours).to.equal("0:00");
			expect(
				patch!.changes.metadata.bandaiPayrollSourceRepair.approvedBuckets.regularDays,
			).to.equal(0);
			expect(patch!.reasons.some((r) => /ABSENT/i.test(r))).to.equal(true);
		});

		it("marks zero-bucket day with punch evidence as INCOMPLETE (not ABSENT)", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "PRESENT",
					timeIn: new Date("2026-07-07T00:00:00.000Z"),
					scheduleSnapshot: { isOff: false },
					overtimeHours: "16:00",
					metadata: null,
				},
				source: zeroSource({ date: "2026-07-07" }),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(patch!.changes.status).to.equal("INCOMPLETE");
			expect(patch!.changes.hoursWorked).to.equal("0:00");
		});

		it("keeps true schedule off-days as REST_DAY when zero pay buckets", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "PRESENT",
					scheduleSnapshot: { isOff: true, code: "OFF" },
					overtimeHours: "2:00",
					metadata: null,
				},
				source: zeroSource({ date: "2026-06-28" }),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(patch!.changes.status).to.equal("REST_DAY");
			expect(patch!.changes.primaryMarker).to.equal("REST_DAY");
			expect(patch!.changes.overtimeHours).to.equal("0:00");
		});

		it("honors effective OFF override even when line template snapshot isOff=false (01116 shape)", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "ABSENT",
					scheduleSnapshot: {
						isOff: false,
						code: "WS_0715_1515_BR_1100_1130",
						source: "template",
					},
					overtimeHours: "0:00",
					metadata: null,
				},
				source: zeroSource({ date: "2026-07-21", employeeNo: "01116" }),
				effectiveScheduleSnapshot: {
					code: "WS_OFF",
					name: "WorkSharing Off",
					isOff: true,
					source: "WORKSHARING_DAY_FLAG_OFF",
				},
				appliedAt: "2026-08-20T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(patch!.changes.status).to.equal("REST_DAY");
			expect(patch!.changes.primaryMarker).to.equal("REST_DAY");
			expect(patch!.changes.scheduleSnapshot?.isOff).to.equal(true);
			expect(String(patch!.changes.scheduleSnapshot?.code || "")).to.match(/OFF/i);
			expect(patch!.reasons.some((r) => /REST_DAY/i.test(r))).to.equal(true);
			expect(patch!.reasons.some((r) => /ABSENT/i.test(r) && /scheduled workday/i.test(r))).to.equal(
				false,
			);
		});

		it("does not convert LEAVE to ABSENT", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "LEAVE",
					scheduleSnapshot: { isOff: false },
					overtimeHours: "0:00",
					metadata: {
						bandaiPayrollSourceRepair: {
							approvedBuckets: zeroSource(),
						},
					},
				},
				source: zeroSource(),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			// buckets already match and leave preserved → null or no status change
			if (patch) {
				expect(patch.changes.status).to.equal(undefined);
			}
		});

		it("stamps approvedBuckets and overtime hours for reg OT pay path", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "PRESENT",
					scheduleSnapshot: { isOff: false },
					overtimeHours: "0:13",
					metadata: null,
				},
				source: otSource(3),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(patch!.changes.overtimeHours).to.equal("3:00");
			expect(
				patch!.changes.metadata.bandaiPayrollSourceRepair.approvedBuckets.regOtHrs,
			).to.equal(3);
			expect(
				patch!.changes.metadata.bandaiPayrollSourceRepair.approvedBuckets.regularDays,
			).to.equal(1);
			expect(hasAnyApprovedPayBucket(otSource(3))).to.equal(true);
		});

		it("always stamps approvedBuckets even when overtime hours already match", () => {
			const patch = buildBandaiOtLinePatch({
				line: {
					status: "PRESENT",
					scheduleSnapshot: { isOff: false },
					overtimeHours: "3:00",
					metadata: null,
				},
				source: otSource(3),
				appliedAt: "2026-08-11T00:00:00.000Z",
			});
			expect(patch).to.not.equal(null);
			expect(
				patch!.changes.metadata.bandaiPayrollSourceRepair.approvedBuckets.regOtHrs,
			).to.equal(3);
		});
	});
});
