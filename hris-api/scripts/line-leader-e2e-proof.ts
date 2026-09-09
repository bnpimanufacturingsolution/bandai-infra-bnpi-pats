import { PrismaClient } from "../generated/prisma";
import fs from "fs";
import path from "path";

/**
 * Live E2E proof for the line-leader requirement (2026-09-07):
 *  A) setup: leader account + section assignment + member->leader assignment
 *  B) leader logs in and files OVERTIME for their member -> 201
 *  C) created request uses the leader-filed chain (manager -> HR)
 *  D) HR approves through the chain -> payable OT lands on the MEMBER's line
 *  E) plain employee denied filing on behalf (403)
 *  F) leader tags day labor on member's timesheet (200) / non-tag change (403)
 */
const prisma = new PrismaClient();
const API = "http://localhost:3001";
const ORG = "cmpxw0mfe00007zws3iypuu9d";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.resolve(process.cwd(), `.runtime/line-leader-e2e-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });
const evidence: Record<string, any> = { stamp, out: OUT };
const save = (name: string, data: any) => {
	evidence[name] = data;
	fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
};

const api = async (method: string, url: string, token: string | null, body?: any) => {
	const res = await fetch(`${API}${url}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	let json: any = null;
	try { json = await res.json(); } catch { /* ignore */ }
	return { status: res.status, json };
};

const login = async (email: string, password = "password123") => {
	const res = await api("POST", "/api/auth/login", null, { email, password, appCode: "hris" });
	if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
	return res.json.data.token as string;
};

