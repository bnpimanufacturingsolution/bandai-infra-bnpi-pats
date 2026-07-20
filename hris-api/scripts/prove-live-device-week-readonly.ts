/**
 * Read-only live Hikvision device probe (no HRIS save/sync).
 * Usage (from hris-api, with DB up):
 *   npx tsx scripts/prove-live-device-week-readonly.ts [deviceAddressOrId]
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import {
	buildHikvisionLogSearchXml,
	classifyHikvisionLogSearchRow,
	isOpaqueHikvisionPersonToken,
	parseHikvisionLogSearchResponse,
} from "../helper/hikvision-event-contract.helper";

// Prefer FORCE_DATABASE_URL so dotenv/.env cannot force a dead host (e.g. :15433).
const databaseUrl = String(process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const prisma = new PrismaClient(
	databaseUrl
		? {
				datasources: {
					db: { url: databaseUrl },
				},
			}
		: undefined,
);

const formatManila = (d: Date) => {
	// Device prefers +08:00 wall clock
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(d);
	const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
	return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00`;
};

const weekStart = () => {
	const end = new Date();
	const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
	return { start, end };
};

async function main() {
	const arg = String(process.argv[2] || "192.168.254.189").trim();
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = path.resolve(
		process.cwd(),
		"..",
		".runtime",
		`hikvision-live-device-week-${stamp}`,
	);
	fs.mkdirSync(outDir, { recursive: true });

	const device = await prisma.device.findFirst({
		where: {
			isDeleted: false,
			OR: [{ id: arg }, { address: arg }, { name: { contains: arg } }],
		},
		select: {
			id: true,
			name: true,
			address: true,
			port: true,
			protocol: true,
			access: true,
			config: true,
		},
	});
	if (!device) throw new Error(`Device not found for ${arg}`);
	const access = (device.access || {}) as any;
	if (!access.username || !access.password) {
		throw new Error("Device missing access credentials");
	}

	const meta = {
		deviceId: device.id,
		name: device.name,
		address: device.address,
		port: device.port,
		protocol: device.protocol,
		mode: "read-only-live-device",
		generatedAt: new Date().toISOString(),
	};
	fs.writeFileSync(path.join(outDir, "device-meta.json"), JSON.stringify(meta, null, 2));

	// ---------- 1) UserInfo/Search inventory ----------
	const users: Array<{
		employeeNo: string;
		name: string;
		numOfFP: number;
		numOfFace: number;
		userType?: string;
		valid?: unknown;
	}> = [];
	let position = 0;
	const pageSize = 30;
	let totalMatches: number | null = null;
	for (let page = 0; page < 80; page++) {
		const body = {
			UserInfoSearchCond: {
				searchID: `live-userinfo-${Date.now()}-${page}`,
				searchResultPosition: position,
				maxResults: pageSize,
			},
		};
		const data = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId: device.id,
			prisma,
			timeoutMs: 20000,
			headers: { "Content-Type": "application/json" },
			body,
		});
		const block = data?.UserInfoSearch || data?.data?.UserInfoSearch || data;
		const list = block?.UserInfo || block?.UserInfoList?.UserInfo || [];
		const arr = Array.isArray(list) ? list : list ? [list] : [];
		const tm = Number(block?.totalMatches ?? block?.numOfMatches ?? NaN);
		if (Number.isFinite(tm)) totalMatches = tm;
		for (const u of arr) {
			const employeeNo = String(u?.employeeNo || u?.employeeNoString || "").trim();
			const name = String(u?.name || u?.userName || "").trim();
			const numOfFP = Number(u?.numOfFP ?? u?.numOfFingerPrint ?? u?.fingerPrintNum ?? 0) || 0;
			const numOfFace = Number(u?.numOfFace ?? u?.faceNum ?? 0) || 0;
			users.push({
				employeeNo,
				name,
				numOfFP,
				numOfFace,
				userType: u?.userType,
				valid: u?.Valid || u?.valid,
			});
		}
		if (!arr.length) break;
		position += arr.length;
		if (totalMatches !== null && position >= totalMatches) break;
		if (arr.length < pageSize) break;
	}
	const withFp = users.filter((u) => u.numOfFP > 0);
	const withFace = users.filter((u) => u.numOfFace > 0);
	const inventory = {
		totalUsers: users.length,
		deviceReportedTotalMatches: totalMatches,
		usersWithFingerprint: withFp.length,
		usersWithFace: withFace.length,
		users,
	};
	fs.writeFileSync(
		path.join(outDir, "inventory-userinfo.json"),
		JSON.stringify(inventory, null, 2),
	);

	// ---------- 2) logSearch Information for this week ----------
	const { start, end } = weekStart();
	const startTime = formatManila(start);
	const endTime = formatManila(new Date(end.getTime() + 60_000));
	const metaId = "log.hikvision.com/Information";
	const classified: Array<{
		time?: string;
		day: string;
		eventAction: string;
		eventLabel: string;
		employeeNo?: string;
		employeeNoReadable: boolean;
		metaId?: string;
		minorType?: string;
		informationSnippet?: string;
		rawProofId: string;
	}> = [];
	const needsReview: Array<{
		time?: string;
		reason: string;
		metaId?: string;
		minorType?: string;
		informationSnippet?: string;
		employeeNo?: string;
		rawProofId: string;
	}> = [];

	let logPosition = 0;
	let logTotal: number | null = null;
	const pageMax = 50;
	const hardCap = 5000; // read-only safety cap for one week sample pass
	let pulled = 0;
	const searchId = `live-week-log-${Date.now()}`;

	while (pulled < hardCap) {
		const xml = buildHikvisionLogSearchXml({
			searchId,
			startTime,
			endTime,
			maxResults: Math.min(pageMax, hardCap - pulled),
			searchResultPosition: logPosition,
			metaId,
		});
		const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
			method: "POST",
			deviceId: device.id,
			prisma,
			timeoutMs: 25000,
			ensureJsonFormat: false,
			rawResponse: true,
			headers: {
				Accept: "application/xml, text/xml, */*",
				"Content-Type": "application/xml; charset=UTF-8",
			},
			body: xml,
		});
		const rawXml = String((response as any)?.raw || "");
		const parsed = parseHikvisionLogSearchResponse(rawXml);
		if (typeof parsed.totalMatches === "number") logTotal = parsed.totalMatches;
		if (!parsed.rows.length) break;

		for (const row of parsed.rows) {
			pulled += 1;
			const tax = classifyHikvisionLogSearchRow(row);
			const emp = String(row.employeeNo || "").trim();
			// also parse LogAddInfo JSON
			let empFromInfo = emp;
			const m = String(row.information || "").match(/"EmployeeNo"\s*:\s*"([^"]+)"/i);
			if (m?.[1]) empFromInfo = m[1].trim();
			const readable = Boolean(empFromInfo) && !isOpaqueHikvisionPersonToken(empFromInfo);
			const day = String(row.time || "").slice(0, 10) || "unknown-day";
			const proofId = `${row.time || "notime"}|${row.metaId || row.minorType || "?"}|${empFromInfo || "no-emp"}|${pulled}`;
			const snippet = String(row.information || row.minorType || "").slice(0, 240);

			const action = tax?.eventAction || "UNKNOWN";
			const isUserAdd =
				action === "USER_CREATED" ||
				/adduserinfo|add\s*person/i.test(String(row.metaId || "")) ||
				/add\s*person/i.test(String(row.minorType || ""));
			const isFpAdd =
				action === "FINGERPRINT_ENROLLED" ||
				/addfp/i.test(String(row.metaId || "")) ||
				/add\s*finger/i.test(String(row.minorType || ""));
			const isFaceAdd =
				action === "FACE_ENROLLED" || /face/i.test(String(row.metaId || row.minorType || "")) && /add|append|enroll/i.test(String(row.metaId || row.minorType || ""));
			const isCardAdd =
				action === "CARD_ENROLLED" || /card/i.test(String(row.metaId || row.minorType || "")) && /add|enroll/i.test(String(row.metaId || row.minorType || ""));

			if (isUserAdd || isFpAdd || isFaceAdd || isCardAdd) {
				const eventAction = isUserAdd
					? "USER_CREATED"
					: isFpAdd
						? "FINGERPRINT_ENROLLED"
						: isFaceAdd
							? "FACE_ENROLLED"
							: "CARD_ENROLLED";
				const eventLabel = isUserAdd
					? "User created"
					: isFpAdd
						? "Fingerprint enrolled"
						: isFaceAdd
							? "Face enrolled"
							: "Card enrolled";
				const rowOut = {
					time: row.time,
					day,
					eventAction,
					eventLabel,
					employeeNo: empFromInfo || undefined,
					employeeNoReadable: readable,
					metaId: row.metaId,
					minorType: row.minorType,
					informationSnippet: snippet,
					rawProofId: proofId,
				};
				if (!tax && !isUserAdd && !isFpAdd) {
					needsReview.push({
						time: row.time,
						reason: "Matched keyword but classifier uncertain",
						metaId: row.metaId,
						minorType: row.minorType,
						informationSnippet: snippet,
						employeeNo: empFromInfo || undefined,
						rawProofId: proofId,
					});
				}
				classified.push(rowOut);
				if (!readable) {
					needsReview.push({
						time: row.time,
						reason: "Operation classified but employeeNo missing or opaque device token",
						metaId: row.metaId,
						minorType: row.minorType,
						informationSnippet: snippet,
						employeeNo: empFromInfo || undefined,
						rawProofId: proofId,
					});
				}
			} else if (tax && tax.eventAction !== "UNKNOWN" && tax.eventCategory !== "UNKNOWN_VENDOR") {
				// other ops ignored for this report (updates/deletes/etc.)
			} else {
				// keep a small sample of unclassifiable for needs review budget
				if (needsReview.length < 50) {
					needsReview.push({
						time: row.time,
						reason: "Unclassified Information log row (not user/fp/face/card add)",
						metaId: row.metaId,
						minorType: row.minorType,
						informationSnippet: snippet,
						employeeNo: empFromInfo || undefined,
						rawProofId: proofId,
					});
				}
			}
		}

		logPosition += parsed.rows.length;
		if (logTotal !== null && logPosition >= logTotal) break;
		if (String(parsed.responseStatus || "").toUpperCase() !== "MORE") break;
	}

	const userAdds = classified.filter((r) => r.eventAction === "USER_CREATED");
	const fpAdds = classified.filter((r) => r.eventAction === "FINGERPRINT_ENROLLED");
	const faceAdds = classified.filter((r) => r.eventAction === "FACE_ENROLLED");
	const cardAdds = classified.filter((r) => r.eventAction === "CARD_ENROLLED");

	const byDay = (rows: typeof classified) => {
		const map = new Map<string, number>();
		for (const r of rows) map.set(r.day, (map.get(r.day) || 0) + 1);
		return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
	};

	const uniq = (rows: typeof classified, onlyReadable: boolean) => {
		const set = new Set<string>();
		for (const r of rows) {
			if (!r.employeeNo) continue;
			if (onlyReadable && !r.employeeNoReadable) continue;
			set.add(r.employeeNo);
		}
		return [...set].sort();
	};

	const report = {
		meta,
		window: { startTime, endTime, hardCap, pulled, logTotalMatches: logTotal },
		inventoryNow: {
			totalUsers: inventory.totalUsers,
			deviceReportedTotalMatches: inventory.deviceReportedTotalMatches,
			usersWithFingerprint: inventory.usersWithFingerprint,
			usersWithFace: inventory.usersWithFace,
			note: "Inventory is current state only — not enrollment this week.",
		},
		thisWeekProven: {
			userCreatedCount: userAdds.length,
			userCreatedReadableEmployeeNos: uniq(userAdds, true),
			userCreatedOpaqueOrMissing: userAdds.filter((r) => !r.employeeNoReadable).length,
			userCreatedByDay: byDay(userAdds),
			userCreatedRows: userAdds,
			fingerprintEnrolledCount: fpAdds.length,
			fingerprintReadableEmployeeNos: uniq(fpAdds, true),
			fingerprintOpaqueOrMissing: fpAdds.filter((r) => !r.employeeNoReadable).length,
			fingerprintByDay: byDay(fpAdds),
			fingerprintRows: fpAdds,
			faceEnrolledCount: faceAdds.length,
			faceRows: faceAdds,
			cardEnrolledCount: cardAdds.length,
			cardRows: cardAdds,
		},
		needsReviewSample: needsReview.slice(0, 80),
		safety: {
			saved: false,
			synced: false,
			deleted: false,
			hrisDeviceEventsNotUsedAsTruth: true,
		},
	};

	fs.writeFileSync(path.join(outDir, "LIVE-DEVICE-WEEK-REPORT.json"), JSON.stringify(report, null, 2));

	const md: string[] = [];
	md.push("# Live Hikvision device week truth (read-only)");
	md.push("");
	md.push(`- Device: **${device.name}** \`${device.address}:${device.port}\` (\`${device.id}\`)`);
	md.push(`- Window: \`${startTime}\` → \`${endTime}\``);
	md.push(`- Evidence: \`${outDir}\``);
	md.push(`- Mode: **dry-run / read-only** (nothing saved)`);
	md.push("");
	md.push("## 1) Current inventory (UserInfo/Search) — who exists NOW");
	md.push("");
	md.push("| Metric | Count |");
	md.push("|---|---:|");
	md.push(`| Users returned | ${inventory.totalUsers} |`);
	md.push(`| Device totalMatches | ${inventory.deviceReportedTotalMatches ?? "n/a"} |`);
	md.push(`| Users with numOfFP > 0 | ${inventory.usersWithFingerprint} |`);
	md.push(`| Users with numOfFace > 0 | ${inventory.usersWithFace} |`);
	md.push("");
	md.push(
		"> Inventory answers “who exists now”. It does **not** prove who was added or enrolled this week.",
	);
	md.push("");
	md.push("## 2) This week — proven operation rows (Information logSearch)");
	md.push("");
	md.push(`- Rows pulled (capped): **${pulled}** / totalMatches **${logTotal ?? "unknown"}**`);
	md.push(`- Hard cap: ${hardCap}`);
	md.push("");
	md.push("### User created (addUserInfo / Add Person)");
	md.push(`- **Count:** ${userAdds.length}`);
	md.push(`- **Readable employeeNos:** ${uniq(userAdds, true).join(", ") || "(none readable)"}`);
	md.push(`- **Opaque/missing employeeNo rows:** ${userAdds.filter((r) => !r.employeeNoReadable).length}`);
	md.push(`- **Per day:** ${JSON.stringify(byDay(userAdds))}`);
	md.push("");
	md.push("### Fingerprint enrolled (addFpByEmployeeNo / Add Fingerprint)");
	md.push(`- **Count:** ${fpAdds.length}`);
	md.push(
		`- **Readable employeeNos:** ${uniq(fpAdds, true).join(", ") || "(none readable)"}`,
	);
	md.push(
		`- **Opaque/missing employeeNo rows:** ${fpAdds.filter((r) => !r.employeeNoReadable).length}`,
	);
	md.push(`- **Per day:** ${JSON.stringify(byDay(fpAdds))}`);
	md.push("");
	md.push("### Face / card adds");
	md.push(`- Face enrolled rows: ${faceAdds.length}`);
	md.push(`- Card enrolled rows: ${cardAdds.length}`);
	md.push("");
	md.push("## 3) Needs review (blocked for ID-level claims)");
	md.push(`- Sample size kept: ${Math.min(needsReview.length, 80)} (reasons include opaque tokens / unclassified)`);
	md.push("");
	md.push("## 4) Explicit non-claims");
	md.push("- Did **not** use HRIS DeviceEvent / DeviceUser as truth.");
	md.push("- Did **not** treat attendance authentication as enrollment.");
	md.push("- Did **not** equate inventory fingerprint count with “enrolled this week”.");
	md.push("- Did **not** save/sync/delete anything.");
	if (logTotal !== null && logTotal > hardCap) {
		md.push(
			`- **Partial week log:** device reported ${logTotal} Information rows in window; this pass capped at ${hardCap}. Counts are lower bounds until a full paginate completes.`,
		);
	}

	fs.writeFileSync(path.join(outDir, "LIVE-DEVICE-WEEK-REPORT.md"), md.join("\n"));
	console.log(md.join("\n"));
	console.log(`\nEVIDENCE_DIR=${outDir}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
