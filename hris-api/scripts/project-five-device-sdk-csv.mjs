import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const HEADERS = Object.freeze([
	"vendorUserId",
	"displayName",
	"userType",
	"fingerprintStatus",
	"rawFingerprintBlob",
	"faceStatus",
	"rawFaceBlob",
]);
const ALLOWED_STATUSES = new Set([
	"raw_blob_present",
	"not_enrolled",
	"missing_raw_blob",
]);
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const inputDir = resolve(String(args.get("input") || "../.runtime/five-device-sdk-packages"));
const outputDir = resolve(String(args.get("output") || inputDir));
const packageNames = [
	"main-b-device-users.json",
	"main-a-device-users.json",
	"main-f-device-users.json",
	"main-d-device-users.json",
	"main-e-device-users.json",
];

const csvValue = (value) => {
	const text = String(value ?? "");
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const escapeFingerprintValue = (value) =>
	String(value || "")
		.trim()
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');
const assertBase64 = (value, label) => {
	const normalized = String(value || "").trim().replace(/\s+/g, "");
	if (!normalized) throw new Error(`${label} is empty`);
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
		throw new Error(`${label} is not valid base64`);
	}
	const decoded = Buffer.from(normalized, "base64");
	if (!decoded.length) throw new Error(`${label} decodes to empty bytes`);
	return normalized;
};
const fingerprintCell = (templates, label) => {
	const normalized = templates.map((template, index) => ({
		slotId: Number(template?.fingerPrintId ?? template?.fingerPrintID ?? index + 1),
		data: assertBase64(template?.data || template?.fingerData, `${label} FP slot ${index + 1}`),
	}));
	const slotIds = normalized.map((template) => template.slotId);
	if (new Set(slotIds).size !== slotIds.length) {
		throw new Error(`${label} contains duplicate fingerprint slot IDs`);
	}
	if (normalized.length === 1) return normalized[0].data;
	return normalized
		.map((template) => `FP${template.slotId}("${escapeFingerprintValue(template.data)}")`)
		.join(" ");
};

const main = async () => {
	await mkdir(outputDir, { recursive: true });
	const results = [];
	for (const packageName of packageNames) {
		const payload = JSON.parse(await readFile(resolve(inputDir, packageName), "utf8"));
		if (payload?.schemaVersion !== "project-truth.hikvision-device-users.v1") {
			throw new Error(`${packageName} has an unexpected schema version`);
		}
		const users = payload?.devices?.[0]?.users;
		if (!Array.isArray(users)) throw new Error(`${packageName} has no device user rows`);
		const ids = users.map((user) => String(user?.vendorUserId || "").trim());
		if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
			throw new Error(`${packageName} contains blank or duplicate vendorUserId values`);
		}
		const rows = users.map((user) => {
			const label = `${packageName}:${user.vendorUserId}`;
			const fingerprint = user?.rawBiometricCustody?.fingerprint || {};
			const face = user?.rawBiometricCustody?.face || {};
			const fingerprintStatus = String(fingerprint.status || "").trim();
			const faceStatus = String(face.status || "").trim();
			if (!ALLOWED_STATUSES.has(fingerprintStatus) || !ALLOWED_STATUSES.has(faceStatus)) {
				throw new Error(`${label} has an unsupported biometric status`);
			}
			const templates = Array.isArray(fingerprint.templates) ? fingerprint.templates : [];
			const rawFingerprintBlob = templates.length ? fingerprintCell(templates, label) : "";
			const faceValue = String(
				face?.blob?.base64 || face?.blob?.facePicture || face?.blob?.faceTemplate || "",
			).trim();
			const rawFaceBlob = faceValue ? assertBase64(faceValue, `${label} face`) : "";
			if ((fingerprintStatus === "raw_blob_present") !== Boolean(rawFingerprintBlob)) {
				throw new Error(`${label} fingerprint status does not agree with bytes`);
			}
			if ((faceStatus === "raw_blob_present") !== Boolean(rawFaceBlob)) {
				throw new Error(`${label} face status does not agree with bytes`);
			}
			return {
				vendorUserId: user.vendorUserId,
				displayName: user.displayName || "",
				userType: user.userType || "",
				fingerprintStatus,
				rawFingerprintBlob,
				faceStatus,
				rawFaceBlob,
			};
		});
		const csv = [
			HEADERS.join(","),
			...rows.map((row) => HEADERS.map((header) => csvValue(row[header])).join(",")),
		].join("\r\n");
		const csvName = packageName.replace(/\.json$/i, ".csv");
		const path = resolve(outputDir, csvName);
		await writeFile(path, `\uFEFF${csv}\r\n`, "utf8");
		await chmod(path, 0o600).catch(() => undefined);
		results.push({
			package: basename(packageName),
			projection: basename(csvName),
			rows: rows.length,
			columns: HEADERS.length,
			fingerprintRawRows: rows.filter((row) => row.fingerprintStatus === "raw_blob_present")
				.length,
			faceRawRows: rows.filter((row) => row.faceStatus === "raw_blob_present").length,
		});
	}
	process.stdout.write(`${JSON.stringify({ inputDir, outputDir, headers: HEADERS, results }, null, 2)}\n`);
};

main().catch((error) => {
	process.stderr.write(`${JSON.stringify({ success: false, error: error?.message || String(error) })}\n`);
	process.exitCode = 1;
});
