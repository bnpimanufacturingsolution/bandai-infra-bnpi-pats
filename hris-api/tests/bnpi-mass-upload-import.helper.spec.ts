import { expect } from "chai";
import {
	detectMassUploadKindFromHeaders,
	parseCompensationMassUploadRow,
	parseDeductionMassUploadRow,
} from "../helper/bnpi-mass-upload-import.helper";
import { parseBenefitImportDate } from "../helper/employee-benefit-import.helper";

describe("BNPI mass upload import helper", () => {
	it("detects compensation and deduction headers", () => {
		expect(
			detectMassUploadKindFromHeaders([
				"COMCODE",
				"Amount",
				"EmployeeID",
				"EmployeeName",
				"StartPayDate",
			]),
		).to.equal("compensation");
		expect(
			detectMassUploadKindFromHeaders([
				"DEDCODE",
				" Amount ",
				" Payment ",
				"EmployeeID",
				"EmployeeName",
				"StartPayment",
			]),
		).to.equal("deduction");
	});

	it("parses Compensation Mass Upload sample rows", () => {
		const parsed = parseCompensationMassUploadRow({
			COMCODE: "LLA",
			Amount: "250.00",
			EmployeeID: "1466",
			EmployeeName: "Leyesa, Ma. Angelica N.",
			StartPayDate: "6/26/26",
		});
		expect(parsed.ok).to.equal(true);
		if (!parsed.ok) return;
		expect(parsed.employeeId).to.equal("01466");
		expect(parsed.code).to.equal("LLA");
		expect(parsed.amount).to.equal(250);
		expect(parsed.startDate.toISOString().slice(0, 10)).to.equal("2026-06-26");
	});

	it("parses Excel Date cells using Asia/Manila calendar (not UTC day)", () => {
		// xlsx cellDates:true for 11 Jul 2026 midnight PH → 2026-07-10T16:00:00.000Z
		const excelPhMidnight = new Date("2026-07-10T16:00:00.000Z");
		const parsedDate = parseBenefitImportDate(excelPhMidnight);
		expect(parsedDate?.toISOString().slice(0, 10)).to.equal("2026-07-11");

		const parsed = parseCompensationMassUploadRow({
			COMCODE: "ARP",
			Amount: 500,
			EmployeeID: "01360",
			EmployeeName: "Sample",
			StartPayDate: excelPhMidnight,
		});
		expect(parsed.ok).to.equal(true);
		if (!parsed.ok) return;
		expect(parsed.startDate.toISOString().slice(0, 10)).to.equal("2026-07-11");
	});

	it("parses Deduction Mass Upload sample rows using Payment amount", () => {
		const parsed = parseDeductionMassUploadRow({
			DEDCODE: "SSSSALLN",
			Amount: " 29,307.36 ",
			Payment: " 610.57 ",
			EmployeeID: "00492",
			EmployeeName: "Carillo, Christian D.",
			StartPayment: "6/26/26",
		});
		expect(parsed.ok).to.equal(true);
		if (!parsed.ok) return;
		expect(parsed.kind).to.equal("loan");
		expect(parsed.loanTypeName).to.equal("SSS Salary Loan");
		expect(parsed.paymentAmount).to.equal(610.57);
		expect(parsed.principalAmount).to.equal(29307.36);
		expect(parsed.startDate.toISOString().slice(0, 10)).to.equal("2026-06-26");
	});

	it("maps HDMFMP2 to MHDMF2 benefit and UNIDED to generic deduction benefit", () => {
		const mp2 = parseDeductionMassUploadRow({
			DEDCODE: "HDMFMP2",
			Amount: 30000,
			Payment: 500,
			EmployeeID: "01716",
			EmployeeName: "Recafranca, Lea M.",
			// ISO avoids DD/MM vs MM/DD ambiguity (7/11 is Nov 7 under PH day-first).
			StartPayment: "2026-07-11",
		});
		expect(mp2.ok).to.equal(true);
		if (!mp2.ok) return;
		expect(mp2.kind).to.equal("benefit");
		expect(mp2.benefitCode).to.equal("MHDMF2");
		expect(mp2.startDate.toISOString().slice(0, 10)).to.equal("2026-07-11");

		const unided = parseDeductionMassUploadRow({
			DEDCODE: "UNIDED",
			Amount: 100.8,
			Payment: 100.8,
			EmployeeID: "01500",
			EmployeeName: "Sample",
			StartPayment: "2026-07-11",
		});
		expect(unided.ok).to.equal(true);
		if (!unided.ok) return;
		expect(unided.kind).to.equal("benefit");
		expect(unided.benefitCode).to.equal("UNIDED");
	});
});
