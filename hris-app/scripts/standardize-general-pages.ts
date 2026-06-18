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

// General pages to copy from employee
// Note: attendance.tsx, payroll.tsx, leave.tsx are handled by standardize-common-routes.ts using templates
// This script now focuses ONLY on subfolders (not the main files) and layout updates
const GENERAL_PAGES = {
	mainFiles: ["requests.$type.tsx"], // Only copy files not handled by templates
	subfolders: ["payroll", "leave"], // Removed "requests" - will be copied but needs cleanup
};

// Target roles to receive employee structure
const TARGET_ROLES = ["hr-manager", "hr-user", "manager"];
const SOURCE_ROLE = "employee";

// Layout files to update
const LAYOUT_FILES = [
	{ path: "layouts/hr-layout.tsx", rolePrefix: "hr-manager", roleName: "HR Admin" },
	{ path: "layouts/hr-user-layout.tsx", rolePrefix: "hr-user", roleName: "HR User" },
	{ path: "layouts/manager-layout.tsx", rolePrefix: "manager", roleName: "Manager" },
];

interface CopyPlan {
	source: string;
	destinations: Array<{
		role: string;
		path: string;
	}>;
	type: "file" | "folder";
	relativePath: string;
}

// Recursively copy directory
function copyDirectory(src: string, dest: string): void {
	if (!existsSync(dest)) {
		mkdirSync(dest, { recursive: true });
	}

	const entries = readdirSync(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);

		if (entry.isDirectory()) {
			copyDirectory(srcPath, destPath);
		} else {
			copyFileSync(srcPath, destPath);
		}
	}
}

// Create copy plan for general pages
function createCopyPlan(appDir: string): CopyPlan[] {
	const plans: CopyPlan[] = [];
	const routesDir = join(appDir, "routes");
	const sourceDir = join(routesDir, SOURCE_ROLE);

	// Plan for main files
	for (const fileName of GENERAL_PAGES.mainFiles) {
		const sourcePath = join(sourceDir, fileName);

		if (!existsSync(sourcePath)) {
			console.log(`⚠️  Source file not found: ${fileName}, skipping...`);
			continue;
		}

		const destinations = TARGET_ROLES.map((role) => ({
			role,
			path: join(routesDir, role, fileName),
		}));

		plans.push({
			source: sourcePath,
			destinations,
			type: "file",
			relativePath: fileName,
		});
	}

	// Plan for subfolders
	for (const folderName of GENERAL_PAGES.subfolders) {
		const sourcePath = join(sourceDir, folderName);

		if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
			console.log(`⚠️  Source folder not found: ${folderName}, skipping...`);
			continue;
		}

		const destinations = TARGET_ROLES.map((role) => ({
			role,
			path: join(routesDir, role, folderName),
		}));

		plans.push({
			source: sourcePath,
			destinations,
			type: "folder",
			relativePath: folderName,
		});
	}

	return plans;
}

