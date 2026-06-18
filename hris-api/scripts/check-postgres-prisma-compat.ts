import fs from "fs";
import path from "path";
import { Prisma } from "../generated/prisma";

type Finding = {
	file: string;
	line: number;
	rule: string;
	text: string;
};

const ROOTS = ["app", "helper", "scripts", "prisma", "tests"];
const SKIP_DIRS = new Set(["node_modules", "generated", "dist", ".git", ".wwg"]);
const jsonFieldNames = new Set(
	(Prisma.dmmf.datamodel.models || []).flatMap((model) =>
		model.fields
			.filter((field) => field.kind === "scalar" && field.type === "Json")
			.map((field) => field.name),
	),
);

function walk(dir: string, files: string[] = []) {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(fullPath, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".ts")) {
			files.push(fullPath);
		}
	}
	return files;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanFile(file: string): Finding[] {
	const text = fs.readFileSync(file, "utf8");
	const lines = text.split(/\r?\n/);
	const findings: Finding[] = [];

	lines.forEach((lineText, index) => {
		if (/\bisSet\s*:/.test(lineText)) {
			findings.push({
				file,
				line: index + 1,
				rule: "no-prisma-json-isSet",
				text: lineText.trim(),
			});
		}

		for (const fieldName of jsonFieldNames) {
			const field = escapeRegExp(fieldName);
			const unsupportedJsonObjectFilter = new RegExp(
				`\\b${field}\\s*:\\s*\\{\\s*(is|isNot)\\s*:`,
			);
			if (unsupportedJsonObjectFilter.test(lineText)) {
				findings.push({
					file,
					line: index + 1,
					rule: "no-json-relation-filter",
					text: lineText.trim(),
				});
			}

			const unsupportedJsonSelect = new RegExp(`\\b${field}\\s*:\\s*\\{\\s*select\\s*:`);
			if (unsupportedJsonSelect.test(lineText)) {
				findings.push({
					file,
					line: index + 1,
					rule: "no-json-subfield-select",
					text: lineText.trim(),
				});
			}
		}
	});

	return findings;
}

const files = ROOTS.flatMap((root) => walk(path.resolve(process.cwd(), root)));
const findings = files.flatMap(scanFile);

if (findings.length > 0) {
	console.error("Postgres Prisma compatibility scan failed.");
	console.error(
		"Use JSON filters with `path`/`equals`/`string_contains`, and select whole JSON fields.",
	);
	for (const finding of findings) {
		console.error(
			`${path.relative(process.cwd(), finding.file)}:${finding.line} ${finding.rule} ${finding.text}`,
		);
	}
	process.exitCode = 1;
} else {
	console.log(
		`Postgres Prisma compatibility scan passed (${files.length} TypeScript files, ${jsonFieldNames.size} JSON fields).`,
	);
}
