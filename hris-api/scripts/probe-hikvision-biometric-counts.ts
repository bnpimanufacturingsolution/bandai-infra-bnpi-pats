import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";

const prisma = new PrismaClient();
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);

const deviceIds = String(args.get("device-ids") || args.get("device-id") || "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const includeInventory = args.get("include-inventory") === "true";
const pageSize = Math.min(Math.max(Number(args.get("page-size") || 100), 1), 100);

const numericField = (value: unknown, names: string[]): number | null => {
	if (!value || typeof value !== "object") return null;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (names.includes(key) && Number.isFinite(Number(child))) return Number(child);
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		const found = numericField(child, names);
		if (found !== null) return found;
	}
	return null;
};

const numericFields = (value: unknown, name: string): number[] => {
	if (!value || typeof value !== "object") return [];
	const found: number[] = [];
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (key === name && Number.isFinite(Number(child))) found.push(Number(child));
		if (child && typeof child === "object") found.push(...numericFields(child, name));
	}
	return found;
};

const probe = async (deviceId: string, endpoint: string) => {
	const startedAt = Date.now();
	try {
		const payload = await hikvisionFetch(endpoint, {
			method: "GET",
			deviceId,
			prisma,
			timeoutMs: 12_000,
		});
		const recordDataNumbers = numericFields(payload, "recordDataNumber");
		return {
			ok: true,
			elapsedMs: Date.now() - startedAt,
			count:
				recordDataNumbers.length > 0
					? recordDataNumbers.reduce((sum, count) => sum + count, 0)
					: numericField(payload, [
							"fingerPrintCount",
							"fingerprintCount",
							"totalMatches",
							"total",
						]),
			countComponents: recordDataNumbers,
			payload,
		};
	} catch (error: any) {
		return {
			ok: false,
			elapsedMs: Date.now() - startedAt,
			status: Number(error?.status || 0) || null,
			error: error?.message || "request_failed",
			payload: error?.data || null,
		};
	}
};

const readInventory = async (deviceId: string) => {
	const searchID = randomUUID();
	const users: any[] = [];
	let totalMatches: number | null = null;
	let position = 0;
	let pages = 0;
	const startedAt = Date.now();

	while (pages < 100) {
		const payload = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId,
			prisma,
			timeoutMs: 15_000,
			body: {
				UserInfoSearchCond: {
					searchID,
					searchResultPosition: position,
					maxResults: pageSize,
				},
			},
		});
		const root = payload?.UserInfoSearch || payload?.UserInfoSearchResult || payload || {};
		const page = Array.isArray(root.UserInfo)
			? root.UserInfo
			: root.UserInfo
				? [root.UserInfo]
				: [];
		if (totalMatches === null) {
			totalMatches = numericField(root, ["totalMatches", "total"]);
		}
		users.push(...page);
		pages += 1;
		position += page.length;
		if (
			page.length === 0 ||
			(totalMatches !== null ? position >= totalMatches : page.length < pageSize)
		) {
			break;
		}
	}

	return {
		searchID,
		searchIdReusedAcrossPages: true,
		pages,
		elapsedMs: Date.now() - startedAt,
		totalMatches,
		uniqueUsers: new Set(users.map((user) => String(user.employeeNo || "").trim())).size,
		fingerprintUsers: users.filter((user) => Number(user.numOfFP || 0) > 0).length,
		fingerprintSlots: users.reduce((sum, user) => sum + Number(user.numOfFP || 0), 0),
		faceUsers: users.filter((user) => Number(user.numOfFace || 0) > 0).length,
		faceSlots: users.reduce((sum, user) => sum + Number(user.numOfFace || 0), 0),
	};
};

const main = async () => {
	if (deviceIds.length === 0) throw new Error("--device-id or --device-ids is required");
	const results = await Promise.all(deviceIds.map(async (deviceId) => {
		const device = await prisma.device.findUnique({
			where: { id: deviceId },
			select: { id: true, name: true, address: true, port: true },
		});
		const [face, fingerprint] = await Promise.all([
			probe(deviceId, "/ISAPI/Intelligent/FDLib/Count?format=json"),
			probe(deviceId, "/ISAPI/AccessControl/FingerPrint/Count?format=json"),
		]);
		return {
			device,
			face,
			fingerprint,
			inventory: includeInventory ? await readInventory(deviceId) : null,
		};
	}));
	process.stdout.write(`${JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2)}\n`);
};

main().finally(() => prisma.$disconnect());
