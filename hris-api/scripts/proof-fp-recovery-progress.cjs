// recovery: same-person rewrite + progress poll + new person with progress
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
	normalizeIsapiFingerprintList,
} = require("../helper/device-user-raw-fingerprint.helper.ts");

function loadEnv() {
	const envPath = path.resolve(__dirname, "../.env");
	for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i < 1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		)
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		if (process.env[key]) {
			process.env[key] = process.env[key].replace(
				/@10\.184\.37\.19:15433\b/g,
				"@127.0.0.1:55435",
			);
		}
	}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	loadEnv();
	const prisma = new PrismaClient();
	const out = { startedAt: new Date().toISOString() };
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
		const device = await prisma.device.findFirst({
			where: { address: "192.168.254.102" },
		});
		const deviceId = device.id;
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};

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
						searchID: `x${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: "15",
					},
				},
			},
		);
		const fps = normalizeIsapiFingerprintList(up);
		out.read15 = {
			count: fps.length,
			len: fps[0]?.data?.length,
			type: fps[0]?.fingerType,
			id: fps[0]?.fingerPrintId,
		};

		out.rewrite15 = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintDownload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 25000,
				body: {
					FingerPrintCfg: {
						employeeNo: "15",
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: fps[0].data,
					},
				},
			},
		);
		try {
			out.progress15 = await hikvisionFetch(
				"/ISAPI/AccessControl/FingerPrintProgress?format=json",
				{
					method: "GET",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 10000,
				},
			);
		} catch (e) {
			out.progress15 = { error: String(e.message || e) };
		}
		await sleep(3000);
		const up2 = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: {
					FingerPrintCond: {
						searchID: `y${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: "15",
					},
				},
			},
		);
		const fps2 = normalizeIsapiFingerprintList(up2);
		out.reread15 = { count: fps2.length, len: fps2[0]?.data?.length };

		const emp = "99183610";
		out.create = await hikvisionFetch(
			"/ISAPI/AccessControl/UserInfo/Record?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 25000,
				body: {
					UserInfo: {
						employeeNo: emp,
						name: `Prog-${emp}`,
						userType: "normal",
						Valid: {
							enable: true,
							beginTime: "2026-01-01T00:00:00",
							endTime: "2036-12-31T23:59:59",
							timeType: "local",
						},
						doorRight: "1",
						RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
					},
				},
			},
		);
		out.writeNew = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintDownload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 25000,
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: fps[0].data,
					},
				},
			},
		);
		out.progressPolls = [];
		for (let i = 0; i < 5; i++) {
			await sleep(2000);
			try {
				out.progressPolls.push(
					await hikvisionFetch(
						"/ISAPI/AccessControl/FingerPrintProgress?format=json",
						{
							method: "GET",
							deviceId,
							prisma,
							request: req,
							timeoutMs: 8000,
						},
					),
				);
			} catch (e) {
				out.progressPolls.push({ error: String(e.message || e) });
			}
		}
		const up3 = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: {
					FingerPrintCond: {
						searchID: `z${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: emp,
						cardReaderNo: 1,
						fingerPrintID: 1,
					},
				},
			},
		);
		const fps3 = normalizeIsapiFingerprintList(up3);
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
						searchID: `u${Date.now()}`,
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
		out.newPerson = {
			emp,
			fpCount: fps3.length,
			numOfFP: Number(uu?.numOfFP || 0),
			uploadStatus: up3?.FingerPrintInfo?.status || up3?.statusString,
			uploadRawKeys: Object.keys(up3 || {}),
		};

		const dest = path.resolve(
			__dirname,
			"../../.runtime/create-enroll-arch-reality-20260719-183434/fp-matrix/recovery-progress-sameperson.json",
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
