/**
 * Migration Script: Populate code field for existing timesheets
 * Run this before applying the schema changes
 */

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function generateUniqueCode(existingCodes: Set<string>): Promise<string> {
	// Generate date prefix (YYYYMMDD)
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const datePrefix = `${year}${month}${day}`;

	// Get timestamp in milliseconds
	const timestamp = Date.now();

	// Construct code: YYYYMMDD + timestamp
	const code = `${datePrefix}${timestamp}`;

	// Check if code already exists in set
	if (!existingCodes.has(code)) {
		existingCodes.add(code);
		return code;
	}

	// If by some chance it exists, add a random suffix
	const randomSuffix = Math.floor(Math.random() * 1000);
	const fallbackCode = `${datePrefix}${timestamp}${randomSuffix}`;
	existingCodes.add(fallbackCode);
	return fallbackCode;
}

async function migrateTimesheetCodes() {
	try {
		console.log("🔍 Checking for timesheets without codes...");

		// Get all timesheets using raw MongoDB query
		const allTimesheets: any = await prisma.$runCommandRaw({
			find: "timesheets",
			filter: {},
			projection: { _id: 1, code: 1, organizationId: 1, employeeId: 1, createdAt: 1 },
		});

		const timesheetsArray = allTimesheets.cursor.firstBatch;

		// Filter timesheets without code
		const timesheetsWithoutCode = timesheetsArray.filter(
			(t: any) => !t.code || t.code === "",
		);

		if (timesheetsWithoutCode.length === 0) {
			console.log("✅ All timesheets already have codes. No migration needed.");
			return;
		}

		console.log(`📝 Found ${timesheetsWithoutCode.length} timesheets without codes.`);

		// Get existing codes to avoid duplicates
		const timesheetsWithCode = timesheetsArray.filter((t: any) => t.code && t.code !== "");
		const existingCodes = new Set<string>(timesheetsWithCode.map((t: any) => String(t.code)));

		console.log(`🔒 Found ${existingCodes.size} existing codes in database.`);

		// Update each timesheet with a unique code
		let updated = 0;
		for (const timesheet of timesheetsWithoutCode) {
			const code = await generateUniqueCode(existingCodes);

			// Use raw MongoDB update
			await prisma.$runCommandRaw({
				update: "timesheets",
				updates: [
					{
						q: { _id: timesheet._id },
						u: { $set: { code: code } },
					},
				],
			});

			updated++;
			if (updated % 10 === 0) {
				console.log(`   ⏳ Updated ${updated}/${timesheetsWithoutCode.length} timesheets...`);
			}
		}

		console.log(`✅ Successfully updated ${updated} timesheets with unique codes.`);
		console.log("\n🎉 Migration completed! You can now run: npx prisma db push");
	} catch (error) {
		console.error("❌ Migration failed:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Run migration
migrateTimesheetCodes()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
