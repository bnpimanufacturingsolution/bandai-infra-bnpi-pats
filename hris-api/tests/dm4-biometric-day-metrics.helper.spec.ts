import { expect } from "chai";
import { computeDm4BiometricDayMetrics } from "../helper/dm4-biometric-day-metrics.helper";

describe("dm4-biometric-day-metrics.helper", () => {
	const dayShift = {
		isOff: false,
		startTime: "06:00",
		endTime: "14:00",
		regularMinutes: 480,
		breakMinutes: 0,
		graceLateMinutes: 0,
		graceEarlyOutMinutes: 0,
	};

	it("computes late minutes for late clock-in", () => {
		const m = computeDm4BiometricDayMetrics({
			timeIn: "11:10",
			timeOut: "19:23",
			punchCount: 2,
			schedule: dayShift,
		});
		expect(m.status).to.equal("PRESENT");
		expect(m.lateMinutes).to.equal(310); // 11:10 - 06:00
		expect(m.incomplete).to.equal(false);
		expect(m.totalMinutesWorked).to.be.greaterThan(0);
	});

	it("computes early-out minutes", () => {
		const m = computeDm4BiometricDayMetrics({
			timeIn: "07:32",
			timeOut: "13:40",
			punchCount: 2,
			schedule: dayShift,
		});
		expect(m.earlyOutMinutes).to.equal(20); // 14:00 - 13:40
		expect(m.undertimeMinutes).to.equal(20);
		expect(m.lateMinutes).to.equal(92); // 07:32 - 06:00
	});

	it("marks single punch as INCOMPLETE without inventing 24h work", () => {
		const m = computeDm4BiometricDayMetrics({
			timeIn: "07:25",
			timeOut: "07:25",
			punchCount: 1,
			schedule: dayShift,
		});
		expect(m.status).to.equal("INCOMPLETE");
		expect(m.incomplete).to.equal(true);
		expect(m.totalMinutesWorked).to.equal(0);
		expect(m.hoursWorked).to.equal("0:00");
		expect(m.timeOut).to.equal(null);
		// late still computable from timeIn
		expect(m.lateMinutes).to.equal(85); // 07:25 - 06:00
	});

	it("does not invent overnight when end < start without overnight schedule", () => {
		const m = computeDm4BiometricDayMetrics({
			timeIn: "22:00",
			timeOut: "06:00",
			punchCount: 2,
			schedule: dayShift,
		});
		expect(m.status).to.equal("INCOMPLETE");
		expect(m.totalMinutesWorked).to.equal(0);
	});
});
