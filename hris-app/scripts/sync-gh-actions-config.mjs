import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

const parseEnvFile = (path) => {
	if (!existsSync(path)) return {};
	const content = readFileSync(path, "utf8");
	const result = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf("=");
		if (idx < 0) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		result[key] = value;
	}
	return result;
};

const args = process.argv.slice(2);
const getArg = (name) => {
	const prefix = `--${name}=`;
	const hit = args.find((arg) => arg.startsWith(prefix));
	return hit ? hit.slice(prefix.length).trim() : "";
};
const hasFlag = (name) => args.includes(`--${name}`);

const repo = getArg("repo");
const dryRun = hasFlag("dry-run");

if (!repo) {
	console.error("Missing --repo=owner/name");
	console.error(
		'Example: npm run gh:sync:deploy-config -- --repo=your-org/your-repo --vite-api-base-url-dev="https://..." --vite-api-base-url-uat="https://..."',
	);
	process.exit(1);
}

const appEnv = parseEnvFile(join(ROOT, ".env"));
const appLocalEnv = parseEnvFile(join(ROOT, ".env.local"));
const appDevEnv = parseEnvFile(join(ROOT, ".env.dev"));
const appUatEnv = parseEnvFile(join(ROOT, ".env.uat"));
const firebasercPath = join(ROOT, ".firebaserc");
if (!existsSync(firebasercPath)) {
	console.error(`Missing .firebaserc at ${firebasercPath}`);
	process.exit(1);
}

const firebaserc = JSON.parse(readFileSync(firebasercPath, "utf8"));
const devProjectId = getArg("firebase-project-id-dev") || firebaserc?.projects?.dev || "";
const uatProjectId = getArg("firebase-project-id-uat") || firebaserc?.projects?.uat || "";
const devSiteId =
	getArg("firebase-site-id-dev") || firebaserc?.targets?.[devProjectId]?.hosting?.dev?.[0] || "";
const uatSiteId =
	getArg("firebase-site-id-uat") || firebaserc?.targets?.[uatProjectId]?.hosting?.uat?.[0] || "";

const viteBaseUrlDev =
	getArg("vite-api-base-url-dev") ||
	getArg("vite-base-url-dev") ||
	appDevEnv.VITE_API_BASE_URL ||
	appLocalEnv.VITE_API_BASE_URL ||
	appEnv.VITE_API_BASE_URL ||
	"https://hris-api-dev-161377059311.asia-southeast1.run.app";
const viteBaseUrlUat =
	getArg("vite-api-base-url-uat") ||
	getArg("vite-base-url-uat") ||
	appUatEnv.VITE_API_BASE_URL ||
	"https://hris-api-uat-161377059311.asia-southeast1.run.app";
const viteCloudinaryPathDev = getArg("vite-cloudinary-path-dev");
const viteCloudinaryPathUat = getArg("vite-cloudinary-path-uat");

const runGh = (ghArgs, inputText = null) => {
	const printable = `gh ${ghArgs.join(" ")}`;
	if (dryRun) {
		console.log(`DRY RUN: ${printable}`);
		return;
	}
	const result = spawnSync("gh", ghArgs, {
		encoding: "utf8",
		input: inputText ?? undefined,
	});
	if (result.status !== 0) {
		console.error(`Command failed: ${printable}`);
		if (result.stdout) console.error(result.stdout);
		if (result.stderr) console.error(result.stderr);
		process.exit(result.status || 1);
	}
	console.log(`OK ${printable}`);
};

const setVar = (name, value) => {
	if (!value) {
		console.warn(`Skipping variable ${name} because no value was provided.`);
		return;
	}
	runGh(["variable", "set", name, "--repo", repo, "--body", value]);
};

const setSecret = (name, value) => {
	if (!value) {
		console.warn(`Skipping secret ${name} because no value was provided.`);
		return;
	}
	runGh(["secret", "set", name, "--repo", repo], `${value}\n`);
};

console.log(`Syncing GitHub Actions config for repo: ${repo}`);

setVar("FIREBASE_PROJECT_ID_DEV", devProjectId);
setVar("FIREBASE_PROJECT_ID_UAT", uatProjectId);
setVar("FIREBASE_SITE_ID_DEV", devSiteId);
setVar("FIREBASE_SITE_ID_UAT", uatSiteId);

setVar("VITE_API_BASE_URL_DEV", viteBaseUrlDev);
setVar("VITE_API_BASE_URL_UAT", viteBaseUrlUat);
setSecret("VITE_CLOUDINARY_PATH_DEV", viteCloudinaryPathDev);
setSecret("VITE_CLOUDINARY_PATH_UAT", viteCloudinaryPathUat);

console.log("GitHub Actions config sync complete.");
