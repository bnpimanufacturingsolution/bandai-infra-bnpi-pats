/**
 * Recurrence proof: for the NEXT payroll period (no Sheet2 involved), verify
 * that recurring comp/ded resolve from the DB alone — DMA, MLA (open-horizon)
 * and loans (24-mo horizon) — using the same resolver the payroll engine uses.
 */
import { PrismaClient } from "../generated/prisma/index.js";
import { createRequire } from "module";
const require2 = createRequire(import.meta.url);
const { resolvePayrollBenefitSources } = await import("../helper/payroll-benefit-source.helper.ts");

process.env.DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
const prisma = new PrismaClient({
	datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
});

const ORG = "cmryhwpv70000vgaktlmrubmx";
const NEXT_PERIOD_ID = process.env.NEXT_PERIOD_ID || "cmryhzl5000avgakznext00"; // placeholder if absent

const period =
	(await prisma.payrollPeriod.findFirst({
		where: { organizationId: ORG, isDeleted: false, code: "PP-20260726-20260811" },
		select: { id: true, code: true, startDate: true, endDate: true },
	})) ||
	(await prisma.payrollPeriod.findFirst({
		where: { organizationId: ORG, isDeleted: false, code: "PP-20260811-20260826" },
		select: { id: true, code: true, startDate: true, endDate: true },
	}));

if (!period) {
	console.log(JSON.stringify({ error: "no future period found" }));
	process.exit(1);
}

const benefits = await prisma.employeeBenefit.findMany({
	where: {
		organizationId: ORG,
		isDeleted: false,
		isActive: true,
		status: { in: ["ACTIVE", "APPROVED"] },
		employee: { isDeleted: false },
	},
	include: {
		benefitType: {
			select: { code: true, name: true, payrollDirection: true, reconciliationAction: true, isTaxable: true, isDeleted: true },
		},
	},
});

const resolved = resolvePayrollBenefitSources(benefits, period);

const byCode = {};
for (const src of resolved) {
	const key = src.code || src.benefitTypeName || "unknown";
	byCode[key] ||= { people: 0, sum: 0 };
	byCode[key].people += 1;
	byCode[key].sum += src.amount;
}
for (const k of Object.keys(byCode)) byCode[k].sum = +byCode[k].sum.toFixed(2);

const recurringCheck = {
	period: period.code,
	periodWindow: `${period.startDate.toISOString().slice(0, 10)}..${period.endDate.toISOString().slice(0, 10)}`,
	sheet2Used: false,
	recurringResolved: {
		DMA: byCode.DMA || { people: 0, sum: 0 },
		MLA: byCode.MLA || { people: 0, sum: 0 },
	},
	loansResolved: Object.fromEntries(
		Object.entries(byCode).filter(([k]) => /LN|LOAN|RCBC|HDMF|SSS/i.test(k)),
	),
	allResolvedCodes: Object.keys(byCode).sort(),
};
console.log(JSON.stringify(recurringCheck, null, 2));
await prisma.$disconnect();
