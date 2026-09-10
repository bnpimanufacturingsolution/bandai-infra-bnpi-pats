import { expect } from "chai";
import { ZERO_PAY_REASON_LABELS, resolveZeroPayReason } from "../helper/payroll-period.helper";

describe("zero-pay reason gate (empty timesheet rows)", () => {
	it("marks empty breakdowns as no biometric device data", () => {
		expect(resolveZeroPayReason([], [])).to.deep.equal({
			hasAttendance: false,
			zeroPayReason: "NO_DEVICE_DATA",
			zeroPayLabel: ZERO_PAY_REASON_LABELS.NO_DEVICE_DATA,
		});
	});

	it("marks null inputs as no biometric device data without throwing", () => {
		expect(resolveZeroPayReason(null, null)).to.deep.equal({
			hasAttendance: false,
			zeroPayReason: "NO_DEVICE_DATA",
			zeroPayLabel: ZERO_PAY_REASON_LABELS.NO_DEVICE_DATA,
		});
	});

	it("marks lines-without-validation as no schedule", () => {
		expect(resolveZeroPayReason([{ status: "ABSENT" }], [])).to.deep.equal({
			hasAttendance: false,
			zeroPayReason: "NO_SCHEDULE",
			zeroPayLabel: ZERO_PAY_REASON_LABELS.NO_SCHEDULE,
		});
	});

	it("returns hasAttendance true with null reason when both inputs are non-empty", () => {
		expect(
			resolveZeroPayReason([{ status: "PRESENT" }], [{ status: "PRESENT" }]),
		).to.deep.equal({ hasAttendance: true, zeroPayReason: null, zeroPayLabel: null });
	});

	it("exposes HR-facing status labels", () => {
		expect(ZERO_PAY_REASON_LABELS.NO_DEVICE_DATA).to.equal(
			"Employee has no biometric device data (no punches)",
		);
		expect(ZERO_PAY_REASON_LABELS.NO_SCHEDULE).to.equal("Employee has no schedule");
	});
});
