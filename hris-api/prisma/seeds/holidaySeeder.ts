import { PrismaClient } from "../../generated/prisma";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";

export interface HolidayDefinition {
	title: string;
	month: number; // 1-12
	day: number; // 1-31
	holidayType: "regular" | "special-non-working" | "special-working";
	description?: string;
}

// A. Regular Holidays
export const REGULAR_HOLIDAYS: HolidayDefinition[] = [
	{ title: "New Year's Day", month: 1, day: 1, holidayType: "regular" },
	{ title: "Maundy Thursday", month: 4, day: 2, holidayType: "regular" },
	{ title: "Good Friday", month: 4, day: 3, holidayType: "regular" },
	{ title: "Araw ng Kagitingan", month: 4, day: 9, holidayType: "regular" },
	{ title: "Labor Day", month: 5, day: 1, holidayType: "regular" },
	{ title: "Independence Day", month: 6, day: 12, holidayType: "regular" },
	{ title: "National Heroes Day", month: 8, day: 31, holidayType: "regular" },
	{ title: "Bonifacio Day", month: 11, day: 30, holidayType: "regular" },
	{ title: "Christmas Day", month: 12, day: 25, holidayType: "regular" },
	{ title: "Rizal Day", month: 12, day: 30, holidayType: "regular" },
];

// B. Special (Non-Working) Holidays
export const SPECIAL_NON_WORKING_HOLIDAYS: HolidayDefinition[] = [
	{ title: "Ninoy Aquino Day", month: 8, day: 21, holidayType: "special-non-working" },
	{ title: "All Saints' Day", month: 11, day: 1, holidayType: "special-non-working" },
	{
		title: "Feast of the Immaculate Conception of Mary",
		month: 12,
		day: 8,
		holidayType: "special-non-working",
	},
	{ title: "Last Day of the Year", month: 12, day: 31, holidayType: "special-non-working" },
	{ title: "Chinese New Year", month: 2, day: 17, holidayType: "special-non-working" },
	{ title: "Black Saturday", month: 4, day: 4, holidayType: "special-non-working" },
	{ title: "All Souls' Day", month: 11, day: 2, holidayType: "special-non-working" },
	{ title: "Christmas Eve", month: 12, day: 24, holidayType: "special-non-working" },
];

// C. Special (Working) Holidays
export const SPECIAL_WORKING_HOLIDAYS: HolidayDefinition[] = [
	{
		title: "EDSA People Power Revolution Anniversary",
		month: 2,
		day: 25,
		holidayType: "special-working",
	},
];

// Combine all holidays
export const ALL_HOLIDAYS = [
	...REGULAR_HOLIDAYS,
	...SPECIAL_NON_WORKING_HOLIDAYS,
	...SPECIAL_WORKING_HOLIDAYS,
];

export async function seedHolidaysWithClient(
	prisma: PrismaClient,
	options: { year?: number; organizationId?: string } = {},
): Promise<{ createdCount: number; skippedCount: number; totalCount: number }> {
	console.log("\n=== Seeding Holidays ===");

	const year = options.year ?? new Date().getUTCFullYear();
	const organizationId = options.organizationId ?? (await resolveDefaultSeedOrganizationId());

	console.log(`Organization ID: ${organizationId}`);

	let createdCount = 0;
	let skippedCount = 0;

	for (const holiday of ALL_HOLIDAYS) {
		try {
			// Create date for the holiday in the given year
			const startDate = new Date(Date.UTC(year, holiday.month - 1, holiday.day, 0, 0, 0, 0));
			const endDate = new Date(
				Date.UTC(year, holiday.month - 1, holiday.day, 23, 59, 59, 999),
			);

			// Check if holiday already exists
			const existing = await prisma.calendarItem.findFirst({
				where: {
					organizationId: organizationId,
					year: year,
					title: holiday.title,
					type: "HOLIDAY",
					startDate: {
						gte: new Date(year, holiday.month - 1, holiday.day, 0, 0, 0, 0),
						lt: new Date(year, holiday.month - 1, holiday.day + 1, 0, 0, 0, 0),
					},
				},
			});

			if (existing) {
				console.log(` Holiday already exists: ${holiday.title} (${existing.id})`);
				skippedCount++;
				continue;
			}

			// Create holiday calendar item
			const calendarItem = await prisma.calendarItem.create({
				data: {
					organizationId: organizationId,
					year: year,
					title: holiday.title,
					description: holiday.description || null,
					type: "HOLIDAY",
					startDate: startDate,
					endDate: endDate,
					isAllDay: true,
					timezone: "UTC",
					status: "ACTIVE",
					tags: ["holiday", holiday.holidayType],
					metadata: {
						holidayType: holiday.holidayType,
						category:
							holiday.holidayType === "regular"
								? "Regular Holiday"
								: holiday.holidayType === "special-non-working"
									? "Special (Non-Working) Holiday"
									: "Special (Working) Holiday",
					},
				},
			});

			console.log(
				` Created holiday: ${holiday.title} (${holiday.holidayType}) - ${calendarItem.id}`,
			);
			createdCount++;
		} catch (error) {
			console.error(` Error creating holiday ${holiday.title}:`, error);
		}
	}

	console.log(`\n Holiday seeding completed!`);
	console.log(`   Created: ${createdCount}`);
	console.log(`   Skipped: ${skippedCount}`);
	console.log(`   Total: ${ALL_HOLIDAYS.length}`);

	return { createdCount, skippedCount, totalCount: ALL_HOLIDAYS.length };
}

export async function seedHolidays() {
	const prisma = new PrismaClient();
	try {
		await seedHolidaysWithClient(prisma);
	} finally {
		await prisma.$disconnect();
	}
}

async function main() {
	assertSeedDryRunNotRequested("seed:holidays");
	console.log(" Starting Holiday Seeding Script");

	try {
		await seedHolidays();
		console.log("\n Holiday seeding completed successfully!");
	} catch (error) {
		console.error("\n Error during seeding:", error);
		throw error;
	}
}

if (require.main === module) {
	main()
		.catch((e) => {
			console.error(e);
			process.exit(1);
		})
		.finally(async () => {
			// main() handles disconnect for its own client
		});
}