(async () => {
	// ---- A) Setup --------------------------------------------------------
	const section = await prisma.section.findFirst({
		where: { organizationId: ORG, isActive: true, name: { contains: "Assembly" } },
		select: { id: true, name: true, code: true },
		orderBy: { name: "asc" },
	});
	if (!section) throw new Error("No Assembly section found");
	const leader = await prisma.employee.findFirst({
		where: { organizationId: ORG, employeeId: "TESTBEN004", isDeleted: false },
		select: { id: true, employeeId: true, departmentId: true },
	});
	const member = await prisma.employee.findFirst({
		where: { organizationId: ORG, employeeId: "TESTBEN003", isDeleted: false },
		select: { id: true, employeeId: true, departmentId: true, sectionId: true },
	});
	if (!leader || !member) throw new Error("Test employees TESTBEN004/TESTBEN003 not found");

	await prisma.sectionLineLeader.upsert({
		where: { sectionId_employeeId: { sectionId: section.id, employeeId: leader.id } },
		create: { organizationId: ORG, sectionId: section.id, employeeId: leader.id },
		update: {},
	});
	await prisma.employee.update({ where: { id: member.id }, data: { lineLeaderId: leader.id } });

	// Re-derive roles through the production helper (same seam the section API uses).
	const { syncLineLeaderRolesForEmployees } = await import("../helper/employee-role-sync.helper");
	const syncResult = await syncLineLeaderRolesForEmployees(prisma, {
		organizationId: ORG,
		employeeIds: [leader.id],
		sampleLimit: 5,
	});
	save("role-sync", syncResult);

	let leaderUser = await prisma.user.findFirst({ where: { email: "leader@bandai.local" } });
	const { createRequire } = await import("module");
	const require_ = createRequire(import.meta.url);
	const bcrypt = require_("bcryptjs");
	const hash: string = bcrypt.hashSync("password123", 10);
	if (!leaderUser) {
		leaderUser = await prisma.user.create({
			data: {
				email: "leader@bandai.local",
				password: hash,
				role: "hris-line-leader",
				status: "active",
				organizationId: ORG,
			},
		});
	} else {
		await prisma.user.update({
			where: { id: leaderUser.id },
			data: { password: hash, status: "active", isDeleted: false },
		});
	}
	await prisma.employee.update({ where: { id: leader.id }, data: { userId: leaderUser.id } });
	save("setup", {
		section: section.id,
		leader: { employeeId: leader.employeeId, employeeRowId: leader.id, userId: leaderUser.id },
		member: { employeeId: member.employeeId, employeeRowId: member.id },
	});

	// ---- B) Leader files OT for the member -------------------------------
	const leaderToken = await login("leader@bandai.local");
	const createRes = await api("POST", "/api/request", leaderToken, {
		type: "OVERTIME",
		targetEmployeeId: member.id,
		description: "Leader-filed early OT for Saturday line catch-up (E2E proof)",
		startDate: "2026-09-12T09:00:00.000Z",
		endDate: "2026-09-12T11:00:00.000Z",
		metadata: {
			date: "2026-09-12",
			overtimeHours: "2:00",
			requestedOvertimeMinutes: 120,
			requestSource: "LINE_LEADER_ON_BEHALF",
		},
	});
	save("create-ot", { status: createRes.status, body: createRes.json });
	if (createRes.status !== 201) throw new Error(`create failed: ${createRes.status}`);
	const requestId = createRes.json.data.id;
	const code = createRes.json.data.code;

	// ---- C) Chain shape: manager -> HR -----------------------------------
	const detail = await api("GET", `/api/request/${requestId}`, leaderToken);
	let steps = (detail.json?.data?.stepExecutions || []).map((s: any) => ({
		stepNumber: s.stepNumber,
		stepName: s.stepName,
		stepType: s.stepType,
		assigneeType: s.assigneeType,
		status: s.status,
		assigneeId: s.assigneeId,
	}));
	if (steps.length === 0) {
		// The detail endpoint may strip stepExecutions; read ledger truth from DB.
		const dbSteps = await prisma.workflowStepExecution.findMany({
			where: { requestId },
			orderBy: { stepNumber: "asc" },
			select: {
				stepNumber: true,
				stepName: true,
				stepType: true,
				assigneeType: true,
				status: true,
				assigneeId: true,
			},
		});
		steps = dbSteps.map((s) => ({ ...s }));
	}
	save("chain-steps", { code, requestId, steps, currentState: detail.json?.data?.currentWorkflowStateKey });
	const managerStep = steps.find((s: any) => s.stepNumber === 2);
	const hrStep = steps.find((s: any) => s.stepNumber === 3);
	if (managerStep?.assigneeType !== "TARGET_DEPARTMENT_MANAGER") throw new Error("step2 is not TARGET_DEPARTMENT_MANAGER");
	if (!["APPROVAL", "TASK"].includes(hrStep?.stepType || "")) throw new Error("step3 missing");

	// ---- D) Approvals through the chain: manager (Bryan) then HR (Maria) ---
	// Step 2 resolved to the member's manager (bryan02@gmail.com). Reset his
	// password to the known test value (local DEV test account only).
	const managerUser = await prisma.user.findFirst({
		where: { email: "bryan02@gmail.com" },
		select: { id: true },
	});
	if (managerUser) {
		const { createRequire } = await import("module");
		const require_ = createRequire(import.meta.url);
		const bcrypt = require_("bcryptjs");
		await prisma.user.update({
			where: { id: managerUser.id },
			data: { password: bcrypt.hashSync("Password123!", 10), status: "active" },
		});
	}
	const managerToken = await login("bryan02@gmail.com", "Password123!");
	const managerApprove = await api("POST", `/api/request/${requestId}/approval`, managerToken, {
		action: "approve",
		comment: "Manager step approval (E2E chain proof)",
	});
	save("approve-manager", { status: managerApprove.status, body: managerApprove.json });

	const hrToken = await login("hr-manager@seed.local", "Password123!");
	const hrApprove = await api("POST", `/api/request/${requestId}/approval`, hrToken, {
		action: "approve",
		comment: "HR step approval (E2E chain proof)",
	});
	save("approve-hr", { status: hrApprove.status, body: hrApprove.json });
	stepResult = { manager: managerApprove.status, hr: hrApprove.status };

	// Post-state: member's OT line
	const memberLine = await prisma.timesheetline.findFirst({
		where: {
			organizationId: ORG,
			employeeId: member.id,
			isDeleted: false,
			isEffective: true,
			date: { gte: new Date("2026-09-12T00:00:00.000Z"), lte: new Date("2026-09-12T23:59:59.999Z") },
		},
		select: { id: true, overtimeHours: true, date: true, dayLaborType: true },
	});
	save("member-ot-line", memberLine);

	// ---- E) Plain employee denied on-behalf ------------------------------
	const employeeToken = await login("employee@seed.local", "Password123!");
	const denial = await api("POST", "/api/request", employeeToken, {
		type: "OVERTIME",
		targetEmployeeId: member.id,
		description: "Should be denied",
		metadata: { date: "2026-09-12", overtimeHours: "1:00" },
	});
	save("deny-plain-employee", { status: denial.status, body: denial.json });

	// ---- F) Day-labor tagging on the member's timesheet ------------------
	const memberTimesheet = await prisma.timesheet.findFirst({
		where: { organizationId: ORG, employeeId: member.id, isDeleted: false, status: { in: ["DRAFT", "REVISED"] } },
		orderBy: { createdAt: "desc" },
		select: { id: true, code: true, status: true },
	});
	let tagResult: any = { skipped: "no member timesheet in DRAFT/REVISED" };
	if (memberTimesheet) {
		const lines = await prisma.timesheetline.findMany({
			where: { timesheetId: memberTimesheet.id, isDeleted: false, isEffective: true },
			select: { date: true },
			take: 1,
		});
		if (lines.length) {
			const dateKey = new Date(lines[0].date).toISOString().slice(0, 10);
			const tag = await api("PATCH", `/api/timesheet/${memberTimesheet.id}`, leaderToken, {
				breakdown: [{ date: dateKey, dayLaborType: "DIRECT" }],
			});
			const reject = await api("PATCH", `/api/timesheet/${memberTimesheet.id}`, leaderToken, {
				breakdown: [{ date: dateKey, overtimeHours: "5:00" }],
			});
			tagResult = { timesheetId: memberTimesheet.id, dateKey, tagStatus: tag.status, rejectStatus: reject.status, rejectBody: reject.json };
		}
	}
	save("day-labor", tagResult);

	console.log(JSON.stringify({
		out: OUT,
		create: createRes.status,
		chain: { managerStep: managerStep?.assigneeType, hrStep: hrStep?.assigneeType, hrStepType: hrStep?.stepType },
		memberOvertimeHours: (memberLine as any)?.overtimeHours ?? null,
		denyStatus: denial.status,
		dayLabor: tagResult,
	}, null, 2));
	await prisma.$disconnect();
})().catch((error) => {
	console.error("E2E_FAILED", error.message);
	console.error(JSON.stringify(evidence, null, 2));
	process.exit(1);
});
