import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import dotenv from "dotenv";

type DeployEnv = "DEV" | "UAT";

type SecretMapping = {
	envKey: string;
	githubSecret: string;
	defaultSecretId: string;
	required?: boolean;
};

const SECRET_MAPPINGS: SecretMapping[] = [
	{
		envKey: "DATABASE_URL",
		githubSecret: "SECRET_DATABASE_URL",
		defaultSecretId: "database-url",
		required: true,
	},
	{
		envKey: "JWT_SECRET",
		githubSecret: "SECRET_JWT_SECRET",
		defaultSecretId: "jwt-secret",
		required: true,
	},
	{
		envKey: "CORS_ORIGINS",
		githubSecret: "SECRET_CORS_ORIGINS",
		defaultSecretId: "cors-origins",
		required: true,
	},
	{
		envKey: "CORS_CREDENTIALS",
		githubSecret: "SECRET_CORS_CREDENTIALS",
		defaultSecretId: "cors-credentials",
		required: true,
	},
	{
		envKey: "GCS_BUCKET_NAME",
		githubSecret: "SECRET_GCS_BUCKET_NAME",
		defaultSecretId: "gcs-bucket-name",
	},
	{
		envKey: "GCS_PROJECT_ID",
		githubSecret: "SECRET_GCS_PROJECT_ID",
		defaultSecretId: "gcs-project-id",
	},
	{
		envKey: "GCS_PUBLIC_BASE_URL",
		githubSecret: "SECRET_GCS_PUBLIC_BASE_URL",
		defaultSecretId: "gcs-public-base-url",
	},
	{
		envKey: "BETTER_STACK_SOURCE_TOKEN",
		githubSecret: "SECRET_BETTER_STACK_SOURCE_TOKEN",
		defaultSecretId: "better-stack-source-token",
	},
	{
		envKey: "BETTER_STACK_HOST",
		githubSecret: "SECRET_BETTER_STACK_HOST",
		defaultSecretId: "better-stack-host",
	},
	{
		envKey: "CLOUDINARY_CLOUD_NAME",
		githubSecret: "SECRET_CLOUDINARY_CLOUD_NAME",
		defaultSecretId: "cloudinary-cloud-name",
		required: true,
	},
	{
		envKey: "CLOUDINARY_API_KEY",
		githubSecret: "SECRET_CLOUDINARY_API_KEY",
		defaultSecretId: "cloudinary-api-key",
		required: true,
	},
	{
		envKey: "CLOUDINARY_API_SECRET",
		githubSecret: "SECRET_CLOUDINARY_API_SECRET",
		defaultSecretId: "cloudinary-api-secret",
		required: true,
	},
];

type TargetConfig = {
	target: DeployEnv;
	envFile: string;
	projectId?: string;
};

type ScriptOptions = {
	targets: TargetConfig[];
	repo?: string;
	secretPrefix?: string;
	syncGcp: boolean;
	dryRun: boolean;
};

let resolvedGcloudBin: string | null = null;
const WINDOWS_CMD_BIN = process.env.ComSpec || "cmd.exe";
const WINDOWS_GCLOUD_OVERRIDE = "GCLOUD_BIN";
const WINDOWS_POWERSHELL_BIN =
	process.env.SystemRoot
		? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
		: "powershell.exe";

const printUsage = () => {
	console.log(`Usage:
  npx tsx scripts/sync-github-deploy-secrets.ts [options]

Options:
  --target <dev|uat>          Optional single deploy target. Default: sync both dev and uat
  --env-file-dev <path>       Override DEV env file. Default: .env.dev
  --env-file-uat <path>       Override UAT env file. Default: .env.uat
  --repo <owner/name>         GitHub repo for gh secret set. Default: current gh repo
  --project-id-dev <id>       Override DEV GCP project for Secret Manager sync.
  --project-id-uat <id>       Override UAT GCP project for Secret Manager sync.
  --secret-prefix <prefix>    Prefix for generated Secret Manager secret IDs.
  --no-sync-gcp               Skip GCP Secret Manager sync and only update GitHub secrets.
  --dry-run                   Show planned actions without changing GitHub or GCP.

Examples:
  npx tsx scripts/sync-github-deploy-secrets.ts --repo your-org/hris-api
  npx tsx scripts/sync-github-deploy-secrets.ts --target uat
  npx tsx scripts/sync-github-deploy-secrets.ts --project-id-dev my-dev-project --project-id-uat my-uat-project
  npx tsx scripts/sync-github-deploy-secrets.ts --no-sync-gcp
`);
};

