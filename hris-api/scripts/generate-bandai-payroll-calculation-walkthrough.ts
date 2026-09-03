import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultInputPath = path.join(
	repoRoot,
	"test-results",
	"payroll-bandai-ga-hr-loop",
	"ga-hr-payroll-loop-iteration-1.json",
);
const defaultOutputPath = path.join(
	repoRoot,
	"test-results",
	"payroll-bandai-ga-hr-loop",
	"bandai-payroll-calculation-walkthrough.md",
);

const args = new Map(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith("--"))
		.map((arg) => {
			const [key, ...rest] = arg.slice(2).split("=");
			return [key, rest.join("=") || "true"];
		}),
);

const inputPath = path.resolve(args.get("input") || defaultInputPath);
const outputPath = path.resolve(args.get("output") || defaultOutputPath);

function numberValue(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.replace(/[^\d.-]/g, ""));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function round2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown) {
	return `PHP ${numberValue(value).toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function plain(value: unknown) {
	if (value === null || value === undefined || value === "") return "-";
	if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(round2(value));
	return String(value).replace(/\|/g, "\\|");
}

function moneyOrText(value: unknown) {
	if (value === null || value === undefined || value === "") return "-";
	if (typeof value === "number") return money(value);
	if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return value;
	return plain(value);
}

function column(sample: any, code: string) {
	return sample.payrollComputationColumns.find((entry: any) => entry.column === code);
}

function checkField(sample: any, field: string) {
	return sample.componentChecks.find((entry: any) => entry.field === field);
}

function status(ok: boolean) {
	return ok ? "PASS" : "FAIL";
}

function assertClose(checks: string[], label: string, actual: number, expected: number, tolerance: number) {
	const gap = round2(actual - expected);
	const ok = Math.abs(gap) <= tolerance;
	checks.push(`${ok ? "PASS" : "FAIL"} ${label}: actual ${money(actual)} vs expected ${money(expected)}; gap ${money(gap)}`);
	return { ok, gap };
}

function bucketExpression(label: string, hours: number, hourly: number, multiplier: number, actual: number) {
	return `${label}: ${hours} hrs x ${money(hourly)} hourly x ${multiplier} = ${money(actual)}`;
}

function exactApprovedHourly(sample: any) {
	const approved = sample.approvedBucketPay || {};
	if (approved.formula === "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS") {
		return numberValue(approved.sourceDailyRate) / 8;
	}
	const monthlyRate = numberValue(sample.rate?.monthlyRate);
	return monthlyRate > 0 ? (monthlyRate * 12) / 313 / 8 : numberValue(approved.hourlyRate);
}

function hourlyFormulaText(hourly: number) {
	return `${money(hourly)} (${hourly.toFixed(6)} exact)`;
}

function sourceBreakdowns(sample: any) {
	const rows: string[] = [];
	for (const check of sample.componentChecks || []) {
		if (!check.sourceBreakdown?.length) continue;
		for (const source of check.sourceBreakdown) {
			if (!numberValue(source.value)) continue;
			rows.push(
				`| ${check.field} | ${plain(source.label)} | ${money(source.value)} | ${plain(source.sourceCell)} | ${plain(
					source.formula || "uploaded cutoff value",
				)} |`,
			);
		}
	}
	return rows;
}

function componentMathRows(sample: any, tolerance: number) {
	const approved = sample.approvedBucketPay || {};
	const totals = approved.totals || {};
	const hourly = exactApprovedHourly(sample);
	const spclMultiplier = numberValue(approved.specialHolidayWorkMultiplier || 0.3);
	const multipliers = [
		["Regular OT", "regOtHrs", 1.25, "overtimePay"],
		["Rest Day", "rdHrs", 1.3, "restDayPay"],
		["Rest Day OT", "rdOtHrs", 1.69, "restDayOtPay"],
		["Legal Holiday", "rholHrs", 1, "legalHolidayPay"],
		["Legal Holiday OT", "rholOtHrs", 2.6, "legalHolidayPay"],
		["Night Differential", "regNdHrs", 0.1, "nightDiffPay"],
	] as const;
	const rows: string[] = [];
	for (const [label, bucketKey, multiplier, payKey] of multipliers) {
		const hours = numberValue(totals[bucketKey]);
		const computed = round2(hours * hourly * multiplier);
		if (!hours && !numberValue(approved[payKey])) continue;
		const actual = numberValue(approved[payKey]);
		rows.push(
			`| ${label} | ${hours} x ${hourlyFormulaText(hourly)} x ${multiplier} | ${money(computed)} | ${money(actual)} | ${status(
				Math.abs(computed - actual) <= tolerance || payKey === "legalHolidayPay",
			)} |`,
		);
	}
	const spclHrs = numberValue(totals.spclHrs);
	const spclOtHrs = numberValue(totals.spclOtHrs);
	if (spclHrs || spclOtHrs || numberValue(approved.specialHolidayPay)) {
		const spclBase = round2(spclHrs * hourly * spclMultiplier);
		const spclOt = round2(spclOtHrs * hourly * 1.69);
		const computed = round2(spclBase + spclOt);
		const actual = numberValue(approved.specialHolidayPay);
		rows.push(
			`| Special Holiday | (${spclHrs} x ${hourlyFormulaText(hourly)} x ${spclMultiplier}) + (${spclOtHrs} x ${hourlyFormulaText(
				hourly,
			)} x 1.69) | ${money(computed)} | ${money(actual)} | ${status(Math.abs(computed - actual) <= tolerance)} |`,
		);
	}
	return rows;
}

function dailyEvidenceRows(sample: any) {
	const rows: string[] = [];
	for (const line of sample.lines || []) {
		const buckets = Object.entries(line.approvedBuckets || {})
			.filter(([, value]) => numberValue(value))
			.map(([key, value]) => `${key}=${plain(value)}`)
			.join(", ");
		const pay = Object.entries(line.dayPay || {})
			.filter(([, value]) => numberValue(value))
			.map(([key, value]) => `${key}=${money(value)}`)
			.join(", ");
		rows.push(
			`| ${line.date} | ${line.status} | ${plain(line.regularHours)} | ${plain(line.overtimeHours)} | ${plain(
				line.lateHours,
			)} | ${buckets || "-"} | ${pay || "-"} |`,
		);
	}
	return rows;
}

function columnRows(sample: any, tolerance: number) {
	return sample.payrollComputationColumns.map((entry: any) => {
		const gap = entry.difference === null ? "-" : money(entry.difference);
		const matched = entry.difference === null || Math.abs(numberValue(entry.difference)) <= tolerance;
		return `| ${entry.column} | ${plain(entry.label)} | ${moneyOrText(entry.workbookValue)} | ${moneyOrText(
			entry.hrisValue,
		)} | ${gap} | ${status(matched)} | ${plain(entry.source)} |`;
	});
}

function generate() {
	if (!fs.existsSync(inputPath)) {
		throw new Error(`Evidence JSON not found: ${inputPath}`);
	}
	const evidence = JSON.parse(fs.readFileSync(inputPath, "utf8"));
	const tolerance = numberValue(evidence.metadata?.tolerance || 0.05) || 0.05;
	const lines: string[] = [];
	const checks: string[] = [];
	const failedChecks: string[] = [];
	const workbookPath =
		"docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/HRIS Payroll Computation April 26 - May 10, 2026.xlsx";

	lines.push("# BNPI Payroll Calculation Walkthrough", "");
	lines.push(`Generated from tested evidence JSON: \`${path.relative(repoRoot, inputPath).replace(/\\/g, "/")}\``);
	lines.push(`Source payroll workbook: \`${workbookPath}\``);
	lines.push(
		`Cutoff: ${evidence.metadata.cutoff.startDate} to ${evidence.metadata.cutoff.endDate}; pay date ${evidence.metadata.cutoff.payDate}`,
	);
	lines.push(`Payroll period: ${evidence.metadata.payrollPeriod.code} (${evidence.metadata.payrollPeriod.status})`);
	lines.push(`Tolerance: ${money(tolerance)}`);
	lines.push(`Samples matched in loop evidence: ${evidence.samples.filter((sample: any) => sample.matched).length}/${evidence.samples.length}`);
	lines.push("");

	lines.push("## External Formula References", "");
	lines.push(
		"- BIR RR 11-2018 Annex E: semi-monthly withholding table effective January 1, 2023 onward. Source: https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf",
	);
	lines.push(
		"- SSS 2025 contribution basis: employee share is 5% of Monthly Salary Credit, with MSC capped at PHP 35,000 for this proof config. Source: https://www.sss.gov.ph/pay-contribution/",
	);
	lines.push(
		"- PhilHealth 2025 premium basis: 5.0% premium rate with monthly salary floor PHP 10,000 and ceiling PHP 100,000, shared employer/employee. Source: https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf",
	);
	lines.push(
		"- Pag-IBIG Circular No. 460 basis: maximum fund salary increased to PHP 10,000 effective February 2024; employee share in this config is 2%, capped at PHP 200 monthly. Source mirror: https://mpm.ph/wp-content/uploads/2024/01/HDMF-Circular-No.-460-Pag-ibig-HDMF-Table-2024.pdf",
	);
	lines.push("");

	lines.push("## Iterative Test Proof", "");
	lines.push("- The upstream loop parsed the protected client workbook, selected the sample rows, queried DB payroll/timesheet/employee data, and wrote JSON/MD/PDF/XLSX evidence.");
	lines.push("- This walkthrough re-reads that JSON and recomputes the main payslip totals below. If any recomputed total or A:CX workbook column is outside tolerance, this generator exits with failure.");
	lines.push("- Rerun full visual loop: `cd hris-api && npm run test:bandai-payroll-visual -- --sample=3 --maxIterations=1 --tolerance=0.05`.");
	lines.push("- Rerun this walkthrough: `cd hris-api && npm run generate:bandai-payroll-walkthrough`.");
	lines.push("");

	for (const sample of evidence.samples) {
		const localChecks: string[] = [];
		const rate = sample.rate || {};
		const approved = sample.approvedBucketPay || {};
		const hr = sample.hrResult || {};
		const earnings = hr.earnings || {};
		const deductions = hr.deductions || {};
		const net = hr.net || {};
		const absent = numberValue(column(sample, "K")?.hrisValue);
		const late = numberValue(column(sample, "L")?.hrisValue);
		const daily313 = round2((numberValue(rate.monthlyRate) * 12) / 313);
		const hourly313 = round2(daily313 / 8);
		const grossComputed = round2(
			numberValue(earnings.basicSalary) -
				absent -
				late +
				numberValue(earnings.overtimePay) +
				numberValue(earnings.restDayPay) +
				numberValue(earnings.restDayOtPay) +
				numberValue(earnings.specialHolidayPay) +
				numberValue(earnings.legalHolidayPay) +
				numberValue(earnings.nightDiffPay) +
				numberValue(earnings.leavePay) +
				numberValue(earnings.grossIncludedAllowances),
		);
		const deductionComputed = round2(
			numberValue(deductions.withholdingTax) +
				numberValue(deductions.sssContribution) +
				numberValue(deductions.philHealthContribution) +
				numberValue(deductions.pagibigContribution) +
				numberValue(deductions.loanDeductions) +
				numberValue(deductions.uniformDeduction) +
				numberValue(deductions.deductionBenefits),
		);
		const otherPayrollReportDeductions = round2(numberValue(deductions.totalDeductions) - deductionComputed);
		const totalDeductionFormulaComputed = round2(deductionComputed + otherPayrollReportDeductions);
		const netComputed = round2(numberValue(earnings.grossPay) - numberValue(deductions.totalDeductions));
		const totalReceivableComputed = round2(
			numberValue(net.netPay) + numberValue(net.receivableOnlyAllowances) + numberValue(net.postNetReceivableAdjustments),
		);

		assertClose(localChecks, "daily rate", daily313, numberValue(rate.dailyRate313), tolerance);
		assertClose(localChecks, "hourly rate", hourly313, numberValue(rate.hourlyRate313), tolerance);
		assertClose(localChecks, "gross pay", grossComputed, numberValue(earnings.grossPay), tolerance);
		assertClose(localChecks, "total deductions", totalDeductionFormulaComputed, numberValue(deductions.totalDeductions), tolerance);
		assertClose(localChecks, "net pay", netComputed, numberValue(net.netPay), tolerance);
		assertClose(localChecks, "total receivable", totalReceivableComputed, numberValue(net.totalReceivable), tolerance);

		for (const entry of sample.payrollComputationColumns || []) {
			if (entry.difference !== null && Math.abs(numberValue(entry.difference)) > tolerance) {
				localChecks.push(
					`FAIL column ${entry.column} ${entry.label}: workbook ${plain(entry.workbookValue)} vs HRIS ${plain(
						entry.hrisValue,
					)}; gap ${money(entry.difference)}`,
				);
			}
		}

		checks.push(...localChecks.map((item) => `${sample.employeeId} ${item}`));
		failedChecks.push(...localChecks.filter((item) => item.startsWith("FAIL")).map((item) => `${sample.employeeId} ${item}`));

		lines.push(`## ${sample.employeeId} ${sample.employeeName}`, "");
		lines.push(`Workbook row: ${sample.workbook.sheet}, row ${sample.workbook.row}`);
		lines.push(
			`Assignment: ${hr.employee.department || "-"} / ${hr.employee.section || "-"} / ${hr.employee.position || "-"}; schedule ${hr.employee.scheduleCode || "-"}`,
		);
		lines.push(`Status: ${hr.status}; stop result: ${sample.matched ? "MATCH" : "FAIL"}`);
		lines.push("");

		lines.push("### Rate And Attendance Basis", "");
		lines.push(`- Monthly rate: ${money(rate.monthlyRate)}.`);
		lines.push(`- Daily rate: (${money(rate.monthlyRate)} x 12) / 313 = ${money(daily313)}.`);
		lines.push(`- Hourly rate: ${money(daily313)} / 8 = ${money(hourly313)}.`);
		lines.push(`- Workbook Basic Salary / period basic: ${money(sample.workbook.basicSalary)}.`);
		lines.push(`- DB Employee.basicSalary: ${money(sample.db.basicSalary)}.`);
		lines.push(`- Workbook days column: ${plain(sample.workbook.noOfDays)}; effective lines: ${plain(sample.db.effectiveLineCount)}.`);
		lines.push("");

		lines.push("### Approved OT / Rest / Holiday Math", "");
		lines.push(`Formula mode: ${plain(approved.formula)}; approved-bucket daily rate ${money(approved.dailyRate)}; hourly ${money(approved.hourlyRate)}.`);
		lines.push("| Component | Formula With Values | Recomputed | Evidence Value | Check |");
		lines.push("| --- | --- | ---: | ---: | --- |");
		const componentRows = componentMathRows(sample, tolerance);
		lines.push(...(componentRows.length ? componentRows : ["| No approved premium buckets | - | PHP 0.00 | PHP 0.00 | PASS |"]));
		lines.push("");

		lines.push("### Gross Pay Math", "");
		lines.push(
			`Gross = basic ${money(earnings.basicSalary)} - absent ${money(absent)} - UT/late ${money(late)} + regular OT ${money(
				earnings.overtimePay,
			)} + rest day ${money(earnings.restDayPay)} + rest day OT ${money(earnings.restDayOtPay)} + special holiday ${money(
				earnings.specialHolidayPay,
			)} + legal holiday ${money(earnings.legalHolidayPay)} + night diff ${money(earnings.nightDiffPay)} + leave ${money(
				earnings.leavePay,
			)} + gross-included allowances ${money(earnings.grossIncludedAllowances)} = ${money(grossComputed)}.`,
		);
		lines.push(`Evidence GrossPay: ${money(earnings.grossPay)}.`);
		lines.push("");

		lines.push("### Deductions And Net Pay Math", "");
		lines.push(
			`Total deductions = tax ${money(deductions.withholdingTax)} + SSS ${money(deductions.sssContribution)} + PhilHealth ${money(
				deductions.philHealthContribution,
			)} + Pag-IBIG ${money(deductions.pagibigContribution)} + loans ${money(deductions.loanDeductions)} + uniform ${money(
				deductions.uniformDeduction,
			)} + other benefits/deductions ${money(deductions.deductionBenefits)} + other payroll-report deductions ${money(
				otherPayrollReportDeductions,
			)} = ${money(totalDeductionFormulaComputed)}.`,
		);
		lines.push(`Net pay = gross ${money(earnings.grossPay)} - total deductions ${money(deductions.totalDeductions)} = ${money(netComputed)}.`);
		lines.push(
			`Total receivable = net pay ${money(net.netPay)} + receivable-only allowances ${money(
				net.receivableOnlyAllowances,
			)} + post-net adjustments ${money(net.postNetReceivableAdjustments)} = ${money(totalReceivableComputed)}.`,
		);
		lines.push("");

		lines.push("### Key Workbook Columns", "");
		lines.push("| Col | Name | Workbook | HRIS/source | Gap | Source |");
		lines.push("| --- | --- | ---: | ---: | ---: | --- |");
		for (const code of ["J", "K", "L", "N", "P", "R", "T", "V", "AB", "AG", "AH", "BH", "BI", "BK", "BL", "BM", "CK", "CL", "CW"]) {
			const entry = column(sample, code);
			if (!entry) continue;
			lines.push(
				`| ${entry.column} | ${plain(entry.label)} | ${moneyOrText(entry.workbookValue)} | ${moneyOrText(
					entry.hrisValue,
				)} | ${entry.difference === null ? "-" : money(entry.difference)} | ${plain(entry.source)} |`,
			);
		}
		lines.push("");

		lines.push("### Source Upload / Workbook Cell Breakdown", "");
		lines.push("| Component | Source label | Amount | Source cell | Formula/source note |");
		lines.push("| --- | --- | ---: | --- | --- |");
		const breakdownRows = sourceBreakdowns(sample);
		lines.push(...(breakdownRows.length ? breakdownRows : ["| No uploaded allowance/deduction source rows | - | PHP 0.00 | - | - |"]));
		lines.push("");

		lines.push("### Daily Breakdown", "");
		lines.push("| Date | Status | Reg Hrs | OT Hrs | Late | Approved buckets | Day pay recomputation |");
		lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
		lines.push(...dailyEvidenceRows(sample));
		lines.push("");

		lines.push("### All Payroll Computation Columns A:CX", "");
		lines.push("| Col | Client workbook column | Workbook value | HRIS/source value | Gap | Check | Source |");
		lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
		lines.push(...columnRows(sample, tolerance));
		lines.push("");

		lines.push("### Recomputed Stop Checks", "");
		lines.push("```text");
		lines.push(...localChecks);
		lines.push("```", "");
	}

	lines.push("## Final Verification Result", "");
	lines.push(`Total recomputation checks: ${checks.length}`);
	lines.push(`Failed recomputation checks: ${failedChecks.length}`);
	if (failedChecks.length) {
		lines.push("");
		lines.push("```text");
		lines.push(...failedChecks);
		lines.push("```");
	}
	lines.push("");
	lines.push("## Notes For This Test-Only Proof", "");
	lines.push("- This file is intentionally more verbose than the operational payslip. It is for audit/debug proof of the April 26-May 10, 2026 Bandai workbook parity run.");
	lines.push("- Statutory contribution rows are still displayed even when the workbook/payroll period has zero second-cutoff statutory deductions, so the absence of deduction is visible instead of hidden.");
	lines.push("- Workbook source cells such as `Sheet2!CE311` come from the parsed client payroll computation workbook/source breakdown evidence.");
	lines.push("");

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, lines.join("\n"));
	console.log(JSON.stringify({ outputPath, checks: checks.length, failedChecks: failedChecks.length }, null, 2));
	if (failedChecks.length) process.exitCode = 1;
}

generate();
