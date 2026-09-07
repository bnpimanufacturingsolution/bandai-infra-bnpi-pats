import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
const ORG = "cmpxw0mfe00007zws3iypuu9d";
const API = "http://localhost:3001";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
import fs from "fs";
import path from "path";
const OUT = path.resolve(process.cwd(), `.runtime/line-leader-daylabor-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });

const api = async (method: string, url: string, token: string, body?: any) => {
	const res = await fetch(`${API}${url}`, {
		method,
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	let json: any = null;
	try { json = await res.json(); } catch { /* ignore */ }
	return { status: res.status, json };
};

(async () => {
	const result: any = {};
	const timesheetId = "dm4ts_29e9f474800a83486b05"; // DRAFT timesheet of a section member
	const lines = await prisma.timesheetline.findMany({
		where: { timesheetId, isDeleted: false, isEffective: true },
		select: { date: true, timeIn: true, timeOut: true, status: true, hoursWorked: true, overtimeHours: true, regularHours: true, undertimeHours: true, lateHours: true, earlyOutHours: true, employeeNotes: true, approverNotes: true },
		orderBy: { date: "asc" },
		take: 3,
	});
	if (!lines.length) throw new Error("no effective lines on target timesheet");
	const target = lines[0];
	const dateKey = new Date(target.date).toISOString().slice(0, 10);
	result.dateKey = dateKey;

	const leaderToken = (await (async () => {
		const res = await api("POST", "/api/auth/login", "", { email: "leader@bandai.local", password: "password123", appCode: "hris" } as any).catch(() => null);
		return null;
	})()) as any;
	// login via fetch (api() requires token param; do it manually)
	const loginRes = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "leader@bandai.local", password: "password123", appCode: "hris" }),
	});
	const loginJson = await loginRes.json();
	const token = loginJson.data.token;
	result.login = loginRes.status;

	// 1) TAG day labor only -> expect 200
	const tag = await api("PATCH", `/api/timesheet/${timesheetId}`, token, {
		breakdown: [{ date: dateKey, dayLaborType: "DIRECT" }],
	});
	result.tagStatus = tag.status;
	result.tagBody = tag.json?.message || (tag.json?.error ?? null);

	// 2) NON-TAG change (overtimeHours) -> expect 403
	const reject = await api("PATCH", `/api/timesheet/${timesheetId}`, token, {
		breakdown: [{ date: dateKey, overtimeHours: "5:00" }],
	});
	result.rejectStatus = reject.status;
	result.rejectBody = reject.json?.message;

	// 3) Non-leader plain employee on same timesheet -> expect 403
	const empLogin = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "employee@seed.local", password: "Password123!", appCode: "hris" }),
	});
	const empJson = await empLogin.json();
	if (empJson?.data?.token) {
		const plain = await api("PATCH", `/api/timesheet/${timesheetId}`, empJson.data.token, {
			breakdown: [{ date: dateKey, dayLaborType: "INDIRECT" }],
		});
		result.plainEmployeeStatus = plain.status;
		result.plainEmployeeBody = plain.json?.message;
	}

	// 4) Verify persisted tag
	const lineAfter = await prisma.timesheetline.findFirst({
		where: { timesheetId, isDeleted: false, isEffective: true, date: new Date(`${dateKey}T00:00:00.000Z`) },
		select: { date: true, dayLaborType: true, overtimeHours: true },
	});
	result.lineAfter = lineAfter;

	fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 1));
	await prisma.$disconnect();
})().catch((e) => {
	console.error("FAILED", e.message);
	process.exit(1);
});
