require("tsx/cjs");
const path = require("path");
const fs = require("fs");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const { PrismaClient } = require("../generated/prisma");

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq < 1) continue;
		const k = t.slice(0, eq).trim();
		let v = t.slice(eq + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
}
loadEnvFile(path.resolve(__dirname, "..", ".env"));
for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
	if (process.env[key]) {
		process.env[key] = process.env[key].replace(/@10\.184\.37\.19:15433\b/g, "@127.0.0.1:55435");
	}
}

const deviceId = process.argv[2] || "cmrlgqsjv000oob01165tbd8n";
const employeeNo = process.argv[3] || "15";
const prisma = new PrismaClient();

(async () => {
	const loginRes = await fetch("http://127.0.0.1:3001/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: "admin@bandai.local",
			password: "password123",
			appCode: "hris",
		}),
	});
	const loginJson = await loginRes.json();
	const token = loginJson?.data?.token;
	const device = await prisma.device.findUnique({ where: { id: deviceId } });
	const req = {
		organizationId: device.organizationId,
		headers: { authorization: `Bearer ${token}` },
		user: { organizationId: device.organizationId },
	};

	const probes = [];
	const bodies = [
		{
			name: "upload_bulk",
			path: "/ISAPI/AccessControl/FingerPrintUpload?format=json",
			body: {
				FingerPrintCond: {
					searchID: `probe-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 32,
					employeeNo,
				},
			},
		},
		{
			name: "upload_finger1",
			path: "/ISAPI/AccessControl/FingerPrintUpload?format=json",
			body: {
				FingerPrintCond: {
					searchID: `probe-f1-${Date.now()}`,
					employeeNo,
					cardReaderNo: 1,
					fingerPrintID: 1,
				},
			},
		},
		{
			name: "userinfo_search",
			path: "/ISAPI/AccessControl/UserInfo/Search?format=json",
			body: {
				UserInfoSearchCond: {
					searchID: `probe-user-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 4,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		},
		{
			name: "fp_search_alt",
			path: "/ISAPI/AccessControl/FingerPrint/Search?format=json",
			body: {
				FingerPrintCond: {
					searchID: `probe-s-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 10,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		},
	];

	for (const probe of bodies) {
		try {
			const response = await hikvisionFetch(probe.path, {
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: probe.body,
			});
			probes.push({ name: probe.name, ok: true, response });
		} catch (error) {
			probes.push({
				name: probe.name,
				ok: false,
				error: String(error?.message || error),
			});
		}
	}

	const out = path.resolve(__dirname, "..", "..", ".runtime", "fp-isapi-probe.json");
	fs.writeFileSync(out, JSON.stringify({ device, employeeNo, probes }, null, 2));
	console.log("WROTE", out);
	for (const p of probes) {
		if (!p.ok) {
			console.log(p.name, "FAIL", p.error);
			continue;
		}
		const text = JSON.stringify(p.response);
		console.log(
			p.name,
			"OK len=",
			text.length,
			"hasFingerData=",
			/fingerData|FingerData|templateData/i.test(text),
			"preview=",
			text.slice(0, 220),
		);
	}
	await prisma.$disconnect();
})().catch(async (e) => {
	console.error(e);
	await prisma.$disconnect().catch(() => undefined);
	process.exit(1);
});