// Update layout file to fix General section
function updateLayout(
	appDir: string,
	layoutFile: { path: string; rolePrefix: string; roleName: string },
	dryRun: boolean,
): boolean {
	const layoutPath = join(appDir, layoutFile.path);

	if (!existsSync(layoutPath)) {
		console.log(`   ⚠️  Layout file not found: ${layoutFile.path}`);
		return false;
	}

	let content = readFileSync(layoutPath, "utf-8");
	let modified = false;

	// Fix 1: Change "Personal" to "General" in section header (if it exists)
	const personalToGeneralRegex = /<p className="[^"]*">\s*Personal\s*<\/p>/g;
	if (personalToGeneralRegex.test(content)) {
		content = content.replace(personalToGeneralRegex, (match) => {
			return match.replace("Personal", "General");
		});
		console.log(`   ✓ Changed "Personal" to "General" section header`);
		modified = true;
	}

	// Fix 2: Update payroll path from /my-payroll to /payroll
	const myPayrollRegex = new RegExp(`to: "/${layoutFile.rolePrefix}/my-payroll"`, "g");
	if (myPayrollRegex.test(content)) {
		content = content.replace(myPayrollRegex, `to: "/${layoutFile.rolePrefix}/payroll"`);
		console.log(`   ✓ Updated payroll path from /my-payroll to /payroll`);
		modified = true;
	}

	// Fix 3: Standardize request submenu items to match employee structure
	// Replace "Overtime Requests" and "Time Adjustment" with single "Time Requests"
	const overtimePattern =
		/\{\s*to:\s*"\/[^"]+\/requests\/overtime",\s*label:\s*"Overtime Requests",\s*Icon:\s*\w+,?\s*\},?\s*\{\s*to:\s*"\/[^"]+\/requests\/time-adjustment",\s*label:\s*"Time Adjustment",\s*Icon:\s*\w+,?\s*\}/;

	if (overtimePattern.test(content)) {
		content = content.replace(
			overtimePattern,
			`{\n\t\t\t\t\t\t\t\t\t\tto: "/${layoutFile.rolePrefix}/requests/time-requests",\n\t\t\t\t\t\t\t\t\t\tlabel: "Time Requests",\n\t\t\t\t\t\t\t\t\t\tIcon: Clock,\n\t\t\t\t\t\t\t\t\t}`,
		);
		console.log(`   ✓ Replaced "Overtime Requests" and "Time Adjustment" with "Time Requests"`);
		modified = true;
	}

	// Fix 4: Ensure correct icon imports are present (DollarSign, FileCheck)
	const hasRequiredImports = content.includes("DollarSign") && content.includes("FileCheck");
	if (!hasRequiredImports) {
		// Add missing imports to lucide-react import statement
		const importRegex = /(import\s*\{[^}]*)(}\s*from\s*["']lucide-react["'];?)/;
		if (importRegex.test(content)) {
			const needsDollarSign = !content.includes("DollarSign");
			const needsFileCheck = !content.includes("FileCheck");

			if (needsDollarSign || needsFileCheck) {
				content = content.replace(importRegex, (match, p1, p2) => {
					let additions = [];
					if (needsDollarSign) additions.push("DollarSign");
					if (needsFileCheck) additions.push("FileCheck");

					// Remove trailing comma/whitespace from p1 and add our imports
					const cleanP1 = p1.trimEnd().replace(/,$/, "");
					return `${cleanP1},\n\t${additions.join(",\n\t")},\n${p2}`;
				});
				console.log(
					`   ✓ Added required icon imports: ${[needsDollarSign && "DollarSign", needsFileCheck && "FileCheck"].filter(Boolean).join(", ")}`,
				);
				modified = true;
			}
		}
	}

	// Fix 5: Update expense reimbursement to use DollarSign icon
	const expenseWalletPattern = new RegExp(
		`to:\\s*"/${layoutFile.rolePrefix}/requests/expense-reimbursement",\\s*label:\\s*"Expense Reimbursement",\\s*Icon:\\s*Wallet,`,
		"g",
	);
	if (expenseWalletPattern.test(content)) {
		content = content.replace(
			expenseWalletPattern,
			`to: "/${layoutFile.rolePrefix}/requests/expense-reimbursement",\n\t\t\t\t\t\t\t\t\t\tlabel: "Expense Reimbursement",\n\t\t\t\t\t\t\t\t\t\tIcon: DollarSign,`,
		);
		console.log(`   ✓ Updated Expense Reimbursement to use DollarSign icon`);
		modified = true;
	}

	// Fix 6: Update document request icon to use FileCheck instead of CalendarDays
	const docCalendarPattern = new RegExp(
		`to:\\s*"/${layoutFile.rolePrefix}/requests/document-request",\\s*label:\\s*"Document Requests",\\s*Icon:\\s*CalendarDays,`,
		"g",
	);
	if (docCalendarPattern.test(content)) {
		content = content.replace(
			docCalendarPattern,
			`to: "/${layoutFile.rolePrefix}/requests/document-request",\n\t\t\t\t\t\t\t\t\t\tlabel: "Document Requests",\n\t\t\t\t\t\t\t\t\t\tIcon: FileCheck,`,
		);
		console.log(`   ✓ Updated Document Requests to use FileCheck icon`);
		modified = true;
	}

	if (modified && !dryRun) {
		writeFileSync(layoutPath, content, "utf-8");
	}

	return modified;
}

