// Induce ACS by modifying person 15 on TEST A, then dump listener-related API state.
// Does NOT invent C++ output — only creates device activity so listener can fire.
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
	normalizeIsapiFingerprintList,
} = require("../helper/device-user-raw-fingerprint.helper.ts");

function loadEnv() {
	for (const line of fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i < 1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		if (process.env[key])
			process.env[key] = process.env[key].replace(
				/@10\.184\.37\.19:15433\b/g,
				"@127.0.0.1:55435",
			);
	}
}

async function main() {
	loadEnv();
	const deviceId = "cmrlgqsjv000oob01165tbd8n";
	const emp = "15";
	const prisma = new PrismaClient();
	const out = { emp, deviceId, startedAt: new Date().toISOString() };
	try {
		const login = await (
			await fetch("http://127.0.0.1:3001/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@bandai.local",
					password: "password123",
					appCode: "hris",
				}),
			})
		).json();
		const token = login.data.token;
		const device = await prisma.device.findUnique({ where: { id: deviceId } });
		const req = {
			organizationId: device.organizationId,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: device.organizationId },
		};

		// Host-side truth: can we READ templates for 15 via ISAPI (not C++)?
		const up = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: {
					FingerPrintCond: {
						searchID: `cpp-proof-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: emp,
					},
				},
			},
		);
		const fps = normalizeIsapiFingerprintList(up);
		out.hostIsapiFp = {
			count: fps.length,
			firstLen: fps[0]?.data?.length || 0,
			fingerType: fps[0]?.fingerType,
		};

		const ui = await hikvisionFetch(
			"/ISAPI/AccessControl/UserInfo/Search?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 12000,
				body: {
					UserInfoSearchCond: {
						searchID: `ui-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 2,
						EmployeeNoList: [{ employeeNo: emp }],
					},
				},
			},
		);
		const uu = Array.isArray(ui?.UserInfoSearch?.UserInfo)
			? ui.UserInfoSearch.UserInfo[0]
			: ui?.UserInfoSearch?.UserInfo;
		out.hostUserInfo = {
			employeeNo: uu?.employeeNo,
			numOfFP: uu?.numOfFP,
			numOfFace: uu?.numOfFace,
			name: uu?.name,
			hasFaceURL: Boolean(uu?.faceURL),
		};

		// Modify name slightly to try to induce ACS user-management signal
		const newName = `P15-cpp-${Date.now().toString().slice(-6)}`;
		out.modify = await hikvisionFetch(
			"/ISAPI/AccessControl/UserInfo/Modify?format=json",
			{
				method: "PUT",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 20000,
				body: {
					UserInfo: {
						employeeNo: emp,
						name: newName,
						userType: uu?.userType || "normal",
						Valid: uu?.Valid || {
							enable: true,
							beginTime: "2020-01-01T00:00:00",
							endTime: "2037-12-31T23:59:59",
							timeType: "local",
						},
						doorRight: uu?.doorRight || "1",
						RightPlan: uu?.RightPlan || [{ doorNo: 1, planTemplateNo: "1" }],
					},
				},
			},
		);
		out.modifyAt = new Date().toISOString();
		out.newName = newName;
		out.note =
			"Host proved ISAPI can read FP for 15. Modify induces ACS for C++ — check listener for enrich fingerprintCount for employeeNo=15.";

		const dest = path.resolve(
			__dirname,
			"../../.runtime/cpp-first-create-enroll-raw-20260719-195658/host-isapi-and-modify-15.json",
		);
		fs.writeFileSync(dest, JSON.stringify(out, null, 2));
		console.log(JSON.stringify(out, null, 2));
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
