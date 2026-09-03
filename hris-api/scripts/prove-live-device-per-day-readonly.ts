/**
 * Fast read-only per-day probe using Hikvision leaf metaIds (not full Information).
 *
 * Research (ISAPI logSearch / device UI):
 * - Filter with <metaId> leaf paths to only the operation types you need.
 * - Proven on TEST A (2026-07-13):
 *   Information=9267, addUserInfo=2894, addFpByEmployeeNo=4205 (much smaller).
 * - Device UI logs: Major/Minor + time; ISAPI maps that to metaId domains.
 * - maxResults is honored; paginate with searchResultPostion + responseStatus MORE.
 * - Web UI often caps display ~2000; API can page further with MORE.
 *
 *   FORCE_DATABASE_URL=... npx tsx scripts/prove-live-device-per-day-readonly.ts 192.168.254.189
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import {
	buildHikvisionLogSearchXml,
	isOpaqueHikvisionPersonToken,
	parseHikvisionLogSearchResponse,
} from "../helper/hikvision-event-contract.helper";

const databaseUrl = String(process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const prisma = new PrismaClient(
	databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

/** Leaf metaIds — device-proven to filter server-side (faster than full Information). */
const META_USER_CREATED = "log.hikvision.com/Information/addUserInfo";
const META_FP_ENROLLED = "log.hikvision.com/Information/addFpByEmployeeNo";

type OpRow = {
	day: string;
	time?: string;
	eventAction: "USER_CREATED" | "FINGERPRINT_ENROLLED";
	employeeNo?: string;
	readable: boolean;
	metaId?: string;
	minorType?: string;
	snippet?: string;
};

async function pullMetaDay(
	deviceId: string,
	day: string,
	metaId: string,
	eventAction: OpRow["eventAction"],
	hardCap = 20000,
): Promise<{ rows: OpRow[]; pulled: number; totalMatches: number | null }> {
	const start = `${day}T00:00:00+08:00`;
	const end = `${day}T23:59:59+08:00`;
	const searchId = `${eventAction}-${day}-${Date.now()}`;
	let position = 0;
	let pulled = 0;
	let totalMatches: number | null = null;
	const rows: OpRow[] = [];
	// Device often returns up to ~100; 50–100 is a good balance.
	const pageMax = 100;

	while (pulled < hardCap) {
		const xml = buildHikvisionLogSearchXml({
			searchId,
			startTime: start,
			endTime: end,
			maxResults: Math.min(pageMax, hardCap - pulled),
			searchResultPosition: position,
			metaId,
		});
		const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
			method: "POST",
			deviceId,
			prisma,
			timeoutMs: 30000,
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
		if (typeof parsed.totalMatches === "number") totalMatches = parsed.totalMatches;
		if (!parsed.rows.length) break;

		for (const row of parsed.rows) {
			pulled += 1;
			let emp = String(row.employeeNo || "").trim();
			const m = String(row.information || "").match(/"EmployeeNo"\s*:\s*"([^"]+)"/i);
			if (m?.[1]) emp = m[1].trim();
			rows.push({
				day,
				time: row.time,
				eventAction,
				employeeNo: emp || undefined,
				readable: Boolean(emp) && !isOpaqueHikvisionPersonToken(emp),
				metaId: row.metaId || metaId,
				minorType: row.minorType,
				snippet: String(row.information || "").slice(0, 200),
			});
		}

		position += parsed.rows.length;
		const status = String(parsed.responseStatus || "").toUpperCase();
		if (totalMatches !== null && position >= totalMatches) break;
		if (status === "NO MATCHES") break;
		if (status === "MORE") continue;
		// Some firmwares omit MORE but still have totalMatches > position
		if (totalMatches !== null && position < totalMatches && parsed.rows.length > 0) {
			continue;
		}
		break;
	}

	return { rows, pulled, totalMatches };
}

function uniqueTokens(rows: OpRow[]) {
	const map = new Map<
		string,
		{ token: string; count: number; first?: string; last?: string; readable: boolean }
	>();
	for (const r of rows) {
		const t = r.employeeNo || "__MISSING__";
		const cur = map.get(t) || {
			token: t,
			count: 0,
			first: r.time,
			last: r.time,
			readable: r.readable,
		};
		cur.count += 1;
		if (r.time && (!cur.first || r.time < cur.first)) cur.first = r.time;
		if (r.time && (!cur.last || r.time > cur.last)) cur.last = r.time;
		map.set(t, cur);
	}
	return [...map.values()].sort((a, b) => b.count - a.count);
}

