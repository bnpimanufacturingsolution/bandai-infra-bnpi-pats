/**
 * Check Attendance Status Script
 * Displays attendance records from the database with status information
 * Useful for verifying import results and checking data integrity
 */

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function checkAttendanceStatus() {
	console.log("=".repeat(80));
	console.log("ATTENDANCE STATUS CHECK");
	console.log("=".repeat(80));
	console.log();

	try {
		console.log("🔍 Checking attendance records from January 2026...\n");

		// Get first 20 attendance records from January 2026
		const records = await prisma.attendance.findMany({
			where: {
				date: {
					gte: new Date("2026-01-01"),
					lte: new Date("2026-01-31"),
				},
				isDeleted: false,
			},
			include: {
				employee: {
					select: {
						employeeId: true,
						person: {
							select: {
								personalInfo: {
									select: {
										firstName: true,
										lastName: true,
									},
								},
							},
						},
					},
				},
			},
			orderBy: {
				date: "asc",
			},
			take: 20,
		});

		if (records.length === 0) {
			console.log("❌ No attendance records found in January 2026");
			console.log("\nℹ️  If you just imported, this might indicate an issue.");
		} else {
			console.log(`✅ Found ${records.length} records (showing first 20):\n`);
			console.log("-".repeat(80));

			records.forEach((record, i) => {
				const personalInfo = record.employee?.person?.personalInfo;
				const name = personalInfo
					? `${personalInfo.firstName} ${personalInfo.lastName}`
					: "Unknown";

				const dateStr = record.date ? record.date.toISOString().split("T")[0] : "N/A";

				console.log(
					`${(i + 1).toString().padStart(2, " ")}. ${dateStr} | EmpID: ${record.employee?.employeeId?.padEnd(10, " ") || "N/A".padEnd(10, " ")} | ${name}`,
				);
				console.log(`    Status: ${record.status || "❌ NULL"}`);
				console.log(
					`    Time In:  ${record.timeIn ? new Date(record.timeIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : "❌ NULL"}`,
				);
				console.log(
					`    Time Out: ${record.timeOut ? new Date(record.timeOut).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : "⚠️  NULL"}`,
				);
				console.log(`    Manual Entry: ${record.isManualEntry ? "✓" : "✗"}`);
				if (record.deviceInfo && typeof record.deviceInfo === "object") {
					const deviceInfo = record.deviceInfo as { source?: string };
					console.log(`    Source: ${deviceInfo.source || "N/A"}`);
				}
				console.log("");
			});

			console.log("-".repeat(80));

			// Statistics
			const missingStatus = records.filter((r) => !r.status);
			if (missingStatus.length > 0) {
				console.log(`\n⚠️  WARNING: ${missingStatus.length} records have NULL status!`);
			}

			const presentCount = records.filter((r) => r.status === "PRESENT").length;
			const leaveCount = records.filter((r) => r.status === "LEAVE").length;
			const nullCount = records.filter((r) => !r.status).length;
			const manualCount = records.filter((r) => r.isManualEntry).length;

			console.log("\n📊 SUMMARY");
			console.log("-".repeat(80));
			console.log(`Total Checked:    ${records.length}`);
			console.log(`  ✅ PRESENT:     ${presentCount}`);
			console.log(`  📅 LEAVE:       ${leaveCount}`);
			console.log(`  ❌ NULL:        ${nullCount}`);
			console.log(`  ✋ Manual Entry: ${manualCount}`);
			console.log("-".repeat(80));

			// Get total count in database
			const totalCount = await prisma.attendance.count({
				where: {
					date: {
						gte: new Date("2026-01-01"),
						lte: new Date("2026-01-31"),
					},
					isDeleted: false,
				},
			});

			if (totalCount > records.length) {
				console.log(
					`\nℹ️  Showing ${records.length} of ${totalCount} total records in January 2026`,
				);
			}
		}

		console.log("\n✅ Done!\n");
	} catch (error) {
		console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
		if (error instanceof Error && error.stack) {
			console.error("\nStack trace:");
			console.error(error.stack);
		}
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the script
checkAttendanceStatus();
