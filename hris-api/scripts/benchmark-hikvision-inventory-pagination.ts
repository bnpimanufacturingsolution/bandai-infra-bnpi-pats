import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";

const prisma = new PrismaClient();
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const deviceId = String(args.get("device-id") || "").trim();
const concurrencyLevels = String(args.get("concurrency") || "1,2,4")
	.split(",")
	.map(Number)
	.filter((value) => Number.isInteger(value) && value >= 1 && value <= 8);
const trials = Math.min(Math.max(Number(args.get("trials") || 3), 1), 5);
const requestedPageSize = Math.min(Math.max(Number(args.get("page-size") || 100), 1), 100);
const output = args.get("output") ? resolve(String(args.get("output"))) : "";

const firstNumeric = (value: unknown, names: string[]): number | null => {
	if (!value || typeof value !== "object") return null;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (names.includes(key) && Number.isFinite(Number(child))) return Number(child);
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		const found = firstNumeric(child, names);
		if (found !== null) return found;
	}
	return null;
};

const pageUsers = (payload: any) => {
	const root = payload?.UserInfoSearch || payload?.UserInfoSearchResult || payload || {};
	const users = Array.isArray(root.UserInfo) ? root.UserInfo : root.UserInfo ? [root.UserInfo] : [];
	return { root, users };
};

const readPage = async (params: {
	searchID: string;
	position: number;
	concurrency: number;
}) => {
	const startedAt = Date.now();
	try {
		const payload = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId,
			prisma,
			timeoutMs: 15_000,
			serializeDeviceRequests: params.concurrency === 1,
			body: {
				UserInfoSearchCond: {
					searchID: params.searchID,
					searchResultPosition: params.position,
					maxResults: requestedPageSize,
				},
			},
		});
		const parsed = pageUsers(payload);
		return {
			ok: true as const,
			position: params.position,
			elapsedMs: Date.now() - startedAt,
			users: parsed.users,
			totalMatches: firstNumeric(parsed.root, ["totalMatches", "total"]),
		};
	} catch (error: any) {
		return {
			ok: false as const,
			position: params.position,
			elapsedMs: Date.now() - startedAt,
			users: [],
			totalMatches: null,
			status: Number(error?.status || 0) || null,
			error: error?.message || "request_failed",
			errorCategory: error?.data?.errorCategory || null,
		};
	}
};

const poolMap = async <T, R>(
	values: T[],
	concurrency: number,
	work: (value: T) => Promise<R>,
) => {
	const results = new Array<R>(values.length);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, async () => {
			while (cursor < values.length) {
				const index = cursor++;
				results[index] = await work(values[index]);
			}
		}),
	);
	return results;
};

const runTrial = async (concurrency: number, trial: number) => {
	const searchID = randomUUID();
	const startedAt = Date.now();
	const first = await readPage({ searchID, position: 0, concurrency });
	if (!first.ok || first.users.length === 0 || !first.totalMatches) {
		return {
			concurrency,
			trial,
			searchID,
			ok: false,
			elapsedMs: Date.now() - startedAt,
			errors: [first],
		};
	}
	const actualPageSize = first.users.length;
	const positions: number[] = [];
	for (let position = actualPageSize; position < first.totalMatches; position += actualPageSize) {
		positions.push(position);
	}
	const remaining = await poolMap(positions, concurrency, (position) =>
		readPage({ searchID, position, concurrency }),
	);
	const pages = [first, ...remaining];
	const errors = pages.filter((page) => !page.ok);
	const users = pages
		.filter((page) => page.ok)
		.flatMap((page) => page.users)
		.map((user) => ({
			vendorUserId: String(user.employeeNo || "").trim(),
			numOfFP: Number(user.numOfFP || 0),
			numOfFace: Number(user.numOfFace || 0),
		}));
	const ids = users.map((user) => user.vendorUserId).filter(Boolean);
	const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
	const sorted = [...users].sort((left, right) =>
		left.vendorUserId.localeCompare(right.vendorUserId, undefined, { numeric: true }),
	);
	const inventoryHash = createHash("sha256")
		.update(
			sorted
				.map((user) => `${user.vendorUserId}|${user.numOfFP}|${user.numOfFace}`)
				.join("\n"),
		)
		.digest("hex");
	const uniqueUsers = new Set(ids).size;
	return {
		concurrency,
		trial,
		searchID,
		searchIdReusedAcrossPages: true,
		ok:
			errors.length === 0 &&
			duplicateIds.length === 0 &&
			uniqueUsers === first.totalMatches &&
			users.length === first.totalMatches,
		elapsedMs: Date.now() - startedAt,
		requestedPageSize,
		actualPageSize,
		pages: pages.length,
		totalMatches: first.totalMatches,
		rowsRead: users.length,
		uniqueUsers,
		duplicateIds,
		fingerprintUsers: users.filter((user) => user.numOfFP > 0).length,
		fingerprintSlots: users.reduce((sum, user) => sum + user.numOfFP, 0),
		faceUsers: users.filter((user) => user.numOfFace > 0).length,
		faceSlots: users.reduce((sum, user) => sum + user.numOfFace, 0),
		inventoryHash,
		pageLatencyMs: {
			min: Math.min(...pages.map((page) => page.elapsedMs)),
			max: Math.max(...pages.map((page) => page.elapsedMs)),
			average: Math.round(
				pages.reduce((sum, page) => sum + page.elapsedMs, 0) / pages.length,
			),
		},
		errors,
	};
};

const main = async () => {
	if (!deviceId) throw new Error("--device-id is required");
	if (concurrencyLevels.length === 0) throw new Error("--concurrency must include 1..8");
	const device = await prisma.device.findUnique({
		where: { id: deviceId },
		select: { id: true, name: true, address: true, port: true },
	});
	const results = [];
	for (const concurrency of concurrencyLevels) {
		for (let trial = 1; trial <= trials; trial += 1) {
			const result = await runTrial(concurrency, trial);
			results.push(result);
			process.stderr.write(
				`${JSON.stringify({
					concurrency,
					trial,
					ok: result.ok,
					elapsedMs: result.elapsedMs,
					inventoryHash: (result as any).inventoryHash || null,
					errors: (result as any).errors?.length || 0,
				})}\n`,
			);
		}
	}
	const baseline = results.find((result: any) => result.concurrency === 1 && result.ok) as any;
	const summary = concurrencyLevels.map((concurrency) => {
		const group = results.filter((result: any) => result.concurrency === concurrency) as any[];
		const exactMatches = baseline
			? group.filter(
					(result) =>
						result.ok &&
						result.inventoryHash === baseline.inventoryHash &&
						result.uniqueUsers === baseline.uniqueUsers &&
						result.fingerprintSlots === baseline.fingerprintSlots &&
						result.faceSlots === baseline.faceSlots,
				).length
			: 0;
		return {
			concurrency,
			trials: group.length,
			successes: group.filter((result) => result.ok).length,
			exactBaselineMatches: exactMatches,
			averageElapsedMs: Math.round(
				group.reduce((sum, result) => sum + result.elapsedMs, 0) / group.length,
			),
			minElapsedMs: Math.min(...group.map((result) => result.elapsedMs)),
			maxElapsedMs: Math.max(...group.map((result) => result.elapsedMs)),
			errorCount: group.reduce((sum, result) => sum + (result.errors?.length || 0), 0),
		};
	});
	const report = {
		benchmarkedAt: new Date().toISOString(),
		device,
		baselineHash: baseline?.inventoryHash || null,
		summary,
		results,
	};
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (output) {
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, serialized, "utf8");
	}
	process.stdout.write(serialized);
};

main().finally(() => prisma.$disconnect());
