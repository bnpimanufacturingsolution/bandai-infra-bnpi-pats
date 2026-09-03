import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import {
	getPayrollPeriodOtReadiness,
	getPayrollPeriodOtPersonDetail,
} from "../helper/payroll-ot-readiness.helper";

if (!process.env.FORCE_ENV_DB) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
}

const prisma = new PrismaClient();
const code = process.env.PERIOD_CODE || "PP-20260526-20260611";

async function main() {
	const period = await prisma.payrollPeriod.findFirst({
		where: { code, isDeleted: false },
	});
	if (!period) {
		console.log(JSON.stringify({ missing: true, code }));
		return;
	}
	const r = await getPayrollPeriodOtReadiness(prisma, {
		payrollPeriodId: period.id,
		organizationId: period.organizationId,
		page: 1,
		limit: 10,
		onlyWithOt: true,
	});
	console.log(
		JSON.stringify(
			{
				code,
				summary: r.summary,
				sample: r.people.slice(0, 7).map((p) => ({
					name: p.name,
					status: p.timesheetStatus,
					label: p.approvalLabel,
					hrs: p.lineOtHours,
					blocker: p.blockerClass,
					source: p.approvalSource,
					payable: p.isPayableApproved,
				})),
			},
			null,
			2,
		),
	);
	if (r.people[0]) {
		const d = await getPayrollPeriodOtPersonDetail(prisma, {
			payrollPeriodId: period.id,
			organizationId: period.organizationId,
			timesheetId: r.people[0].timesheetId,
		});
		console.log(
			JSON.stringify(
				{
					detail: {
						name: d.name,
						label: d.approvalLabel,
						source: d.approvalSource,
						days: d.otDayCount,
						total: d.totalLineOtHours,
						firstDays: d.days.slice(0, 4),
						note: d.truth.note,
					},
				},
				null,
				2,
			),
		);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
