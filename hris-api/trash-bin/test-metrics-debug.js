/**
 * Debug script for metrics calculation
 */

const { PrismaClient } = require("./generated/prisma");
const { findShiftForDay } = require("../helper/schedule.helper");

const prisma = new PrismaClient();

async function debug() {
	console.log("🔍 DEBUGGING METRICS CALCULATION");
	console.log("=".repeat(80));

	const dateFrom = "2026-01-11";
	const dateTo = "2026-01-11";
	const orgId = "69884da971e2dc9d6ac67b59";

	console.log("📅 Date Range:", dateFrom, "to", dateTo);
	console.log("🏢 Organization:", orgId);
	console.log();

	// Mimic the metrics controller logic
	const startDate = new Date(dateFrom);
	startDate.setUTCHours(0, 0, 0, 0);
	const endDate = new Date(dateTo);
	endDate.setUTCHours(23, 59, 59, 999);

	console.log("🕐 Start Date:", startDate.toISOString());
	console.log("🕐 End Date:", endDate.toISOString());
	console.log();

	// Pull employees with schedules and attendance for the window
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: orgId,
			isDeleted: false,
			employmentStatus: "ACTIVE",
			employmentHireDate: { lte: endDate },
		},
		select: {
			id: true,
			employeeId: true,
			employmentHireDate: true,
			employmentTerminationDate: true,
			schedule: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			attendances: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
				select: { status: true, date: true },
			},
		},
	});

	console.log(`✅ Found ${employees.length} active employees`);
	console.log();

	let present = 0;
	let leave = 0;
	let absent = 0;

	const cursorDate = new Date(startDate);
	let dayCount = 0;

	while (cursorDate <= endDate) {
		dayCount++;
		console.log(`\n📅 DAY ${dayCount}: ${cursorDate.toISOString()}`);

		const dayStart = new Date(cursorDate);
		const dayEnd = new Date(cursorDate);
		dayStart.setUTCHours(0, 0, 0, 0);
		dayEnd.setUTCHours(23, 59, 59, 999);
		const dayOfWeek = cursorDate.getUTCDay(); // Use UTC day

		console.log(`   Day of Week: ${dayOfWeek} (0=Sun, 1=Mon, ...)`);
		console.log(`   Day Start: ${dayStart.toISOString()}`);
		console.log(`   Day End: ${dayEnd.toISOString()}`);

		let dayPresent = 0;
		let dayLeave = 0;
		let dayAbsent = 0;
		let daySkipped = 0;

		for (const emp of employees) {
			const name =
				`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim() ||
				emp.employeeId;

			// Skip if not employed on this day
			if (emp.employmentHireDate > dayEnd) {
				console.log(`   ⏭️  ${name}: Not yet hired`);
				daySkipped++;
				continue;
			}
			if (emp.employmentTerminationDate && emp.employmentTerminationDate < dayStart) {
				console.log(`   ⏭️  ${name}: Already terminated`);
				daySkipped++;
				continue;
			}

			// Determine schedule to use
			const activeSchedule = emp.schedule;

			if (!activeSchedule) {
				console.log(`   ⏭️  ${name}: No schedule`);
				daySkipped++;
				continue;
			}

			const shift = findShiftForDay(activeSchedule, dayOfWeek);
			if (!shift) {
				console.log(`   ⏭️  ${name}: No shift found for day ${dayOfWeek}`);
				daySkipped++;
				continue;
			}

			if (shift.isRestDay) {
				console.log(`   ⏭️  ${name}: Rest day (${shift.label})`);
				daySkipped++;
				continue;
			}

			console.log(`   👤 ${name}: Work day (${shift.label})`);

			// Attendance for this day
			const attendance = emp.attendances.find((a) => {
				if (!a.date) return false;
				const d = new Date(a.date);
				const match = d >= dayStart && d <= dayEnd;
				if (match) {
					console.log(
						`      ✅ Found attendance: ${d.toISOString()} (status: ${a.status})`,
					);
				}
				return match;
			});

			if (!attendance) {
				// No attendance record on a work day = ABSENT
				console.log(`      ❌ No attendance record → ABSENT`);
				absent++;
				dayAbsent++;
				continue;
			}

			// Count based on actual attendance status
			if (attendance.status === "LEAVE") {
				console.log(`      🏖️  LEAVE`);
				leave++;
				dayLeave++;
			} else {
				console.log(`      ✅ ${attendance.status} (counted as PRESENT)`);
				present++;
				dayPresent++;
			}
		}

		console.log(
			`\n   📊 Day Summary: Present=${dayPresent}, Leave=${dayLeave}, Absent=${dayAbsent}, Skipped=${daySkipped}`,
		);

		cursorDate.setUTCDate(cursorDate.getUTCDate() + 1); // Use UTC date increment
	}

	console.log("\n\n" + "=".repeat(80));
	console.log("📊 FINAL RESULTS:");
	console.log("   PRESENT:", present);
	console.log("   LEAVE:", leave);
	console.log("   ABSENT:", absent);
	console.log("=".repeat(80));

	await prisma.$disconnect();
}

debug().catch(console.error);
