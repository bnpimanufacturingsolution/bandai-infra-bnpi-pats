import { Request } from "express";

export interface Endpoint {
	id: string;
	method: string;
	url: string;
	summary: string;
	description: string;
	tags: string[];
	handler?: string;
}

export const generateEndpointsFromApp = async (req: Request): Promise<Endpoint[]> => {
	const endpoints: Endpoint[] = [];

	try {
		// Try to get the Express app instance from the request
		const app = (req as any).app;

		// If app is not available, try to get it from the global scope
		if (!app || !app.router) {
			// Try to access the app from the global scope
			const appInstance = (global as any).app;

			if (appInstance && appInstance.router) {
				console.log("Using global app instance for dynamic generation");
				console.log("App router stack length:", appInstance.router.stack?.length || 0);
				extractRoutesFromApp(appInstance, endpoints);
			} else {
				// Fallback: return a basic list of known endpoints
				console.log("Using fallback endpoints - app not accessible");
				return getKnownEndpoints();
			}
		} else {
			extractRoutesFromApp(app, endpoints);
		}

		// If no routes found, return known endpoints
		if (endpoints.length === 0) {
			console.log("No routes found, using fallback endpoints");
			return getKnownEndpoints();
		}

		console.log(`Generated ${endpoints.length} endpoints dynamically`);
		return endpoints;
	} catch (error) {
		console.error("Error generating endpoints:", error);
		return getKnownEndpoints();
	}
};

