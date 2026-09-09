import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
const ORG = "cmpxw0mfe00007zws3iypuu9d";
const API = "http://localhost:3001";
const SECTION_ID = "cmpxw1jjm00377zwsqrwkofgq"; // Assembly (has leader TESTBEN004)

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

(async () => {
	// admin token
	const login = await api("POST", "/api/auth/login", null, {
		email: "admin@bandai.local",
		password: "password123",
		appCode: "hris",
	});
	const token = login.json.data.token;

	// Pick a member of the section who is NOT the leader
	const members = await prisma.employee.findMany({
		where: { organizationId: ORG, isDeleted: false, sectionId: SECTION_ID, role: "hris-employee" },
		select: { id: true, employeeId: true },
		take: 3,
	});
	const leader = await prisma.employee.findFirst({
		where: { employeeId: "TESTBEN004", isDeleted: false },
		select: { id: true, employeeId: true },
	});
	if (!members.length || !leader) throw new Error("setup missing");
	const member = members.find((m) => m.id !== leader.id)!;
	console.log("MEMBER=", member.employeeId);

	// 1) Invalid leader assignment -> 400
	const bad = await api("POST", `/api/section/${SECTION_ID}/assign-members`, token, {
		assignments: [{ employeeId: member.id, lineLeaderId: "cmtgu0mu9000rvxj8a201bzzg" }], // TESTBEN003 is not a leader
	});
	console.log("INVALID_LEADER_STATUS=", bad.status); // expect 400

	// 2) Valid assignment -> 200
	const good = await api("POST", `/api/section/${SECTION_ID}/assign-members`, token, {
		assignments: [{ employeeId: member.id, lineLeaderId: leader.id }],
	});
	console.log("VALID_ASSIGN_STATUS=", good.status); // expect 200

	// 3) Verify persisted
	const after = await prisma.employee.findFirst({
		where: { id: member.id },
		select: { employeeId: true, lineLeaderId: true },
	});
	console.log("PERSISTED=", JSON.stringify(after));

	// 4) Responsible-leader resolution now explicit
	const { resolveResponsibleLineLeaderId } = await import("../helper/section-leader-scope.helper");
	const resolved = await resolveResponsibleLineLeaderId(prisma, {
		organizationId: ORG,
		employeeId: member.id,
	});
	console.log("RESOLVED_LEADER=", resolved, "matches=", resolved === leader.id);

	await prisma.$disconnect();
})().catch((e) => {
	console.error("FAILED", e.message);
	process.exit(1);
});
