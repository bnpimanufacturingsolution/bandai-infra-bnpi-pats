import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { assertSafeMigrationExecution } from "./migration/script-safety";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const employeeIdArg = process.argv.find((arg) => arg.startsWith("--employeeId="))?.split("=")[1];
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const dateOnly = (value: Date | string | null | undefined) => {
	if (!value) return "";
	return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

const codeOf = (entry: any) =>
	String(entry?.leaveTypeCode || entry?.leaveTypeCodeSnapshot || entry?.leaveType || entry?.leaveTypeName || "")
		.trim()
		.toUpperCase();

const balanceKey = (code: string, periodStart: Date | string, periodEnd: Date | string) =>
	`${String(code || "").trim().toUpperCase()}::${dateOnly(periodStart)}::${dateOnly(periodEnd)}`;

const sourceRank = (entry: any) => {
	const source = String(entry?.sourceWorkbook || entry?.notes || "").toLowerCase();
	if (source.includes("rptleavebalance") || source.includes("opening-leave-balances-import")) return 3;
	if (source.includes("march 2026")) return 1;
	return 2;
};

const fromNormalized = (row: any, existing: any) => ({
	...existing,
	leaveType: row.leaveType.code,
	leaveTypeId: row.leaveTypeId,
	leaveTypeCode: row.leaveType.code,
	leaveTypeName: row.leaveType.name,
	totalEntitled: row.totalEntitled,
	used: row.used,
	pending: row.pending,
	available: row.available,
	carriedOver: row.carriedOver,
	maxCarryOver: row.maxCarryOver,
	balance: row.available,
	periodStart: dateOnly(row.periodStart),
	periodEnd: dateOnly(row.periodEnd),
	source: existing?.source || "DM3.5 Opening Leave Balances",
	asOfDate: existing?.asOfDate || dateOnly(row.updatedAt),
});

const sameNumbers = (entry: any, row: any) =>
	Number(entry?.totalEntitled ?? entry?.balance ?? 0) === Number(row.totalEntitled) &&
	Number(entry?.used ?? 0) === Number(row.used) &&
	Number(entry?.pending ?? 0) === Number(row.pending) &&
	Number(entry?.available ?? entry?.balance ?? 0) === Number(row.available);

const summarizeCodes = (entries: any[]) =>
	entries.map((entry) => `${codeOf(entry)}:${entry.available ?? entry.balance ?? entry.totalEntitled}@${dateOnly(entry.periodStart)}-${dateOnly(entry.periodEnd)}`);

async function main() {
	try {
		assertSafeMigrationExecution({
			scriptName: "audit-dm3-opening-leave-balances",
			execute: apply,
			databaseTargets: [
				{
					label: "PG_DATABASE_URL",
					url: process.env.PG_DATABASE_URL,
					requiredForExecute: true,
				},
			],
		});
	} catch (error) {
		const allowActiveLocalDb = hasFlag("allow-active-local-db");
		const pgUrl = process.env.PG_DATABASE_URL || "";
		const parsed = pgUrl ? new URL(pgUrl) : null;
		const databaseName = parsed?.pathname.replace(/^\//, "").split("?")[0] || "";
		const isLocalDatabase = parsed && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
		const isBlockedDatabaseName =
			/^hris$/i.test(databaseName) ||
			/^hris-new$/i.test(databaseName) ||
			/prod|production|stage|staging|uat|shared|dev/i.test(databaseName);
		if (!(apply && allowActiveLocalDb && isLocalDatabase && !isBlockedDatabaseName)) {
			throw error;
		}
		console.warn(
			`audit-dm3-opening-leave-balances: explicit --allow-active-local-db override accepted for local database ${databaseName}.`,
		);
	}

	const where: any = { isDeleted: false };
	if (employeeIdArg) where.employeeId = employeeIdArg;
	const employees = await prisma.employee.findMany({
		where,
		select: {
			id: true,
			employeeId: true,
			leaveBalances: true,
			employeeLeaveBalances: {
				include: { leaveType: { select: { id: true, code: true, name: true } } },
				orderBy: [{ periodStart: "asc" }, { leaveTypeCodeSnapshot: "asc" }],
			},
		},
		orderBy: { employeeId: "asc" },
	});

	let inspected = 0;
	let conflictEmployees = 0;
	let plannedUpdates = 0;
	let duplicateEmbeddedRows = 0;
	const samples: any[] = [];

	for (const employee of employees) {
		inspected += 1;
		const normalized = employee.employeeLeaveBalances;
		if (normalized.length === 0) continue;

		const existingEmbedded = Array.isArray(employee.leaveBalances) ? employee.leaveBalances : [];
		const normalizedByKey = new Map(
			normalized.map((row) => [balanceKey(row.leaveType.code, row.periodStart, row.periodEnd), row]),
		);
		const normalizedKeys = new Set(normalizedByKey.keys());
		const existingByKey = new Map<string, any[]>();
		for (const entry of existingEmbedded) {
			const key = balanceKey(codeOf(entry), entry?.periodStart, entry?.periodEnd);
			if (!key.startsWith("::")) {
				const entries = existingByKey.get(key) || [];
				entries.push(entry);
				existingByKey.set(key, entries);
			}
		}

		const duplicateCount = Array.from(existingByKey.entries())
			.filter(([key, entries]) => normalizedKeys.has(key) && entries.length > 1)
			.reduce((count, [, entries]) => count + entries.length - 1, 0);

		const seenNormalizedKeys = new Set<string>();
		const nextLeaveBalances: any[] = [];
		let missingOrMismatched = false;

		for (const entry of existingEmbedded) {
			const key = balanceKey(codeOf(entry), entry?.periodStart, entry?.periodEnd);
			const normalizedRow = normalizedByKey.get(key);
			if (!normalizedRow) {
				nextLeaveBalances.push(entry);
				continue;
			}
			if (seenNormalizedKeys.has(key)) {
				continue;
			}
			const candidates = (existingByKey.get(key) || []).sort((a, b) => sourceRank(b) - sourceRank(a));
			const bestExisting = candidates[0];
			if (!sameNumbers(bestExisting, normalizedRow)) {
				missingOrMismatched = true;
			}
			nextLeaveBalances.push(fromNormalized(normalizedRow, bestExisting));
			seenNormalizedKeys.add(key);
		}

		for (const row of normalized) {
			const key = balanceKey(row.leaveType.code, row.periodStart, row.periodEnd);
			if (seenNormalizedKeys.has(key)) continue;
			missingOrMismatched = true;
			nextLeaveBalances.push(fromNormalized(row, null));
		}

		if (duplicateCount === 0 && !missingOrMismatched) continue;

		conflictEmployees += duplicateCount > 0 ? 1 : 0;
		duplicateEmbeddedRows += duplicateCount;
		plannedUpdates += 1;
		if (samples.length < 10) {
			samples.push({
				employeeId: employee.employeeId,
				duplicateEmbeddedRows: duplicateCount,
				before: summarizeCodes(existingEmbedded),
				after: summarizeCodes(nextLeaveBalances),
			});
		}

		if (apply) {
			await prisma.employee.update({
				where: { id: employee.id },
				data: { leaveBalances: nextLeaveBalances as any, leaveBalancesLastUpdated: new Date() },
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: apply ? "apply" : "dry-run",
				inspected,
				plannedUpdates,
				conflictEmployees,
				duplicateEmbeddedRows,
				samples,
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
