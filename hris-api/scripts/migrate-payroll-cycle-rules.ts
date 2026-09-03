import { PrismaClient, Prisma } from "../generated/prisma";

const prisma = new PrismaClient();

// BNPI default: 11-25 / 26-10 (matches Bandai semi-monthly register cutoffs).
const DEFAULT_CYCLE_RULES: Prisma.InputJsonValue = {
	SEMI_MONTHLY: {
		firstStartDay: 11,
		secondStartDay: 26,
		secondEndDay: 10,
	},
	WEEKLY: { anchorWeekday: 1 },
	BIWEEKLY: { anchorWeekday: 1 },
	MONTHLY: { startDay: 1, endDay: "LAST_DAY" },
	QUARTERLY: { startMonth: 1 },
	ANNUALLY: { startMonth: 1 },
};

async function run() {
	const configs = await prisma.payrollCycleConfig.findMany({
		where: { isDeleted: false },
		select: { id: true, cycleRules: true },
	});

	let updated = 0;
	for (const config of configs) {
		const current = (config.cycleRules as Record<string, any> | null) || {};
		const hasSemiMonthlyRule =
			current?.SEMI_MONTHLY?.firstStartDay !== undefined &&
			current?.SEMI_MONTHLY?.secondStartDay !== undefined &&
			current?.SEMI_MONTHLY?.secondEndDay !== undefined;
		if (config.cycleRules && hasSemiMonthlyRule) continue;
		const hasLegacySplitDay = current?.SEMI_MONTHLY?.splitDay !== undefined;
		const legacySplitDay = Math.min(
			Math.max(Number(current?.SEMI_MONTHLY?.splitDay || 15), 1),
			30,
		);
		const firstStartDay = hasLegacySplitDay ? 1 : 11;
		const secondStartDay = hasLegacySplitDay
			? Math.min(Math.max(legacySplitDay + 1, 2), 31)
			: 26;
		const secondEndDay = hasLegacySplitDay ? "LAST_DAY" : 10;
		const migrated: Prisma.InputJsonValue = {
			...(current || {}),
			SEMI_MONTHLY: {
				firstStartDay,
				secondStartDay,
				secondEndDay,
			},
			WEEKLY: current?.WEEKLY || { anchorWeekday: 1 },
			BIWEEKLY: current?.BIWEEKLY || { anchorWeekday: 1 },
			MONTHLY: current?.MONTHLY || { startDay: 1, endDay: "LAST_DAY" },
			QUARTERLY: current?.QUARTERLY || { startMonth: 1 },
			ANNUALLY: current?.ANNUALLY || { startMonth: 1 },
		};
		await prisma.payrollCycleConfig.update({
			where: { id: config.id },
			data: { cycleRules: migrated || DEFAULT_CYCLE_RULES },
		});
		updated += 1;
	}

	console.log(`Migration complete. Updated ${updated} payroll cycle configs.`);
}

run()
	.catch((error) => {
		console.error("Failed to migrate payroll cycle rules:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
