import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Test script to verify the absence calculation
 * This script checks if employees under a specific manager have correct absent counts
 */
async function main() {
	const managerId = "6938e6cc447a1aba0fdfb63c"; // Patricia Moore's employee ID
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	console.log("\n=== Testing Absence Calculation ===\n");

	// Get employees reporting to the manager
	const employees = await prisma.employee.findMany({
		where: {
			reportToId: managerId,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			employmentHireDate: true,
			employmentTerminationDate: true,
			activeEmployeeSchedule: {
				select: {
					id: true,
					effectiveDate: true,
					schedule: {
						select: {
							id: true,
							name: true,
							shifts: true,
						},
					},
				},
			},
			attendances: {
				where: {
					isDeleted: false,
				},
				select: {
					id: true,
					date: true,
					status: true,
					timeIn: true,
					timeOut: true,
				},
			},
		},
	});

	console.log(`Found ${employees.length} employees reporting to manager ${managerId}\n`);

	for (const employee of employees) {
		const personalInfo = employee.person?.personalInfo as any;
		const fullName = `${personalInfo?.firstName || ""} ${personalInfo?.lastName || ""}`.trim();

		console.log(`\n${"=".repeat(60)}`);
		console.log(`Employee: ${fullName} (${employee.employeeId})`);
		console.log(`${"=".repeat(60)}`);

		// Check if employee has active schedule
		if (!employee.activeEmployeeSchedule) {
			console.log("❌ No active employee schedule found");
			continue;
		}

		// Check if schedule exists
		if (!employee.activeEmployeeSchedule.schedule) {
			console.log("❌ activeEmployeeSchedule has no schedule reference");
			console.log("   This is the BUG! The query needs to include the schedule.");
			continue;
		}

		const schedule = employee.activeEmployeeSchedule.schedule;
		console.log(`\n📅 Schedule: ${schedule.name}`);
		console.log(`   Effective Date: ${employee.activeEmployeeSchedule.effectiveDate}`);

		// Check if shifts exist
		if (!schedule.shifts || !Array.isArray(schedule.shifts)) {
			console.log("❌ Schedule has no shifts data");
			continue;
		}

		console.log(`   Shifts defined: ${(schedule.shifts as any[]).length} days`);

		// Get hire date
		const hireDate = employee.employmentHireDate
			? new Date(employee.employmentHireDate)
			: null;

		if (!hireDate) {
			console.log("❌ No hire date found");
			continue;
		}

		console.log(`\n💼 Employment:`);
		console.log(`   Hire Date: ${hireDate.toISOString().split("T")[0]}`);
		console.log(
			`   End Date: ${employee.employmentTerminationDate ? new Date(employee.employmentTerminationDate).toISOString().split("T")[0] : "Present"}`,
		);

		// Calculate working days from hire date to today
		const endDate = employee.employmentTerminationDate
			? new Date(employee.employmentTerminationDate)
			: today;
		endDate.setHours(23, 59, 59, 999);

		const startDate = new Date(hireDate);
		startDate.setHours(0, 0, 0, 0);

		let totalWorkingDays = 0;
		let absentDays = 0;
		const cursorDate = new Date(startDate);

		// Build attendance map
		const attendanceByDate = new Map<string, any>();
		(employee.attendances || []).forEach((record) => {
			if (record.date) {
				const dateStr = new Date(record.date).toISOString().split("T")[0];
				attendanceByDate.set(dateStr, record);
			}
		});

		// Count working days and absences
		while (cursorDate <= endDate) {
			const dayOfWeek = cursorDate.getDay(); // 0 = Sunday, 6 = Saturday
			const shift = findShiftForDay(schedule.shifts as any[], dayOfWeek);

			if (shift && !shift.isRestDay) {
				totalWorkingDays++;

				const dateStr = cursorDate.toISOString().split("T")[0];
				const attendance = attendanceByDate.get(dateStr);

				if (
					!attendance ||
					(attendance.status !== "PRESENT" && attendance.status !== "LEAVE")
				) {
					absentDays++;
				}
			}

			cursorDate.setDate(cursorDate.getDate() + 1);
		}

		console.log(`\n📊 Attendance Summary:`);
		console.log(`   Total Working Days (${startDate.toISOString().split("T")[0]} - ${endDate.toISOString().split("T")[0]}): ${totalWorkingDays}`);
		console.log(`   Total Attendance Records: ${employee.attendances.length}`);

		// Count by status
		const presentCount =
			employee.attendances.filter((a) => a.status === "PRESENT").length || 0;
		const leaveCount =
			employee.attendances.filter((a) => a.status === "LEAVE").length || 0;

		console.log(`\n   PRESENT: ${presentCount}`);
		console.log(`   LEAVE: ${leaveCount}`);
		console.log(`   ABSENT (calculated): ${absentDays}`);

		console.log(
			`\n${absentDays > 0 ? "✅" : "⚠️ "} Expected ABSENT count: ${absentDays}`,
		);

		if (absentDays > 0) {
			console.log("   The API should show ABSENT: " + absentDays + ", not 0");
		}
	}

	console.log("\n" + "=".repeat(60));
	console.log("\n💡 Diagnosis:");
	console.log(
		"   The issue is in employee.controller.ts lines 244-260.",
	);
	console.log(
		"   When aggregateBy='attendances' and countBy='status', the query",
	);
	console.log(
		"   includes activeEmployeeSchedule but does NOT include the nested",
	);
	console.log(
		"   'schedule' object which contains the shifts data.",
	);
	console.log(
		"\n   The calculateAbsentFromSchedule() function checks for",
	);
	console.log(
		"   activeEmployeeSchedule.shifts, but it should check for",
	);
	console.log("   activeEmployeeSchedule.schedule.shifts instead.\n");
}

/**
 * Find shift for a given day of week
 * @param shifts - Array of shifts from schedule
 * @param dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 */
function findShiftForDay(shifts: any[], dayOfWeek: number): any {
	const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const dayLabel = dayNames[dayOfWeek];

	return shifts.find(
		(shift) =>
			shift.label === dayLabel ||
			shift.label === getDayFullName(dayLabel),
	);
}

function getDayFullName(abbr: string): string {
	const map: Record<string, string> = {
		Sun: "Sunday",
		Mon: "Monday",
		Tue: "Tuesday",
		Wed: "Wednesday",
		Thu: "Thursday",
		Fri: "Friday",
		Sat: "Saturday",
	};
	return map[abbr] || abbr;
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("Error:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
