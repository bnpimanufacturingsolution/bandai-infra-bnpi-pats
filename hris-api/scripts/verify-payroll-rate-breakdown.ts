import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

function getArg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function money(value: unknown) {
	const amount = Number(value || 0);
	return new Intl.NumberFormat("en-PH", {
		currency: "PHP",
		style: "currency",
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	}).format(Number.isFinite(amount) ? amount : 0);
}

function num(value: unknown, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertClose(label: string, actual: number, expected: number, rows: string[]) {
	const delta = round(actual - expected);
	const ok = Math.abs(delta) <= 0.01;
	rows.push(`${ok ? "OK" : "FAIL"} ${label}: ${money(actual)} vs ${money(expected)} delta ${money(delta)}`);
	return ok;
}

function rateLine(label: string, expression: string, actual: number, expected: number, rows: string[]) {
	const ok = assertClose(label, actual, expected, rows);
	rows.push(`  ${expression} = ${money(expected)}`);
	return ok;
}

async function resolvePayroll(): Promise<any> {
	const payrollId = getArg("payrollId");
	const employeeCode = getArg("employeeCode");
	const periodCode = getArg("periodCode");

	return prisma.employeePayroll.findFirst({
		where: {
			isDeleted: false,
			...(payrollId ? { id: payrollId } : {}),
			...(employeeCode
				? { employee: { employeeId: employeeCode.padStart(5, "0") } }
				: {}),
			...(periodCode ? { payrollPeriod: { code: periodCode } } : {}),
		},
		select: {
			id: true,
			basicPay: true,
			overtimePay: true,
			nightDiffPay: true,
			holidayPay: true,
			netPay: true,
			rateBreakdown: true,
			dailyBreakdown: true,
			employee: {
				select: {
					employeeId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			payrollPeriod: {
				select: {
					code: true,
					name: true,
				},
			},
		},
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
	});
}

async function main() {
	const payroll = await resolvePayroll();
	if (!payroll) {
		throw new Error("No employee payroll found. Pass --payrollId, --employeeCode, or --periodCode.");
	}

	const rateBreakdown = (payroll.rateBreakdown || {}) as Record<string, any>;
	const dailyBreakdown = Array.isArray(payroll.dailyBreakdown) ? payroll.dailyBreakdown : [];
	const rows: string[] = [];
	let passed = true;

	const daily = rateBreakdown.dailyRate;
	const hourly = rateBreakdown.hourlyRate;
	const minute = rateBreakdown.minuteRate;
	const overtime = rateBreakdown.overtimeRate;
	const night = rateBreakdown.nightDiffRate;

	if (daily?.inputs) {
		const expected = round(num(daily.inputs.periodBasicSalary) / num(daily.inputs.totalWorkDays, 1));
		passed = rateLine(
			"Daily rate",
			`${money(daily.inputs.periodBasicSalary)} / ${num(daily.inputs.totalWorkDays)} days`,
			num(daily.result),
			expected,
			rows,
		) && passed;
	}

	if (hourly?.inputs) {
		const expected = round(num(hourly.inputs.dailyRate) / num(hourly.inputs.workingHoursPerDay, 1));
		passed = rateLine(
			"Hourly rate",
			`${money(hourly.inputs.dailyRate)} / ${num(hourly.inputs.workingHoursPerDay)} hrs`,
			num(hourly.result),
			expected,
			rows,
		) && passed;
	}

	if (minute?.inputs) {
		const expected = round(num(minute.inputs.hourlyRate) / 60);
		passed = rateLine(
			"Minute rate",
			`${money(minute.inputs.hourlyRate)} / 60 mins`,
			num(minute.result),
			expected,
			rows,
		) && passed;
	}

	if (overtime?.inputs) {
		const expected = round(num(overtime.inputs.hourlyRate) * num(overtime.inputs.multiplier));
		passed = rateLine(
			"OT rate",
			`${money(overtime.inputs.hourlyRate)} x ${num(overtime.inputs.multiplier)}`,
			num(overtime.result),
			expected,
			rows,
		) && passed;
	}

	if (night?.inputs) {
		const expected = round(num(night.inputs.hourlyRate) * num(night.inputs.multiplier));
		passed = rateLine(
			"Night diff rate",
			`${money(night.inputs.hourlyRate)} x ${num(night.inputs.multiplier)}`,
			num(night.result),
			expected,
			rows,
		) && passed;
	}

	const sampleDay = dailyBreakdown.find((day: any) => {
		const bucket = day?.metadata?.bandaiApprovedBucketDayPay;
		if (!bucket) return false;
		return (
			num(day?.earnings?.regularPay) > 0 ||
			num(day?.earnings?.overtimePay) > 0 ||
			num(day?.earnings?.nightDiffPay) > 0 ||
			num(day?.earnings?.holidayPay) > 0
		);
	}) as any;
	if (sampleDay) {
		const bucket = sampleDay.metadata.bandaiApprovedBucketDayPay;
		const hours = bucket.hours || {};
		passed = rateLine(
			"Sample day regular pay",
			`${num(hours.regularDays)} days x ${money(bucket.regularDailyRate)}`,
			num(sampleDay.earnings?.regularPay),
			round(num(hours.regularDays) * num(bucket.regularDailyRate)),
			rows,
		) && passed;
		passed = rateLine(
			"Sample day OT pay",
			`${num(hours.regOtHrs)} hrs x ${money(bucket.premiumHourlyRate)} x 1.25`,
			num(sampleDay.earnings?.overtimePay),
			round(num(hours.regOtHrs) * num(bucket.premiumHourlyRate) * 1.25),
			rows,
		) && passed;
	}

	const totalBucketOvertimePay = round(
		dailyBreakdown.reduce(
			(sum: number, day: any) =>
				sum + num(day?.metadata?.bandaiApprovedBucketDayPay?.overtimePay),
			0,
		),
	);
	if (totalBucketOvertimePay > 0 || num(payroll.overtimePay) > 0) {
		passed = rateLine(
			"Total approved bucket OT pay",
			"sum(dailyBreakdown.metadata.bandaiApprovedBucketDayPay.overtimePay)",
			num(payroll.overtimePay),
			totalBucketOvertimePay,
			rows,
		) && passed;
	}

	const name = [
		(payroll.employee?.person?.personalInfo as any)?.firstName,
		(payroll.employee?.person?.personalInfo as any)?.lastName,
	]
		.filter(Boolean)
		.join(" ");
	console.log(`Payroll rate breakdown verification`);
	console.log(`Employee: ${payroll.employee?.employeeId || "N/A"} ${name}`.trim());
	console.log(`Period: ${payroll.payrollPeriod?.code || "N/A"} ${payroll.payrollPeriod?.name || ""}`.trim());
	console.log(`Payroll ID: ${payroll.id}`);
	console.log(rows.join("\n"));

	if (!passed) {
		throw new Error("Rate breakdown verification failed.");
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
