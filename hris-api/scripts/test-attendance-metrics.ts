/**
 * Attendance Metrics Test Script
 * Tests the metrics endpoint to verify ABSENT calculation is working correctly
 */

import { PrismaClient } from "../generated/prisma";
import { findShiftForDay } from "../helper/schedule.helper";
import { calculateAttendanceStatusSummary } from "../helper/attendance-metrics.helper";

const prisma = new PrismaClient();

async function testAttendanceMetrics() {
	console.log("=".repeat(80));
	console.log("ATTENDANCE METRICS TEST SCRIPT");
	console.log("=".repeat(80));
	console.log();

	// Test date range - yesterday and today
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const dateFrom = yesterday.toISOString().split("T")[0];
	const dateTo = today.toISOString().split("T")[0];

	console.log(`📅 Testing Date Range: ${dateFrom} to ${dateTo}`);
	console.log();

	// Get organization
	const org = await prisma.employee.findFirst({
		where: { isDeleted: false },
		select: { organizationId: true },
	});

	if (!org?.organizationId) {
		console.error("❌ No organization found!");
		return;
	}

	console.log(`🏢 Organization ID: ${org.organizationId}`);
	console.log();

	// Step 1: Get all active employees
	console.log("-".repeat(80));
	console.log("1. ACTIVE EMPLOYEES");
	console.log("-".repeat(80));

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: org.organizationId,
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
			schedule: true,
			attendances: {
				where: {
					isDeleted: false,
					date: {
						gte: yesterday,
						lte: new Date(today.getTime() + 86400000 - 1),
					},
				},
				select: {
					date: true,
					status: true,
					timeIn: true,
					timeOut: true,
				},
			},
		},
	});

	console.log(`✓ Found ${employees.length} active employees`);

	// Show each employee's schedule status
	console.log("\n👥 EMPLOYEE SCHEDULE STATUS:");
	for (const emp of employees) {
		const firstName = emp.person?.personalInfo?.firstName || "";
		const lastName = emp.person?.personalInfo?.lastName || "";
		const name = `${firstName} ${lastName}`.trim() || emp.employeeId;

		if (!emp.schedule) {
			console.log(`  ❌ ${name}: NO SCHEDULE ASSIGNED`);
		} else {
			const monShift = (emp.schedule as any).mon;
			const monStatus = monShift
				? monShift.isRestDay
					? "REST DAY ⛱️"
					: "WORK DAY ✓"
				: "NO SHIFT";
			console.log(`  📋 ${name}: Monday = ${monStatus}`);
		}
	}
	console.log();

	// Step 2: Manual calculation (same logic as metrics endpoint)
	console.log("-".repeat(80));
	console.log("2. MANUAL CALCULATION (Expected Results)");
	console.log("-".repeat(80));

	let expectedPresent = 0;
	let expectedLeave = 0;
	let expectedAbsent = 0;

	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	// Iterate through each day
	const cursorDate = new Date(yesterday);
	while (cursorDate <= today) {
		const dayStart = new Date(cursorDate);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(cursorDate);
		dayEnd.setHours(23, 59, 59, 999);
		const dayOfWeek = cursorDate.getDay();
		const dayName = dayNames[dayOfWeek];

		console.log(`\n📅 ${dayName} (${cursorDate.toISOString().split("T")[0]}):`);

		let dayPresent = 0;
		let dayLeave = 0;
		let dayAbsent = 0;
		let workDayCount = 0;

		for (const emp of employees) {
			const firstName = emp.person?.personalInfo?.firstName || "";
			const lastName = emp.person?.personalInfo?.lastName || "";
			const name = `${firstName} ${lastName}`.trim() || emp.employeeId;

			const activeSchedule = emp.schedule;
			if (!activeSchedule) {
				console.log(`  ⚠️ ${name}: SKIPPED (no schedule)`);
				continue;
			}

			const shift = findShiftForDay(activeSchedule as any, dayOfWeek);
			if (!shift || shift.isRestDay) {
				console.log(`  ⚠️ ${name}: SKIPPED (rest day or no shift)`);
				continue;
			}

			workDayCount++;

			// Find attendance for this day
			const attendance = emp.attendances.find((a) => {
				if (!a.date) return false;
				const d = new Date(a.date);
				return d >= dayStart && d <= dayEnd;
			});

			if (!attendance) {
				dayAbsent++;
				console.log(`  ❌ ${name}: ABSENT (no record)`);
			} else if (attendance.status === "LEAVE") {
				dayLeave++;
				console.log(`  🏖️ ${name}: LEAVE`);
			} else {
				dayPresent++;
				console.log(`  ✓ ${name}: ${attendance.status} (counted as PRESENT)`);
			}
		}

		console.log(
			`  📊 Work Days: ${workDayCount}, Present: ${dayPresent}, Leave: ${dayLeave}, Absent: ${dayAbsent}`,
		);

		expectedPresent += dayPresent;
		expectedLeave += dayLeave;
		expectedAbsent += dayAbsent;

		cursorDate.setDate(cursorDate.getDate() + 1);
	}

	console.log();
	console.log("📊 EXPECTED TOTALS:");
	console.log(`   PRESENT: ${expectedPresent}`);
	console.log(`   LEAVE: ${expectedLeave}`);
	console.log(`   ABSENT: ${expectedAbsent}`);
	console.log();

	// Step 3: Simulate metrics endpoint call
	console.log("-".repeat(80));
	console.log("3. METRICS ENDPOINT SIMULATION (using helper)");
	console.log("-".repeat(80));

	// Use the helper function that the metrics controller uses
	const startDate = new Date(yesterday);
	startDate.setHours(0, 0, 0, 0);
	const endDate = new Date(today);
	endDate.setHours(23, 59, 59, 999);

	const metricsResult = await calculateAttendanceStatusSummary(
		prisma,
		org.organizationId,
		startDate,
		endDate,
	);

	console.log(`✓ Metrics calculation complete`);
	console.log();
	console.log("📊 METRICS RESULTS:");
	console.log(`   PRESENT: ${metricsResult.PRESENT}`);
	console.log(`   LEAVE: ${metricsResult.LEAVE}`);
	console.log(`   ABSENT: ${metricsResult.ABSENT}`);
	console.log();

	// Step 4: Compare results
	console.log("-".repeat(80));
	console.log("4. COMPARISON & VALIDATION");
	console.log("-".repeat(80));

	const presentMatch = metricsResult.PRESENT === expectedPresent;
	const leaveMatch = metricsResult.LEAVE === expectedLeave;
	const absentMatch = metricsResult.ABSENT === expectedAbsent;

	console.log(
		`PRESENT: ${metricsResult.PRESENT} vs ${expectedPresent} ${presentMatch ? "✓" : "❌"}`,
	);
	console.log(`LEAVE: ${metricsResult.LEAVE} vs ${expectedLeave} ${leaveMatch ? "✓" : "❌"}`);
	console.log(`ABSENT: ${metricsResult.ABSENT} vs ${expectedAbsent} ${absentMatch ? "✓" : "❌"}`);
	console.log();

	if (presentMatch && leaveMatch && absentMatch) {
		console.log("🎉 SUCCESS! All metrics match expected values!");
	} else {
		console.log("⚠️  WARNING! Metrics do not match expected values!");
	}
	console.log();

	// Step 5: API Call Example
	console.log("-".repeat(80));
	console.log("5. API CALL EXAMPLE");
	console.log("-".repeat(80));

	const curlCommand = `curl 'http://localhost:3001/api/metrics' \\
  -H 'Accept: */*' \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"model":"Attendance","data":["statusSummary"],"filter":{"dateFrom":"${dateFrom}","dateTo":"${dateTo}"}}'`;

	console.log(curlCommand);
	console.log();

	console.log("Expected Response:");
	console.log(
		JSON.stringify(
			{
				statusSummary: {
					PRESENT: metricsResult.PRESENT,
					LEAVE: metricsResult.LEAVE,
					ABSENT: metricsResult.ABSENT,
				},
			},
			null,
			2,
		),
	);
	console.log();

	console.log("=".repeat(80));
	console.log("TEST COMPLETE");
	console.log("=".repeat(80));
}

// Run the test
testAttendanceMetrics()
	.catch((error) => {
		console.error("Test failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
