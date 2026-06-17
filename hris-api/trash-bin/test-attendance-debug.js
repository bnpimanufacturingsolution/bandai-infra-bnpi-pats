/**
 * Debug script for attendance metrics
 */

const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

async function debug() {
	console.log("🔍 DEBUGGING ATTENDANCE METRICS");
	console.log("=".repeat(80));

	const yesterday = new Date("2026-01-10");
	const today = new Date("2026-01-11");
	const orgId = "69884da971e2dc9d6ac67b59";

	console.log("📅 Date Range:", yesterday.toISOString(), "to", today.toISOString());
	console.log("🏢 Organization:", orgId);
	console.log();

	// Get all employees with schedules
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: orgId,
			isDeleted: false,
			employmentStatus: "ACTIVE",
		},
		include: {
			person: {
				select: {
					personalInfo: true,
				},
			},
			schedule: true,
		},
	});

	console.log(`✅ Found ${employees.length} active employees`);
	console.log();

	for (const emp of employees) {
		const name =
			`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim() ||
			emp.employeeId;

		console.log(`\n👤 ${name} (${emp.id})`);
		console.log(`   Hire Date: ${emp.employmentHireDate}`);
		console.log(`   Schedule: ${emp.schedule ? "✓" : "❌"}`);

		if (emp.schedule) {
			console.log(`   Schedule ID: ${emp.schedule.id}`);
			console.log(`   Schedule Type: ${emp.schedule.type}`);
			console.log(`   Shifts:`, JSON.stringify(emp.schedule.shifts, null, 2));
		}
	}

	console.log("\n\n🔍 CHECKING MONDAY (2026-01-11) - Day of Week = 1");
	console.log("=".repeat(80));

	// Check each employee's schedule for Monday
	const dayOfWeek = 1; // Monday
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	for (const emp of employees) {
		const name =
			`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim() ||
			emp.employeeId;

		console.log(`\n👤 ${name}`);

		if (!emp.schedule) {
			console.log("   ❌ No schedule");
			continue;
		}

		if (!emp.schedule.shifts || !Array.isArray(emp.schedule.shifts)) {
			console.log("   ❌ No shifts array");
			continue;
		}

		console.log(`   Shifts count: ${emp.schedule.shifts.length}`);

		// Try to find Monday shift
		const mondayShift = emp.schedule.shifts.find((shift) => {
			const label = shift.label.toLowerCase();
			return (
				label.includes("monday") ||
				label.includes("mon") ||
				"monday".includes(label) ||
				"mon".includes(label)
			);
		});

		if (!mondayShift) {
			console.log("   ❌ No Monday shift found");
			console.log("   Available shifts:", emp.schedule.shifts.map((s) => s.label).join(", "));
		} else {
			console.log("   ✅ Monday shift found:", mondayShift.label);
			console.log("   Is Rest Day:", mondayShift.isRestDay);
			console.log("   Time:", `${mondayShift.timeIn} - ${mondayShift.timeOut}`);
		}
	}

	// Check attendance records for the date range
	console.log("\n\n📋 ATTENDANCE RECORDS");
	console.log("=".repeat(80));

	// First, let's see ALL attendance records
	const allAttendances = await prisma.attendance.findMany({
		where: {
			isDeleted: false,
		},
		orderBy: {
			date: "desc",
		},
		take: 10,
		include: {
			employee: {
				include: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
		},
	});

	console.log(`\n📊 Recent attendance records (all dates):`);
	for (const att of allAttendances) {
		const name =
			`${att.employee.person?.personalInfo?.firstName || ""} ${att.employee.person?.personalInfo?.lastName || ""}`.trim() ||
			att.employee.employeeId;
		console.log(`   ${name}: ${att.date} (${typeof att.date}) - ${att.status}`);
	}

	const startDate = new Date(yesterday);
	startDate.setUTCHours(0, 0, 0, 0);
	const endDate = new Date(today);
	endDate.setUTCHours(23, 59, 59, 999);

	console.log("\n📅 Filtering for date range:");
	console.log("   Start Date (UTC):", startDate.toISOString());
	console.log("   End Date (UTC):", endDate.toISOString());
	console.log();

	const attendances = await prisma.attendance.findMany({
		where: {
			isDeleted: false,
			date: {
				gte: startDate,
				lte: endDate,
			},
		},
		include: {
			employee: {
				include: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
		},
	});

	console.log(`Found ${attendances.length} attendance records in date range`);

	for (const att of attendances) {
		const name =
			`${att.employee.person?.personalInfo?.firstName || ""} ${att.employee.person?.personalInfo?.lastName || ""}`.trim() ||
			att.employee.employeeId;

		console.log(`\n👤 ${name}`);
		console.log(`   Date: ${att.date}`);
		console.log(`   Status: ${att.status}`);
		console.log(`   Time In: ${att.timeIn || "N/A"}`);
		console.log(`   Time Out: ${att.timeOut || "N/A"}`);
	}

	await prisma.$disconnect();
}

debug().catch(console.error);
