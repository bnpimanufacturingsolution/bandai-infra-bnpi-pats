import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// Extract route definitions from routes.ts and build full paths
function extractRouteDefinitions(routesContent: string): Map<string, string> {
	const routeMap = new Map<string, string>(); // path -> file

	// Parse route groups with their prefixes
	const routeGroups = [
		{ name: "authRoutes", prefix: "" },
		{ name: "legalRoutes", prefix: "" },
		{ name: "supportRoutes", prefix: "" },
		{ name: "userRoutes", prefix: "" },
		{ name: "adminRoutes", prefix: "admin" },
		{ name: "hrAdminRoutes", prefix: "hr-manager" },
		{ name: "hrUserRoutes", prefix: "hr-user" },
		{ name: "employeeRoutes", prefix: "employee" },
		{ name: "managerRoutes", prefix: "manager" },
	];

	// Extract routes from each group
	for (const group of routeGroups) {
		const groupRegex = new RegExp(`const ${group.name} = \\[([\\s\\S]*?)\\];`, "m");
		const match = routesContent.match(groupRegex);

		if (match) {
			const groupContent = match[1];

			// Match route() calls
			const routeRegex = /route\(["']([^"']+)["'],\s*["']([^"']+)["']\)/g;
			let routeMatch;

			while ((routeMatch = routeRegex.exec(groupContent)) !== null) {
				const path = routeMatch[1];
				const file = routeMatch[2];
				const fullPath = group.prefix ? `/${group.prefix}/${path}` : `/${path}`;
				routeMap.set(fullPath, file);
			}

			// Match index() calls within prefix blocks
			const indexRegex = /index\(["']([^"']+)["']\)/g;
			let indexMatch;

			while ((indexMatch = indexRegex.exec(groupContent)) !== null) {
				const file = indexMatch[1];
				const fullPath = group.prefix ? `/${group.prefix}` : "/";
				routeMap.set(fullPath, file);
			}
		}
	}

	// Add root-level routes from export default
	const exportRegex = /export default \[([^\]]*?)\]/s;
	const exportMatch = routesContent.match(exportRegex);

	if (exportMatch) {
		const exportContent = exportMatch[1];

		// Match index route
		const indexMatch = exportContent.match(/index\(["']([^"']+)["']\)/);
		if (indexMatch) {
			routeMap.set("/", indexMatch[1]);
		}

		// Match standalone routes
		const standaloneRegex = /route\(["']([^"']+)["'],\s*["']([^"']+)["']\)/g;
		let standaloneMatch;

		while ((standaloneMatch = standaloneRegex.exec(exportContent)) !== null) {
			const path = standaloneMatch[1];
			const file = standaloneMatch[2];
			routeMap.set(`/${path}`, file);
		}
	}

	return routeMap;
}

