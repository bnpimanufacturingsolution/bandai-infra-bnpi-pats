import { PrismaClient } from "../generated/prisma";

type BulkAdjustResponse = {
	status: string;
	message: string;
	data?: {
		total: number;
		updated: number;
		skipped: number;
		dryRunApplied?: boolean;
		items: Array<{ id: string; code?: string | null; action: string; reason?: string }>;
	};
	code?: number;
	timestamp?: string;
};

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
	const key = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(key))?.slice(key.length);
}

function required(value: string | undefined, hint: string): string {
	if (!value) {
		throw new Error(`Missing required input: ${hint}`);
	}
	return value;
}

function toStamp(date: Date) {
	return date.toISOString();
}

async function postBulkAdjust(params: {
	baseUrl: string;
	token: string;
	frequency: string;
	forceRetroactive: boolean;
	dryRun: boolean;
}): Promise<BulkAdjustResponse> {
	const response = await fetch(`${params.baseUrl}/api/payrollperiod/bulk-adjust`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${params.token}`,
		},
		body: JSON.stringify({
			frequency: params.frequency,
			forceRetroactive: params.forceRetroactive,
			dryRun: params.dryRun,
		}),
	});

	const body = (await response.json()) as BulkAdjustResponse;
	if (!response.ok) {
		throw new Error(
			`bulk-adjust failed (${response.status}): ${JSON.stringify(body, null, 2)}`,
		);
	}
	return body;
}

async function run() {
	const baseUrl = getArg("baseUrl") || process.env.BULK_ADJUST_BASE_URL || "http://localhost:3001";
	const token = required(
		getArg("token") || process.env.BULK_ADJUST_TOKEN,
		"token (use --token=... or BULK_ADJUST_TOKEN)",
	);
	const organizationId = required(
		getArg("organizationId") || process.env.BULK_ADJUST_ORG_ID,
		"organizationId (use --organizationId=... or BULK_ADJUST_ORG_ID)",
	);
	const frequency = getArg("frequency") || process.env.BULK_ADJUST_FREQUENCY || "SEMI_MONTHLY";
	const forceRetroactive = (getArg("forceRetroactive") || "false").toLowerCase() === "true";

	console.log("=== Bulk Adjust Endpoint Verification ===");
	console.log(`baseUrl=${baseUrl}`);
	console.log(`organizationId=${organizationId}`);
	console.log(`frequency=${frequency}`);
	console.log(`forceRetroactive=${forceRetroactive}`);

	const before = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			payFrequency: frequency as any,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			startDate: true,
			endDate: true,
			payDate: true,
			updatedAt: true,
		},
		orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
	});

	if (!before.length) {
		throw new Error("No payroll periods found for the given organization/frequency.");
	}

	const beforeMap = new Map(before.map((p) => [p.id, p]));
	const completedIds = new Set(
		before.filter((p) => p.status === "COMPLETED" || p.status === "CLOSED").map((p) => p.id),
	);
	const openIds = new Set(before.filter((p) => !completedIds.has(p.id)).map((p) => p.id));

	console.log(`Found periods: ${before.length}`);
	console.log(`Protected periods (COMPLETED/CLOSED): ${completedIds.size}`);
	console.log(`Adjustable periods: ${openIds.size}`);

	console.log("\n1) Calling dry-run=true (should not mutate DB)...");
	const dryRunResponse = await postBulkAdjust({
		baseUrl,
		token,
		frequency,
		forceRetroactive,
		dryRun: true,
	});
	console.log(`Response message: ${dryRunResponse.message}`);
	console.log(
		`Summary: updated=${dryRunResponse.data?.updated ?? 0}, skipped=${dryRunResponse.data?.skipped ?? 0}, dryRunApplied=${String(dryRunResponse.data?.dryRunApplied)}`,
	);

	const afterDryRun = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			payFrequency: frequency as any,
			isDeleted: false,
		},
		select: {
			id: true,
			startDate: true,
			endDate: true,
			payDate: true,
			updatedAt: true,
		},
	});

	const dryRunMutations = afterDryRun.filter((p) => {
		const prev = beforeMap.get(p.id);
		if (!prev) return false;
		return (
			toStamp(prev.startDate) !== toStamp(p.startDate) ||
			toStamp(prev.endDate) !== toStamp(p.endDate) ||
			toStamp(prev.payDate) !== toStamp(p.payDate) ||
			toStamp(prev.updatedAt) !== toStamp(p.updatedAt)
		);
	});

	if (dryRunMutations.length > 0) {
		throw new Error(
			`Dry-run mutated ${dryRunMutations.length} records unexpectedly: ${dryRunMutations
				.slice(0, 5)
				.map((p) => p.id)
				.join(", ")}`,
		);
	}
	console.log("Dry-run verification passed: no DB mutations.");

	console.log("\n2) Calling dry-run=false (should persist for open periods)...");
	const applyResponse = await postBulkAdjust({
		baseUrl,
		token,
		frequency,
		forceRetroactive,
		dryRun: false,
	});
	console.log(`Response message: ${applyResponse.message}`);
	console.log(
		`Summary: updated=${applyResponse.data?.updated ?? 0}, skipped=${applyResponse.data?.skipped ?? 0}, dryRunApplied=${String(applyResponse.data?.dryRunApplied)}`,
	);

	const afterApply = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			payFrequency: frequency as any,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			updatedAt: true,
		},
	});

	const applyUpdatedOpenCount = afterApply.filter((p) => {
		if (!openIds.has(p.id)) return false;
		const prev = beforeMap.get(p.id);
		if (!prev) return false;
		return toStamp(prev.updatedAt) !== toStamp(p.updatedAt);
	}).length;

	const applyChangedProtectedCount = afterApply.filter((p) => {
		if (!completedIds.has(p.id)) return false;
		const prev = beforeMap.get(p.id);
		if (!prev) return false;
		return toStamp(prev.updatedAt) !== toStamp(p.updatedAt);
	}).length;

	if (applyUpdatedOpenCount === 0) {
		throw new Error("Apply run did not update any adjustable (OPEN) records.");
	}

	if (!forceRetroactive && applyChangedProtectedCount > 0) {
		throw new Error(
			`Protected periods changed unexpectedly (${applyChangedProtectedCount}) while forceRetroactive=false.`,
		);
	}

	console.log(
		`Apply verification passed: updatedOpen=${applyUpdatedOpenCount}, changedProtected=${applyChangedProtectedCount}.`,
	);
	console.log("\nBulk adjust endpoint behavior verified successfully.");
}

run()
	.catch((error) => {
		console.error("Bulk adjust endpoint verification failed.");
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
