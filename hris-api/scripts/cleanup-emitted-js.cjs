const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const excludedDirs = new Set(["node_modules", "dist"]);
const excludedFileNames = new Set(["eslint.config.js", "webpack.config.js"]);
const excludedPathFragments = [path.join("generated", "prisma")];

function shouldSkipDir(dirName) {
	return excludedDirs.has(dirName);
}

function hasExcludedFragment(filePath) {
	return excludedPathFragments.some((fragment) => filePath.includes(fragment));
}

function collectFiles(dirPath, collected = []) {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			if (shouldSkipDir(entry.name)) continue;
			collectFiles(fullPath, collected);
			continue;
		}
		collected.push(fullPath);
	}
	return collected;
}

function isEmittedJsSibling(filePath) {
	if (!filePath.endsWith(".js")) return false;
	if (excludedFileNames.has(path.basename(filePath))) return false;
	if (hasExcludedFragment(filePath)) return false;

	const tsSibling = filePath.replace(/\.js$/, ".ts");
	return fs.existsSync(tsSibling);
}

function removeFileSafe(filePath) {
	try {
		fs.rmSync(filePath, { force: true });
		return true;
	} catch (_error) {
		return false;
	}
}

const markerPath = path.join(rootDir, ".runtime", "cleanup-emitted-js.stamp");
const maxAgeMs = Number(process.env.HRIS_CLEANUP_EMITTED_JS_MAX_AGE_MS || 5 * 60 * 1000);
try {
	if (fs.existsSync(markerPath)) {
		const age = Date.now() - fs.statSync(markerPath).mtimeMs;
		if (age >= 0 && age < maxAgeMs && process.env.HRIS_FORCE_CLEANUP_EMITTED_JS !== "true") {
			console.log(
				`[cleanup-emitted-js] Fast skip — last cleanup ${Math.round(age / 1000)}s ago (max ${Math.round(maxAgeMs / 1000)}s). Set HRIS_FORCE_CLEANUP_EMITTED_JS=true to force.`,
			);
			process.exit(0);
		}
	}
} catch {
	// fall through to full scan
}

const files = collectFiles(rootDir);
const emittedJsFiles = files.filter(isEmittedJsSibling);

let removedCount = 0;
for (const filePath of emittedJsFiles) {
	if (removeFileSafe(filePath)) {
		removedCount += 1;
	}
}

if (removedCount > 0) {
	console.log(`[cleanup-emitted-js] Removed ${removedCount} emitted .js file(s).`);
} else {
	console.log("[cleanup-emitted-js] No emitted .js siblings to remove.");
}
try {
	fs.mkdirSync(path.dirname(markerPath), { recursive: true });
	fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
} catch {
	// ignore stamp failures
}
