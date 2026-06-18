import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import ExcelJS from "exceljs";
import YAML from "yaml";

const DEFAULT_SCHEMA_DIR = path.resolve(process.cwd(), "prisma", "schema-postgres");
const DEFAULT_PAGE_SIZE = 500;

type LoggerLike = {
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
	error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type PrismaModelDefinition = {
	modelName: string;
	delegateName: string;
	fields: string[];
};

export type BackupFormat = "ndjson" | "xml" | "yaml" | "excel";

export type PgDumpOptions = {
	enabled: boolean;
	containerName?: string;
	database?: string;
	user?: string;
	databaseUrl?: string;
	command?: string;
	args?: string[];
	env?: NodeJS.ProcessEnv;
};

export type DatabaseBackupOptions = {
	prisma: any;
	outputDir: string;
	schemaDir?: string;
	timezone?: string;
	now?: Date;
	pageSize?: number;
	dryRun?: boolean;
	logger?: LoggerLike;
	runId?: string;
	models?: PrismaModelDefinition[];
	formats?: BackupFormat[];
	pgDump?: PgDumpOptions;
	appVersion?: string | null;
	gitCommit?: string | null;
	workbookFactory?: () => ExcelJS.Workbook;
};

export type BackupArtifact = {
	type: "pg_dump" | "ndjson" | "xml" | "yaml" | "excel" | "manifest";
	path: string;
	relativePath: string;
	sizeBytes: number;
	sha256: string;
	modelName?: string;
	rowCount?: number;
};

export type DatabaseBackupManifest = {
	backupRunId: string;
	startedAt: string;
	completedAt: string | null;
	timezone: string;
	status: "success" | "failed";
	appVersion: string | null;
	gitCommit: string | null;
	database: {
		name: string | null;
		containerName: string | null;
	};
	backupDirectory: string;
	artifacts: BackupArtifact[];
	rowCounts: Record<string, number>;
	totalRows: number;
	errorMessage?: string;
};

export type DatabaseBackupResult = {
	runId: string;
	runDir: string;
	manifestPath: string | null;
	manifest: DatabaseBackupManifest;
};

export const toPrismaDelegateName = (modelName: string): string =>
	modelName ? modelName.charAt(0).toLowerCase() + modelName.slice(1) : modelName;

const isFieldLine = (line: string): boolean => {
	if (!line || line.startsWith("//") || line.startsWith("@@") || line.startsWith("@")) return false;
	return /^[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(\[\])?/.test(line);
};

const isRelationField = (line: string): boolean => {
	const parts = line.split(/\s+/);
	const fieldType = parts[1] || "";
	return line.includes("@relation") || fieldType.endsWith("[]");
};

const stripOptionalAndListMarkers = (fieldType: string): string =>
	fieldType.replace("?", "").replace("[]", "");

const SCALAR_AND_SPECIAL_TYPES = new Set([
	"String",
	"Boolean",
	"Int",
	"BigInt",
	"Float",
	"Decimal",
	"DateTime",
	"Json",
	"Bytes",
]);

const extractModelBlocks = (content: string): Array<{ name: string; body: string }> => {
	const blocks: Array<{ name: string; body: string }> = [];
	const modelRegex = /model\s+([A-Za-z_][A-Za-z0-9_]*)\s+\{/g;
	let match: RegExpExecArray | null;

	while ((match = modelRegex.exec(content)) !== null) {
		const name = match[1];
		let cursor = modelRegex.lastIndex;
		let depth = 1;

		while (cursor < content.length && depth > 0) {
			const char = content[cursor];
			if (char === "{") depth += 1;
			if (char === "}") depth -= 1;
			cursor += 1;
		}

		blocks.push({ name, body: content.slice(modelRegex.lastIndex, cursor - 1) });
		modelRegex.lastIndex = cursor;
	}

	return blocks;
};

export const discoverPrismaModelsFromSchema = (schemaDir = DEFAULT_SCHEMA_DIR): PrismaModelDefinition[] => {
	const files = fs
		.readdirSync(schemaDir)
		.filter((file) => file.endsWith(".prisma"))
		.sort((a, b) => a.localeCompare(b));

	const enumNames = new Set<string>();
	for (const file of files) {
		const content = fs.readFileSync(path.join(schemaDir, file), "utf8");
		for (const match of content.matchAll(/enum\s+([A-Za-z_][A-Za-z0-9_]*)\s+\{/g)) {
			enumNames.add(match[1]);
		}
	}

	const models: PrismaModelDefinition[] = [];
	for (const file of files) {
		const content = fs.readFileSync(path.join(schemaDir, file), "utf8");
		for (const block of extractModelBlocks(content)) {
			const fields = block.body
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(isFieldLine)
				.filter((line) => {
					if (isRelationField(line)) return false;
					const fieldType = stripOptionalAndListMarkers(line.split(/\s+/)[1] || "");
					return SCALAR_AND_SPECIAL_TYPES.has(fieldType) || enumNames.has(fieldType);
				})
				.map((line) => line.split(/\s+/)[0]);

			models.push({
				modelName: block.name,
				delegateName: toPrismaDelegateName(block.name),
				fields,
			});
		}
	}

	return models;
};

const stableJsonStringify = (value: unknown): string => {
	const seen = new WeakSet<object>();

	const normalize = (input: unknown): unknown => {
		if (input === null || input === undefined) return input;
		if (input instanceof Date) return input.toISOString();
		if (typeof input === "bigint") return input.toString();
		if (Array.isArray(input)) return input.map((item) => normalize(item));
		if (typeof input === "object") {
			if (seen.has(input)) return "[Circular]";
			seen.add(input);
			const record = input as Record<string, unknown>;
			return Object.keys(record)
				.sort()
				.reduce<Record<string, unknown>>((acc, key) => {
					acc[key] = normalize(record[key]);
					return acc;
				}, {});
		}
		return input;
	};

	return JSON.stringify(normalize(value));
};

export const serializeBackupValue = (value: unknown): string | number | boolean | null => {
	if (value === undefined || value === null) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (typeof value === "object") return stableJsonStringify(value);
	return String(value);
};

const normalizeRow = (
	model: PrismaModelDefinition,
	row: Record<string, unknown>,
	metadata: { runId: string; startedAt: string; timezone: string },
): Record<string, string | number | boolean | null> => {
	const result: Record<string, string | number | boolean | null> = {
		__backupRunId: metadata.runId,
		__backupStartedAt: metadata.startedAt,
		__backupTimezone: metadata.timezone,
		__model: model.modelName,
	};

	for (const field of model.fields) {
		result[field] = serializeBackupValue(row[field]);
	}

	return result;
};

const ensureDirectory = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const writeAtomicString = (filePath: string, content: string) => {
	ensureDirectory(path.dirname(filePath));
	const tempPath = `${filePath}.tmp`;
	fs.writeFileSync(tempPath, content, "utf8");
	fs.renameSync(tempPath, filePath);
};

const sha256File = (filePath: string): string => {
	const hash = crypto.createHash("sha256");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("hex");
};

const artifactForFile = (
	type: BackupArtifact["type"],
	filePath: string,
	runDir: string,
	extra: Partial<BackupArtifact> = {},
): BackupArtifact => {
	const stat = fs.statSync(filePath);
	return {
		type,
		path: filePath,
		relativePath: path.relative(runDir, filePath).replace(/\\/g, "/"),
		sizeBytes: stat.size,
		sha256: sha256File(filePath),
		...extra,
	};
};

const timestampForRun = (date: Date): string => {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}${parts.minute}${parts.second}+0800`;
};

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

const rowToXml = (row: Record<string, string | number | boolean | null>): string => {
	const fields = Object.entries(row)
		.map(([key, value]) =>
			value === null
				? `    <field name="${escapeXml(key)}" null="true" />`
				: `    <field name="${escapeXml(key)}">${escapeXml(String(value))}</field>`,
		)
		.join("\n");
	return `  <row>\n${fields}\n  </row>`;
};

const sanitizeWorksheetName = (name: string, fallbackIndex: number): string => {
	const sanitized = name.replace(/[\\/*?:[\]]/g, "_").slice(0, 31);
	return sanitized || `Model${fallbackIndex + 1}`;
};

const listWorksheetNames = (models: PrismaModelDefinition[]): string[] => {
	const used = new Set<string>();
	return models.map((model, index) => {
		const base = sanitizeWorksheetName(model.modelName, index);
		let candidate = base;
		let suffix = 1;
		while (used.has(candidate)) {
			const suffixText = `_${suffix}`;
			candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
			suffix += 1;
		}
		used.add(candidate);
		return candidate;
	});
};

const runCommandToFile = async (
	command: string,
	args: string[],
	outputPath: string,
	env: NodeJS.ProcessEnv,
): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		const tempPath = `${outputPath}.tmp`;
		const output = fs.createWriteStream(tempPath);
		const child = spawn(command, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stderr = "";

		child.stdout.pipe(output);
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			output.close();
			fs.rmSync(tempPath, { force: true });
			reject(error);
		});
		child.on("close", (code) => {
			output.close();
			if (code !== 0) {
				fs.rmSync(tempPath, { force: true });
				reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
				return;
			}
			const stat = fs.statSync(tempPath);
			if (stat.size <= 0) {
				fs.rmSync(tempPath, { force: true });
				reject(new Error(`${command} produced an empty backup artifact`));
				return;
			}
			fs.renameSync(tempPath, outputPath);
			resolve();
		});
	});
};

const parseDatabaseName = (databaseUrl?: string): string | null => {
	if (!databaseUrl) return null;
	try {
		const parsed = new URL(databaseUrl);
		return parsed.pathname.replace(/^\//, "") || null;
	} catch {
		return null;
	}
};

const resolvePgDumpCommand = (pgDump: PgDumpOptions): { command: string; args: string[]; env: NodeJS.ProcessEnv } => {
	if (pgDump.command && pgDump.args) {
		return { command: pgDump.command, args: pgDump.args, env: { ...process.env, ...pgDump.env } };
	}

	if (pgDump.containerName) {
		const args = ["exec"];
		if (pgDump.env?.PGPASSWORD) {
			args.push("-e", "PGPASSWORD");
		}
		args.push(pgDump.containerName, "pg_dump");
		if (pgDump.user) args.push("-U", pgDump.user);
		if (pgDump.database) args.push("-d", pgDump.database);
		args.push("-Fc");
		return { command: "docker", args, env: { ...process.env, ...pgDump.env } };
	}

	const args = ["-Fc"];
	if (pgDump.databaseUrl) {
		args.push(pgDump.databaseUrl);
	} else {
		if (pgDump.user) args.push("-U", pgDump.user);
		if (pgDump.database) args.push("-d", pgDump.database);
	}
	return { command: "pg_dump", args, env: { ...process.env, ...pgDump.env } };
};

const writePgDump = async (
	runDir: string,
	pgDump: PgDumpOptions | undefined,
	logger: LoggerLike,
): Promise<BackupArtifact | null> => {
	if (!pgDump?.enabled) return null;
	const outputPath = path.join(runDir, "hris-postgres.dump");
	const resolved = resolvePgDumpCommand(pgDump);
	logger.info?.("database_backup.pg_dump_started", {
		command: resolved.command,
		args: resolved.args.map((arg) => (arg.includes("://") ? "[DATABASE_URL]" : arg)),
		outputPath,
	});
	await runCommandToFile(resolved.command, resolved.args, outputPath, resolved.env);
	return artifactForFile("pg_dump", outputPath, runDir);
};

export const runDatabaseBackup = async (
	options: DatabaseBackupOptions,
): Promise<DatabaseBackupResult> => {
	const startedAtDate = options.now ?? new Date();
	const startedAt = startedAtDate.toISOString();
	const completedFormats = new Set(options.formats || ["ndjson", "xml", "yaml", "excel"]);
	const timezone = options.timezone || "Asia/Manila";
	const runId = options.runId || timestampForRun(startedAtDate);
	const runDir = path.resolve(options.outputDir, runId);
	const logger = options.logger || {};
	const models = options.models || discoverPrismaModelsFromSchema(options.schemaDir);
	const pageSize = Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE);
	const artifacts: BackupArtifact[] = [];
	const rowCounts: Record<string, number> = {};
	const metadata = { runId, startedAt, timezone };

	if (!options.dryRun && fs.existsSync(runDir)) {
		throw new Error(`Backup run directory already exists: ${runDir}`);
	}
	if (!options.dryRun) {
		ensureDirectory(runDir);
	}

	logger.info?.("database_backup.started", {
		runId,
		runDir,
		timezone,
		modelCount: models.length,
		dryRun: Boolean(options.dryRun),
	});

	const workbook = completedFormats.has("excel")
		? options.workbookFactory
			? options.workbookFactory()
			: new ExcelJS.Workbook()
		: null;
	const worksheetNames = listWorksheetNames(models);
	const worksheets = new Map<string, ExcelJS.Worksheet>();
	if (workbook) {
		workbook.creator = "hris-api";
		workbook.created = startedAtDate;
		workbook.modified = startedAtDate;
		for (const [index, model] of models.entries()) {
			const worksheet = workbook.addWorksheet(worksheetNames[index]);
			const columns = Array.from(
				new Set(["__backupRunId", "__backupStartedAt", "__backupTimezone", "__model", ...model.fields]),
			);
			worksheet.columns = columns.map((key) => ({
				header: key,
				key,
				width: Math.min(Math.max(key.length + 2, 14), 42),
			}));
			worksheets.set(model.modelName, worksheet);
		}
	}

	try {
		if (!options.dryRun) {
			const pgDumpArtifact = await writePgDump(runDir, options.pgDump, logger);
			if (pgDumpArtifact) artifacts.push(pgDumpArtifact);
		}

		for (const model of models) {
			const delegate = options.prisma?.[model.delegateName];
			if (!delegate?.findMany) {
				throw new Error(`Prisma delegate not found for model ${model.modelName}: ${model.delegateName}`);
			}

			const ndjsonRows: string[] = [];
			const xmlRows: string[] = [];
			const yamlRows: Array<Record<string, string | number | boolean | null>> = [];
			let skip = 0;
			let rowCount = 0;

			for (;;) {
				const rows = await delegate.findMany({ skip, take: pageSize });
				if (!Array.isArray(rows) || rows.length === 0) break;

				for (const row of rows) {
					const normalized = normalizeRow(model, row, metadata);
					if (completedFormats.has("ndjson")) ndjsonRows.push(stableJsonStringify(normalized));
					if (completedFormats.has("xml")) xmlRows.push(rowToXml(normalized));
					if (completedFormats.has("yaml")) yamlRows.push(normalized);
					worksheets.get(model.modelName)?.addRow(normalized);
					rowCount += 1;
				}

				skip += rows.length;
				if (rows.length < pageSize) break;
			}

			rowCounts[model.modelName] = rowCount;
			if (!options.dryRun) {
				if (completedFormats.has("ndjson")) {
					const filePath = path.join(runDir, "json", `${model.modelName}.ndjson`);
					writeAtomicString(filePath, ndjsonRows.join("\n") + (ndjsonRows.length ? "\n" : ""));
					artifacts.push(artifactForFile("ndjson", filePath, runDir, { modelName: model.modelName, rowCount }));
				}
				if (completedFormats.has("xml")) {
					const filePath = path.join(runDir, "xml", `${model.modelName}.xml`);
					writeAtomicString(
						filePath,
						`<?xml version="1.0" encoding="UTF-8"?>\n<model name="${escapeXml(model.modelName)}">\n${xmlRows.join("\n")}\n</model>\n`,
					);
					artifacts.push(artifactForFile("xml", filePath, runDir, { modelName: model.modelName, rowCount }));
				}
				if (completedFormats.has("yaml")) {
					const filePath = path.join(runDir, "yaml", `${model.modelName}.yml`);
					writeAtomicString(
						filePath,
						YAML.stringify({ model: model.modelName, rows: yamlRows }, { customTags: [] }),
					);
					artifacts.push(artifactForFile("yaml", filePath, runDir, { modelName: model.modelName, rowCount }));
				}
			}

			logger.info?.("database_backup.model_exported", {
				runId,
				modelName: model.modelName,
				rowCount,
			});
		}

		if (workbook && !options.dryRun) {
			const filePath = path.join(runDir, "excel", "hris-readable.xlsx");
			ensureDirectory(path.dirname(filePath));
			const tempPath = `${filePath}.tmp`;
			await workbook.xlsx.writeFile(tempPath);
			fs.renameSync(tempPath, filePath);
			artifacts.push(artifactForFile("excel", filePath, runDir));
		}

		const completedAt = new Date().toISOString();
		const manifest: DatabaseBackupManifest = {
			backupRunId: runId,
			startedAt,
			completedAt,
			timezone,
			status: "success",
			appVersion: options.appVersion || null,
			gitCommit: options.gitCommit || null,
			database: {
				name: options.pgDump?.database || parseDatabaseName(options.pgDump?.databaseUrl) || null,
				containerName: options.pgDump?.containerName || null,
			},
			backupDirectory: runDir,
			artifacts,
			rowCounts,
			totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
		};

		let manifestPath: string | null = null;
		if (!options.dryRun) {
			manifestPath = path.join(runDir, "manifest.json");
			writeAtomicString(manifestPath, stableJsonStringify(manifest));
		}

		logger.info?.("database_backup.completed", {
			runId,
			runDir,
			totalRows: manifest.totalRows,
			artifactCount: manifest.artifacts.length,
			dryRun: Boolean(options.dryRun),
		});

		return { runId, runDir, manifestPath, manifest };
	} catch (error) {
		const manifest: DatabaseBackupManifest = {
			backupRunId: runId,
			startedAt,
			completedAt: new Date().toISOString(),
			timezone,
			status: "failed",
			appVersion: options.appVersion || null,
			gitCommit: options.gitCommit || null,
			database: {
				name: options.pgDump?.database || parseDatabaseName(options.pgDump?.databaseUrl) || null,
				containerName: options.pgDump?.containerName || null,
			},
			backupDirectory: runDir,
			artifacts,
			rowCounts,
			totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
			errorMessage: error instanceof Error ? error.message : String(error),
		};
		if (!options.dryRun) {
			writeAtomicString(path.join(runDir, "manifest.failed.json"), stableJsonStringify(manifest));
		}
		logger.error?.("database_backup.failed", { runId, error: manifest.errorMessage });
		throw error;
	}
};

export const pruneOldBackupRuns = (
	outputDir: string,
	retentionDays: number,
	now = new Date(),
	logger?: LoggerLike,
): string[] => {
	if (retentionDays <= 0 || !fs.existsSync(outputDir)) return [];
	const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	const candidates = fs
		.readdirSync(outputDir)
		.map((entry) => path.join(outputDir, entry))
		.filter((entryPath) => fs.statSync(entryPath).isDirectory())
		.filter((entryPath) => fs.existsSync(path.join(entryPath, "manifest.json")))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	const latestSuccessful = candidates[0];
	const deleted: string[] = [];

	for (const candidate of candidates) {
		if (candidate === latestSuccessful) continue;
		if (fs.statSync(candidate).mtimeMs >= cutoffMs) continue;
		fs.rmSync(candidate, { recursive: true, force: true });
		deleted.push(candidate);
		logger?.info?.("database_backup.retention_deleted", { path: candidate, retentionDays });
	}

	return deleted;
};
