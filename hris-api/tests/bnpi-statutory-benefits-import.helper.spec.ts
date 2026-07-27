import { expect } from "chai";
import * as XLSX from "xlsx";
import {
	detectStatutoryBenefitsWorkbook,
	isStatutoryBenefitsHeaderRow,
	parseStatutoryBenefitsWorkbook,
	parseStatutorySheetStartDate,
	resolveStatutoryPeriodPayment,
} from "../helper/bnpi-statutory-benefits-import.helper";

function buildStatutoryWorkbookBuffer(params?: {
	sheetName?: string;
	rows?: unknown[][];
}): Buffer {
	const sheetName = params?.sheetName || "2026 April";
	const rows =
		params?.rows ||
		([
			[
				"No.",
				"Emp. No.",
				"Emp. No.",
				"Employee Name",
				"Section",
				"Category",
				"SSS No.",
				"",
				"SSS EE",
				"SSS ER",
				"SSS EC",
				"Total",
				"PHIC EE",
				"PHIC ER",
				"Total",
				"HDMF EE",
				"HDMF ER",
				"Total",
				"SSS Loan 15th",
				"SSS Loan 30th",
				"Total",
				"",
				"",
				"HDMF Loan 15th",
				"HDMF Loan 30th",
				"Total",
				"",
				"",
				"SSS Calamity 15th",
				"SSS Calamity 30th",
				"Total",
				"HDMF Calamity 15th",
				"HDMF Calamity 30th",
				"Total",
				"HDMF MP2\n15th",
				"HDMF MP2\n30th",
				"Total",
				"",
				"",
				"SSS LRP\n15th",
				"SSS LRP\n30th",
				"Total",
			],
			[
				1,
				"00032",
				32,
				"Llarena, Ivy Sheena T.",
				"Production Planning",
				"Indirect Labor",
				"04-2334316-6",
				"",
				900,
				1800,
				30,
				2730,
				380,
				380,
				760,
				200,
				200,
				400,
				904.54,
				904.54,
				1809.08,
				"",
				"",
				1162.29,
				1162.29,
				2324.58,
				"",
				"",
				447.73,
				447.73,
				895.46,
				164.06,
				164.06,
				328.12,
				0,
				0,
				0,
				"",
				"",
				0,
				0,
				0,
			],
			[
				2,
				"00021",
				21,
				"Salud, Arvin M.",
				"Administration",
				"Indirect Labor",
				"33-2560937-4",
				"",
				1750,
				3500,
				30,
				5280,
				2125,
				2125,
				4250,
				200,
				200,
				400,
				0,
				0,
				0,
				"",
				"",
				0,
				0,
				0,
				"",
				"",
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				"",
				"",
				0,
				0,
				0,
			],
		] as unknown[][]);

	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.aoa_to_sheet(rows);
	XLSX.utils.book_append_sheet(wb, ws, sheetName);
	return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("BNPI statutory benefits import helper", () => {
	it("detects statutory header rows", () => {
		expect(
			isStatutoryBenefitsHeaderRow([
				"Emp. No.",
				"Employee Name",
				"SSS EE",
				"PHIC EE",
				"HDMF EE",
				"SSS Loan 15th",
			]),
		).to.equal(true);
		expect(isStatutoryBenefitsHeaderRow(["COMCODE", "Amount", "EmployeeID"])).to.equal(false);
	});

	it("resolves per-cutoff payment preferring 15th then 30th", () => {
		expect(resolveStatutoryPeriodPayment(904.54, 904.54)).to.equal(904.54);
		expect(resolveStatutoryPeriodPayment(0, 500)).to.equal(500);
		expect(resolveStatutoryPeriodPayment(100, 200)).to.equal(100);
		expect(resolveStatutoryPeriodPayment(0, 0)).to.equal(0);
	});

	it("parses sheet start dates from month names", () => {
		expect(parseStatutorySheetStartDate("2026 April").toISOString().slice(0, 10)).to.equal(
			"2026-04-01",
		);
		expect(parseStatutorySheetStartDate("2024 December").toISOString().slice(0, 10)).to.equal(
			"2024-12-01",
		);
	});

	it("parses loan deduction rows from a statutory workbook and skips contribution-only employees", () => {
		const buffer = buildStatutoryWorkbookBuffer();
		expect(detectStatutoryBenefitsWorkbook(buffer)).to.equal(true);

		const parsed = parseStatutoryBenefitsWorkbook(buffer);
		expect(parsed.sheetName).to.equal("2026 April");
		expect(parsed.startDate.toISOString().slice(0, 10)).to.equal("2026-04-01");
		expect(parsed.contributionOnlyEmployees).to.equal(1);

		const byFamily = new Map(parsed.deductionRows.map((r) => [r.family, r]));
		expect(byFamily.has("SSS_SALARY_LOAN")).to.equal(true);
		expect(byFamily.get("SSS_SALARY_LOAN")?.employeeId).to.equal("00032");
		expect(byFamily.get("SSS_SALARY_LOAN")?.paymentAmount).to.equal(904.54);
		expect(byFamily.get("SSS_SALARY_LOAN")?.kind).to.equal("loan");
		expect(byFamily.get("SSS_SALARY_LOAN")?.loanTypeName).to.equal("SSS Salary Loan");

		expect(byFamily.get("HDMF_SALARY_LOAN")?.paymentAmount).to.equal(1162.29);
		expect(byFamily.get("SSS_CALAMITY")?.paymentAmount).to.equal(447.73);
		expect(byFamily.get("HDMF_CALAMITY")?.paymentAmount).to.equal(164.06);

		// Contribution-only Salud should not create SSS EE benefit rows.
		expect(parsed.deductionRows.every((r) => r.employeeId !== "00021")).to.equal(true);
	});

	it("maps HDMF MP2 to benefit deduction code MHDMF2", () => {
		const buffer = buildStatutoryWorkbookBuffer({
			rows: [
				[
					"Emp. No.",
					"Employee Name",
					"HDMF MP2 15th",
					"HDMF MP2 30th",
				],
				["00104", "Atienza, Maria Cristina H.", 2500, 2500],
			],
		});
		const parsed = parseStatutoryBenefitsWorkbook(buffer);
		expect(parsed.deductionRows).to.have.length(1);
		expect(parsed.deductionRows[0].family).to.equal("HDMF_MP2");
		expect(parsed.deductionRows[0].kind).to.equal("benefit");
		expect(parsed.deductionRows[0].benefitCode).to.equal("MHDMF2");
		expect(parsed.deductionRows[0].paymentAmount).to.equal(2500);
	});
});
