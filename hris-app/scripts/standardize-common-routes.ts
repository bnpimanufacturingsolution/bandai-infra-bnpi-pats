import {
	readdirSync,
	statSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	existsSync,
	unlinkSync,
	copyFileSync,
} from "fs";
import { join, relative, basename, dirname } from "path";

// Common pages that should be standardized across all roles
// Can be either 'filename.tsx' or 'folder/filename.tsx' for nested files
const COMMON_PAGES = [
	"messages.tsx",
	"notifications.tsx",
	"settings.tsx",
	"help.tsx",
	"profile.tsx",
	"attendance.tsx",
	"payroll.tsx",
	"leave.tsx",
	"requests/time-requests.tsx",
	"requests/expense-reimbursement.tsx",
	"requests/document-request.tsx",
	"requests/leave.tsx",
];

// Roles to standardize
const ROLES = ["hr-manager", "hr-user", "manager"];

// Source role (employee has the best implementations)
const SOURCE_ROLE = "employee";

interface StandardizationPlan {
	sourcePath: string;
	templatePath: string;
	templateRelativePath: string;
	componentName: string;
	pageName: string;
	isNested: boolean;
	targetRoles: Array<{
		role: string;
		routePath: string;
	}>;
}

// Extract component name from file content
function extractComponentName(content: string): string {
	const match = content.match(/export\s+default\s+function\s+(\w+)/);
	return match ? match[1] : "UnknownComponent";
}

// Create template file content (convert default export to named export and fix imports)
function createTemplateContent(
	sourceContent: string,
	componentName: string,
	sourceRole: string,
	pageName: string,
): string {
	let content = sourceContent;

	// Convert default export to named export
	content = content.replace(/export\s+default\s+function\s+(\w+)/, "export function $1");

	// Fix relative imports that reference role-specific paths
	// Convert "./something" to "~/routes/{role}/something"
	// Convert "../something" to "~/routes/something" or appropriate path
	const isNested = pageName.includes("/");
	const baseFolder = isNested ? pageName.split("/")[0] : "";

	// Transform relative imports to absolute imports
	content = content.replace(/from\s+["']\.\/([^"']+)["']/g, (match, importPath) => {
		// If nested file (e.g., requests/time-requests.tsx), resolve from that subfolder
		if (isNested) {
			return `from "~/routes/${sourceRole}/${baseFolder}/${importPath}"`;
		}
		return `from "~/routes/${sourceRole}/${importPath}"`;
	});

	// Transform parent relative imports
	content = content.replace(/from\s+["']\.\.\/([^"']+)["']/g, `from "~/routes/${sourceRole}/$1"`);

	return content;
}

// Create wrapper file content that imports from template
function createWrapperContent(templateRelativePath: string, componentName: string): string {
	const importPath = `~/components/${templateRelativePath.replace(".tsx", "")}`;
	return `import { ${componentName} } from "${importPath}";\n\nexport default ${componentName};\n`;
}