// Alternative function that takes app instance directly
export const generateEndpointsFromAppInstance = async (app: any): Promise<Endpoint[]> => {
	const endpoints: Endpoint[] = [];

	try {
		if (!app || !app.router) {
			console.log("App instance not available, using fallback endpoints");
			return getKnownEndpoints();
		}

		// Try to extract module names from the global context or app registration
		const moduleMap = new Map<any, string>(); // Map router instances to their detected names

		// Helper function to extract module names from the main app file
		const extractModuleNamesFromApp = (): string[] => {
			try {
				// Try to read the index.ts file to get actual module names
				const fs = require("fs");
				const path = require("path");
				const indexPath = path.join(process.cwd(), "index.ts");

				if (fs.existsSync(indexPath)) {
					const indexContent = fs.readFileSync(indexPath, "utf8");

					// Extract require/import statements for modules
					const modulePatterns = [
						/const\s+(\w+)\s*=\s*require\(['"`]\.\/app\/(\w+)['"`]\)/g, // const template = require('./app/template')
						/import\s+(\w+)\s+from\s+['"`]\.\/app\/(\w+)['"`]/g, // import template from './app/template'
						/app\.use\([^,]+,\s*(\w+)\)/g, // app.use(config.baseApiPath, template)
					];

					const detectedModules: string[] = [];

					for (const pattern of modulePatterns) {
						let match;
						while ((match = pattern.exec(indexContent)) !== null) {
							if (match[1] && match[1] !== "docs") {
								// Skip docs module
								detectedModules.push(match[1]);
							}
						}
					}

					// Remove duplicates and filter out system modules
					const uniqueModules = [...new Set(detectedModules)].filter(
						(name) =>
							name !== "app" &&
							name !== "server" &&
							name !== "config" &&
							name !== "prisma" &&
							name !== "docs" &&
							name.length > 2,
					);

					console.log(`Detected modules from index.ts: ${uniqueModules.join(", ")}`);
					return uniqueModules;
				}
			} catch (error) {
				console.log(`Could not read index.ts: ${error}`);
			}

			return []; // Return empty if detection fails
		};

		const detectedModuleNames = extractModuleNamesFromApp();

		// First pass: analyze all routers to detect their types and assign names
		const analyzeRouters = (router: any) => {
			if (!router || !router.stack) return;

			router.stack.forEach((layer: any) => {
				if (layer.name === "router" && layer.handle) {
					const subRoutes =
						layer.handle.stack
							?.filter((sublayer: any) => sublayer.route)
							?.map((sublayer: any) => sublayer.route.path) || [];

					let moduleName = "";

					// Identify docs module by its unique routes
					if (
						subRoutes.includes("/api-list") ||
						subRoutes.includes("/swagger") ||
						subRoutes.includes("/postman") ||
						subRoutes.includes("/iml")
					) {
						moduleName = "docs";
					} else if (subRoutes.some((p: string) => p === "/" || p === "/:id")) {
						// CRUD module - use the detected module names from index.ts
						const existingCrudModules = Array.from(moduleMap.values()).filter((name) =>
							detectedModuleNames.includes(name),
						);

						// Get the next available module name from our detected list
						const availableModules = detectedModuleNames.filter(
							(name) => !existingCrudModules.includes(name),
						);

						if (availableModules.length > 0) {
							moduleName = availableModules[0];
						} else {
							// Fallback if we have more routers than detected modules
							const crudCount = Array.from(moduleMap.values()).filter(
								(name) => name !== "docs" && !name.includes("system"),
							).length;
							moduleName = `module${crudCount + 1}`;
						}

						// Get handler names for debugging
						const handlers =
							layer.handle.stack
								?.filter((sublayer: any) => sublayer.route)
								?.map((sublayer: any) => sublayer.route.stack[0]) || [];

						const handlerNames = handlers
							.map((h: any) => h?.name)
							.filter((name: string) => name && name !== "anonymous");

						console.log(
							`CRUD module detected with handlers: [${handlerNames.join(", ")}] -> named: ${moduleName} (from detected: [${detectedModuleNames.join(", ")}])`,
						);
					}

					if (moduleName) {
						moduleMap.set(layer.handle, moduleName);
						console.log(
							`Detected router: ${moduleName} with routes: ${subRoutes.join(", ")}`,
						);
					}

					// Recursively analyze nested routers
					analyzeRouters(layer.handle);
				}
			});
		};

		// Second pass: extract routes with detected module names
		const extractAllRoutes = (router: any, basePath = "/api", currentModule = "API") => {
			if (!router || !router.stack) return;

			router.stack.forEach((layer: any) => {
				if (layer.route) {
					// Direct route
					const route = layer.route;
					const fullPath = basePath + route.path;
					const methods = Object.keys(route.methods);

					methods.forEach((method: string) => {
						const handler = route.stack[0];

						// Determine module name dynamically from the base path
						let module = currentModule;
						const pathParts = basePath.split("/").filter((p) => p);
						if (pathParts.length > 1) {
							// Capitalize the module name from the path
							module =
								pathParts[pathParts.length - 1].charAt(0).toUpperCase() +
								pathParts[pathParts.length - 1].slice(1);
						}

						endpoints.push({
							id: `${method.toUpperCase()} ${fullPath}`,
							method: method.toUpperCase(),
							url: fullPath,
							summary: `${module} endpoint`,
							description: `${module} endpoint`,
							tags: [module],
							handler: handler.name || "anonymous",
						});
					});
				} else if (layer.name === "router" && layer.handle) {
					// Sub-router - use detected module name
					const detectedModule = moduleMap.get(layer.handle);
					if (detectedModule) {
						const mountPath = `${basePath}/${detectedModule}`;
						extractAllRoutes(layer.handle, mountPath, detectedModule);
					} else {
						// Fallback to current path if not detected
						extractAllRoutes(layer.handle, basePath, currentModule);
					}
				}
			});
		};

		// Run the two-pass analysis
		analyzeRouters(app.router);
		extractAllRoutes(app.router);

		// If no routes found, return known endpoints
		if (endpoints.length === 0) {
			console.log("No routes found, using fallback endpoints");
			return getKnownEndpoints();
		}

		console.log(`Generated ${endpoints.length} endpoints dynamically from app instance`);
		return endpoints;
	} catch (error) {
		console.error("Error generating endpoints from app instance:", error);
		return getKnownEndpoints();
	}
};

// Helper function to extract routes from Express app
const extractRoutesFromApp = (app: any, endpoints: Endpoint[]) => {
	console.log("Extracting routes from app, router stack length:", app.router?.stack?.length || 0);

	const extractRoutes = (router: any, basePath = "") => {
		if (!router || !router.stack) {
			console.log("No router or stack found");
			return;
		}

		console.log(
			`Extracting routes from router with ${router.stack.length} layers, basePath: ${basePath}`,
		);
		router.stack.forEach((layer: any, index: number) => {
			if (layer.route) {
				// Handle regular routes
				const route = layer.route;
				const path = basePath + route.path;
				const methods = Object.keys(route.methods);

				methods.forEach((method: string) => {
					const handler = route.stack[0];
					const summary = extractSummaryFromHandler(handler);
					const tags = extractTagsFromHandler(handler);

					endpoints.push({
						id: `${method.toUpperCase()} ${path}`,
						method: method.toUpperCase(),
						url: path,
						summary: summary,
						description: summary,
						tags: tags,
						handler: handler.name || "anonymous",
					});
				});
			} else if (layer.name === "router" && layer.handle) {
				// Handle sub-routers - use known module paths
				let subPath = basePath;

				// Dynamically detect the module path by examining the router's content
				if (layer.handle && layer.handle.stack) {
					// Get all route paths from this router
					const routePaths = layer.handle.stack
						.filter((sublayer: any) => sublayer.route)
						.map((sublayer: any) => sublayer.route.path);

					console.log(`Router has routes: ${routePaths.join(", ")}`);

					// Check for specific route patterns to identify the module
					if (
						routePaths.includes("/api-list") ||
						routePaths.includes("/swagger") ||
						routePaths.includes("/postman") ||
						routePaths.includes("/iml")
					) {
						subPath = basePath + "/docs";
						console.log(`Identified as docs module: ${subPath}`);
					} else if (routePaths.length > 0) {
						// For other modules, try to determine the module name dynamically
						// Since we can't easily get the module name, we'll use a different approach
						// Let's check if we can extract it from the router's properties or use the route patterns

						// For now, let's use the base path and let the individual routes be discovered
						// This will show routes as /api/ and /api/:id which is still informative
						subPath = basePath;
						console.log(`Using base path for unknown module: ${subPath}`);
					}
				}

				extractRoutes(layer.handle, subPath);
			}
		});
	};

	// Extract routes from the main app using a more sophisticated approach
	// First, let's analyze the router structure to identify module patterns
	const moduleRouters: Array<{
		router: any;
		moduleName: string;
		routePaths: string[];
	}> = [];

	// Track CRUD module order based on index.ts registration order
	let crudModuleIndex = 0;
	const expectedCrudModules = ["template", "  "];

	if (app.router && app.router.stack) {
		app.router.stack.forEach((layer: any, index: number) => {
			if (layer.name === "router" && layer.handle && layer.handle.stack) {
				const routePaths = layer.handle.stack
					.filter((sublayer: any) => sublayer.route)
					.map((sublayer: any) => sublayer.route.path);

				console.log(`Router ${index} has routes: ${routePaths.join(", ")}`);

				// Try to identify the module based on route patterns
				let moduleName = "";
				if (
					routePaths.includes("/api-list") ||
					routePaths.includes("/swagger") ||
					routePaths.includes("/postman") ||
					routePaths.includes("/iml")
				) {
					moduleName = "docs";
				} else if (
					routePaths.length > 0 &&
					routePaths.some((p: string) => p === "/" || p === "/:id")
				) {
					// This looks like a CRUD module, assign based on expected order
					if (crudModuleIndex < expectedCrudModules.length) {
						moduleName = expectedCrudModules[crudModuleIndex];
						crudModuleIndex++;
					} else {
						moduleName = `module${crudModuleIndex}`;
						crudModuleIndex++;
					}

					console.log(
						`CRUD router identified as: ${moduleName} (routes: ${routePaths.join(", ")})`,
					);
				}

				moduleRouters.push({
					router: layer.handle,
					moduleName: moduleName,
					routePaths: routePaths,
				});
			}
		});
	}

	// Now extract routes with proper module paths
	moduleRouters.forEach(({ router, moduleName }) => {
		const modulePath = moduleName ? `/api/${moduleName}` : "/api";
		console.log(`Extracting routes for ${moduleName} at ${modulePath}`);
		extractRoutes(router, modulePath);
	});

	// Extract only non-module routes (health, root, etc.) from the main router
	if (app.router && app.router.stack) {
		app.router.stack.forEach((layer: any) => {
			if (layer.route) {
				// This is a direct route, not a sub-router
				const route = layer.route;
				const path = "/api" + route.path;
				const methods = Object.keys(route.methods);

				methods.forEach((method: string) => {
					const handler = route.stack[0];
					const summary = extractSummaryFromHandler(handler);
					const tags = extractTagsFromHandler(handler);

					endpoints.push({
						id: `${method.toUpperCase()} ${path}`,
						method: method.toUpperCase(),
						url: path,
						summary: summary,
						description: summary,
						tags: tags,
						handler: handler.name || "anonymous",
					});
				});
			}
		});
	}
};

// Extract summary from OpenAPI comments
const extractSummaryFromHandler = (handler: any): string => {
	if (handler && handler.toString) {
		const handlerStr = handler.toString();
		const summaryMatch = handlerStr.match(/@openapi[\s\S]*?summary:\s*([^\n]+)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}
	}
	return "API Endpoint";
};

// Extract tags from OpenAPI comments
const extractTagsFromHandler = (handler: any): string[] => {
	if (handler && handler.toString) {
		const handlerStr = handler.toString();
		const tagsMatch = handlerStr.match(/@openapi[\s\S]*?tags:\s*\[([^\]]+)\]/);
		if (tagsMatch) {
			return tagsMatch[1].split(",").map((tag: string) => tag.trim().replace(/['"]/g, ""));
		}
	}
	return ["API"];
};

// Fallback: return known endpoints if dynamic extraction fails
const getKnownEndpoints = (): Endpoint[] => {
	return [
		{
			id: "GET /api/template/{id}",
			method: "GET",
			url: "/api/template/{id}",
			summary: "Get template by id",
			description: "Get template by id with optional fields to include",
			tags: ["Template"],
		},
		{
			id: "GET /api/template",
			method: "GET",
			url: "/api/template",
			summary: "Get all templates",
			description:
				"Get all templates with pagination, sorting, field selection, and optional grouping",
			tags: ["Template"],
		},
		{
			id: "POST /api/template",
			method: "POST",
			url: "/api/template",
			summary: "Create new template",
			description: "Creates a new template with sections and fields",
			tags: ["Template"],
		},
		{
			id: "PATCH /api/template/{id}",
			method: "PATCH",
			url: "/api/template/{id}",
			summary: "Update template",
			description: "Update template data by id",
			tags: ["Template"],
		},
		{
			id: "DELETE /api/template/{id}",
			method: "DELETE",
			url: "/api/template/{id}",
			summary: "Delete template",
			description: "Permanently delete a template",
			tags: ["Template"],
		},
		{
			id: "GET /api/docs/api-list",
			method: "GET",
			url: "/api/docs/api-list",
			summary: "Get API endpoints list",
			description: "Get a list of all API endpoints in various formats",
			tags: ["Documentation"],
		},
		{
			id: "GET /api/docs/swagger",
			method: "GET",
			url: "/api/docs/swagger",
			summary: "Get Swagger documentation",
			description: "Get the complete Swagger/OpenAPI specification",
			tags: ["Documentation"],
		},
		{
			id: "GET /api/docs/postman",
			method: "GET",
			url: "/api/docs/postman",
			summary: "Get Postman collection",
			description: "Get the Postman collection for API testing",
			tags: ["Documentation"],
		},
		{
			id: "GET /api/docs/iml",
			method: "GET",
			url: "/api/docs/iml",
			summary: "Get import/export list",
			description: "Get a list of all available import/export formats and their usage",
			tags: ["Documentation"],
		},
		{
			id: "GET /health",
			method: "GET",
			url: "/health",
			summary: "Health check",
			description: "Enhanced health check with SLA status",
			tags: ["System"],
		},
		{
			id: "GET /",
			method: "GET",
			url: "/",
			summary: "Basic health status",
			description: "Basic health status endpoint",
			tags: ["System"],
		},
	];
};
