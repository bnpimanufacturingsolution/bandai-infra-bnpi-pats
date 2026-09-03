import { MongoClient } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!DATABASE_URL) {
	console.error("❌ DATABASE_URL or MONGODB_URI environment variable is required");
	process.exit(1);
}

const DB_URL: string = DATABASE_URL;
const prisma = new PrismaClient();

/**
 * Migration script to add employeeScheduleId to existing attendance records
 *
 * This script:
 * 1. Finds all attendance records without an employeeScheduleId
 * 2. For each record, finds the employee's active schedule at the time of attendance
 * 3. Updates the attendance record with the appropriate employeeScheduleId
 */
async function migrateAttendanceRecords() {
	console.log("Starting attendance migration...");
	console.log("=".repeat(80));

	try {
		// Use MongoDB native driver to find attendance records with null or missing employeeScheduleId
		// This is necessary because Prisma throws an error when querying non-nullable fields that contain null
		const client = new MongoClient(DB_URL);
		await client.connect();
		const db = client.db();
		const attendancesCollection = db.collection("attendances");
		const employeesCollection = db.collection("employees");
		const personsCollection = db.collection("persons");

		// Find all attendance records with null, missing, or empty employeeScheduleId
		const rawAttendanceRecords = await attendancesCollection
			.find({
				$or: [
					{ employeeScheduleId: null },
					{ employeeScheduleId: { $exists: false } },
					{ employeeScheduleId: "" },
				],
			})
			.toArray();

		console.log(
			`Found ${rawAttendanceRecords.length} attendance records with null or missing employeeScheduleId\n`,
		);

		// Fetch employee and person data for each attendance record
		const attendanceRecords: any[] = [];
		for (const rawRecord of rawAttendanceRecords) {
			try {
				const employeeId = rawRecord.employeeId;
				const employee = await employeesCollection.findOne({ _id: employeeId });

				if (!employee) {
					console.warn(`⚠️  Employee not found for attendance ${rawRecord._id}`);
					continue;
				}

				let person: any = null;
				if (employee.personId) {
					person = await personsCollection.findOne({ _id: employee.personId });
				}

				attendanceRecords.push({
					id: rawRecord._id.toString(),
					organizationId: rawRecord.organizationId,
					employeeId: employeeId.toString(),
					date: rawRecord.date ? new Date(rawRecord.date) : null,
					employeeScheduleId: rawRecord.employeeScheduleId || null,
					employee: {
						id: employee._id.toString(),
						employeeId: employee.employeeId as string,
						person: person
							? {
									personalInfo: (person as any).personalInfo,
								}
							: null,
					},
				});
			} catch (err: any) {
				console.error(`Error processing attendance record ${rawRecord._id}:`, err.message);
			}
		}

		await client.close();

		let successCount = 0;
		let failCount = 0;
		const failures: Array<{ attendanceId: string; error: string }> = [];

		for (const attendance of attendanceRecords) {
			try {
				// Find the employee's active schedule at the time of this attendance
				const employeeSchedule = await prisma.employeeSchedule.findFirst({
					where: {
						employeeId: attendance.employeeId,
						status: "ACTIVE",
						isDeleted: false,
						effectiveDate: {
							lte: attendance.date as Date, // Schedule must be effective on or before the attendance date
						} as any,
						OR: [
							{ endDate: null }, // Permanent assignment
							{ endDate: { gte: attendance.date as Date } }, // Or end date is after attendance date
						] as any,
					},
					orderBy: {
						effectiveDate: "desc", // Get the most recent schedule
					},
				});

				if (!employeeSchedule) {
					// If no schedule found, try to get the employee's default schedule
					const employee = await prisma.employee.findUnique({
						where: { id: attendance.employeeId },
						select: { defaultScheduleId: true },
					});

					if (employee?.defaultScheduleId) {
						// Create an EmployeeSchedule record for this employee
						const newEmployeeSchedule = await prisma.employeeSchedule.create({
							data: {
								organizationId: attendance.organizationId,
								employeeId: attendance.employeeId,
								scheduleId: employee.defaultScheduleId,
								effectiveDate: attendance.date as Date,
								endDate: null,
								status: "ACTIVE",
								reason: "Migrated from default schedule",
							},
						});

						// Update attendance with the new employeeScheduleId
						await prisma.attendance.update({
							where: { id: attendance.id },
							data: { employeeScheduleId: newEmployeeSchedule.id },
						});

						const personalInfo = attendance.employee.person?.personalInfo as any;
						const name = personalInfo
							? `${personalInfo.firstName} ${personalInfo.lastName}`
							: attendance.employee.employeeId;

						console.log(
							`✓ Created schedule and updated attendance for ${name} (${(attendance.date as Date).toISOString().split("T")[0]})`,
						);
						successCount++;
					} else {
						throw new Error("No default schedule found for employee");
					}
				} else {
					// Update attendance with the found employeeScheduleId
					await prisma.attendance.update({
						where: { id: attendance.id },
						data: { employeeScheduleId: employeeSchedule.id },
					});

					const personalInfo = attendance.employee.person?.personalInfo as any;
					const name = personalInfo
						? `${personalInfo.firstName} ${personalInfo.lastName}`
						: attendance.employee.employeeId;

					console.log(
						`✓ Updated attendance for ${name} (${(attendance.date as Date).toISOString().split("T")[0]})`,
					);
					successCount++;
				}
			} catch (error: any) {
				failCount++;
				failures.push({
					attendanceId: attendance.id,
					error: error.message,
				});

				const personalInfo = attendance.employee.person?.personalInfo as any;
				const name = personalInfo
					? `${personalInfo.firstName} ${personalInfo.lastName}`
					: attendance.employee.employeeId;

				console.error(`✗ Failed to update attendance for ${name}: ${error.message}`);
			}
		}

		console.log("\n" + "=".repeat(80));
		console.log("Migration Summary:");
		console.log("=".repeat(80));
		console.log(`Total records: ${attendanceRecords.length}`);
		console.log(`✓ Successfully updated: ${successCount}`);
		console.log(`✗ Failed: ${failCount}`);

		if (failures.length > 0) {
			console.log("\nFailures:");
			failures.forEach(({ attendanceId, error }) => {
				console.log(`  - Attendance ID ${attendanceId}: ${error}`);
			});
		}

		console.log("\n" + "=".repeat(80));
		console.log("Migration completed!");
		console.log("=".repeat(80));
	} catch (error) {
		console.error("Migration failed with error:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Run the migration
migrateAttendanceRecords()
	.then(() => {
		console.log("\nMigration script finished successfully");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\nMigration script failed:", error);
		process.exit(1);
	});