const parseArgs = (argv: string[]): ScriptOptions => {
	const getValue = (flag: string) => {
		const index = argv.indexOf(flag);
		if (index !== -1) return argv[index + 1];
		const inlineArg = argv.find((arg) => arg.startsWith(`${flag}=`));
		if (inlineArg) return inlineArg.slice(flag.length + 1);
		const npmConfigKey = `npm_config_${flag.slice(2).replace(/-/g, "_")}`;
		const npmConfigValue = process.env[npmConfigKey];
		return npmConfigValue === "true" ? undefined : npmConfigValue;
	};
	const hasFlag = (flag: string) => {
		if (argv.includes(flag)) return true;
		const npmConfigKey = `npm_config_${flag.slice(2).replace(/-/g, "_")}`;
		return String(process.env[npmConfigKey] || "").toLowerCase() === "true";
	};
	const positionalArgs = argv.filter((arg, index) => {
		if (!arg || arg.startsWith("-")) return false;
		const previousArg = index > 0 ? argv[index - 1] : "";
		return !previousArg.startsWith("--");
	});

	if (argv.includes("--help") || argv.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	const rawTarget = (getValue("--target") || positionalArgs[0] || "").trim().toUpperCase();
	const envFileDev = getValue("--env-file-dev") || ".env.dev";
	const envFileUat = getValue("--env-file-uat") || ".env.uat";
	const projectIdDev = getValue("--project-id-dev");
	const projectIdUat = getValue("--project-id-uat");

	let targets: TargetConfig[];
	if (!rawTarget) {
		targets = [
			{ target: "DEV", envFile: envFileDev, projectId: projectIdDev },
			{ target: "UAT", envFile: envFileUat, projectId: projectIdUat },
		];
	} else if (rawTarget === "DEV") {
		targets = [{ target: "DEV", envFile: envFileDev, projectId: projectIdDev }];
	} else if (rawTarget === "UAT") {
		targets = [{ target: "UAT", envFile: envFileUat, projectId: projectIdUat }];
	} else {
		printUsage();
		throw new Error("--target must be either dev or uat when provided");
	}

	return {
		targets,
		repo: getValue("--repo"),
		secretPrefix: getValue("--secret-prefix") || "hris-api",
		syncGcp: !hasFlag("--no-sync-gcp"),
		dryRun: hasFlag("--dry-run"),
	};
};

const run = (command: string, args: string[], input?: string, dryRun = false) => {
	const rendered = [command, ...args].join(" ");
	if (dryRun) {
		console.log(`[dry-run] ${rendered}`);
		return;
	}

	execFileSync(command, args, {
		stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
		input,
	});
};

const execWindowsCommand = (
	command: string,
	args: string[],
	options?: { input?: string; stdio?: "ignore" | "inherit" },
) => {
	const escapedCommand = command.replace(/'/g, "''");
	const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(", ");
	const invokeScript = [
		"$ErrorActionPreference = 'Stop'",
		`$cmd = '${escapedCommand}'`,
		`$cmdArgs = @(${escapedArgs})`,
		"$stdin = [Console]::In.ReadToEnd()",
		"if ($stdin.Length -gt 0) { $stdin | & $cmd @cmdArgs } else { & $cmd @cmdArgs }",
		"exit $LASTEXITCODE",
	].join("; ");

	const result = spawnSync(WINDOWS_POWERSHELL_BIN, ["-NoProfile", "-NonInteractive", "-Command", invokeScript], {
		windowsHide: true,
		stdio: options?.input ? ["pipe", options?.stdio || "inherit", options?.stdio || "inherit"] : options?.stdio || "inherit",
		input: options?.input,
	});

	if (result.error) {
		throw result.error;
	}

	if (typeof result.status === "number" && result.status !== 0) {
		throw new Error(
			`Command failed: ${command} ${args.join(" ")}`,
		);
	}

	return result;
};

const probeWindowsCommand = (command: string, args: string[]) => {
	execWindowsCommand(command, args, { stdio: "ignore" });
};

const runGcloudCommand = (args: string[], options?: { input?: string; stdio?: "ignore" | "inherit" }) => {
	const gcloudBin = resolveGcloudBin();

	if (process.platform !== "win32") {
		return execFileSync(gcloudBin, args, {
			stdio: options?.input ? ["pipe", options?.stdio || "inherit", options?.stdio || "inherit"] : options?.stdio || "inherit",
			input: options?.input,
		});
	}

	return execWindowsCommand(gcloudBin, args, options);
};

const loadEnvFile = (envFilePath: string) => {
	const absolutePath = path.resolve(process.cwd(), envFilePath);
	if (!fs.existsSync(absolutePath)) {
		throw new Error(`Env file not found: ${absolutePath}`);
	}

	return {
		absolutePath,
		values: dotenv.parse(fs.readFileSync(absolutePath)),
	};
};

const resolveProjectIdFromEnv = (values: dotenv.DotenvParseOutput) =>
	String(values.GCP_PROJECT_ID || values.GCS_PROJECT_ID || "").trim();

const findExistingFile = (filePath: string | null | undefined) => {
	if (!filePath) return null;

	const trimmed = filePath.trim();
	if (!trimmed) return null;

	return fs.existsSync(trimmed) ? trimmed : null;
};

const findGcloudFromPath = () => {
	try {
		const output = execFileSync("where.exe", ["gcloud.cmd"], {
			stdio: ["ignore", "pipe", "ignore"],
			encoding: "utf8",
		});
		return output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean);
	} catch {
		return null;
	}
};

const findGcloudFromPathEnv = () => {
	const pathEntries = String(process.env.Path || process.env.PATH || "")
		.split(path.delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean);

	for (const entry of pathEntries) {
		const candidate = path.join(entry, "gcloud.cmd");
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
};

const resolveGcloudBin = () => {
	if (resolvedGcloudBin) return resolvedGcloudBin;

	if (process.platform !== "win32") {
		resolvedGcloudBin = "gcloud";
		return resolvedGcloudBin;
	}

	const overrideBin = String(process.env[WINDOWS_GCLOUD_OVERRIDE] || "").trim();
	const pathCandidate = findGcloudFromPath();
	const pathEnvCandidate = findGcloudFromPathEnv();
	const candidates = [
		overrideBin,
		pathCandidate,
		pathEnvCandidate,
		path.join(
			process.env.LOCALAPPDATA || "",
			"Google",
			"Cloud SDK",
			"google-cloud-sdk",
			"bin",
			"gcloud.cmd",
		),
		path.join(
			process.env.ProgramFiles || "",
			"Google",
			"Cloud SDK",
			"google-cloud-sdk",
			"bin",
			"gcloud.cmd",
		),
		path.join(
			process.env["ProgramFiles(x86)"] || "",
			"Google",
			"Cloud SDK",
			"google-cloud-sdk",
			"bin",
			"gcloud.cmd",
		),
	].filter(Boolean) as string[];

	const searchedLocations: string[] = [];
	if (overrideBin) {
		searchedLocations.push(`${WINDOWS_GCLOUD_OVERRIDE}=${overrideBin}`);
	}
	searchedLocations.push(pathCandidate ? `PATH=${pathCandidate}` : "PATH lookup via where.exe gcloud.cmd");
	searchedLocations.push(pathEnvCandidate ? `Path env=${pathEnvCandidate}` : "Path env scan for gcloud.cmd");
	searchedLocations.push("LOCALAPPDATA Google Cloud SDK bin");
	searchedLocations.push("ProgramFiles Google Cloud SDK bin");
	searchedLocations.push("ProgramFiles(x86) Google Cloud SDK bin");

	for (const candidate of candidates) {
		const existingCandidate = findExistingFile(candidate);
		if (existingCandidate) {
			resolvedGcloudBin = existingCandidate;
			return resolvedGcloudBin;
		}

		if (candidate === "gcloud.cmd") {
			try {
				probeWindowsCommand(candidate, ["--version"]);
				resolvedGcloudBin = candidate;
				return resolvedGcloudBin;
			} catch {
				// Try next candidate.
			}
		}

		try {
			probeWindowsCommand(candidate, ["--version"]);
			resolvedGcloudBin = candidate;
			return resolvedGcloudBin;
		} catch {
			// Try next candidate.
		}
	}

	throw new Error(
		`Google Cloud CLI \`gcloud\` is required for GCP sync. Windows npm shells must be able to run \`gcloud.cmd\`. Set ${WINDOWS_GCLOUD_OVERRIDE} to the full \`gcloud.cmd\` path or add it to PATH. Checked: ${searchedLocations.join("; ")}.`,
	);
};

const normalizeSecretId = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const ensureGhAvailable = () => {
	try {
		execFileSync("gh", ["--version"], { stdio: "ignore" });
	} catch {
		throw new Error("GitHub CLI `gh` is required but was not found in PATH.");
	}

	try {
		execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
	} catch {
		throw new Error(
			"GitHub CLI authentication is invalid or expired. Run `gh auth login -h github.com` and retry.",
		);
	}
};

const ensureGcloudAvailable = () => {
	resolveGcloudBin();
};

const upsertSecretManagerSecret = (
	projectId: string,
	secretId: string,
	value: string,
	dryRun: boolean,
) => {
	if (dryRun) {
		const rendered = [
			resolveGcloudBin(),
			"secrets",
			"create",
			secretId,
			"--project",
			projectId,
			"--replication-policy",
			"automatic",
		].join(" ");
		console.log(`[dry-run] ${rendered}`);
		console.log(
			`[dry-run] ${[resolveGcloudBin(), "secrets", "versions", "add", secretId, "--project", projectId, "--data-file", "-"].join(" ")}`,
		);
		return;
	}

	let exists = true;
	try {
		runGcloudCommand(
			["secrets", "describe", secretId, "--project", projectId, "--format=value(name)"],
			{ stdio: "ignore" },
		);
	} catch {
		exists = false;
	}

	if (!exists) {
		if (dryRun) {
			const rendered = [
				resolveGcloudBin(),
				"secrets",
				"create",
				secretId,
				"--project",
				projectId,
				"--replication-policy",
				"automatic",
			].join(" ");
			console.log(`[dry-run] ${rendered}`);
		} else {
			runGcloudCommand([
				"secrets",
				"create",
				secretId,
				"--project",
				projectId,
				"--replication-policy",
				"automatic",
			]);
		}
	}

	runGcloudCommand(
		["secrets", "versions", "add", secretId, "--project", projectId, "--data-file", "-"],
		{ input: value, stdio: "inherit" },
	);
};

const main = () => {
	const options = parseArgs(process.argv.slice(2));
	ensureGhAvailable();
	if (options.syncGcp) ensureGcloudAvailable();

	for (const targetConfig of options.targets) {
		const { absolutePath, values } = loadEnvFile(targetConfig.envFile);
		console.log(`Using env file for ${targetConfig.target}: ${absolutePath}`);
		const resolvedProjectId = targetConfig.projectId || resolveProjectIdFromEnv(values);

		const missingRequired = SECRET_MAPPINGS.filter(
			(mapping) => mapping.required && !String(values[mapping.envKey] || "").trim(),
		);
		if (missingRequired.length > 0) {
			throw new Error(
				`Missing required env values for ${targetConfig.target}: ${missingRequired
					.map((item) => item.envKey)
					.join(", ")}`,
			);
		}

		if (options.syncGcp && !resolvedProjectId) {
			throw new Error(
				`Missing GCP project for ${targetConfig.target}. Set GCP_PROJECT_ID or GCS_PROJECT_ID in ${absolutePath}, or pass --project-id-${targetConfig.target.toLowerCase()}.`,
			);
		}

		if (options.syncGcp) {
			console.log(
				`Using GCP project for ${targetConfig.target}: ${resolvedProjectId}`,
			);
		}

		for (const mapping of SECRET_MAPPINGS) {
			const value = String(values[mapping.envKey] || "").trim();
			if (!value) {
				console.log(`Skipping ${mapping.envKey} for ${targetConfig.target} (no value in env file)`);
				continue;
			}

			const githubSecretName = `${mapping.githubSecret}_${targetConfig.target}`;
			const secretId = normalizeSecretId(
				`${options.secretPrefix}-${targetConfig.target.toLowerCase()}-${mapping.defaultSecretId}`,
			);

			if (options.syncGcp && resolvedProjectId) {
				console.log(
					`Syncing GCP Secret Manager value for ${mapping.envKey} (${targetConfig.target}) -> ${secretId}`,
				);
				upsertSecretManagerSecret(resolvedProjectId, secretId, value, options.dryRun);
			} else {
				console.log(
					`Using generated Secret Manager name for ${mapping.envKey} (${targetConfig.target}) -> ${secretId}`,
				);
			}

			const ghArgs = ["secret", "set", githubSecretName, "--body", secretId];
			if (options.repo) {
				ghArgs.push("--repo", options.repo);
			}

			console.log(`Syncing GitHub secret ${githubSecretName}`);
			run("gh", ghArgs, undefined, options.dryRun);
		}

		console.log("");
	}

	console.log("Done.");
	console.log(
		"This script syncs GitHub workflow secrets to Secret Manager secret names, not raw runtime values.",
	);
	console.log("GitHub repo is inferred from your current gh login/repo unless you pass --repo.");
	if (options.syncGcp) {
		console.log("GCP Secret Manager sync is enabled by default.");
	} else {
		console.log("GCP Secret Manager sync was skipped because --no-sync-gcp was used.");
		console.log(
			"GitHub secret values cannot be read back via gh, so existing hidden secret contents still cannot be auto-discovered from GitHub.",
		);
	}
};

try {
	main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
}
