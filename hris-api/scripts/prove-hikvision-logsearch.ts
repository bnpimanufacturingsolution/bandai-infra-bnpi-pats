import fs from "node:fs/promises";
import path from "node:path";

const apiBaseUrl = String(process.env.HRIS_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const email = String(process.env.HRIS_ADMIN_EMAIL || "admin@bandai.local");
const password = String(process.env.HRIS_ADMIN_PASSWORD || "");
const deviceId = String(process.env.HIKVISION_DEVICE_ID || process.argv[2] || "").trim();
if (!password) throw new Error("Set HRIS_ADMIN_PASSWORD for the admin proof actor.");
if (!deviceId) throw new Error("Pass a device id or set HIKVISION_DEVICE_ID.");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const evidenceDir = path.resolve(
	process.env.HIKVISION_LOGSEARCH_EVIDENCE_DIR ||
		path.join(process.cwd(), "..", ".runtime", `device-event-source-truth-${stamp}`, "hikvision-logsearch"),
);
const main = async () => {
await fs.mkdir(evidenceDir, { recursive: true });

const loginResponse = await fetch(`${apiBaseUrl}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email, password, appCode: "hris" }),
});
const login = (await loginResponse.json()) as any;
if (!loginResponse.ok || !login?.data?.token) {
	throw new Error(`Admin login failed with HTTP ${loginResponse.status}`);
}

const endTime = String(process.env.HIKVISION_LOGSEARCH_END || new Date().toISOString());
const startTime = String(
	process.env.HIKVISION_LOGSEARCH_START ||
		new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
);
const payload = {
	execute: process.env.HIKVISION_LOGSEARCH_EXECUTE === "true",
	startTime,
	endTime,
	maxResults: Number(process.env.HIKVISION_LOGSEARCH_PAGE_SIZE || 100),
	maxRows: Number(process.env.HIKVISION_LOGSEARCH_MAX_ROWS || 1000),
};
const requestUrl = `${apiBaseUrl}/api/device/${encodeURIComponent(deviceId)}/hikvision/log-search`;
const startedAt = new Date();
const response = await fetch(requestUrl, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${login.data.token}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify(payload),
});
const result = (await response.json()) as any;
const completedAt = new Date();
if (!response.ok) {
	await fs.writeFile(
		path.join(evidenceDir, "failure.json"),
		JSON.stringify(
			{
				requestUrl,
				payload,
				status: response.status,
				startedAt: startedAt.toISOString(),
				completedAt: completedAt.toISOString(),
				elapsedSeconds: Number(
					((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(3),
				),
				result,
			},
			null,
			2,
		),
	);
	throw new Error(`Hikvision logSearch proof failed with HTTP ${response.status}: ${result?.message || "unknown error"}`);
}

const pages = Array.isArray(result?.data?.pages) ? result.data.pages : [];
for (let index = 0; index < pages.length; index += 1) {
	await fs.writeFile(
		path.join(evidenceDir, `page-${String(index + 1).padStart(3, "0")}.xml`),
		String(pages[index]?.rawXml || ""),
	);
}
const proof = {
	requestUrl,
	payload,
	status: response.status,
	startedAt: startedAt.toISOString(),
	completedAt: completedAt.toISOString(),
	elapsedSeconds: Number(((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(3)),
	device: result?.data?.device,
	summary: result?.data?.summary,
	nextSearchResultPosition: result?.data?.nextSearchResultPosition,
	persisted: result?.data?.persisted,
	pageFiles: pages.map((_: unknown, index: number) => `page-${String(index + 1).padStart(3, "0")}.xml`),
	normalized: result?.data?.normalized,
};
await fs.writeFile(path.join(evidenceDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ evidenceDir, ...proof, normalized: undefined }, null, 2));
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
