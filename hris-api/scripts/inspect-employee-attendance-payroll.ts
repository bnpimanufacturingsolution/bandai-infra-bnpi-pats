import { PrismaClient } from "../generated/prisma";
import { previewPayrollFromTimesheets } from "../helper/payroll-period.helper";

const prisma = new PrismaClient();

async function main() {
	console.log("=== Inspecting DIRECT Employees with Attendance vs Payroll for PP-20260826-20260911 ===");
	
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: "PP-20260826-20260911", isDeleted: false },
	});

	if (!period) {
		console.log("Period PP-20260826-20260911 not found.");
		return;
	}

	// Fetch DIRECT employees who have timesheets in this period
	const timesheets = await prisma.timesheet.findMany({
		where: {
			payrollPeriodId: period.id,
			isDeleted: false,
			employee: {
				workforceSource: "DIRECT",
				basicSalary: { gt: 0 },
				isDeleted: false,
				NOT: [{ embeddedSchedule: { equals: null } }],
			},
		},
		select: {
			id: true,
			employeeId: true,
			status: true,
			totalRegularHours: true,
			totalHoursWorked: true,
			totalDays: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					basicSalary: true,
					dailyRate: true,
					payFrequency: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
					position: {
						select: {
							title: true,
						},
					},
				},
			},
			timesheetlines: {
				where: { isDeleted: false, isEffective: true },
				select: {
					date: true,
					status: true,
					timeIn: true,
					timeOut: true,
					hoursWorked: true,
				},
				orderBy: { date: "asc" },
			},
		},
		take: 300,
	});

	console.log(`Loaded ${timesheets.length} valid direct employee timesheets with embedded schedules.`);

	const getPresentDays = (ts: any) =>
		ts.timesheetlines.filter(
			(l: any) => l.status === "PRESENT" && l.timeIn && l.timeOut
		).length;

	const fullWorked = timesheets.filter((ts) => getPresentDays(ts) >= 5).slice(0, 2);
	const singleDayWorked = timesheets.filter((ts) => getPresentDays(ts) === 1).slice(0, 2);
	const zeroWorked = timesheets.filter((ts) => getPresentDays(ts) === 0).slice(0, 2);

	const sampleTs = [...fullWorked, ...singleDayWorked, ...zeroWorked];

	for (const ts of sampleTs) {
		const emp = ts.employee;
		const name = `${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim();
		const presentDays = getPresentDays(ts);
		
		const preview = await previewPayrollFromTimesheets(prisma, period.id, period.organizationId, {
			employeeId: emp.id,
			calculateRows: true,
		});

		const row = preview.rows?.[0];

		console.log(`\n======================================================`);
		console.log(`Employee: ${emp.employeeId} - ${name} (${emp.position?.title || "Staff"})`);
		console.log(`PayFrequency: ${emp.payFrequency} | Basic Salary: ₱${emp.basicSalary} | Daily Rate: ${emp.dailyRate ?? "N/A"}`);
		console.log(`Total Timesheet Lines: ${ts.timesheetlines.length} | Valid Present Days: ${presentDays}`);
		console.log(`Lines: ${ts.timesheetlines.map((l: any) => `${l.date.toISOString().slice(5, 10)}:${l.status}(${l.hoursWorked})`).join(", ")}`);
		
		if (row) {
			console.log(`-> Basic Pay: ₱${row.basicPay}`);
			console.log(`-> Absent Deduction: ₱${row.absentDeduction}`);
			console.log(`-> Overtime Pay: ₱${row.overtimePay} | Night Diff: ₱${row.nightDiffPay} | Holiday Pay: ₱${row.holidayPay}`);
			console.log(`-> Gross Pay: ₱${row.grossPay}`);
			console.log(`-> Total Deductions: ₱${row.totalDeductions}`);
			console.log(`-> Net Pay: ₱${row.netPay}`);
			console.log(`-> ZeroPay Note: ${row.zeroPayReason ? row.zeroPayReason + " (" + row.zeroPayLabel + ")" : "None (Has Attendance)"}`);
		} else {
			console.log(`-> No preview row computed (excluded from payroll-ready set).`);
		}
	}
}

main()
	.catch((err) => {
		console.error("Error:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
