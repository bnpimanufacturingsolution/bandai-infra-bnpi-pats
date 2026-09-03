/**
 * Attendance Clock-In Test Script
 * Tests the clock-in logic to debug "already clocked in" issue
 * Simulates the exact API call and validates date/timezone handling
 */

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function testAttendanceClockIn() {
	console.log("=".repeat(80));
	console.log("ATTENDANCE CLOCK-IN TEST");
	console.log("=".repeat(80));
	console.log();

	// Test parameters from the curl request
	const employeeId = "6938e705447a1aba0fdfb660";
	const requestStatus = "PRESENT";

	console.log(`🔍 Employee ID: ${employeeId}`);
	console.log(`📝 Request Status: ${requestStatus}`);
	console.log();

	// Step 1: Current Time Information
	console.log("-".repeat(80));
	console.log("1. CURRENT TIME & TIMEZONE INFORMATION");
	console.log("-".repeat(80));

	const now = new Date();
	console.log(`System Time (UTC): ${now.toISOString()}`);
	console.log(`System Time (Local): ${now.toLocaleString()}`);
	console.log(`System Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
	console.log();

	// What "today" means in different contexts
	const todayUTC = new Date();
	todayUTC.setUTCHours(0, 0, 0, 0);
	const todayEndUTC = new Date();
	todayEndUTC.setUTCHours(23, 59, 59, 999);

	const todayLocal = new Date();
	todayLocal.setHours(0, 0, 0, 0);
	const todayEndLocal = new Date();
	todayEndLocal.setHours(23, 59, 59, 999);

	console.log("📅 Date Ranges:");
	console.log(`  UTC Today Start:   ${todayUTC.toISOString()}`);
	console.log(`  UTC Today End:     ${todayEndUTC.toISOString()}`);
	console.log(`  Local Today Start: ${todayLocal.toISOString()}`);
	console.log(`  Local Today End:   ${todayEndLocal.toISOString()}`);
	console.log();

	// Step 2: Check Employee Exists
	console.log("-".repeat(80));
	console.log("2. EMPLOYEE VALIDATION");
	console.log("-".repeat(80));

	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		select: {
			id: true,
			employeeId: true,
			employmentStatus: true,
			person: {
				select: {
					personalInfo: true,
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
	console.log(`✓ Employee Found: ${firstName} ${lastName}`);
	console.log(`✓ Employee Number: ${employee.employeeId}`);
	console.log(`✓ Status: ${employee.employmentStatus}`);
	console.log();

	// Step 3: Check Existing Attendance Records (Using UTC)
	console.log("-".repeat(80));
	console.log("3. EXISTING ATTENDANCE RECORDS (UTC Range)");
	console.log("-".repeat(80));

	const existingAttendanceUTC = await prisma.attendance.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: todayUTC,
				lte: todayEndUTC,
			},
		},
		orderBy: { createdAt: "desc" },
	});

	console.log(`Query Range: ${todayUTC.toISOString()} to ${todayEndUTC.toISOString()}`);
	console.log(`Found: ${existingAttendanceUTC.length} record(s)`);
	console.log();

	if (existingAttendanceUTC.length > 0) {
		console.log("⚠️  ATTENDANCE RECORDS FOUND (UTC):");
		existingAttendanceUTC.forEach((att, index) => {
			console.log(`\n  Record #${index + 1}:`);
			console.log(`    ID: ${att.id}`);
			console.log(`    Date: ${att.date?.toISOString()}`);
			console.log(`    Status: ${att.status}`);
			console.log(`    Time In: ${att.timeIn?.toISOString() || "N/A"}`);
			console.log(`    Time Out: ${att.timeOut?.toISOString() || "N/A"}`);
			console.log(`    Created At: ${att.createdAt?.toISOString()}`);
			console.log(`    Updated At: ${att.updatedAt?.toISOString()}`);

			// Check if this record has both timeIn and timeOut
			const hasTimeIn = !!att.timeIn;
			const hasTimeOut = !!att.timeOut;
			console.log(`    Has Time In: ${hasTimeIn}`);
			console.log(`    Has Time Out: ${hasTimeOut}`);
			console.log(`    Can Clock Out: ${hasTimeIn && !hasTimeOut}`);
		});
		console.log();
	} else {
		console.log("✓ No attendance records found for today (UTC range)");
		console.log();
	}

	// Step 4: Check Existing Attendance Records (Using Local)
	console.log("-".repeat(80));
	console.log("4. EXISTING ATTENDANCE RECORDS (Local Range)");
	console.log("-".repeat(80));

	const existingAttendanceLocal = await prisma.attendance.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: todayLocal,
				lte: todayEndLocal,
			},
		},
		orderBy: { createdAt: "desc" },
	});

	console.log(`Query Range: ${todayLocal.toISOString()} to ${todayEndLocal.toISOString()}`);
	console.log(`Found: ${existingAttendanceLocal.length} record(s)`);
	console.log();

	if (existingAttendanceLocal.length > 0) {
		console.log("⚠️  ATTENDANCE RECORDS FOUND (Local):");
		existingAttendanceLocal.forEach((att, index) => {
			console.log(`\n  Record #${index + 1}:`);
			console.log(`    ID: ${att.id}`);
			console.log(`    Date: ${att.date?.toISOString()}`);
			console.log(`    Date (Local): ${att.date?.toLocaleString()}`);
			console.log(`    Status: ${att.status}`);
			console.log(`    Time In: ${att.timeIn?.toISOString() || "N/A"}`);
			console.log(`    Time Out: ${att.timeOut?.toISOString() || "N/A"}`);

			// Date comparison
			const attDate = att.date ? new Date(att.date) : null;
			if (attDate) {
				const isSameDayUTC =
					attDate.getUTCFullYear() === todayUTC.getUTCFullYear() &&
					attDate.getUTCMonth() === todayUTC.getUTCMonth() &&
					attDate.getUTCDate() === todayUTC.getUTCDate();

				const isSameDayLocal =
					attDate.getFullYear() === todayLocal.getFullYear() &&
					attDate.getMonth() === todayLocal.getMonth() &&
					attDate.getDate() === todayLocal.getDate();

				console.log(`    Same Day (UTC): ${isSameDayUTC}`);
				console.log(`    Same Day (Local): ${isSameDayLocal}`);
			}
		});
		console.log();
	} else {
		console.log("✓ No attendance records found for today (Local range)");
		console.log();
	}

	// Step 5: Check All Recent Attendance (Last 3 days)
	console.log("-".repeat(80));
	console.log("5. RECENT ATTENDANCE HISTORY (Last 3 Days)");
	console.log("-".repeat(80));

	const threeDaysAgo = new Date();
	threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
	threeDaysAgo.setHours(0, 0, 0, 0);

	const allRecentAttendance = await prisma.attendance.findMany({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: threeDaysAgo,
			},
		},
		orderBy: { date: "desc" },
	});

	console.log(`Found: ${allRecentAttendance.length} record(s) in last 3 days`);
	console.log();

	if (allRecentAttendance.length > 0) {
		console.log("📋 All Recent Records:");
		allRecentAttendance.forEach((att) => {
			const dateStr = att.date?.toISOString().split("T")[0] || "N/A";
			const timeInStr = att.timeIn?.toISOString().split("T")[1].substring(0, 8) || "N/A";
			const timeOutStr = att.timeOut?.toISOString().split("T")[1].substring(0, 8) || "N/A";
			const status = att.status.padEnd(10);
			const complete = att.timeIn && att.timeOut ? "✓" : "✗";

			console.log(
				`  ${dateStr} | ${status} | In: ${timeInStr} | Out: ${timeOutStr} | Complete: ${complete}`,
			);
		});
		console.log();
	}

	// Step 6: Simulate Backend Logic
	console.log("-".repeat(80));
	console.log("6. BACKEND LOGIC SIMULATION");
	console.log("-".repeat(80));

	// This simulates what the backend likely does
	const startOfDay = new Date();
	startOfDay.setUTCHours(0, 0, 0, 0);
	const endOfDay = new Date();
	endOfDay.setUTCHours(23, 59, 59, 999);

	console.log("Backend likely checks:");
	console.log(`  Start of day: ${startOfDay.toISOString()}`);
	console.log(`  End of day:   ${endOfDay.toISOString()}`);
	console.log();

	const backendCheck = await prisma.attendance.findFirst({
		where: {
			employeeId: employeeId,
			isDeleted: false,
			date: {
				gte: startOfDay,
				lte: endOfDay,
			},
		},
	});

	if (backendCheck) {
		console.log("❌ BACKEND WOULD REJECT: Attendance record already exists");
		console.log(`   Record ID: ${backendCheck.id}`);
		console.log(`   Record Date: ${backendCheck.date?.toISOString()}`);
		console.log(`   Record Status: ${backendCheck.status}`);
		console.log(`   Has Time In: ${!!backendCheck.timeIn}`);
		console.log(`   Has Time Out: ${!!backendCheck.timeOut}`);
		console.log();

		console.log("🔍 WHY THIS FAILS:");
		const recordDate = backendCheck.date ? new Date(backendCheck.date) : null;
		if (recordDate) {
			console.log(`   Record Date (ISO): ${recordDate.toISOString()}`);
			console.log(`   Record Date (Local): ${recordDate.toLocaleString()}`);
			console.log(`   Start of Day (UTC): ${startOfDay.toISOString()}`);
			console.log(`   End of Day (UTC): ${endOfDay.toISOString()}`);
			console.log();

			const isInRange = recordDate >= startOfDay && recordDate <= endOfDay;
			console.log(`   Record is in today's range: ${isInRange}`);

			// Check actual date values
			console.log();
			console.log("📅 Date Component Comparison:");
			console.log(`   Record Date: ${recordDate.getUTCFullYear()}-${String(recordDate.getUTCMonth() + 1).padStart(2, "0")}-${String(recordDate.getUTCDate()).padStart(2, "0")}`);
			console.log(`   Today's Date: ${startOfDay.getUTCFullYear()}-${String(startOfDay.getUTCMonth() + 1).padStart(2, "0")}-${String(startOfDay.getUTCDate()).padStart(2, "0")}`);
		}
	} else {
		console.log("✓ BACKEND WOULD ACCEPT: No existing attendance record");
		console.log("   Employee can clock in");
	}
	console.log();

	// Step 7: Analysis & Recommendations
	console.log("-".repeat(80));
	console.log("7. ANALYSIS & RECOMMENDATIONS");
	console.log("-".repeat(80));

	if (existingAttendanceUTC.length > 0 || existingAttendanceLocal.length > 0) {
		console.log("⚠️  ISSUE IDENTIFIED:");
		console.log(
			"   Attendance record exists for 'today' based on date range query",
		);
		console.log();

		console.log("💡 POSSIBLE CAUSES:");
		console.log("   1. Timezone mismatch between client and server");
		console.log("   2. Date stored in database includes time component");
		console.log("   3. Backend using UTC midnight while client uses local midnight");
		console.log("   4. Record from previous day still in range due to timezone offset");
		console.log();

		console.log("🔧 RECOMMENDATIONS:");
		console.log("   1. Check backend attendance endpoint code for date comparison logic");
		console.log("   2. Ensure consistent timezone handling (always use UTC or always local)");
		console.log("   3. Store date as date-only (no time component) in database");
		console.log("   4. Add logging to backend to see what date range is being checked");
		console.log(
			"   5. Consider using date strings (YYYY-MM-DD) instead of Date objects for comparison",
		);
	} else {
		console.log("✓ No issues found - employee should be able to clock in");
	}
	console.log();

	console.log("=".repeat(80));
	console.log("TEST COMPLETE");
	console.log("=".repeat(80));
}

// Run the test
testAttendanceClockIn()
	.catch((error) => {
		console.error("❌ Test failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
