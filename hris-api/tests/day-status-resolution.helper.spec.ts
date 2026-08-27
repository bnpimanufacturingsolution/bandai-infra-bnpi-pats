import { expect } from "chai";
import {
	DAY_STATUS_CLASSES,
	buildDayStatusResolution,
	classifyEmployeeDay,
	enumerateDates,
	isScheduledWorkday,
	parseBenefitNotesLeaveDates,
	weekdayOfDate,
} from "../helper/day-status-resolution.helper";

const base = {
	code: "00010",
	date: "2026-07-06", // Monday
	tenureStart: null as string | null,
	tenureEnd: null as string | null,
	punched: false,
	schedulePositive: false,
	awolRow: null,
	leaveRow: null,
};

describe("day-status-resolution helper (Mon–Sat truth + review queue)", () => {
	it("treats only Sunday as rest under Mon–Sat schedule truth", () => {
		expect(isScheduledWorkday("2026-07-05")).to.equal(false); // Sun
		expect(isScheduledWorkday("2026-07-04")).to.equal(true); // Sat
		expect(isScheduledWorkday("2026-07-06")).to.equal(true); // Mon
		expect(weekdayOfDate("2026-07-05")).to.equal("Sun");
	});

	it("enumerates an inclusive window in UTC", () => {
		expect(enumerateDates("2026-07-10", "2026-07-12")).to.deep.equal([
			"2026-07-10",
			"2026-07-11",
			"2026-07-12",
		]);
	});

	it("classifies OUT_OF_TENURE before weekday/punch precedence", () => {
		const preHire = classifyEmployeeDay({
			...base,
			date: "2026-07-05",
			tenureStart: "2026-07-06",
			punched: true,
		});
		expect(preHire.status).to.equal("OUT_OF_TENURE");
	});

	it("Sunday stays REST even with punch and schedule-positive proof", () => {
		const sunday = classifyEmployeeDay({
			...base,
			date: "2026-07-05",
			punched: true,
			schedulePositive: true,
		});
		// Punch wins over REST only on scheduled days; on Sunday the schedule
		// class is REST_SUNDAY — punch is surfaced through conflicts instead.
		expect(sunday.status).to.equal("REST_SUNDAY");
	});

	it("punch beats AWOL evidence and leave ledger, surfacing conflicts", () => {
		const punched = classifyEmployeeDay({
			...base,
			punched: true,
			awolRow: { date: base.date },
			leaveRow: { date: base.date, paidFlag: true },
		});
		expect(punched.status).to.equal("PRESENT_PUNCH");
		expect(punched.conflictWith).to.deep.equal(["awol", "leave"]);
	});

	it("schedule-positive (WS=1) beats AWOL/ledger but loses to punch", () => {
		const ws = classifyEmployeeDay({ ...base, schedulePositive: true });
		expect(ws.status).to.equal("PRESENT_SCHEDULE_POSITIVE");
		const wsAwol = classifyEmployeeDay({
			...base,
			schedulePositive: true,
			awolRow: { date: base.date },
		});
		expect(wsAwol.status).to.equal("PRESENT_SCHEDULE_POSITIVE");
	});

	it("AWOL row is an evidenced absent that outranks ledger rows", () => {
		const awol = classifyEmployeeDay({
			...base,
			awolRow: { date: base.date, label: "For DA Issuance" },
			leaveRow: { date: base.date, paidFlag: true },
		});
		expect(awol.status).to.equal("ABSENT_AWOL_EVIDENCED");
		expect(awol.reason).to.contain("For DA Issuance");
		expect(awol.conflictWith).to.deep.equal(["leave"]);
	});

	it("splits paid vs unpaid leave ledger rows", () => {
		const paid = classifyEmployeeDay({ ...base, leaveRow: { date: base.date, paidFlag: true, label: "VL" } });
		const unpaid = classifyEmployeeDay({ ...base, leaveRow: { date: base.date, paidFlag: false, label: "A" } });
		expect(paid.status).to.equal("LEAVE_PAID");
		expect(unpaid.status).to.equal("LEAVE_UNPAID");
	});

	it("bare no-show lands in REVIEW_NO_EVIDENCE, never silent ABSENT", () => {
		const bare = classifyEmployeeDay({ ...base });
		expect(bare.status).to.equal("REVIEW_NO_EVIDENCE");
	});

	it("builds fleet buckets, review queue, and per-employee exposure estimates", () => {
		const result = buildDayStatusResolution({
			window: { start: "2026-07-05", end: "2026-07-11" }, // Sun..Sat
			employees: [
				{ code: "00001", name: "A" },
				{ code: "00002", name: "B" },
			],
			punchKeys: new Set(["00001|2026-07-06"]),
			schedulePositiveKeys: new Set(["00002|2026-07-06"]),
			awolByCodeDate: new Map([["00001", new Map([["2026-07-07", { date: "2026-07-07" }]])]]),
			leaveByCodeDate: new Map([
				["00001", new Map([["2026-07-08", { date: "2026-07-08", paidFlag: true }]])],
				["00002", new Map([["2026-07-08", { date: "2026-07-08", paidFlag: false }]])],
			]),
			dailyBasisByCode: new Map([
				["00001", 600],
				["00002", 500],
			]),
		});
		// 2 employees × 7 days = 14; Sundays = 2.
		expect(result.scope.calendarDays).to.equal(7);
		expect(result.buckets.REST_SUNDAY).to.equal(2);
		expect(result.buckets.PRESENT_PUNCH).to.equal(1);
		expect(result.buckets.PRESENT_SCHEDULE_POSITIVE).to.equal(1);
		expect(result.buckets.ABSENT_AWOL_EVIDENCED).to.equal(1);
		expect(result.buckets.LEAVE_PAID).to.equal(1);
		expect(result.buckets.LEAVE_UNPAID).to.equal(1);
		// Remaining scheduled days are review: emp1 → 07-09,07-10,07-11; emp2 → 07-06? no (positive), so 07-07,07-09,07-10,07-11 minus awol/leave days.
		expect(result.buckets.REVIEW_NO_EVIDENCE).to.equal(
			14 - 2 - 1 - 1 - 1 - 1 - 1 - result.buckets.OUT_OF_TENURE,
		);
		expect(result.reviewItems.length).to.equal(result.buckets.REVIEW_NO_EVIDENCE);
		expect(result.evidencedAbsentItems.length).to.equal(1);
		const emp1 = result.perEmployee.find((e) => e.code === "00001")!;
		expect(emp1.reviewDays).to.equal(3);
		expect(emp1.estReviewAmount).to.equal(1800); // 3 × 600 ESTIMATE_ONLY
	});

	it("parses imported LVP notes back into day-level paid dates", () => {
		const notes =
			"BNPI Period Leave Import; sheet=Leave (2); days=4.5; dates=2026-07-11+2026-07-12+2026-07-14+2026-07-15+2026-07-18.5; types=BEL; basis=daily@600; source=x.xlsx; period=PP";
		expect(parseBenefitNotesLeaveDates(notes)).to.deep.equal([
			"2026-07-11",
			"2026-07-12",
			"2026-07-14",
			"2026-07-15",
			"2026-07-18.5",
		].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
		expect(parseBenefitNotesLeaveDates(null)).to.deep.equal([]);
	});

	it("exposes a closed class set for UI chips", () => {
		expect(DAY_STATUS_CLASSES).to.have.length(8);
	});
});