// Search for navigation references in all app files
function findNavigationReferences(appDir: string): Set<string> {
	const references = new Set<string>();

	function scanDirectory(dir: string) {
		const entries = readdirSync(dir);

		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stat = statSync(fullPath);

			if (stat.isDirectory()) {
				// Skip node_modules and build directories
				if (!["node_modules", "build", ".git"].includes(entry)) {
					scanDirectory(fullPath);
				}
			} else if (stat.isFile() && (fullPath.endsWith(".tsx") || fullPath.endsWith(".ts"))) {
				const content = readFileSync(fullPath, "utf-8");

				// Find Link/NavLink to="" references
				const linkRegex = /<(?:Link|NavLink)[^>]*to=["']([^"']+)["']/g;
				let match;
				while ((match = linkRegex.exec(content)) !== null) {
					references.add(match[1]);
				}

				// Find navigate("") calls
				const navigateRegex = /navigate\(["']([^"']+)["']/g;
				while ((match = navigateRegex.exec(content)) !== null) {
					references.add(match[1]);
				}

				// Find redirect to="" or redirect("")
				const redirectRegex = /redirect(?:\(|[^>]*to=)["']([^"']+)["']/g;
				while ((match = redirectRegex.exec(content)) !== null) {
					references.add(match[1]);
				}

				// Find pathname or path references (like { pathname: "/path" })
				const pathnameRegex = /(?:pathname|path):\s*["']([^"']+)["']/g;
				while ((match = pathnameRegex.exec(content)) !== null) {
					const path = match[1];
					if (path.startsWith("/")) {
						references.add(path);
					}
				}
			}
		}
	}

	scanDirectory(appDir);
	return references;
}

// Check if a route path matches any navigation reference
function isRouteReferenced(routePath: string, references: Set<string>): boolean {
	// Direct match
	if (references.has(routePath)) {
		return true;
	}

	// Check if route is part of a reference (for dynamic segments)
	// e.g., /employee/benefits/$tab matches /employee/benefits/health
	const routePattern = routePath.replace(/\$\w+/g, "[^/]+").replace(/:\w+/g, "[^/]+");
	const routeRegex = new RegExp(`^${routePattern}$`);

	for (const ref of references) {
		if (routeRegex.test(ref)) {
			return true;
		}

		// Also check if the reference partially matches (for nested routes)
		if (ref.startsWith(routePath.replace(/\/\$\w+$/, "").replace(/\/:\w+$/, ""))) {
			return true;
		}
	}

	return false;
}

describe("Route Accessibility Check", () => {
	it("should not have unreachable routes", () => {
		const appDir = join(process.cwd(), "app");
		const routesConfigPath = join(appDir, "routes.ts");

		// Read routes.ts
		const routesContent = readFileSync(routesConfigPath, "utf-8");

		// Extract all route definitions
		const routeDefinitions = extractRouteDefinitions(routesContent);

		console.log("\n📋 Total routes defined:", routeDefinitions.size);

		// Find all navigation references in the codebase
		console.log("🔍 Scanning codebase for navigation references...");
		const navigationReferences = findNavigationReferences(appDir);

		console.log("📍 Found", navigationReferences.size, "navigation references\n");

		// Find unreachable routes
		const unreachableRoutes: Array<{ path: string; file: string }> = [];

		// Routes that are typically accessed programmatically and should be excluded
		const excludedPatterns = [
			"/", // Home/landing page
			"/403", // Error pages
			"/404",
			"/500",
			"/auth/login", // Auth pages (redirected to)
			"/auth/register",
			"/public", // Public landing
		];

		for (const [path, file] of routeDefinitions.entries()) {
			// Skip excluded routes
			if (excludedPatterns.some((pattern) => path === pattern)) {
				continue;
			}

			if (!isRouteReferenced(path, navigationReferences)) {
				unreachableRoutes.push({ path, file });
			}
		}

		if (unreachableRoutes.length > 0) {
			console.log(`\n🚫 Found ${unreachableRoutes.length} unreachable routes:`);
			console.log("-----------------------------------------------------------");

			// Group by role
			const grouped = unreachableRoutes.reduce(
				(acc, route) => {
					const role = route.path.split("/")[1] || "root";
					if (!acc[role]) acc[role] = [];
					acc[role].push(route);
					return acc;
				},
				{} as Record<string, typeof unreachableRoutes>,
			);

			for (const [role, routes] of Object.entries(grouped)) {
				console.log(`\n  [${role.toUpperCase()}]`);
				routes.forEach(({ path, file }) => {
					console.log(`    ❌ ${path}`);
					console.log(`       📁 ${file}`);
				});
			}

			console.log("\n💡 These routes exist but have no navigation links pointing to them.");
			console.log("   They might be dead code or need navigation added.");
			console.log("\nTo remove these routes, run:");
			console.log("  npm run clean-unreachable-routes\n");
		} else {
			console.log(
				"\n✅ All routes are reachable! Every route has navigation pointing to it.\n",
			);
		}

		// This will fail the test if there are unreachable routes
		expect(unreachableRoutes).toEqual([]);
	});
});
