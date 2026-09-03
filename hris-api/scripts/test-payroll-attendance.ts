/**
 * Payroll Period Attendance Script
 * Calculates attendance and absences for an employee for a specific payroll period
 * Includes rate calculation and absence detection based on employee schedule
 * Now includes complete payroll calculation with taxes and contributions
 *
 * Usage:
 *   npm run ts-node scripts/test-payroll-attendance.ts <employeeId>
 *   npm run ts-node scripts/test-payroll-attendance.ts -all
 *
 * Examples:
 *   npm run ts-node scripts/test-payroll-attendance.ts 695b356af70742645a95f293
 *   npm run ts-node scripts/test-payroll-attendance.ts -all
 */

import { PrismaClient } from "../generated/prisma";
import { calculatePayroll, formatPHP } from "../helper/tax-calculator.helper";
import {
	calculateRatesWithBreakdown,
	formatRateCalculationOutput,
} from "../helper/rate-calculator.helper";

const prisma = new PrismaClient();

interface AttendanceSummary {
	totalScheduledDays: number;
	totalWorkDays: number;
	totalRestDays: number;
	daysPresent: number;
	daysAbsent: number;
	daysLate: number;
	attendanceRecords: Array<{
		date: Date;
		dayOfWeek: string;
		status: "present" | "leave" | "absent" | "rest";
		timeIn?: string | null;
		timeOut?: string | null;
		hoursWorked?: number;
		isLate?: boolean;
		remarks?: string;
	}>;
}

