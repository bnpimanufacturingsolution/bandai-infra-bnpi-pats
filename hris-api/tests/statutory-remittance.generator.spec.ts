/**
 * SSS R-3 + Pag-ibig MF math pins (spec gap M5.1/5.2 completion).
 */
import { expect } from "chai";
import { describe, it } from "mocha";
import {
	buildSssR3Row,
	summarizeSssR3,
	buildPagibigMfRow,
	summarizePagibigMf,
} from "../helper/statutory-remittance.generator";

describe("statutory-remittance.generator", () => {
	it("SSS: uses the bracket split when the stored total matches the bracket", () => {
		const row = buildSssR3Row({
			employeeCode: "00010",
			personalInfo: { firstName: "Zen", lastName: "Andrei" },
			sssNo: "34-1234567-8",
			basicSalary: 15500,
			contribution: 1350,
		});
		expect(row.employeeShare + row.employerShare + row.ec).to.equal(row.total);
		expect(row.total).to.equal(1350);
	});

	it("SSS: scales the bracket split proportionally when register differs", () => {
		const row = buildSssR3Row({
			employeeCode: "00147",
			basicSalary: 15500,
			contribution: 675,
		});
		expect(row.employeeShare + row.employerShare + row.ec).to.equal(675);
	});

	it("Pag-ibig: splits the stored remittance 50/50 member/employer", () => {
		const row = buildPagibigMfRow({
			employeeCode: "00269",
			pagibigNo: "1234-5678-9012",
			basicSalary: 20000,
			contribution: 200,
		});
		expect(row.employeeShare).to.equal(100);
		expect(row.employerShare).to.equal(100);
		expect(row.total).to.equal(200);
		expect(row.pagibigNo).to.equal("1234-5678-9012");
	});

	it("summaries keep missing-number counts honest", () => {
		const sss = summarizeSssR3([
			buildSssR3Row({ employeeCode: "1", sssNo: "X", basicSalary: 15500, contribution: 1350 }),
			buildSssR3Row({ employeeCode: "2", basicSalary: 10000, contribution: 900 }),
		]);
		expect(sss.missingSssNo).to.equal(1);
		expect(sss.total).to.equal(2250);

		const mf = summarizePagibigMf([
			buildPagibigMfRow({ employeeCode: "1", contribution: 200 }),
			buildPagibigMfRow({ employeeCode: "2", contribution: 300 }),
		]);
		expect(mf.total).to.equal(500);
		expect(mf.totalEmployeeShare).to.equal(250);
	});
});
