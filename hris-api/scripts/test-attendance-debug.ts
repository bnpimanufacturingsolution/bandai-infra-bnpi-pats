/**
 * Attendance Debug Script
 * Tests and validates attendance data for a specific employee
 * Logs all relevant information to debug attendance completion issues
 */

import { PrismaClient } from "../generated/prisma";
import { findShiftForDay } from "../helper/schedule.helper";

const prisma = new PrismaClient();

async function debugAttendance() {
	console.log("=".repeat(80));
	console.log("ATTENDANCE DEBUG SCRIPT");
	console.log("=".repeat(80));
	console.log();

	// Test parameters - Update this with your employee ID
	const employeeId = "6938e705447a1aba0fdfb660";
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const todayEnd = new Date();
	todayEnd.setUTCHours(23, 59, 59, 999);

	console.log(`🔍 Employee ID: ${employeeId}`);
	console.log(`📅 Current UTC Date: ${today.toISOString()}`);
	console.log(`📅 Local Date: ${new Date().toLocaleString()}`);
	console.log(`📅 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
	console.log();

	// Step 1: Get Employee Details
	console.log("-".repeat(80));
	console.log("1. EMPLOYEE DETAILS");
	console.log("-".repeat(80));

	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		include: {
			person: {
				select: {
					personalInfo: true,
					contactInfo: true,
				},
			},
			department: {
				select: {
					id: true,
					name: true,
					code: true,
				},
			},
			position: {
				select: {
					id: true,
					title: true,
					code: true,
				},
			},
			level: {
				select: {
					id: true,
					name: true,
					rank: true,
				},
			},
			reportTo: {
				select: {
					id: true,
					employeeId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
		},
	});

	if (!employee) {
		console.error("❌ Employee not found!");
		return;
	}

	const firstName = employee.person?.personalInfo?.firstName || "N/A";
	const lastName = employee.person?.personalInfo?.lastName || "N/A";
	console.log(`✓ Name: ${firstName} ${lastName}`);
	console.log(`✓ Employee Number: ${employee.employeeId}`);
	console.log(`✓ Employment Status: ${employee.employmentStatus}`);
	console.log(`✓ Employment Type: ${employee.employmentType}`);
	console.log(`✓ Work Location: ${employee.workLocation}`);
	console.log(
		`✓ Department: ${employee.department?.name || "N/A"} (${employee.department?.code || "N/A"})`,
	);
	console.log(
		`✓ Position: ${employee.position?.title || "N/A"} (${employee.position?.code || "N/A"})`,
	);
	console.log(
		`✓ Level: ${employee.level?.name || "N/A"} (Rank: ${employee.level?.rank || "N/A"})`,
	);
	console.log(
		`✓ Hire Date: ${employee.employmentHireDate?.toISOString().split("T")[0] || "N/A"}`,
	);
	console.log(`✓ Is Manager: ${employee.isManager || false}`);
	if (employee.reportTo) {
		const reportToName =
			`${employee.reportTo.person?.personalInfo?.firstName || ""} ${employee.reportTo.person?.personalInfo?.lastName || ""}`.trim();
		console.log(`✓ Reports To: ${reportToName} (${employee.reportTo.employeeId})`);
	}
	console.log();

	// Step 2: Get Active Work Schedule
	console.log("-".repeat(80));
	console.log("2. WORK SCHEDULE DETAILS");
	console.log("-".repeat(80));

	const activeSchedules = await prisma.employeeSchedule.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			status: "ACTIVE",
			effectiveDate: { lte: todayEnd },
			OR: [{ endDate: null }, { endDate: { gte: today } }],
		},
		include: {
			schedule: true,
		},
		orderBy: { effectiveDate: "desc" },
	});

	if (activeSchedules.length === 0) {
		console.log("❌ No active schedule found!");
	} else {
		const activeSchedule = activeSchedules[0];
		const schedule = activeSchedule.schedule;
		console.log(`✓ Active Schedule: ${schedule.name}`);
		console.log(`✓ Schedule ID: ${schedule.id}`);
		console.log(`✓ Is Active: ${schedule.isActive}`);
		console.log(
			`✓ Effective Date: ${activeSchedule.effectiveDate?.toISOString().split("T")[0]}`,
		);
		console.log(
			`✓ End Date: ${activeSchedule.endDate?.toISOString().split("T")[0] || "Ongoing"}`,
		);

		console.log("\n📋 Shifts:");
		if (schedule.shifts && schedule.shifts.length > 0) {
			schedule.shifts.forEach((shift: any) => {
				console.log(
					`  - ${shift.label}: ${JSON.stringify(shift.timeSlots)} ${shift.isRestDay ? "(REST DAY)" : ""}`,
				);
			});
		} else {
			console.log("  No shifts configured");
		}

		// Check if today is a work day
		const dayOfWeek = today.getDay();
		const dayNames = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		console.log(`\n📅 Today is: ${dayNames[dayOfWeek]} (Day ${dayOfWeek})`);

		const todayShift = findShiftForDay(schedule, dayOfWeek);
		if (todayShift) {
			const timeSlots = todayShift.timeSlots || [];
			const firstSlot = timeSlots[0];
			const lastSlot = timeSlots[timeSlots.length - 1];
			if (firstSlot && lastSlot) {
				console.log(`✓ Today's Shift: ${firstSlot.startTime} - ${lastSlot.endTime}`);
			}
			console.log(`✓ Is Rest Day: ${todayShift.isRestDay ? "YES ⚠️" : "NO"}`);
		} else {
			console.log("⚠️  No shift found for today");
		}
	}
	console.log();

	// Step 3: Get Today's Attendance Records
	console.log("-".repeat(80));
	console.log("3. TODAY'S ATTENDANCE RECORDS");
	console.log("-".repeat(80));

	const todayAttendance = await prisma.attendance.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: today,
				lte: todayEnd,
			},
		},
		orderBy: { createdAt: "desc" },
	});

	if (todayAttendance.length === 0) {
		console.log("✓ No attendance records for today");
	} else {
		console.log(`⚠️  Found ${todayAttendance.length} attendance record(s) for today:`);
		todayAttendance.forEach((att, index) => {
			console.log(`\n  Record #${index + 1}:`);
			console.log(`    ID: ${att.id}`);
			console.log(`    Date: ${att.date?.toISOString()}`);
			console.log(`    Status: ${att.status}`);
			console.log(`    Check-in: ${att.timeIn?.toISOString() || "N/A"}`);
			console.log(`    Check-out: ${att.timeOut?.toISOString() || "N/A"}`);
			// Calculate hours worked if both times exist
			const hoursWorked =
				att.timeIn && att.timeOut
					? ((att.timeOut.getTime() - att.timeIn.getTime()) / (1000 * 60 * 60)).toFixed(2)
					: "N/A";
			console.log(`    Hours Worked: ${hoursWorked}`);
			const isComplete = !!(att.timeIn && att.timeOut);
			console.log(`    Is Complete: ${isComplete}`);
			console.log(`    Created At: ${att.createdAt?.toISOString()}`);
			console.log(`    Updated At: ${att.updatedAt?.toISOString()}`);
			if (att.notes) {
				console.log(`    Notes: ${att.notes}`);
			}
		});
	}
	console.log();

	// Step 4: Get Last 7 Days Attendance
	console.log("-".repeat(80));
	console.log("4. RECENT ATTENDANCE HISTORY (Last 7 Days)");
	console.log("-".repeat(80));

	const sevenDaysAgo = new Date(today);
	sevenDaysAgo.setDate(today.getDate() - 7);

	const recentAttendance = await prisma.attendance.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: sevenDaysAgo,
				lte: todayEnd,
			},
		},
		orderBy: { date: "desc" },
	});

	console.log(`Found ${recentAttendance.length} attendance record(s) in the last 7 days:`);
	if (recentAttendance.length > 0) {
		console.log();
		recentAttendance.forEach((att) => {
			const dateStr = att.date?.toISOString().split("T")[0] || "N/A";
			const checkIn = att.timeIn?.toISOString().split("T")[1].substring(0, 8) || "N/A";
			const checkOut = att.timeOut?.toISOString().split("T")[1].substring(0, 8) || "N/A";
			const status = att.status.padEnd(10);
			const complete = att.timeIn && att.timeOut ? "✓" : "✗";
			console.log(
				`  ${dateStr} | ${status} | In: ${checkIn} | Out: ${checkOut} | Complete: ${complete}`,
			);
		});
	}
	console.log();

	// Step 5: Database Date Check
	console.log("-".repeat(80));
	console.log("5. DATABASE DATE & TIMEZONE CHECK");
	console.log("-".repeat(80));

	// For MongoDB, we use JavaScript Date directly
	const systemNow = new Date();
	console.log(`System Time (UTC): ${systemNow.toISOString()}`);
	console.log(`System Time (Local): ${systemNow.toLocaleString()}`);

	// Check if dates match
	const todayDateStr = today.toISOString().split("T")[0];
	console.log(`\n📅 Today's Date String (for queries): ${todayDateStr}`);
	console.log();

	// Step 6: Analysis & Recommendations
	console.log("-".repeat(80));
	console.log("6. ANALYSIS & RECOMMENDATIONS");
	console.log("-".repeat(80));

	if (todayAttendance.length > 0) {
		const att = todayAttendance[0];
		console.log("⚠️  ISSUE DETECTED:");
		console.log(`   An attendance record already exists for today.`);
		console.log(`   Status: ${att.status}`);
		const isComplete = !!(att.timeIn && att.timeOut);
		console.log(`   Is Complete: ${isComplete}`);
		console.log();
		console.log("💡 POSSIBLE CAUSES:");
		console.log("   1. Employee has already checked in today");
		console.log("   2. An attendance record was created by the system");
		console.log("   3. There's a duplicate attendance record");
		console.log("   4. Date/timezone mismatch between client and server");
		console.log();
		console.log("🔧 RECOMMENDATIONS:");
		console.log("   1. Check the attendance API to see if it prevents duplicate records");
		console.log("   2. Verify date comparison logic uses consistent timezone");
		console.log("   3. Add a check to prevent creating attendance for same employee+date");
		console.log(
			"   4. Consider adding a 'lastCheckIn' timestamp to prevent multiple check-ins",
		);
	} else {
		console.log("✓ No attendance record found for today - employee can check in");
	}
	console.log();

	console.log("=".repeat(80));
	console.log("DEBUG COMPLETE");
	console.log("=".repeat(80));
}

// Run the debug script
debugAttendance()
	.catch((error) => {
		console.error("❌ Debug script failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
