import { expect } from "chai";
import {
	aggregateCompensationMassUploadRowsByEmployeeCodeStart,
	COMPENSATION_CODE_LABELS,
	COMPENSATION_CODE_PAYROLL_ROLES,
	detectMassUploadKindFromHeaders,
	loanTypeNameToDeductionCode,
	parseCompensationMassUploadRow,
	parseDeductionMassUploadRow,
	resolveBandaiLoanEndDate,
	resolveBandaiMassUploadLoanTermMonths,
	resolveCompensationCodePayrollRole,
	resolveDeductionCodePayrollRole,
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

	it("sums multi-row ABS for same employee + StartPayDate (not last-write-wins)", () => {
		const start = new Date("2026-06-26T00:00:00.000Z");
		const summed = aggregateCompensationMassUploadRowsByEmployeeCodeStart([
			{ rowNumber: 10, employeeId: "01660", code: "ABS", amount: 600, startDate: start },
			{ rowNumber: 20, employeeId: "01660", code: "ABS", amount: 1800, startDate: start },
			{ rowNumber: 30, employeeId: "01660", code: "ARP", amount: 500, startDate: start },
		]);
		expect(summed).to.have.length(2);
		const abs = summed.find((r) => r.code === "ABS");
		const arp = summed.find((r) => r.code === "ARP");
		expect(abs?.amount).to.equal(2400);
		expect(abs?.sourceRowNumbers).to.deep.equal([10, 20]);
		expect(arp?.amount).to.equal(500);
	});

	it("maps loan type names to DEDCODE for payroll source details", () => {
		expect(loanTypeNameToDeductionCode("SSS Calamity Loan")).to.equal("SSSCALLN");
		expect(loanTypeNameToDeductionCode("HDMF Salary Loan")).to.equal("HDMFSALLN");
		expect(loanTypeNameToDeductionCode("RCBC Loan")).to.equal("RCBCLN");
	});

	it("loan term ignores maxTermMonths=1 and floors at 24 multi-cutoff months", () => {
		const term = resolveBandaiMassUploadLoanTermMonths({
			maxTermMonths: 1,
			principalAmount: 40000,
			paymentAmount: 904.54,
		});
		// ~45 cutoffs / 2 ≈ 23 months, floor 24
		expect(term).to.be.at.least(24);
		expect(term).to.equal(24);
	});

	it("loan term grows with principal/payment when longer than floor", () => {
		const term = resolveBandaiMassUploadLoanTermMonths({
			maxTermMonths: 1,
			principalAmount: 100000,
			paymentAmount: 1000,
		});
		// 100 cutoffs / 2 = 50 months
		expect(term).to.equal(50);
	});

	it("loan endDate never shrinks below existing later end", () => {
		const start = new Date("2026-04-26T00:00:00.000Z");
		const existing = new Date("2028-04-26T00:00:00.000Z");
		const end = resolveBandaiLoanEndDate({
			startDate: start,
			termMonths: 1,
			existingEndDate: existing,
		});
		expect(end.toISOString().slice(0, 10)).to.equal("2028-04-26");
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

	it("wires known compensation COMCODEs to payroll reconciliation actions", () => {
		// Critical cut codes that previously imported as display-only (empty recon).
		expect(resolveCompensationCodePayrollRole("ARP")).to.deep.equal({
			reconciliationAction: "RECEIVABLE_ONLY",
			isTaxable: true,
		});
		// Client COMCODE ABS = Adjustment Basic → gross-included adjustment.
		expect(resolveCompensationCodePayrollRole("abs")).to.deep.equal({
			reconciliationAction: "GROSS_INCLUDED",
			isTaxable: true,
		});
		expect(COMPENSATION_CODE_LABELS.ABS).to.equal("Adjustment Basic");
		expect(resolveCompensationCodePayrollRole("OBA")?.reconciliationAction).to.equal(
			"GROSS_INCLUDED",
		);
		expect(resolveCompensationCodePayrollRole("AON")?.reconciliationAction).to.equal(
			"GROSS_INCLUDED",
		);
		expect(resolveCompensationCodePayrollRole("PFA")?.reconciliationAction).to.equal(
			"RECEIVABLE_ONLY",
		);
		expect(resolveCompensationCodePayrollRole("UNKNOWN_CODE")).to.equal(null);

		// Every labeled COMCODE must have an explicit payroll role so mass upload never
		// creates empty reconciliationAction for known BNPI codes.
		for (const code of Object.keys(COMPENSATION_CODE_LABELS)) {
			expect(
				COMPENSATION_CODE_PAYROLL_ROLES[code],
				`missing payroll role for COMCODE ${code}`,
			).to.exist;
		}
	});

	it("defaults unknown deduction benefit codes to DEDUCTION recon", () => {
		expect(resolveDeductionCodePayrollRole("MHDMF2")).to.deep.equal({
			reconciliationAction: "DEDUCTION",
			isTaxable: false,
		});
		expect(resolveDeductionCodePayrollRole("CUSTOM_DED")).to.deep.equal({
			reconciliationAction: "DEDUCTION",
			isTaxable: false,
		});
	});
});