function csvEscape(v: unknown) {
	const s = String(v ?? "");
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function writeCsv(file: string, headers: string[], rows: Array<Record<string, unknown>>) {
	const lines = [headers.join(",")];
	for (const r of rows) {
		lines.push(headers.map((h) => csvEscape(r[h])).join(","));
	}
	fs.writeFileSync(file, lines.join("\n"), "utf8");
}

async function main() {
	const arg = String(process.argv[2] || "192.168.254.189").trim();
	const days = (process.argv[3] || "2026-07-13,2026-07-14,2026-07-15,2026-07-16,2026-07-17")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = path.resolve(process.cwd(), "..", ".runtime", `mgmt-daily-13-17-fast-${stamp}`);
	fs.mkdirSync(outDir, { recursive: true });

	const device = await prisma.device.findFirst({
		where: {
			isDeleted: false,
			OR: [{ id: arg }, { address: arg }, { name: { contains: arg } }],
		},
		select: { id: true, name: true, address: true, port: true, access: true },
	});
	if (!device?.access || !(device.access as any).username) {
		throw new Error(`Device not found or missing credentials: ${arg}`);
	}

	// Inventory
	const users: Array<{ employeeNo: string; name: string; numOfFP: number; numOfFace: number }> =
		[];
	let position = 0;
	let invTotal: number | null = null;
	for (let page = 0; page < 40; page++) {
		const data = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId: device.id,
			prisma,
			timeoutMs: 20000,
			headers: { "Content-Type": "application/json" },
			body: {
				UserInfoSearchCond: {
					searchID: `inv-${Date.now()}-${page}`,
					searchResultPosition: position,
					maxResults: 30,
				},
			},
		});
		const block = data?.UserInfoSearch || data;
		const list = block?.UserInfo || [];
		const arr = Array.isArray(list) ? list : list ? [list] : [];
		const tm = Number(block?.totalMatches ?? NaN);
		if (Number.isFinite(tm)) invTotal = tm;
		for (const u of arr) {
			users.push({
				employeeNo: String(u?.employeeNo || "").trim(),
				name: String(u?.name || "").trim(),
				numOfFP: Number(u?.numOfFP ?? 0) || 0,
				numOfFace: Number(u?.numOfFace ?? 0) || 0,
			});
		}
		if (!arr.length) break;
		position += arr.length;
		if (invTotal !== null && position >= invTotal) break;
		if (arr.length < 30) break;
	}

	writeCsv(
		path.join(outDir, "INVENTORY-now-all-employees.csv"),
		["Employee_No", "Name", "Fingerprints_Now", "Faces_Now", "Has_Fingerprint"],
		users.map((u) => ({
			Employee_No: u.employeeNo,
			Name: u.name,
			Fingerprints_Now: u.numOfFP,
			Faces_Now: u.numOfFace,
			Has_Fingerprint: u.numOfFP > 0 ? "Yes" : "No",
		})),
	);

	const research = {
		method: "ISAPI ContentMgmt/logSearch leaf metaId filter",
		filters: [META_USER_CREATED, META_FP_ENROLLED],
		whyFaster:
			"Server-side metaId filter returns only addUserInfo / addFpByEmployeeNo rows instead of full Information (noise + other ops).",
		pageSize: 100,
		deviceUiNote: "Web Log UI max display often ~2000; API paginates with MORE + searchResultPostion.",
	};
	fs.writeFileSync(path.join(outDir, "RESEARCH-METHOD.json"), JSON.stringify(research, null, 2));

	const dailySummary: Array<Record<string, unknown>> = [];
	const allUserUnique: Array<Record<string, unknown>> = [];
	const allFpUnique: Array<Record<string, unknown>> = [];
	const allUserOps: Array<Record<string, unknown>> = [];
	const allFpOps: Array<Record<string, unknown>> = [];

	for (const day of days) {
		console.log(`Day ${day}: pulling leaf metaIds...`);
		const [userPull, fpPull] = await Promise.all([
			pullMetaDay(device.id, day, META_USER_CREATED, "USER_CREATED"),
			pullMetaDay(device.id, day, META_FP_ENROLLED, "FINGERPRINT_ENROLLED"),
		]);
		const userRows = userPull.rows;
		const fpRows = fpPull.rows;
		const uTok = uniqueTokens(userRows);
		const fTok = uniqueTokens(fpRows);
		const userComplete =
			userPull.totalMatches === null
				? "unknown"
				: userPull.pulled >= userPull.totalMatches
					? "YES"
					: "NO";
		const fpComplete =
			fpPull.totalMatches === null
				? "unknown"
				: fpPull.pulled >= fpPull.totalMatches
					? "YES"
					: "NO";

		dailySummary.push({
			Day: day,
			Unique_People_UserCreated: uTok.length,
			UserCreated_Log_Lines: userRows.length,
			UserCreate_TotalMatches: userPull.totalMatches ?? "",
			UserCreate_Pulled: userPull.pulled,
			UserCreate_Complete: userComplete,
			Unique_People_FingerprintEnrolled: fTok.length,
			Fingerprint_Log_Lines: fpRows.length,
			FP_TotalMatches: fpPull.totalMatches ?? "",
			FP_Pulled: fpPull.pulled,
			FP_Complete: fpComplete,
			Readable_Plain_EmployeeNos_UserCreate: uTok.filter((t) => t.readable).length,
			Readable_Plain_EmployeeNos_FP: fTok.filter((t) => t.readable).length,
		});

		for (const t of uTok) {
			allUserUnique.push({
				Day: day,
				Device_Person_ID: t.token,
				ID_Type: t.readable ? "Plain employee no" : "Opaque device token",
				Times_Logged: t.count,
				First_Time: t.first || "",
				Last_Time: t.last || "",
			});
		}
		for (const t of fTok) {
			allFpUnique.push({
				Day: day,
				Device_Person_ID: t.token,
				ID_Type: t.readable ? "Plain employee no" : "Opaque device token",
				Times_Logged: t.count,
				First_Time: t.first || "",
				Last_Time: t.last || "",
			});
		}
		for (const r of userRows) {
			allUserOps.push({
				Day: day,
				Timestamp: r.time || "",
				Action: "User created",
				Device_Person_ID: r.employeeNo || "",
				ID_Readable: r.readable ? "Yes" : "No",
				MetaId: r.metaId || "",
			});
		}
		for (const r of fpRows) {
			allFpOps.push({
				Day: day,
				Timestamp: r.time || "",
				Action: "Fingerprint enrolled",
				Device_Person_ID: r.employeeNo || "",
				ID_Readable: r.readable ? "Yes" : "No",
				MetaId: r.metaId || "",
			});
		}

		console.log(
			`  ${day}: USER unique=${uTok.length} lines=${userRows.length} complete=${userComplete} (${userPull.pulled}/${userPull.totalMatches}) | FP unique=${fTok.length} lines=${fpRows.length} complete=${fpComplete} (${fpPull.pulled}/${fpPull.totalMatches})`,
		);
	}

	writeCsv(
		path.join(outDir, "DAILY-13-17-summary.csv"),
		[
			"Day",
			"Unique_People_UserCreated",
			"UserCreated_Log_Lines",
			"UserCreate_TotalMatches",
			"UserCreate_Pulled",
			"UserCreate_Complete",
			"Unique_People_FingerprintEnrolled",
			"Fingerprint_Log_Lines",
			"FP_TotalMatches",
			"FP_Pulled",
			"FP_Complete",
			"Readable_Plain_EmployeeNos_UserCreate",
			"Readable_Plain_EmployeeNos_FP",
		],
		dailySummary,
	);
	writeCsv(
		path.join(outDir, "DAILY-unique-user-created-by-day.csv"),
		["Day", "Device_Person_ID", "ID_Type", "Times_Logged", "First_Time", "Last_Time"],
		allUserUnique,
	);
	writeCsv(
		path.join(outDir, "DAILY-unique-fingerprint-enrolled-by-day.csv"),
		["Day", "Device_Person_ID", "ID_Type", "Times_Logged", "First_Time", "Last_Time"],
		allFpUnique,
	);
	writeCsv(
		path.join(outDir, "DAILY-all-user-created-events.csv"),
		["Day", "Timestamp", "Action", "Device_Person_ID", "ID_Readable", "MetaId"],
		allUserOps,
	);
	writeCsv(
		path.join(outDir, "DAILY-all-fingerprint-enrolled-events.csv"),
		["Day", "Timestamp", "Action", "Device_Person_ID", "ID_Readable", "MetaId"],
		allFpOps,
	);

	const withFp = users.filter((u) => u.numOfFP > 0).length;
	const md: string[] = [];
	md.push("# Jul 13–17 daily report (FAST leaf-metaId method)");
	md.push("");
	md.push("## Copy this folder path");
	md.push("");
	md.push("```");
	md.push(outDir);
	md.push("```");
	md.push("");
	md.push(`Device: **${device.name}** \`${device.address}\``);
	md.push("");
	md.push("## Method (why faster / more correct)");
	md.push("");
	md.push(
		"ISAPI `ContentMgmt/logSearch` supports **leaf metaId** filters. On this device we proved:",
	);
	md.push("");
	md.push("| metaId | Jul 13 totalMatches (probe) |");
	md.push("|---|---:|");
	md.push("| `log.hikvision.com/Information` (all) | ~9267 |");
	md.push("| `.../Information/addUserInfo` only | ~2894 |");
	md.push("| `.../Information/addFpByEmployeeNo` only | ~4205 |");
	md.push("");
	md.push(
		"We pull **only** those two operation types, page size 100, status MORE / totalMatches paging. Not full Information dump.",
	);
	md.push("");
	md.push("## Inventory NOW");
	md.push("");
	md.push("| Item | Count |");
	md.push("|---|---:|");
	md.push(`| Users on device | **${users.length}** |`);
	md.push(`| With fingerprint | **${withFp}** |`);
	md.push(`| Device totalMatches | ${invTotal ?? "n/a"} |`);
	md.push("");
	md.push("File: `INVENTORY-now-all-employees.csv` (plain employee nos)");
	md.push("");
	md.push("## Daily unique people (13–17)");
	md.push("");
	md.push(
		"| Day | Unique User created | User-create lines | Complete? | Unique FP enrolled | FP lines | Complete? |",
	);
	md.push("|---|---:|---:|---|---:|---:|---|");
	for (const d of dailySummary) {
		md.push(
			`| ${d.Day} | **${d.Unique_People_UserCreated}** | ${d.UserCreated_Log_Lines} | ${d.UserCreate_Complete} (${d.UserCreate_Pulled}/${d.UserCreate_TotalMatches || "?"}) | **${d.Unique_People_FingerprintEnrolled}** | ${d.Fingerprint_Log_Lines} | ${d.FP_Complete} (${d.FP_Pulled}/${d.FP_TotalMatches || "?"}) |`,
		);
	}
	md.push("");
	md.push("## Employee numbers");
	md.push("");
	md.push("| Source | What you get |");
	md.push("|---|---|");
	md.push("| Inventory CSV | Plain employee nos for all users **on device now** |");
	md.push(
		"| Day unique CSVs | Person IDs from logs — usually **opaque tokens**, not plain 1/2/17 |",
	);
	md.push("");
	md.push("## Files (open in Explorer)");
	md.push("");
	md.push("| File | Use |");
	md.push("|---|---|");
	md.push("| DAILY-13-17-summary.csv | Daily dashboard |");
	md.push("| DAILY-unique-user-created-by-day.csv | Unique people + times per day |");
	md.push("| DAILY-unique-fingerprint-enrolled-by-day.csv | Unique FP people + times per day |");
	md.push("| DAILY-all-user-created-events.csv | Every user-create timestamp |");
	md.push("| DAILY-all-fingerprint-enrolled-events.csv | Every FP enroll timestamp |");
	md.push("| INVENTORY-now-all-employees.csv | All plain employee nos now |");
	md.push("| RESEARCH-METHOD.json | Why leaf metaId |");

	fs.writeFileSync(path.join(outDir, "README.md"), md.join("\n"), "utf8");
	console.log(md.join("\n"));
	console.log(`\nCOPY_THIS_PATH=${outDir}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
