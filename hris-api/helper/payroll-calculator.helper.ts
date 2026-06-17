import { PrismaClient } from "../generated/prisma";
import { getEffectiveAttendanceRecordsForRange } from "./attendance.helper";
import { resolveEmployeeActiveSchedule } from "./employee-schedule.helper";
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

interface AttendanceRecord {
	date: Date;
	dayOfWeek: string;
	status: "present" | "leave" | "absent" | "rest";
	timeIn?: string | null;
	timeOut?: string | null;
	hoursWorked?: number;
	isLate?: boolean;
	remarks?: string;
}

interface AttendanceSummary {
	totalScheduledDays: number;
	totalWorkDays: number;
	totalRestDays: number;
	daysPresent: number;
	daysAbsent: number;
	daysLate: number;
	attendanceRecords: AttendanceRecord[];
}

export const calculatePayrollBreakdown = async (
	prisma: PrismaClient,
	employeePayrollId: string,
) => {
	// Get employee payroll with all necessary relations
	const employeePayroll = await prisma.employeePayroll.findFirst({
		where: { id: employeePayrollId },
		include: {
			employee: {
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
			},
			payrollPeriod: true,
		},
	});

	if (!employeePayroll) {
		return null;
	}

	const employee = employeePayroll.employee;
	const activeSchedule = resolveEmployeeActiveSchedule(employee);
	const payrollPeriod = employeePayroll.payrollPeriod;

	if (!payrollPeriod) {
		throw new Error("Payroll period not found for this payroll record");
	}

	const summary: AttendanceSummary = {
		totalScheduledDays: 0,
		totalWorkDays: 0,
		totalRestDays: 0,
		daysPresent: 0,
		daysAbsent: 0,
		daysLate: 0,
		attendanceRecords: [],
	};

	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	// First pass: Count work days and rest days
	let currentDate = new Date(payrollPeriod.startDate);
	const endDate = new Date(payrollPeriod.endDate);

	while (currentDate <= endDate) {
		const dayOfWeek = currentDate.getDay();
		const dayName = dayNames[dayOfWeek];

		summary.totalScheduledDays++;

		// Find shift for this day
		const shift = activeSchedule?.shifts?.find((s: any) => {
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

	// Calculate daily/hourly rate
	let dailyRate = 0;
	let hourlyRate = 0;
	if (employee.payFrequency === "DAILY") {
		dailyRate = employee.basicSalary;
		hourlyRate = dailyRate / 8;
	} else {
		// For MONTHLY, SEMI_MONTHLY, etc. basicSalary IS the period salary
		dailyRate = employee.basicSalary / (summary.totalWorkDays || 1); // Avoid division by zero
		hourlyRate = dailyRate / 8;
	}

	// Get attendance records for payroll period
	// Extend endDate to include the entire day (23:59:59.999)
	const endDateInclusive = new Date(payrollPeriod.endDate);
	endDateInclusive.setHours(23, 59, 59, 999);

	const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
		organizationId: employeePayroll.organizationId,
		employeeId: employee.id,
		startDate: payrollPeriod.startDate,
		endDate: endDateInclusive,
	});

	// Create attendance map for quick lookup
	const attendanceMap = new Map<string, any>();
	attendances.forEach((att) => {
		if (att.date) {
			const dateKey = att.date.toISOString().split("T")[0];
			attendanceMap.set(dateKey, att);
		}
	});

	// Build detailed attendance breakdown
	const iterDate = new Date(payrollPeriod.startDate);

	while (iterDate <= endDate) {
		const dateKey = iterDate.toISOString().split("T")[0];
		const dayOfWeek = iterDate.getDay();
		const dayName = dayNames[dayOfWeek];

		// Find shift for this day
		const shift = activeSchedule?.shifts?.find((s: any) => {
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
						// On leave - don't count as absent, but not present either
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

		iterDate.setDate(iterDate.getDate() + 1);
	}

	// Calculate deductions and basic pay
	const absentDeduction = summary.daysAbsent * dailyRate;
	const estimatedBasicPay = (summary.totalWorkDays - summary.daysAbsent) * dailyRate;

	return {
		employeeInfo: {
			id: employee.id,
			employeeId: employee.employeeId,
			name: `${getJsonString((employee as any).person?.personalInfo, "firstName")} ${getJsonString((employee as any).person?.personalInfo, "lastName")}`.trim(),
			department: employee.department?.name || "",
			position: employee.position?.title || "",
			level: employee.level?.name || "",
			basicSalary: employee.basicSalary,
			payFrequency: employee.payFrequency,
		},
		payrollPeriod: {
			id: payrollPeriod.id,
			name: payrollPeriod.name,
			startDate: payrollPeriod.startDate,
			endDate: payrollPeriod.endDate,
			payDate: payrollPeriod.payDate,
			status: payrollPeriod.status,
			cutoffDay: payrollPeriod.cutoffDay,
		},
		schedule: activeSchedule
			? {
					scheduleName: activeSchedule.scheduleName,
					scheduleCode: activeSchedule.scheduleCode,
					startDate: activeSchedule.startDate,
					endDate: activeSchedule.endDate,
					shifts: activeSchedule.shifts,
					gracePeriodMinutes: activeSchedule.gracePeriodMinutes || 0,
				}
			: null,
		workingDays: {
			totalScheduledDays: summary.totalScheduledDays,
			totalWorkDays: summary.totalWorkDays,
			totalRestDays: summary.totalRestDays,
		},
		rates: {
			basicSalary: employee.basicSalary,
			dailyRate: Math.round(dailyRate * 100) / 100,
			hourlyRate: Math.round(hourlyRate * 100) / 100,
		},
		attendanceSummary: {
			daysPresent: summary.daysPresent,
			daysAbsent: summary.daysAbsent,
			daysLate: summary.daysLate,
		},
		attendanceBreakdown: summary.attendanceRecords,
		calculations: {
			absentDeduction: Math.round(absentDeduction * 100) / 100,
			estimatedBasicPay: Math.round(estimatedBasicPay * 100) / 100,
		},
		payroll: {
			id: employeePayroll.id,
			basicPay: employeePayroll.basicPay,
			overtimePay: employeePayroll.overtimePay,
			nightDiffPay: employeePayroll.nightDiffPay,
			holidayPay: employeePayroll.holidayPay,
			allowances: employeePayroll.allowances,
			bonuses: employeePayroll.bonuses,
			grossPay: employeePayroll.grossPay,
			contributions: {
				sss: employeePayroll.sssContribution,
				philHealth: employeePayroll.philHealthContribution,
				pagIbig: employeePayroll.pagibigContribution,
				total:
					employeePayroll.sssContribution +
					employeePayroll.philHealthContribution +
					employeePayroll.pagibigContribution,
			},
			taxableIncome:
				employeePayroll.grossPay -
				(employeePayroll.sssContribution +
					employeePayroll.philHealthContribution +
					employeePayroll.pagibigContribution),
			withholdingTax: employeePayroll.taxAmount,
			deductions: {
				tax: employeePayroll.taxAmount,
				sss: employeePayroll.sssContribution,
				philHealth: employeePayroll.philHealthContribution,
				pagIbig: employeePayroll.pagibigContribution,
				loans: employeePayroll.loanDeductions,
				other: employeePayroll.otherDeductions,
				total: employeePayroll.totalDeductions,
			},
			netPay: employeePayroll.netPay,

			isPaid: employeePayroll.isPaid,
			paidAt: employeePayroll.paidAt,
			paymentMethod: employeePayroll.paymentMethod,
			referenceNumber: employeePayroll.referenceNumber,
			notes: employeePayroll.notes,
		},
	};
};
