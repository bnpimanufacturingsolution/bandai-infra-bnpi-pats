#!/usr/bin/env node

/**
 * Script to find and fix old route references after route unification
 * This script searches for old route patterns and suggests fixes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Route mapping from old to new paths
const ROUTE_MAPPINGS = {
	"/hr/": "/hr/",
	"/hr/": "/hr/",
	"/employee/": "/employee/",
	"/hr/dashboard": "/hr/dashboard",
	"/hr/dashboard": "/hr/dashboard",
	"/employee/dashboard": "/employee/dashboard",
	"/hr/profile": "/hr/profile",
	"/hr/profile": "/hr/profile",
	"/employee/profile": "/employee/profile",
	"/hr/employees": "/hr/employees",
	"/hr/employee-records": "/hr/employees",
	"/employee/approvals": "/employee/approvals",
	"/hr/performance/overview": "/hr/performance/overview",
};

const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".firebase"];
const IGNORE_EXTENSIONS = [
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".ico",
	".woff",
	".woff2",
	".ttf",
	".eot",
];

function shouldProcessFile(filePath) {
	const ext = extname(filePath).toLowerCase();
	if (IGNORE_EXTENSIONS.includes(ext)) return false;

	// Skip files in ignored directories
	for (const ignoreDir of IGNORE_DIRS) {
		if (filePath.includes(`/${ignoreDir}/`) || filePath.includes(`\\${ignoreDir}\\`)) {
			return false;
		}
	}

	return true;
}

function findFiles(dir, files = []) {
	const items = readdirSync(dir);

	for (const item of items) {
		const fullPath = join(dir, item);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			if (!IGNORE_DIRS.includes(item)) {
				findFiles(fullPath, files);
			}
		} else if (shouldProcessFile(fullPath)) {
			files.push(fullPath);
		}
	}

	return files;
}

function scanFileForOldRoutes(filePath) {
	try {
		const content = readFileSync(filePath, "utf8");
		const issues = [];

		for (const [oldRoute, newRoute] of Object.entries(ROUTE_MAPPINGS)) {
			const regex = new RegExp(oldRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
			const matches = content.match(regex);

			if (matches) {
				issues.push({
					file: filePath,
					oldRoute,
					newRoute,
					occurrences: matches.length,
					lineNumbers: [],
				});

				// Find line numbers
				const lines = content.split("\n");
				lines.forEach((line, index) => {
					if (line.includes(oldRoute)) {
						issues[issues.length - 1].lineNumbers.push(index + 1);
					}
				});
			}
		}

		return issues;
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error.message);
		return [];
	}
}

function fixFile(filePath, issues) {
	try {
		let content = readFileSync(filePath, "utf8");
		let modified = false;

		for (const issue of issues) {
			const oldRoute = issue.oldRoute;
			const newRoute = issue.newRoute;

			if (content.includes(oldRoute)) {
				content = content.replace(
					new RegExp(oldRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
					newRoute,
				);
				modified = true;
			}
		}

		if (modified) {
			writeFileSync(filePath, content, "utf8");
			console.log(`✅ Fixed ${filePath}`);
		}

		return modified;
	} catch (error) {
		console.error(`Error fixing file ${filePath}:`, error.message);
		return false;
	}
}

function main() {
	const projectRoot = join(__dirname, "..");
	console.log("🔍 Scanning for old route references...\n");

	const files = findFiles(projectRoot);
	let totalIssues = 0;
	let fixedFiles = 0;

	for (const file of files) {
		const issues = scanFileForOldRoutes(file);

		if (issues.length > 0) {
			console.log(`📁 ${file.replace(projectRoot + "/", "")}:`);
			for (const issue of issues) {
				console.log(
					`  ❌ ${issue.oldRoute} → ${issue.newRoute} (${issue.occurrences} occurrences)`,
				);
				console.log(`     Lines: ${issue.lineNumbers.join(", ")}`);
				totalIssues += issue.occurrences;
			}

			// Auto-fix the file
			const wasFixed = fixFile(file, issues);
			if (wasFixed) {
				fixedFiles++;
			}
			console.log("");
		}
	}

	console.log(`\n📊 Summary:`);
	console.log(`   Total issues found: ${totalIssues}`);
	console.log(`   Files fixed: ${fixedFiles}`);

	if (totalIssues === 0) {
		console.log("🎉 No old route references found!");
	} else {
		console.log("✅ All found issues have been automatically fixed.");
	}
}

main();