// Execute copy operation
function executeCopy(plans: CopyPlan[], appDir: string, dryRun: boolean): void {
	console.log(
		dryRun ? "🔍 DRY RUN - No files will be modified\n" : "🚀 Executing standardization...\n",
	);

	let filesCopied = 0;
	let foldersCopied = 0;
	let filesOverwritten = 0;

	// Step 1: Copy routes
	console.log("📂 STEP 1: Copying route files and folders\n");
	plans.forEach((plan, index) => {
		const typeIcon = plan.type === "file" ? "📄" : "📁";
		console.log(`${index + 1}. ${typeIcon} ${plan.relativePath}`);
		console.log(`   👤 Source: ${SOURCE_ROLE}/${plan.relativePath}`);
		console.log(`   📂 Copying to ${plan.destinations.length} role(s):`);

		plan.destinations.forEach((dest) => {
			const exists = existsSync(dest.path);
			const action = exists ? "(overwrite)" : "(new)";
			console.log(`      → ${dest.role}/${plan.relativePath} ${action}`);

			if (!dryRun) {
				if (plan.type === "file") {
					// Copy single file
					const destDir = dirname(dest.path);
					if (!existsSync(destDir)) {
						mkdirSync(destDir, { recursive: true });
					}

					if (exists) {
						unlinkSync(dest.path);
						filesOverwritten++;
					}

					copyFileSync(plan.source, dest.path);
					filesCopied++;
				} else {
					// Copy entire folder
					if (exists) {
						// Remove existing folder contents
						const removeRecursive = (path: string) => {
							if (existsSync(path)) {
								readdirSync(path).forEach((file) => {
									const curPath = join(path, file);
									if (statSync(curPath).isDirectory()) {
										removeRecursive(curPath);
									} else {
										unlinkSync(curPath);
									}
								});
							}
						};
						removeRecursive(dest.path);
					}

					copyDirectory(plan.source, dest.path);
					foldersCopied++;
				}
			}
		});

		console.log("");
	});

	// Step 2: Update layouts
	console.log("🎨 STEP 2: Updating layout files\n");
	let layoutsUpdated = 0;

	LAYOUT_FILES.forEach((layoutFile, index) => {
		console.log(`${index + 1}. ${layoutFile.roleName} (${layoutFile.path})`);
		const updated = updateLayout(appDir, layoutFile, dryRun);

		if (updated) {
			layoutsUpdated++;
		} else {
			console.log(`   ✓ Already correct or no changes needed`);
		}
		console.log("");
	});

	console.log("=".repeat(80));
	console.log("");

	if (dryRun) {
		const totalFiles = plans.filter((p) => p.type === "file").length * TARGET_ROLES.length;
		const totalFolders = plans.filter((p) => p.type === "folder").length * TARGET_ROLES.length;

		console.log("✅ Dry run complete! No files were modified.");
		console.log(`   Would copy: ${totalFiles} files`);
		console.log(`   Would copy: ${totalFolders} folders`);
		console.log(`   Would update: ${layoutsUpdated} layout files`);
	} else {
		console.log(`✅ Standardization complete!`);
		console.log(`   Copied: ${filesCopied} files`);
		console.log(`   Copied: ${foldersCopied} folders`);
		console.log(`   Overwritten: ${filesOverwritten} existing files`);
		console.log(`   Updated: ${layoutsUpdated} layout files`);
	}

	console.log("");
	console.log("📝 Summary:");
	console.log(`   General pages: ${GENERAL_PAGES.mainFiles.join(", ")}`);
	console.log(`   Subfolders: ${GENERAL_PAGES.subfolders.join(", ")}`);
	console.log(`   Roles updated: ${TARGET_ROLES.join(", ")}`);
	console.log(`   Source role: ${SOURCE_ROLE}`);
	console.log(`   Layouts fixed: ${LAYOUT_FILES.map((l) => l.roleName).join(", ")}`);
	console.log("");
	console.log("📝 Next Steps:");
	console.log("  1. Test your application: npm run dev");
	console.log("  2. Verify all general pages work correctly for all roles");
	console.log("  3. Check that sidebar navigation is consistent across all roles");
	console.log("");
}

function main() {
	const appDir = join(process.cwd(), "app");
	const dryRun = process.argv.includes("--dry-run");

	console.log("=".repeat(80));
	console.log("🔧 GENERAL PAGES STANDARDIZATION TOOL");
	console.log("=".repeat(80));
	console.log("");
	console.log(`📋 Copying employee general pages structure`);
	console.log(`   Files: ${GENERAL_PAGES.mainFiles.join(", ")}`);
	console.log(`   Folders: ${GENERAL_PAGES.subfolders.join(", ")}`);
	console.log(`👥 Target roles: ${TARGET_ROLES.join(", ")}`);
	console.log(`📖 Using ${SOURCE_ROLE} as source`);
	console.log(`🎨 Updating layouts: ${LAYOUT_FILES.map((l) => l.roleName).join(", ")}`);
	console.log("");

	const plans = createCopyPlan(appDir);

	if (plans.length === 0) {
		console.log("⚠️  No files to copy. Check that source files exist.");
		process.exit(0);
	}

	console.log(`📊 Found ${plans.length} items to copy\n`);

	executeCopy(plans, appDir, dryRun);
}

main();
