#!/usr/bin/env ts-node

/*
  Simple CLI to list API endpoints from docs/generated/endpoints.json

  Usage:
    npm run api endpoints

  Optional flags:
    --json       Output raw JSON
    --tag <tag>  Filter by tag (case-insensitive)
    --method <m> Filter by HTTP method (GET, POST, ...)
*/

import { readFileSync } from "fs";
import { join } from "path";

type Endpoint = {
	method: string;
	url: string;
	summary?: string;
	description?: string;
	tags?: string[];
};

function loadEndpoints(): Endpoint[] {
	const filePath = join(process.cwd(), "docs", "generated", "endpoints.json");
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error("endpoints.json is not an array");
		}
		return parsed as Endpoint[];
	} catch (error) {
		console.error("Failed to read docs/generated/endpoints.json");
		console.error(String(error));
		process.exit(1);
	}
}

function printEndpoints(endpoints: Endpoint[]) {
	const longestMethod = Math.max(6, ...endpoints.map((e) => (e.method ? e.method.length : 0)));

	for (const e of endpoints) {
		const method = (e.method || "").toUpperCase().padEnd(longestMethod, " ");
		const line = `${method}  ${e.url}`;
		if (e.summary) {
			console.log(`${line}  - ${e.summary}`);
		} else {
			console.log(line);
		}
	}
}

function main() {
	const args = process.argv.slice(2);
	const subcommand = args[0];
	const flags = new Map<string, string | boolean>();

	for (let i = 1; i < args.length; i++) {
		const a = args[i];
		if (a.startsWith("--")) {
			const key = a.replace(/^--/, "");
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				flags.set(key, true);
			} else {
				flags.set(key, next);
				i++;
			}
		}
	}

	if (!subcommand || subcommand === "help" || subcommand === "--help") {
		console.log("Usage: npm run api-list endpoints [--json] [--tag <tag>] [--method <METHOD>]");
		console.log("\n📋 Sample Usage Examples:");
		console.log("  npm run api-list endpoints                    # List all endpoints");
		console.log("  npm run api-list endpoints --json             # Output as JSON");
		console.log("  npm run api-list endpoints --tag Template     # Filter by tag");
		console.log("  npm run api-list endpoints --method GET       # Filter by HTTP method");
		console.log(
			"  npm run api-list endpoints --tag Template --method POST  # Multiple filters",
		);
		process.exit(0);
	}

	if (subcommand !== "endpoints") {
		if (!subcommand) {
			// Show sample usage when no subcommand provided
			console.log("📋 API List Tool - Sample Usage Examples:");
			console.log("  npm run api-list endpoints                    # List all endpoints");
			console.log("  npm run api-list endpoints --json             # Output as JSON");
			console.log("  npm run api-list endpoints --tag Template     # Filter by tag");
			console.log("  npm run api-list endpoints --method GET       # Filter by HTTP method");
			console.log(
				"  npm run api-list endpoints --tag Template --method POST  # Multiple filters",
			);
			console.log("\nUse 'npm run api-list help' for more information.");
			process.exit(0);
		}
		console.error(`Unknown subcommand: ${subcommand}`);
		console.error("Use 'npm run api-list help' for available commands.");
		process.exit(1);
	}

	let endpoints = loadEndpoints();

	const tag = String(flags.get("tag") || "")
		.trim()
		.toLowerCase();
	if (tag) {
		endpoints = endpoints.filter((e) => (e.tags || []).some((t) => t.toLowerCase() === tag));
	}

	const method = String(flags.get("method") || "")
		.trim()
		.toUpperCase();
	if (method) {
		endpoints = endpoints.filter((e) => (e.method || "").toUpperCase() === method);
	}

	if (flags.get("json")) {
		console.log(JSON.stringify(endpoints, null, 2));
		return;
	}

	if (endpoints.length === 0) {
		console.log("No endpoints found.");
		return;
	}

	printEndpoints(endpoints);
}

main();
