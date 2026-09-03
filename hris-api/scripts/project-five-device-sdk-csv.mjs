import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

// Compact portable CSV: status is encoded in the blob cells themselves.
// - present: FPn("base64") / face base64
// - not enrolled: not_enrolled
// - enrolled but no exportable bytes: missing_raw_blob
const HEADERS = Object.freeze([
	"vendorUserId",
	"displayName",
	"userType",
	"rawFingerprintBlob",
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
		slotId: Number(template?.fingerPrintId ?? template?.fingerPrintID ?? index + 1) || index + 1,
		data: assertBase64(template?.data || template?.fingerData, `${label} FP slot ${index + 1}`),
	}));
	const slotIds = normalized.map((template) => template.slotId);
	if (new Set(slotIds).size !== slotIds.length) {
		throw new Error(`${label} contains duplicate fingerprint slot IDs`);
	}
	// Always emit FPn("base64") — including single-slot rows — so package cells are uniform.
	// Import accepts both plain base64 and FPn wrappers; generation must not mix them.
	return normalized
		.map((template) => `FP${template.slotId}("${escapeFingerprintValue(template.data)}")`)
		.join(";");
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
			const faceValue = String(
				face?.blob?.base64 || face?.blob?.facePicture || face?.blob?.faceTemplate || "",
			).trim();
			// Status columns stay in the governed 7-col schema (present / not_enrolled /
			// missing_raw_blob). Blob cells carry either FPn("...") bytes or the same
			// status sentinel — never leave blank when status is non-present.
			const rawFingerprintBlob =
				fingerprintStatus === "raw_blob_present"
					? fingerprintCell(templates, label)
					: fingerprintStatus;
			const rawFaceBlob =
				faceStatus === "raw_blob_present"
					? assertBase64(faceValue, `${label} face`)
					: faceStatus;
			if (
				fingerprintStatus === "raw_blob_present" &&
				(!templates.length || !rawFingerprintBlob.startsWith("FP"))
			) {
				throw new Error(`${label} fingerprint status does not agree with bytes`);
			}
			if (faceStatus === "raw_blob_present" && !faceValue) {
				throw new Error(`${label} face status does not agree with bytes`);
			}
			if (
				fingerprintStatus !== "raw_blob_present" &&
				rawFingerprintBlob !== fingerprintStatus
			) {
				throw new Error(`${label} fingerprint sentinel does not match status`);
			}
			if (faceStatus !== "raw_blob_present" && rawFaceBlob !== faceStatus) {
				throw new Error(`${label} face sentinel does not match status`);
			}
			return {
				vendorUserId: user.vendorUserId,
				displayName: user.displayName || "",
				userType: user.userType || "",
				rawFingerprintBlob,
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
			fingerprintRawRows: rows.filter((row) =>
				String(row.rawFingerprintBlob || "").startsWith("FP"),
			).length,
			faceRawRows: rows.filter(
				(row) =>
					row.rawFaceBlob &&
					row.rawFaceBlob !== "not_enrolled" &&
					row.rawFaceBlob !== "missing_raw_blob",
			).length,
		});
	}
	process.stdout.write(`${JSON.stringify({ inputDir, outputDir, headers: HEADERS, results }, null, 2)}\n`);
};

main().catch((error) => {
	process.stderr.write(`${JSON.stringify({ success: false, error: error?.message || String(error) })}\n`);
	process.exitCode = 1;
});
