import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { isOpenHorizonCompensationCode } from "../helper/bnpi-mass-upload-import.helper";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");

type CsvRow = Record<string, string>;

const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};

const parseCsv = (filePath: string): CsvRow[] => {
	const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];
		if (quoted) {
			if (char === '"' && next === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				cell += char;
			}
			continue;
		}
		if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\n") {
			row.push(cell.replace(/\r$/, ""));
			rows.push(row);
			row = [];
			cell = "";
		} else {
			cell += char;
		}
	}
	if (cell || row.length) {
		row.push(cell.replace(/\r$/, ""));
		rows.push(row);
	}

	const [headers = [], ...dataRows] = rows;
	return dataRows
		.filter((values) => values.some((value) => value.trim()))
		.map((values) =>
			headers.reduce<CsvRow>((record, header, index) => {
				record[header.trim().toUpperCase()] = values[index]?.trim() || "";
				return record;
			}, {}),
		);
};

const toBool = (value: string, fallback = false) => {
	if (!value) return fallback;
	return ["TRUE", "YES", "Y", "1"].includes(value.trim().toUpperCase());
};

const toNumber = (value: string, fallback?: number) => {
	if (!value) return fallback;
	const parsed = Number(String(value).replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const dateKey = (startDate: Date, endDate: Date) =>
	`${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}`;

async function main() {
	const execute = process.argv.includes("--execute");
	const organizationCode = readArg("--orgCode", "bnei");
	const benefitTypesPath = path.resolve(readArg("--benefitTypes", path.join(repoRoot, "data", "import", "benefit-types-import.csv"))!);
	const employeeBenefitsPath = path.resolve(readArg("--employeeBenefits", path.join(repoRoot, "data", "import", "employee-benefits-loans-import.csv"))!);
	const loanTypesPath = path.resolve(readArg("--loanTypes", path.join(repoRoot, "data", "import", "loan-types-import.csv"))!);

	const organization = await prisma.organization.findUnique({
		where: { code: organizationCode! },
		select: { id: true, code: true, name: true },
	});
	if (!organization) throw new Error(`Organization code ${organizationCode} was not found.`);

	const benefitTypeRows = parseCsv(benefitTypesPath);
	const employeeBenefitLoanRows = parseCsv(employeeBenefitsPath);
	const employeeBenefitRows = employeeBenefitLoanRows.filter((row) => row.TYPE.toUpperCase() === "BENEFIT");
	const employeeLoanRows = employeeBenefitLoanRows.filter((row) => row.TYPE.toUpperCase() === "LOAN");
	const loanTypeRows = fs.existsSync(loanTypesPath) ? parseCsv(loanTypesPath) : [];
	const benefitCodes = Array.from(new Set(benefitTypeRows.map((row) => row.CODE).filter(Boolean)));
	const loanTypeNames = Array.from(new Set(loanTypeRows.map((row) => row.NAME).filter(Boolean)));
	const employeeIds = Array.from(
		new Set(employeeBenefitLoanRows.map((row) => row.EMP_ID).filter(Boolean)),
	);

	const [existingBenefitTypes, existingLoanTypes, employees] = await Promise.all([
		prisma.benefitType.findMany({
			where: { organizationId: organization.id, code: { in: benefitCodes } },
			select: { id: true, code: true, name: true, fixedAmount: true, isDeleted: true },
		}),
		(prisma as any).loanType.findMany({
			where: { organizationId: organization.id, name: { in: loanTypeNames } },
			select: { id: true, name: true, isDeleted: true },
		}),
		prisma.employee.findMany({
			where: { organizationId: organization.id, employeeId: { in: employeeIds }, isDeleted: false },
			select: { id: true, employeeId: true },
		}),
	]);

	const benefitTypeByCode = new Map(existingBenefitTypes.map((benefitType) => [benefitType.code.toUpperCase(), benefitType]));
	const loanTypeByName = new Map(existingLoanTypes.map((loanType: any) => [loanType.name.toUpperCase(), loanType]));
	const employeeBySourceId = new Map(employees.map((employee) => [employee.employeeId, employee]));
	const missingEmployees = employeeIds.filter((employeeId) => !employeeBySourceId.has(employeeId));
	const benefitCreates = benefitTypeRows.filter((row) => row.CODE && !benefitTypeByCode.has(row.CODE.toUpperCase()));
	const benefitUpdates = benefitTypeRows.filter((row) => row.CODE && benefitTypeByCode.has(row.CODE.toUpperCase()));
	const loanTypeCreates = loanTypeRows.filter((row) => row.NAME && !loanTypeByName.has(row.NAME.toUpperCase()));
	const loanTypeUpdates = loanTypeRows.filter((row) => row.NAME && loanTypeByName.has(row.NAME.toUpperCase()));
	const missingBenefitCodes = Array.from(
		new Set(employeeBenefitRows.map((row) => row.CODE_OR_NAME).filter((code) => code && !benefitCodes.includes(code))),
	);
	const missingLoanTypeNames = Array.from(
		new Set(
			employeeLoanRows
				.map((row) => row.CODE_OR_NAME)
				.filter((name) => name && !loanTypeNames.includes(name)),
		),
	);

	let employeeBenefitCreates = 0;
	let employeeBenefitUpdates = 0;
	let employeeBenefitSkipped = 0;
	let employeeLoanCreates = 0;
	let employeeLoanUpdates = 0;
	let employeeLoanSkipped = 0;
	let staleEmployeeBenefits = 0;
	let staleEmployeeLoans = 0;
	const activeBenefitTypeByCode = new Map<string, { id: string; name: string }>();
	const activeLoanTypeByName = new Map<string, { id: string; name: string; interestRate?: number; maxTermMonths?: number }>();

	if (execute) {
		for (const row of benefitTypeRows) {
			if (!row.CODE || !row.NAME) continue;
			const payload = {
				organizationId: organization.id,
				code: row.CODE,
				name: row.NAME,
				category: row.CATEGORY || "OTHER",
				payrollDirection: row.PAYROLL_DIRECTION || "COMPENSATION",
				description: row.DESCRIPTION || null,
				isTaxable: toBool(row.IS_TAXABLE),
				isActive: toBool(row.IS_ACTIVE, true),
				isDefault: toBool(row.IS_DEFAULT),
				defaultInstallments: toNumber(row.DEFAULT_INSTALLMENTS, 1),
				payrollCycleDays: toNumber(row.PAYROLL_CYCLE_DAYS, 15),
				requireTermsAgreement: toBool(row.REQUIRE_TERMS_AGREEMENT, true),
				reconciliationAction: row.RECONCILIATION_ACTION || null,
				fixedAmount: toNumber(row.FIXED_AMOUNT),
				isDeleted: false,
			};
			await prisma.benefitType.upsert({
				where: { organizationId_code: { organizationId: organization.id, code: row.CODE } },
				update: payload as any,
				create: payload as any,
			});
		}

		for (const row of loanTypeRows) {
			if (!row.NAME) continue;
			const payload = {
				organizationId: organization.id,
				name: row.NAME,
				category: row.CATEGORY || "OTHER",
				description: row.DESCRIPTION || null,
				minAmount: toNumber(row.MIN_AMOUNT),
				maxAmount: toNumber(row.MAX_AMOUNT),
				interestRate: toNumber(row.INTEREST_RATE, 0) || 0,
				// BNPI loans recur across cutoffs; never seed 1-month types from workbook.
				maxTermMonths: Math.max(toNumber(row.MAX_TERM_MONTHS, 24) || 24, 24),
				minServiceMonths: toNumber(row.MIN_SERVICE_MONTHS),
				isActive: toBool(row.IS_ACTIVE, true),
				isDeleted: false,
			};
			await (prisma as any).loanType.upsert({
				where: { organizationId_name: { organizationId: organization.id, name: row.NAME } },
				update: payload,
				create: payload,
			});
		}
	}

	const refreshedBenefitTypes = await prisma.benefitType.findMany({
		where: { organizationId: organization.id, code: { in: Array.from(new Set(employeeBenefitRows.map((row) => row.CODE_OR_NAME))) }, isDeleted: false },
		select: { id: true, code: true, name: true },
	});
	const sourceBenefitTypesForStaleScan = await prisma.benefitType.findMany({
		where: { organizationId: organization.id, code: { in: benefitCodes }, isDeleted: false },
		select: { id: true, code: true, name: true },
	});
	const refreshedLoanTypes = await (prisma as any).loanType.findMany({
		where: {
			organizationId: organization.id,
			name: { in: Array.from(new Set(employeeLoanRows.map((row) => row.CODE_OR_NAME))) },
			isDeleted: false,
		},
		select: { id: true, name: true, interestRate: true, maxTermMonths: true },
	});
	for (const benefitType of refreshedBenefitTypes) {
		activeBenefitTypeByCode.set(benefitType.code.toUpperCase(), benefitType);
	}
	for (const loanType of refreshedLoanTypes) {
		activeLoanTypeByName.set(loanType.name.toUpperCase(), loanType);
	}

	const currentEmployeeBenefitKeys = new Set<string>();
	const currentEmployeeLoanKeys = new Set<string>();
	for (const row of employeeBenefitRows) {
		const employee = employeeBySourceId.get(row.EMP_ID);
		const benefitType = activeBenefitTypeByCode.get(row.CODE_OR_NAME.toUpperCase());
		const amount = toNumber(row.AMOUNT);
		if (!employee || !benefitType || amount == null) continue;
		currentEmployeeBenefitKeys.add(
			[employee.id, benefitType.id, toDate(row.START_DATE).toISOString(), toDate(row.END_DATE).toISOString()].join(":"),
		);
	}
	for (const row of employeeLoanRows) {
		const employee = employeeBySourceId.get(row.EMP_ID);
		const loanType = activeLoanTypeByName.get(row.CODE_OR_NAME.toUpperCase());
		const amount = toNumber(row.AMOUNT);
		if (!employee || !loanType || amount == null) continue;
		currentEmployeeLoanKeys.add(
			[employee.id, loanType.id, toDate(row.START_DATE).toISOString(), toDate(row.END_DATE).toISOString()].join(":"),
		);
	}

	const currentBenefitDatePairs = Array.from(
		new Map(employeeBenefitRows.map((row) => [`${row.START_DATE}:${row.END_DATE}`, { startDate: toDate(row.START_DATE), endDate: toDate(row.END_DATE) }])).values(),
	);
	const currentLoanDatePairs = Array.from(
		new Map(employeeLoanRows.map((row) => [`${row.START_DATE}:${row.END_DATE}`, { startDate: toDate(row.START_DATE), endDate: toDate(row.END_DATE) }])).values(),
	);
	const sourceBenefitTypeIds = sourceBenefitTypesForStaleScan.map((benefitType) => benefitType.id);
	const sourceLoanTypeIds = refreshedLoanTypes.map((loanType: any) => loanType.id);
	const payrollPeriodCodes = Array.from(
		new Set(employeeBenefitRows.map((row) => String(row.PAYROLL_PERIOD_CODE || "").trim()).filter(Boolean)),
	);
	const payrollPeriods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			OR: [
				...payrollPeriodCodes.map((code) => ({ code })),
				...currentBenefitDatePairs.map((pair) => ({
					startDate: pair.startDate,
					endDate: pair.endDate,
				})),
			],
		},
		select: { id: true, code: true, startDate: true, endDate: true },
	});
	const payrollPeriodByKey = new Map<string, (typeof payrollPeriods)[number]>();
	for (const payrollPeriod of payrollPeriods) {
		if (payrollPeriod.code) payrollPeriodByKey.set(payrollPeriod.code.toUpperCase(), payrollPeriod);
		payrollPeriodByKey.set(dateKey(payrollPeriod.startDate, payrollPeriod.endDate), payrollPeriod);
	}
	if (sourceBenefitTypeIds.length && currentBenefitDatePairs.length) {
		const existingSourceBenefits = await prisma.employeeBenefit.findMany({
			where: {
				organizationId: organization.id,
				benefitTypeId: { in: sourceBenefitTypeIds },
				isDeleted: false,
				OR: [
					{ notes: { contains: "BNPI payroll workbook" } },
					{ remarks: { contains: "BNPI payroll workbook" } },
				],
				AND: [
					{
						OR: currentBenefitDatePairs.map((pair) => ({
							startDate: pair.startDate,
							endDate: pair.endDate,
						})),
					},
				],
			},
			select: { id: true, employeeId: true, benefitTypeId: true, startDate: true, endDate: true, notes: true },
		});
		for (const existing of existingSourceBenefits) {
			const key = [existing.employeeId, existing.benefitTypeId, existing.startDate.toISOString(), existing.endDate.toISOString()].join(":");
			if (currentEmployeeBenefitKeys.has(key)) continue;
			staleEmployeeBenefits += 1;
			if (!execute) continue;
			await prisma.employeeBenefit.update({
				where: { id: existing.id },
				data: {
					isActive: false,
					isDeleted: true,
					notes: [existing.notes, "stale source row deactivated by apply-bandai-payroll-benefit-imports"].filter(Boolean).join(" | "),
				} as any,
			});
		}
	}
	if (sourceLoanTypeIds.length && currentLoanDatePairs.length) {
		const existingSourceLoans = await (prisma as any).employeeLoan.findMany({
			where: {
				organizationId: organization.id,
				loanTypeId: { in: sourceLoanTypeIds },
				isDeleted: false,
				notes: { contains: "BNPI payroll workbook" },
				AND: [
					{
						OR: currentLoanDatePairs.map((pair) => ({
							startDate: pair.startDate,
							endDate: pair.endDate,
						})),
					},
				],
			},
			select: { id: true, employeeId: true, loanTypeId: true, startDate: true, endDate: true, notes: true },
		});
		for (const existing of existingSourceLoans) {
			const key = [existing.employeeId, existing.loanTypeId, existing.startDate.toISOString(), existing.endDate.toISOString()].join(":");
			if (currentEmployeeLoanKeys.has(key)) continue;
			staleEmployeeLoans += 1;
			if (!execute) continue;
			await (prisma as any).employeeLoan.update({
				where: { id: existing.id },
				data: {
					isDeleted: true,
					notes: [existing.notes, "stale source row deactivated by apply-bandai-payroll-benefit-imports"].filter(Boolean).join(" | "),
				},
			});
		}
	}

	for (const row of employeeBenefitRows) {
		const employee = employeeBySourceId.get(row.EMP_ID);
		const benefitType = activeBenefitTypeByCode.get(row.CODE_OR_NAME.toUpperCase());
		const amount = toNumber(row.AMOUNT);
		if (!employee || !benefitType || amount == null) {
			employeeBenefitSkipped += 1;
			continue;
		}
		const startDate = toDate(row.START_DATE);
		const sheetEndDate = toDate(row.END_DATE);
		const openHorizon = isOpenHorizonCompensationCode(row.CODE_OR_NAME);
		const payrollPeriodCode = String(row.PAYROLL_PERIOD_CODE || "").trim();
		const payrollPeriod = openHorizon
			? null
			: payrollPeriodCode
				? payrollPeriodByKey.get(payrollPeriodCode.toUpperCase())
				: payrollPeriodByKey.get(dateKey(startDate, sheetEndDate));
		const existing = await prisma.employeeBenefit.findFirst({
			where: {
				organizationId: organization.id,
				employeeId: employee.id,
				benefitTypeId: benefitType.id,
				isDeleted: false,
				...(openHorizon
					? {}
					: payrollPeriod
						? { OR: [{ payrollPeriodId: payrollPeriod.id }, { startDate, endDate: sheetEndDate }] }
						: { startDate, endDate: sheetEndDate }),
			},
			select: { id: true, startDate: true },
			orderBy: openHorizon ? [{ payrollPeriodId: "asc" }, { updatedAt: "desc" }] : undefined,
		});
		if (existing) employeeBenefitUpdates += 1;
		else employeeBenefitCreates += 1;

		if (!execute) continue;
		const totalInstallments = openHorizon ? 0 : toNumber(row.INSTALLMENTS, 1) || 1;
		const openStart =
			openHorizon && existing?.startDate && existing.startDate.getTime() < startDate.getTime()
				? existing.startDate
				: startDate;
		const payload = openHorizon
			? {
					name: benefitType.name,
					totalAmount: amount,
					totalInstallments: 0,
					installmentAmount: amount,
					remainingBalance: amount,
					amount,
					payrollPeriodId: null,
					startDate: openStart,
					endDate: null,
					startPayrollCutOff: openStart,
					endPayrollCutOff: null,
					scheduleMode: "RECURRING",
					recurrenceFrequency: "EVERY_CUTOFF",
					status: row.STATUS || "ACTIVE",
					notes: [row.NOTES, "open-horizon EVERY_CUTOFF (DMA)"].filter(Boolean).join(" | "),
					remarks: row.NOTES || null,
					isActive: true,
					isDeleted: false,
				}
			: {
					name: benefitType.name,
					totalAmount: amount,
					totalInstallments,
					installmentAmount: amount / totalInstallments,
					remainingBalance: amount,
					amount,
					payrollPeriodId: payrollPeriod?.id,
					startDate,
					endDate: sheetEndDate,
					status: row.STATUS || "ACTIVE",
					notes: row.NOTES || null,
					remarks: row.NOTES || null,
					isActive: true,
					isDeleted: false,
				};
		if (existing) {
			await prisma.employeeBenefit.update({ where: { id: existing.id }, data: payload as any });
		} else {
			await prisma.employeeBenefit.create({
				data: {
					...payload,
					organizationId: organization.id,
					employeeId: employee.id,
					benefitTypeId: benefitType.id,
					currency: "PHP",
				} as any,
			});
		}
	}

	for (const row of employeeLoanRows) {
		const employee = employeeBySourceId.get(row.EMP_ID);
		const loanType = activeLoanTypeByName.get(row.CODE_OR_NAME.toUpperCase());
		const amount = toNumber(row.AMOUNT);
		if (!employee || !loanType || amount == null) {
			employeeLoanSkipped += 1;
			continue;
		}
		const startDate = toDate(row.START_DATE);
		// Workbook START/END is the *source cut*, not the loan horizon. Keep multi-cutoff endDate.
		const sheetEndDate = toDate(row.END_DATE);
		const existing = await (prisma as any).employeeLoan.findFirst({
			where: {
				organizationId: organization.id,
				employeeId: employee.id,
				loanTypeId: loanType.id,
				isDeleted: false,
				status: { in: ["PENDING", "APPROVED", "ACTIVE"] },
			},
			select: { id: true, endDate: true, monthlyPayment: true },
		});
		if (existing) employeeLoanUpdates += 1;
		else employeeLoanCreates += 1;

		if (!execute) continue;
		const termMonths = Math.max(
			toNumber(row.INSTALLMENTS, loanType.maxTermMonths || 24) || 24,
			24,
		);
		// Sheet AMOUNT for loans is the per-cutoff payment on the register, not principal.
		const monthlyPayment = amount;
		const principalAmount = amount * termMonths;
		const horizonEnd = new Date(startDate.getTime());
		horizonEnd.setUTCMonth(horizonEnd.getUTCMonth() + termMonths);
		const existingEnd = existing?.endDate ? new Date(existing.endDate) : null;
		const endDate =
			existingEnd && existingEnd.getTime() > horizonEnd.getTime()
				? existingEnd
				: horizonEnd.getTime() > sheetEndDate.getTime()
					? horizonEnd
					: sheetEndDate;
		const payload = {
			principalAmount,
			interestRate: Number(loanType.interestRate || 0),
			totalAmount: principalAmount,
			termMonths,
			monthlyPayment,
			startDate,
			endDate,
			amountPaid: 0,
			balance: principalAmount,
			status: row.STATUS || "ACTIVE",
			notes: row.NOTES || null,
			isDeleted: false,
		};
		if (existing) {
			await (prisma as any).employeeLoan.update({ where: { id: existing.id }, data: payload });
		} else {
			await (prisma as any).employeeLoan.create({
				data: {
					...payload,
					organizationId: organization.id,
					employeeId: employee.id,
					loanTypeId: loanType.id,
				},
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: execute ? "execute" : "dry-run",
				organization,
				files: { benefitTypesPath, loanTypesPath, employeeBenefitsPath },
				benefitTypes: { rows: benefitTypeRows.length, creates: benefitCreates.length, updates: benefitUpdates.length },
				loanTypes: { rows: loanTypeRows.length, creates: loanTypeCreates.length, updates: loanTypeUpdates.length },
				employeeBenefits: {
					rows: employeeBenefitRows.length,
					creates: employeeBenefitCreates,
					updates: employeeBenefitUpdates,
					staleDeactivations: staleEmployeeBenefits,
					skipped: employeeBenefitSkipped,
				},
				employeeLoans: {
					rows: employeeLoanRows.length,
					creates: employeeLoanCreates,
					updates: employeeLoanUpdates,
					staleDeactivations: staleEmployeeLoans,
					skipped: employeeLoanSkipped,
				},
				gaps: {
					missingEmployees: missingEmployees.slice(0, 20),
					missingEmployeeCount: missingEmployees.length,
					missingBenefitCodes,
					missingLoanTypeNames,
				},
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
