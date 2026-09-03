import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
	auditDeviceUserSdkExportPackage,
	type DeviceUserSdkExportAuditRow,
} from "../helper/device-user-sdk-export-audit.helper";

const readArg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : "";
};

const csvCell = (value: unknown) => {
	const text =
		value === null || value === undefined
			? ""
			: typeof value === "string"
				? value
				: JSON.stringify(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const auditCsv = (rows: DeviceUserSdkExportAuditRow[]) => {
	const headers = [
		"rowNumber",
		"sourceDeviceId",
		"vendorUserId",
		"fingerprintStatus",
		"fingerprintSlotCount",
		"fingerprintBase64Valid",
		"fingerprintDecodedByteLengths",
		"fingerprintSha256",
		"faceStatus",
		"faceBase64Valid",
		"faceDecodedByteLength",
		"faceDetectedType",
		"faceSha256",
		"rowVerdict",
		"reasons",
	];
	return [
		headers.join(","),
		...rows.map((row) => headers.map((header) => csvCell((row as any)[header])).join(",")),
	].join("\r\n");
};

const main = async () => {
	const input = readArg("--input");
	const outputDir = readArg("--output-dir");
	if (!input || !outputDir) {
		throw new Error(
			"Usage: tsx scripts/audit-device-user-sdk-export.ts --input <package.json> --output-dir <protected-runtime-dir>",
		);
	}
	const payload = JSON.parse(
		(await readFile(path.resolve(input), "utf8")).replace(/^\uFEFF/, ""),
	);
	const audit = auditDeviceUserSdkExportPackage(payload);
	const resolvedOutput = path.resolve(outputDir);
	await mkdir(resolvedOutput, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(resolvedOutput, "sdk-export-row-audit.jsonl"),
			`${audit.rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
			{ mode: 0o600 },
		),
		writeFile(
			path.join(resolvedOutput, "sdk-export-row-audit.csv"),
			`${auditCsv(audit.rows)}\n`,
			{ mode: 0o600 },
		),
		writeFile(
			path.join(resolvedOutput, "sdk-export-failures.json"),
			`${JSON.stringify(audit.failures, null, 2)}\n`,
			{ mode: 0o600 },
		),
		writeFile(
			path.join(resolvedOutput, "sdk-export-summary.json"),
			`${JSON.stringify(
				{
					schemaVersion: audit.schemaVersion,
					exportedAt: audit.exportedAt,
					...audit.summary,
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		),
	]);
	process.stdout.write(
		`${JSON.stringify(
			{
				outputDir: resolvedOutput,
				...audit.summary,
			},
			null,
			2,
		)}\n`,
	);
	if (audit.summary.invalidRows > 0) process.exitCode = 2;
};

void main().catch((error) => {
	process.stderr.write(`${error?.stack || error}\n`);
	process.exitCode = 1;
});