async function calculatePayrollAttendanceForEmployee(employeeId: string, organizationId: string) {
	console.log("=".repeat(80));
	console.log("PAYROLL PERIOD ATTENDANCE CALCULATOR");
	console.log("=".repeat(80));
	console.log();

	try {
		// Step 1: Get Employee Details with Schedule
		console.log("-".repeat(80));
		console.log("1. EMPLOYEE DETAILS");
		console.log("-".repeat(80));

		const employee = await prisma.employee.findUnique({
			where: { id: employeeId },
			include: {
				person: {
					select: {
						personalInfo: true,
					},
				},
				department: true,
				position: true,
				level: true,
			},
		});

		if (!employee) {
			console.error("❌ Employee not found!");
			return;
		}

		console.log(
			`👤 Employee: ${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
		);
		console.log(`🆔 Employee ID: ${employee.employeeId}`);
		console.log(`🏢 Department: ${employee.department.name}`);
		console.log(`💼 Position: ${employee.position.title}`);
		console.log(`💰 Basic Salary: ₱${employee.basicSalary.toLocaleString()}`);
		console.log(`📅 Pay Frequency: ${employee.payFrequency}`);
		console.log();

		// Step 2: Get Current/Latest Open Payroll Period
		console.log("-".repeat(80));
		console.log("2. PAYROLL PERIOD");
		console.log("-".repeat(80));

		const payrollPeriod = await prisma.payrollPeriod.findFirst({
			where: {
				organizationId,
				status: { in: ["OPEN", "PROCESSING"] },
			},
			orderBy: {
				startDate: "desc",
			},
		});

		if (!payrollPeriod) {
			console.error("❌ No active payroll period found!");
			console.log("💡 Please create a payroll period first.");
			return;
		}

		console.log(`📋 Period: ${payrollPeriod.name}`);
		console.log(`📅 Start Date: ${payrollPeriod.startDate.toISOString().split("T")[0]}`);
		console.log(`📅 End Date: ${payrollPeriod.endDate.toISOString().split("T")[0]}`);
		console.log(`💵 Pay Date: ${payrollPeriod.payDate.toISOString().split("T")[0]}`);
		console.log(`📊 Status: ${payrollPeriod.status}`);
		if (payrollPeriod.cutoffDay) {
			console.log(`✂️  Cutoff Day: ${payrollPeriod.cutoffDay}`);
		}
		console.log();

		// Step 3: Get Employee Schedule
		console.log("-".repeat(80));
		console.log("3. EMPLOYEE SCHEDULE");
		console.log("-".repeat(80));

		if (!employee.schedule) {
			console.error("❌ Employee has no schedule assigned!");
			return;
		}

		console.log(`📋 Schedule: ${employee.schedule.scheduleName}`);
		console.log(`📅 Schedule Code: ${employee.schedule.scheduleCode}`);
		console.log(`🗓️  Start Date: ${employee.schedule.startDate.toISOString().split("T")[0]}`);
		console.log(
			`🗓️  End Date: ${employee.schedule.endDate ? employee.schedule.endDate.toISOString().split("T")[0] : "Permanent"}`,
		);
		console.log();
		console.log("Weekly Schedule:");
		employee.schedule.shifts.forEach((shift: any) => {
			if (shift.isRestDay) {
				console.log(`  📴 ${shift.label}: REST DAY`);
			} else if (shift.timeSlots && shift.timeSlots.length > 0) {
				const workSlot = shift.timeSlots.find((slot: any) => slot.type === "work");
				if (workSlot) {
					console.log(`  ⏰ ${shift.label}: ${workSlot.startTime} - ${workSlot.endTime}`);
				}
			}
		});
		console.log();

		// Step 4: Calculate Working Days in Payroll Period
		console.log("-".repeat(80));
		console.log("4. WORKING DAYS CALCULATION");
		console.log("-".repeat(80));

		const summary: AttendanceSummary = {
			totalScheduledDays: 0,
			totalWorkDays: 0,
			totalRestDays: 0,
			daysPresent: 0,
			daysAbsent: 0,
			daysLate: 0,
			attendanceRecords: [],
		};

		const dayNames = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const currentDate = new Date(payrollPeriod.startDate);
		const endDate = new Date(payrollPeriod.endDate);
		// Make endDate inclusive (23:59:59.999)
		const endDateInclusive = new Date(payrollPeriod.endDate);
		endDateInclusive.setHours(23, 59, 59, 999);

		// First pass: Count work days and rest days
		while (currentDate <= endDate) {
			const dayOfWeek = currentDate.getDay();
			const dayName = dayNames[dayOfWeek];

			summary.totalScheduledDays++;

			// Find shift for this day
			const shift = employee.schedule.shifts.find((s: any) => {
				const label = s.label.toLowerCase();
				return (
					label.includes(dayName.toLowerCase()) ||
					label.includes(dayName.substring(0, 3).toLowerCase())
				);
			});

			if (shift) {
				if (shift.isRestDay) {
					summary.totalRestDays++;
				} else {
					summary.totalWorkDays++;
				}
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}

		console.log(`📊 Period Summary:`);
		console.log(`   Total Days in Period: ${summary.totalScheduledDays}`);
		console.log(`   Scheduled Work Days: ${summary.totalWorkDays}`);
		console.log(`   Rest Days: ${summary.totalRestDays}`);
		console.log();

		// Step 5: Calculate Daily/Hourly Rate based on actual working days
		console.log("-".repeat(80));
		console.log("5. RATE CALCULATION");
		console.log("-".repeat(80));

		let dailyRate = 0;
		let hourlyRate = 0;
		const monthlySalary = employee.basicSalary;

		// Calculate actual working hours per day from time slots (accounting for breaks)
		let totalDailyWorkingHours = 0;
		if (employee.schedule?.shifts && employee.schedule.shifts.length > 0) {
			const firstWorkShift = employee.schedule.shifts.find(
				(s: any) => !s.isRestDay && s.timeSlots,
			);
			if (firstWorkShift?.timeSlots && firstWorkShift.timeSlots.length > 0) {
				const workTimeSlots = firstWorkShift.timeSlots.filter(
					(ts: any) => ts.type === "work",
				);
				if (workTimeSlots.length > 0) {
					totalDailyWorkingHours = workTimeSlots.reduce((total: number, slot: any) => {
						const [startHour, startMin] = slot.startTime.split(":").map(Number);
						const [endHour, endMin] = slot.endTime.split(":").map(Number);
						const hours = endHour + endMin / 60 - (startHour + startMin / 60);
						return total + hours;
					}, 0);
				}
			}
		}

		if (employee.payFrequency === "MONTHLY") {
			// Use actual working days from payroll period
			dailyRate = monthlySalary / summary.totalWorkDays;
			hourlyRate = dailyRate / totalDailyWorkingHours;
		} else if (employee.payFrequency === "SEMI_MONTHLY") {
			// For semi-monthly, use half the monthly salary
			const semiMonthlySalary = monthlySalary / 2;
			dailyRate = semiMonthlySalary / summary.totalWorkDays;
			hourlyRate = dailyRate / totalDailyWorkingHours;
		} else if (employee.payFrequency === "DAILY") {
			dailyRate = monthlySalary;
			hourlyRate = dailyRate / totalDailyWorkingHours;
		}

		// Display rate calculation details using helper
		const rateBreakdown = calculateRatesWithBreakdown(
			monthlySalary,
			employee.payFrequency as "MONTHLY" | "SEMI_MONTHLY" | "DAILY",
			summary.totalWorkDays,
			totalDailyWorkingHours,
		);
		formatRateCalculationOutput(rateBreakdown);

		// Step 6: Get Attendance Records for Payroll Period
		console.log("-".repeat(80));
		console.log("6. ATTENDANCE RECORDS");
		console.log("-".repeat(80));

		const attendances = await prisma.attendance.findMany({
			where: {
				employeeId,
				isDeleted: false,
				date: {
					gte: payrollPeriod.startDate,
					lte: endDateInclusive,
				},
			},
			orderBy: {
				date: "asc",
			},
		});

		console.log(`📊 Total Attendance Records: ${attendances.length}`);
		console.log();

		// Step 7: Calculate Absences Based on Schedule
		console.log("-".repeat(80));
		console.log("7. ABSENCE CALCULATION");
		console.log("-".repeat(80));

		// Create attendance map for quick lookup
		const attendanceMap = new Map<string, any>();
		attendances.forEach((att) => {
			if (att.date) {
				const dateKey = att.date.toISOString().split("T")[0];
				attendanceMap.set(dateKey, att);
				// Debug: Log Jan 6 attendance
				if (dateKey === "2026-01-06") {
					console.log(
						`📋 DEBUG: Found Jan 6 attendance - dateKey: ${dateKey}, status: ${att.status}`,
					);
				}
			}
		});

		// Iterate through each day in payroll period
		const iterDate = new Date(payrollPeriod.startDate);

		while (iterDate <= endDate) {
			const dateKey = iterDate.toISOString().split("T")[0];
			const dayOfWeek = iterDate.getDay();
			const dayName = dayNames[dayOfWeek];

			// Find shift for this day
			const shift = employee.schedule.shifts.find((s: any) => {
				const label = s.label.toLowerCase();
				return (
					label.includes(dayName.toLowerCase()) ||
					label.includes(dayName.substring(0, 3).toLowerCase())
				);
			});

			if (shift) {
				if (shift.isRestDay) {
					// Rest day
					summary.attendanceRecords.push({
						date: new Date(iterDate),
						dayOfWeek: dayName,
						status: "rest",
						remarks: "Scheduled rest day",
					});
				} else {
					// Work day
					const attendance = attendanceMap.get(dateKey);

					if (attendance) {
						if (attendance.status === "PRESENT") {
							// Present
							summary.daysPresent++;

							const timeIn = attendance.timeIn
								? new Date(attendance.timeIn).toLocaleTimeString("en-US", {
										hour: "2-digit",
										minute: "2-digit",
										hour12: false,
									})
								: null;
							const timeOut = attendance.timeOut
								? new Date(attendance.timeOut).toLocaleTimeString("en-US", {
										hour: "2-digit",
										minute: "2-digit",
										hour12: false,
									})
								: null;

							let hoursWorked = 0;
							if (attendance.timeIn && attendance.timeOut) {
								const diff =
									new Date(attendance.timeOut).getTime() -
									new Date(attendance.timeIn).getTime();
								hoursWorked = diff / (1000 * 60 * 60);
							}

							// Check if late
							const isLate = attendance.isLate || false;
							if (isLate) summary.daysLate++;

							summary.attendanceRecords.push({
								date: new Date(iterDate),
								dayOfWeek: dayName,
								status: "present",
								timeIn,
								timeOut,
								hoursWorked: Math.round(hoursWorked * 100) / 100,
								isLate,
								remarks: attendance.remarks || "Present",
							});
						} else if (attendance.status === "LEAVE") {
							// On leave - don't count as absent
							summary.attendanceRecords.push({
								date: new Date(iterDate),
								dayOfWeek: dayName,
								status: "leave",
								remarks: attendance.remarks || "On Leave",
							});
						}
					} else {
						// No attendance record - Absent
						summary.daysAbsent++;
						summary.attendanceRecords.push({
							date: new Date(iterDate),
							dayOfWeek: dayName,
							status: "absent",
							remarks: "No attendance record (Absent)",
						});
					}
				}
			}

			// Move to next day
			iterDate.setDate(iterDate.getDate() + 1);
		}

		console.log(`📊 Attendance Summary:`);
		console.log(`   Days Present: ${summary.daysPresent}`);
		console.log(`   Days Absent: ${summary.daysAbsent}`);
		console.log(`   Days Late: ${summary.daysLate}`);
		console.log();

		// Step 8: Detailed Attendance Breakdown
		console.log("-".repeat(80));
		console.log("8. DETAILED ATTENDANCE BREAKDOWN");
		console.log("-".repeat(80));

		summary.attendanceRecords.forEach((record) => {
			const dateStr = record.date.toISOString().split("T")[0];
			const icon =
				record.status === "present"
					? "✅"
					: record.status === "absent"
						? "❌"
						: record.status === "leave"
							? "🏖️"
							: "📴";
			const lateIndicator = record.isLate ? " [LATE]" : "";

			if (record.status === "present") {
				console.log(
					`${icon} ${dateStr} (${record.dayOfWeek}): ${record.timeIn || "N/A"} - ${record.timeOut || "N/A"} | ${record.hoursWorked?.toFixed(2) || "0.00"}h${lateIndicator}`,
				);
			} else if (record.status === "absent") {
				console.log(`${icon} ${dateStr} (${record.dayOfWeek}): ABSENT`);
			} else if (record.status === "leave") {
				console.log(`${icon} ${dateStr} (${record.dayOfWeek}): ON LEAVE`);
			} else {
				console.log(`${icon} ${dateStr} (${record.dayOfWeek}): ${record.remarks}`);
			}
		});
		console.log();

		// Step 9: Calculate Deductions for Absences
		console.log("-".repeat(80));
		console.log("9. ABSENCE DEDUCTIONS & BASIC PAY");
		console.log("-".repeat(80));

		const absentDeduction = summary.daysAbsent * dailyRate;
		const estimatedBasicPay = (summary.totalWorkDays - summary.daysAbsent) * dailyRate;

		console.log(
			`💵 Daily Rate: ₱${dailyRate.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
		);
		console.log(`📊 Days Absent: ${summary.daysAbsent}`);
		console.log(
			`💸 Absence Deduction: ₱${absentDeduction.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
		);
		console.log(
			`💰 Estimated Basic Pay: ₱${estimatedBasicPay.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
		);
		console.log();

		// Step 10: Calculate Taxes and Contributions
		console.log("-".repeat(80));
		console.log("10. TAX & CONTRIBUTION CALCULATION");
		console.log("-".repeat(80));

		// Calculate tax based on full semi-monthly/monthly amount (not prorated by absences)
		// Absences reduce the final pay but not the taxable gross
		let taxableGrossPay = monthlySalary;
		if (employee.payFrequency === "SEMI_MONTHLY") {
			taxableGrossPay = monthlySalary / 2;
		}

		const payrollCalculation = calculatePayroll(taxableGrossPay);

		// Adjust deductions based on prorated basic pay (after absences)
		const prorationRatio = estimatedBasicPay / taxableGrossPay;
		const proratedDeductions = payrollCalculation.totalDeductions * prorationRatio;
		const proratedNetPay = estimatedBasicPay - proratedDeductions;

		console.log(`📊 GROSS INCOME (Tax Basis):`);
		console.log(`   ${formatPHP(taxableGrossPay)} (${employee.payFrequency})`);
		console.log();

		console.log(`📊 GROSS INCOME (After Absences):`);
		console.log(`   ${formatPHP(estimatedBasicPay)}`);
		console.log();

		console.log(`📋 MANDATORY CONTRIBUTIONS:`);
		console.log(`   SSS:        ${formatPHP(payrollCalculation.contributions.sss)}`);
		console.log(`   PhilHealth: ${formatPHP(payrollCalculation.contributions.philHealth)}`);
		console.log(`   Pag-IBIG:   ${formatPHP(payrollCalculation.contributions.pagIbig)}`);
		console.log(`   ─────────────────────────`);
		console.log(`   Total:      ${formatPHP(payrollCalculation.contributions.total)}`);
		console.log();

		console.log(`💵 TAXABLE INCOME:`);
		console.log(`   ${formatPHP(payrollCalculation.taxableIncome)}`);
		console.log(`   (Gross - Contributions)`);
		console.log();

		console.log(`🏛️  WITHHOLDING TAX:`);
		console.log(`   ${formatPHP(payrollCalculation.withholdingTax)}`);
		console.log();

		console.log(`📊 TOTAL DEDUCTIONS (Prorated):`);
		console.log(`   Contributions: ${formatPHP(payrollCalculation.contributions.total)}`);
		console.log(`   Withholding Tax: ${formatPHP(payrollCalculation.withholdingTax)}`);
		console.log(`   ─────────────────────────`);
		console.log(`   Total:      ${formatPHP(proratedDeductions)}`);
		console.log();

		console.log(`💰 NET PAY (TAKE HOME):`);
		console.log(`   ${formatPHP(proratedNetPay)}`);
		console.log();

		// Step 11: Check if Employee Payroll Record Exists
		console.log("-".repeat(80));
		console.log("11. EMPLOYEE PAYROLL RECORD");
		console.log("-".repeat(80));

		const employeePayroll = await prisma.employeePayroll.findUnique({
			where: {
				employeeId_payrollPeriodId: {
					employeeId,
					payrollPeriodId: payrollPeriod.id,
				},
			},
		});

		if (employeePayroll) {
			console.log("✅ Employee payroll record exists:");
			console.log(
				`   Basic Pay: ₱${employeePayroll.basicPay.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
			);
			console.log(
				`   Gross Pay: ₱${employeePayroll.grossPay.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
			);
			console.log(
				`   Total Deductions: ₱${employeePayroll.totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
			);
			console.log(
				`   Net Pay: ₱${employeePayroll.netPay.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
			);
			console.log(`   Regular Hours: ${employeePayroll.regularHours}`);
			console.log(`   Paid: ${employeePayroll.isPaid ? "Yes" : "No"}`);
		} else {
			console.log("⚠️  No employee payroll record found for this period.");
			console.log("💡 This record would be created during payroll processing.");
		}
		console.log();

		console.log("=".repeat(80));
		console.log("✅ CALCULATION COMPLETE");
		console.log("=".repeat(80));
	} catch (error) {
		console.error("❌ Error:", error);
	}
}

async function main() {
	// Parse command line arguments
	const args = process.argv.slice(2);
	const employeeIdArg = args[0];
	const organizationId = "69884da971e2dc9d6ac67b59"; // Your org ID

	if (!employeeIdArg) {
		console.error("❌ Error: Employee ID is required");
		console.log("\nUsage:");
		console.log("  npm run ts-node scripts/test-payroll-attendance.ts <employeeId>");
		console.log("  npm run ts-node scripts/test-payroll-attendance.ts -all");
		console.log("\nExamples:");
		console.log(
			"  npm run ts-node scripts/test-payroll-attendance.ts 695b356af70742645a95f293",
		);
		console.log("  npm run ts-node scripts/test-payroll-attendance.ts -all");
		process.exit(1);
	}

	try {
		if (employeeIdArg === "-all") {
			// Process all active employees
			console.log("🔍 Fetching all active employees...\n");

			const employees = await prisma.employee.findMany({
				where: {
					organizationId,
					isDeleted: false,
					employmentStatus: "ACTIVE",
				},
				select: {
					id: true,
					employeeId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});

			console.log(`📊 Found ${employees.length} active employees\n`);

			for (const emp of employees) {
				const name = `${emp.person?.personalInfo?.firstName} ${emp.person?.personalInfo?.lastName}`;
				console.log(`\n${"=".repeat(80)}`);
				console.log(`Processing: ${name} (${emp.employeeId})`);
				console.log("=".repeat(80));

				await calculatePayrollAttendanceForEmployee(emp.id, organizationId);

				console.log("\n");
			}
		} else {
			// Process single employee
			await calculatePayrollAttendanceForEmployee(employeeIdArg, organizationId);
		}
	} catch (error) {
		console.error("❌ Script failed:", error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the script
main()
	.then(() => {
		console.log("\n🎉 Script completed successfully!");
		process.exit(0);
	})
	.catch((error: any) => {
		console.error("\n💥 Script failed:", error);
		process.exit(1);
	});