// Create standardization plan
function createStandardizationPlan(appDir: string): StandardizationPlan[] {
	const plans: StandardizationPlan[] = [];
	const routesDir = join(appDir, "routes");
	const sourceDir = join(routesDir, SOURCE_ROLE);

	for (const pageName of COMMON_PAGES) {
		const sourcePath = join(sourceDir, pageName);
		const isNested = pageName.includes("/");

		// Skip if source doesn't exist
		if (!existsSync(sourcePath)) {
			console.log(`⚠️  Source file not found: ${pageName}, skipping...`);
			continue;
		}

		const sourceContent = readFileSync(sourcePath, "utf-8");
		const componentName = extractComponentName(sourceContent);

		// Create template path
		const templateName = pageName.replace(/\//g, "-").replace(".tsx", "-template.tsx");
		const templateFolder = isNested ? "templates/my-pages" : "templates/common";
		const templateRelativePath = `${templateFolder}/${templateName}`;
		const templatePath = join(appDir, "components", templateRelativePath);

		// Find target roles that have this page
		const targetRoles: Array<{ role: string; routePath: string }> = [];
		for (const role of ROLES) {
			const routePath = join(routesDir, role, pageName);
			if (existsSync(routePath)) {
				targetRoles.push({ role, routePath });
			}
		}

		if (targetRoles.length > 0) {
			plans.push({
				sourcePath,
				templatePath,
				templateRelativePath,
				componentName,
				pageName,
				isNested,
				targetRoles,
			});
		}
	}

	return plans;
}

// Execute standardization
function executeStandardization(
	plans: StandardizationPlan[],
	appDir: string,
	dryRun: boolean,
): void {
	console.log(
		dryRun ? "🔍 DRY RUN - No files will be modified\n" : "🚀 Executing standardization...\n",
	);

	let templatesCreated = 0;
	let routesUpdated = 0;
	let filesDeleted = 0;

	plans.forEach((plan, index) => {
		const pageIcon = plan.isNested ? "📁" : "📄";
		console.log(`${index + 1}. ${pageIcon} ${plan.pageName}`);
		console.log(`   📝 Template: components/${plan.templateRelativePath}`);
		console.log(`   🔧 Component: ${plan.componentName}`);
		console.log(`   👤 Source: ${SOURCE_ROLE}/${plan.pageName}`);
		console.log(`   📂 Standardizing ${plan.targetRoles.length} role(s):`);

		if (!dryRun) {
			// Create template directory if it doesn't exist
			const templateDir = dirname(plan.templatePath);
			if (!existsSync(templateDir)) {
				mkdirSync(templateDir, { recursive: true });
			}

			// Read source content and create template
			const sourceContent = readFileSync(plan.sourcePath, "utf-8");
			const templateContent = createTemplateContent(
				sourceContent,
				plan.componentName,
				SOURCE_ROLE,
				plan.pageName,
			);
			writeFileSync(plan.templatePath, templateContent, "utf-8");
			templatesCreated++;
		}

		// Update each role's route file
		plan.targetRoles.forEach((target) => {
			console.log(`      → ${target.role}/${plan.pageName}`);

			if (!dryRun) {
				// Ensure the directory exists for nested files
				const targetDir = dirname(target.routePath);
				if (!existsSync(targetDir)) {
					mkdirSync(targetDir, { recursive: true });
				}

				// Delete the old file if it exists
				if (existsSync(target.routePath)) {
					unlinkSync(target.routePath);
					filesDeleted++;
				}

				// Create new wrapper file
				const wrapperContent = createWrapperContent(
					plan.templateRelativePath,
					plan.componentName,
				);
				writeFileSync(target.routePath, wrapperContent, "utf-8");
				routesUpdated++;
			}
		});

		console.log("");
	});

	console.log("=".repeat(80));
	console.log("");

	if (dryRun) {
		console.log("✅ Dry run complete! No files were modified.");
		console.log(`   Would create: ${plans.length} template files`);
		console.log(
			`   Would delete: ${plans.reduce((sum, p) => sum + p.targetRoles.length, 0)} old route files`,
		);
		console.log(
			`   Would create: ${plans.reduce((sum, p) => sum + p.targetRoles.length, 0)} new wrapper files`,
		);
	} else {
		console.log(`✅ Standardization complete!`);
		console.log(`   Created: ${templatesCreated} shared template files`);
		console.log(`   Deleted: ${filesDeleted} old route files`);
		console.log(`   Created: ${routesUpdated} new wrapper files`);
	}

	console.log("");
	console.log("📝 Summary:");
	console.log(`   Common pages standardized: ${plans.map((p) => p.pageName).join(", ")}`);
	console.log(`   Roles affected: ${ROLES.join(", ")}`);
	console.log(`   Source role: ${SOURCE_ROLE}`);
	console.log("");
	console.log("📝 Next Steps:");
	console.log("  1. Review the generated template files in app/components/templates/");
	console.log("  2. Check that all route wrappers are correctly importing templates");
	console.log("  3. Test your application: npm run dev");
	console.log("  4. Verify that all roles have consistent UI for common pages");
	console.log("");
}

function main() {
	const appDir = join(process.cwd(), "app");
	const dryRun = process.argv.includes("--dry-run");

	console.log("=".repeat(80));
	console.log("🔧 COMMON ROUTES STANDARDIZATION TOOL");
	console.log("=".repeat(80));
	console.log("");
	console.log(`📋 Standardizing: ${COMMON_PAGES.map((p) => p.replace(".tsx", "")).join(", ")}`);
	console.log(`👥 Target roles: ${ROLES.join(", ")}`);
	console.log(`📖 Using ${SOURCE_ROLE} as source`);
	console.log("");

	const plans = createStandardizationPlan(appDir);

	if (plans.length === 0) {
		console.log("⚠️  No files to standardize. Check that source files exist.");
		process.exit(0);
	}

	console.log(`📊 Found ${plans.length} pages to standardize\n`);

	executeStandardization(plans, appDir, dryRun);
}

main();
