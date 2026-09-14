import { expect } from "chai";
import { resolvePathBAbsentDays } from "../helper/payroll-period.helper";

const TODAY = "2026-09-10";
const day = (status: string, date: string, extra: Record<string, unknown> = {}) => ({
	status,
	date: new Date(`${date}T00:00:00.000Z`),
	hoursWorked: "0:00",
	timeIn: null,
	timeOut: null,
	...extra,
});
const present = (date: string) =>
	day("PRESENT", date, { timeIn: new Date(`${date}T00:00:00.000Z`), timeOut: new Date(`${date}T08:00:00.000Z`), hoursWorked: "8:00" });

describe("resolvePathBAbsentDays (Path-B evidenced absence)", () => {
	it("legacy parity: fully-materialized 12-workday cutoff charges 12 - worked", () => {
		const days = [
			...Array.from({ length: 10 }, (_, i) => present(`2026-08-${26 + i}`)),
			day("ABSENT", "2026-09-08"),
			day("ABSENT", "2026-09-09"),
		];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 12, effectiveWorkedDays: 10, todayKey: TODAY })).to.equal(2);
	});

	it("EMP3338: 2-day tenure (1 ABSENT past + 1 NCI today) charges 1, not 12", () => {
		const days = [day("ABSENT", "2026-09-09"), day("NOT_CLOCKED_IN", "2026-09-10")];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 2, effectiveWorkedDays: 0, todayKey: TODAY })).to.equal(1);
	});

	it("EMP3337: 3 SCHEDULED (2 past + 1 today) charges 2, not 12", () => {
		const days = [day("SCHEDULED", "2026-09-08"), day("SCHEDULED", "2026-09-09"), day("SCHEDULED", "2026-09-10")];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 3, effectiveWorkedDays: 0, todayKey: TODAY })).to.equal(2);
	});

	it("EMP3334: single SCHEDULED day still open charges 0, not 12", () => {
		const days = [day("SCHEDULED", "2026-09-10")];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 1, effectiveWorkedDays: 0, todayKey: TODAY })).to.equal(0);
	});

	it("EMP3333: LEAVE/HOLIDAY excused, open today excluded (5 ABSENT + 1 NCI past + 3 SCHED past)", () => {
		const days = [
			...Array.from({ length: 5 }, (_, i) => day("ABSENT", `2026-08-${26 + i}`)),
			day("NOT_CLOCKED_IN", "2026-09-04"),
			day("HOLIDAY", "2026-08-31"),
			day("HOLIDAY", "2026-09-01"),
			...["2026-09-07", "2026-09-08", "2026-09-09"].map((d) => day("SCHEDULED", d)),
			day("SCHEDULED", "2026-09-10"),
			...Array.from({ length: 4 }, (_, i) => day("REST_DAY", `2026-08-${30 + i}`)),
		];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 12, effectiveWorkedDays: 0, todayKey: TODAY })).to.equal(9);
	});

	it("past PRESENT with no usable punch pair is still charged (missing-punch no-pay)", () => {
		const days = [...Array.from({ length: 11 }, (_, i) => present(`2026-08-${26 + i}`)), day("PRESENT", "2026-09-09")];
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 12, effectiveWorkedDays: 11, todayKey: TODAY })).to.equal(1);
	});

	it("usable PRESENT days are never charged", () => {
		const days = Array.from({ length: 12 }, (_, i) => present(`2026-08-${26 + i}`));
		expect(resolvePathBAbsentDays({ days, totalWorkDays: 12, effectiveWorkedDays: 12, todayKey: TODAY })).to.equal(0);
	});
});
