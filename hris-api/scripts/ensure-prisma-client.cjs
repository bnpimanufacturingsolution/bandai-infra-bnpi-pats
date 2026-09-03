const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");

function fail(message) {
	console.error(`[prisma-preflight] ${message}`);
	process.exit(1);
}

function readJson(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		fail(`Unable to read ${path.relative(rootDir, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function resolveSchemaPath() {
	const packageJson = readJson(packageJsonPath);
	const schemaRelativePath = packageJson?.prisma?.schema;

	if (!schemaRelativePath || typeof schemaRelativePath !== "string") {
		fail(
			"Missing `prisma.schema` in package.json. Configure the active Prisma schema before running app commands.",
		);
	}

	const schemaPath = path.resolve(rootDir, schemaRelativePath);
	if (!fs.existsSync(schemaPath)) {
		fail(
			`Configured Prisma schema was not found at ${path.relative(rootDir, schemaPath)}.`,
		);
	}

	return { schemaPath, schemaRelativePath };
}

function getPrimarySchemaFile(schemaPath) {
	const schemaStat = fs.statSync(schemaPath);
	if (schemaStat.isFile()) {
		return schemaPath;
	}

	const schemaFilePath = path.join(schemaPath, "schema.prisma");
	if (!fs.existsSync(schemaFilePath)) {
		fail(
			`Configured Prisma schema directory ${path.relative(rootDir, schemaPath)} does not contain schema.prisma.`,
		);
	}

	return schemaFilePath;
}

function listSchemaFiles(schemaPath) {
	const schemaStat = fs.statSync(schemaPath);
	if (schemaStat.isFile()) {
		return [schemaPath];
	}

	const schemaFiles = [];
	const walk = (currentPath) => {
		for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
			const entryPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				walk(entryPath);
			} else if (entry.isFile() && entry.name.endsWith(".prisma")) {
				schemaFiles.push(entryPath);
			}
		}
	};

	walk(schemaPath);
	return schemaFiles;
}

function resolveGeneratedOutput(schemaPath) {
	const primarySchemaFile = getPrimarySchemaFile(schemaPath);
	const schemaContents = fs.readFileSync(primarySchemaFile, "utf8");
	const outputMatch = schemaContents.match(/^\s*output\s*=\s*"([^"]+)"/m);
	if (!outputMatch) {
		fail(
			`Could not find a Prisma generator output in ${path.relative(rootDir, primarySchemaFile)}.`,
		);
	}

	return path.resolve(path.dirname(primarySchemaFile), outputMatch[1]);
}

function getGeneratedEntrypoint(outputDir) {
	return path.join(outputDir, "index.js");
}

function shouldGenerate(schemaPath, outputDir) {
	const entrypointPath = getGeneratedEntrypoint(outputDir);
	if (!fs.existsSync(outputDir)) {
		return { needed: true, reason: `missing ${path.relative(rootDir, outputDir)}` };
	}

	if (!fs.existsSync(entrypointPath)) {
		return {
			needed: true,
			reason: `missing ${path.relative(rootDir, entrypointPath)}`,
		};
	}

	const schemaFiles = listSchemaFiles(schemaPath);
	const newestSchemaMtimeMs = schemaFiles.reduce((latest, filePath) => {
		const mtimeMs = fs.statSync(filePath).mtimeMs;
		return Math.max(latest, mtimeMs);
	}, 0);
	const entrypointStat = fs.statSync(entrypointPath);
	if (newestSchemaMtimeMs > entrypointStat.mtimeMs) {
		return {
			needed: true,
			reason: `${path.relative(rootDir, schemaPath)} is newer than ${path.relative(rootDir, entrypointPath)}`,
		};
	}

	return { needed: false, reason: "" };
}

function runPrismaGenerate(schemaRelativePath) {
	console.log(
		`[prisma-preflight] Generating Prisma client from ${schemaRelativePath}...`,
	);

	const isWindows = process.platform === "win32";
	const result = isWindows
		? spawnSync(`npx prisma generate --schema "${schemaRelativePath}"`, {
				cwd: rootDir,
				stdio: "inherit",
				windowsHide: true,
				shell: true,
			})
		: spawnSync("npx", ["prisma", "generate", "--schema", schemaRelativePath], {
				cwd: rootDir,
				stdio: "inherit",
				windowsHide: true,
			});

	if (result.status !== 0) {
		fail(
			`Prisma client generation failed for ${schemaRelativePath}. Try running \`npx prisma generate --schema ${schemaRelativePath}\` manually for more details.`,
		);
	}
}

function main() {
	const { schemaPath, schemaRelativePath } = resolveSchemaPath();
	const outputDir = resolveGeneratedOutput(schemaPath);
	const generationCheck = shouldGenerate(schemaPath, outputDir);

	if (!generationCheck.needed) {
		console.log(
			`[prisma-preflight] Prisma client is up to date at ${path.relative(rootDir, outputDir)}.`,
		);
		return;
	}

	console.log(`[prisma-preflight] Regenerating because ${generationCheck.reason}.`);
	runPrismaGenerate(schemaRelativePath);

	const entrypointPath = getGeneratedEntrypoint(outputDir);
	if (!fs.existsSync(entrypointPath)) {
		fail(
			`Prisma generate completed, but ${path.relative(rootDir, entrypointPath)} was not created. Try running \`npx prisma generate --schema ${schemaRelativePath}\` manually.`,
		);
	}

	console.log(
		`[prisma-preflight] Prisma client is ready at ${path.relative(rootDir, outputDir)}.`,
	);
}

main();
