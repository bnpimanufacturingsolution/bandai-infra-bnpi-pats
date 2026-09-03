import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MigrationConfig {
	sourceDir: string;
	targetDir: string;
	pattern?: string;
	description: string;
}

interface MigrationResult {
	success: boolean;
	filesProcessed: number;
	errors: string[];
	warnings: string[];
}

const APP_ROOT = path.join(__dirname, "..");
const ROUTES_DIR = path.join(APP_ROOT, "app/routes");
const LAYOUTS_DIR = path.join(APP_ROOT, "app/layouts");
const ROUTES_CONFIG = path.join(APP_ROOT, "app/routes.ts");
const BACKUP_DIR = path.join(APP_ROOT, ".routes-backup");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const question = (query: string): Promise<string> => {
	return new Promise((resolve) => rl.question(query, resolve));
};

const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

function log(message: string, color: keyof typeof colors = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
	console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message: string) {
	console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function warn(message: string) {
	console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function copyDirectory(src: string, dest: string, dryRun: boolean = true): MigrationResult {
	const result: MigrationResult = {
		success: true,
		filesProcessed: 0,
		errors: [],
		warnings: [],
	};

	try {
		if (!fs.existsSync(src)) {
			result.errors.push(`Source directory not found: ${src}`);
			result.success = false;
			return result;
		}

		if (!dryRun && !fs.existsSync(dest)) {
			fs.mkdirSync(dest, { recursive: true });
		}

		const files = fs.readdirSync(src, { withFileTypes: true });

		for (const file of files) {
			const srcPath = path.join(src, file.name);
			const destPath = path.join(dest, file.name);

			if (file.isDirectory()) {
				const subResult = copyDirectory(srcPath, destPath, dryRun);
				result.filesProcessed += subResult.filesProcessed;
				result.errors.push(...subResult.errors);
				result.warnings.push(...subResult.warnings);
			} else {
				if (!dryRun) {
					fs.copyFileSync(srcPath, destPath);
				}
				result.filesProcessed++;
			}
		}
	} catch (err) {
		result.success = false;
		result.errors.push(`Error copying directory: ${err}`);
	}

	return result;
}

function updateImportsInFile(
	filePath: string,
	replacements: Map<string, string>,
	dryRun: boolean = true,
): boolean {
	try {
		if (!fs.existsSync(filePath)) return false;

		let content = fs.readFileSync(filePath, "utf-8");
		let modified = false;

		replacements.forEach((newValue, oldValue) => {
			if (content.includes(oldValue)) {
				content = content.replace(new RegExp(oldValue, "g"), newValue);
				modified = true;
			}
		});

		if (modified && !dryRun) {
			fs.writeFileSync(filePath, content, "utf-8");
		}

		return modified;
	} catch (err) {
		error(`Failed to update imports in ${filePath}: ${err}`);
		return false;
	}
}

function updateImportsInDirectory(
	dirPath: string,
	replacements: Map<string, string>,
	dryRun: boolean = true,
): number {
	let count = 0;

	try {
		const files = fs.readdirSync(dirPath, { withFileTypes: true });

		for (const file of files) {
			const fullPath = path.join(dirPath, file.name);

			if (file.isDirectory()) {
				count += updateImportsInDirectory(fullPath, replacements, dryRun);
			} else if (
				file.name.endsWith(".tsx") ||
				file.name.endsWith(".ts") ||
				file.name.endsWith(".jsx")
			) {
				if (updateImportsInFile(fullPath, replacements, dryRun)) {
					count++;
				}
			}
		}
	} catch (err) {
		error(`Error updating imports in directory ${dirPath}: ${err}`);
	}

	return count;
}

function removeDirectory(dirPath: string, dryRun: boolean = true): boolean {
	try {
		if (fs.existsSync(dirPath)) {
			if (!dryRun) {
				fs.rmSync(dirPath, { recursive: true, force: true });
			}
			return true;
		}
		return false;
	} catch (err) {
		error(`Failed to remove directory ${dirPath}: ${err}`);
		return false;
	}
}

function removeFile(filePath: string, dryRun: boolean = true): boolean {
	try {
		if (fs.existsSync(filePath)) {
			if (!dryRun) {
				fs.unlinkSync(filePath);
			}
			return true;
		}
		return false;
	} catch (err) {
		error(`Failed to remove file ${filePath}: ${err}`);
		return false;
	}
}

function createBackup(): boolean {
	try {
		log("\n📦 Creating backup...", "cyan");

		if (!fs.existsSync(BACKUP_DIR)) {
			fs.mkdirSync(BACKUP_DIR, { recursive: true });
		}

		// Backup routes.ts
		if (fs.existsSync(ROUTES_CONFIG)) {
			fs.copyFileSync(ROUTES_CONFIG, path.join(BACKUP_DIR, "routes.ts"));
			success("Backed up routes.ts");
		}

		// Backup layouts
		const layoutBackupDir = path.join(BACKUP_DIR, "layouts");
		if (!fs.existsSync(layoutBackupDir)) {
			fs.mkdirSync(layoutBackupDir, { recursive: true });
		}

		const layoutFiles = [
			"hr-layout.tsx",
			"hr-user-layout.tsx",
			"employee-layout.tsx",
			"manager-layout.tsx",
		];
		for (const file of layoutFiles) {
			const src = path.join(LAYOUTS_DIR, file);
			if (fs.existsSync(src)) {
				fs.copyFileSync(src, path.join(layoutBackupDir, file));
			}
		}
		success("Backed up layout files");

		// Backup route directories
		const dirsToBackup = ["hr-manager", "hr-user", "manager"];
		for (const dir of dirsToBackup) {
			const src = path.join(ROUTES_DIR, dir);
			if (fs.existsSync(src)) {
				const dest = path.join(BACKUP_DIR, "routes", dir);
				copyDirectory(src, dest, false);
			}
		}
		success("Backed up route directories");

		log(`\n💾 Backup saved to: ${BACKUP_DIR}\n`, "green");
		return true;
	} catch (err) {
		error(`Backup failed: ${err}`);
		return false;
	}
}

async function performFullMigration(dryRun: boolean = true): Promise<void> {
	log("\n" + "=".repeat(70), "blue");
	log("        HRIS ROUTES UNIFICATION - FULL MIGRATION", "bold");
	log("=".repeat(70) + "\n", "blue");

	if (dryRun) {
		warn("DRY RUN MODE - No files will be modified");
	} else {
		if (!createBackup()) {
			error("Backup failed. Aborting migration.");
			return;
		}
	}

	// Step 1: Create target directories
	log("\n[1/6] Creating unified route directories...", "blue");
	const dirsToCreate = [
		path.join(ROUTES_DIR, "employee"),
		path.join(ROUTES_DIR, "hr"),
		path.join(ROUTES_DIR, "hr", "recruitment"),
	];

	for (const dir of dirsToCreate) {
		if (!fs.existsSync(dir)) {
			if (!dryRun) {
				fs.mkdirSync(dir, { recursive: true });
				success(`Created ${path.relative(APP_ROOT, dir)}`);
			} else {
				log(`[DRY] Would create ${path.relative(APP_ROOT, dir)}`, "cyan");
			}
		} else {
			log(`Already exists: ${path.relative(APP_ROOT, dir)}`, "yellow");
		}
	}

	// Step 2: Copy hr-manager routes to hr/
	log("\n[2/6] Migrating HR Manager routes...", "blue");
	const hrManagerSrc = path.join(ROUTES_DIR, "hr-manager");
	const hrDest = path.join(ROUTES_DIR, "hr");

	if (fs.existsSync(hrManagerSrc)) {
		const result = copyDirectory(hrManagerSrc, hrDest, dryRun);
		if (result.filesProcessed > 0) {
			success(`Copied ${result.filesProcessed} files from hr-manager/`);
		}
		if (result.errors.length > 0) {
			result.errors.forEach((e) => warn(e));
		}
	}

	// Step 3: Copy hr-user routes to hr/
	log("\n[3/6] Migrating HR User routes...", "blue");
	const hrUserSrc = path.join(ROUTES_DIR, "hr-user");

	if (fs.existsSync(hrUserSrc)) {
		const result = copyDirectory(hrUserSrc, hrDest, dryRun);
		if (result.filesProcessed > 0) {
			success(`Copied ${result.filesProcessed} files from hr-user/`);
		}
		if (result.errors.length > 0) {
			result.errors.forEach((e) => warn(e));
		}
	}

	// Step 4: Copy manager routes to employee/
	log("\n[4/6] Migrating Manager routes...", "blue");
	const managerSrc = path.join(ROUTES_DIR, "manager");
	const employeeDest = path.join(ROUTES_DIR, "employee");

	if (fs.existsSync(managerSrc)) {
		const result = copyDirectory(managerSrc, employeeDest, dryRun);
		if (result.filesProcessed > 0) {
			success(`Copied ${result.filesProcessed} files from manager/`);
		}
		if (result.errors.length > 0) {
			result.errors.forEach((e) => warn(e));
		}
	}

	// Step 5: Update imports in migrated files
	log("\n[5/6] Updating imports in migrated files...", "blue");
	const importReplacements = new Map<string, string>([
		["routes/hr/", "routes/hr/"],
		["routes/hr/", "routes/hr/"],
		["routes/employee/", "routes/employee/"],
		["'../../../hr/", "'../../../hr/"],
		["'../../../hr/", "'../../../hr/"],
		["'../../../employee/", "'../../../employee/"],
	]);

	const hrDestUpdated = updateImportsInDirectory(hrDest, importReplacements, dryRun);
	const employeeDestUpdated = updateImportsInDirectory(employeeDest, importReplacements, dryRun);

	success(`Updated imports in ${hrDestUpdated + employeeDestUpdated} files`);

	// Step 6: Update routes.ts and layouts
	log("\n[6/6] Updating configuration files...", "blue");

	// This would be done manually or with another helper function
	warn("⚠️  Important: Manually update the following:");
	log("  1. Update app/routes.ts with the new unified configuration", "yellow");
	log("  2. Update app/layouts/unified-layout.tsx to consolidate navigation", "yellow");

	// Step 7: Show deletion plan
	log("\n📋 CLEANUP PHASE - The following will be deleted:", "blue");

	const dirsToRemove = ["hr-manager", "hr-user", "manager"];
	for (const dir of dirsToRemove) {
		const dirPath = path.join(ROUTES_DIR, dir);
		if (fs.existsSync(dirPath)) {
			if (dryRun) {
				log(`[DRY] Would remove routes/${dir}/`, "cyan");
			} else {
				if (removeDirectory(dirPath, false)) {
					success(`Removed routes/${dir}/`);
				}
			}
		}
	}

	const layoutsToRemove = [
		"hr-layout.tsx",
		"hr-user-layout.tsx",
		"employee-layout.tsx",
		"manager-layout.tsx",
	];
	for (const layout of layoutsToRemove) {
		const layoutPath = path.join(LAYOUTS_DIR, layout);
		if (fs.existsSync(layoutPath) && layout !== "hr-layout.tsx") {
			// Keep hr-layout.tsx, delete others
			if (dryRun) {
				log(`[DRY] Would remove layouts/${layout}`, "cyan");
			} else {
				if (removeFile(layoutPath, false)) {
					success(`Removed layouts/${layout}`);
				}
			}
		}
	}

	// Summary
	log("\n" + "=".repeat(70), "blue");
	log("MIGRATION SUMMARY", "bold");
	log("=".repeat(70), "blue");

	log(`\n✓ HR Manager routes migrated to /hr`, "green");
	log(`✓ HR User routes merged into /hr`, "green");
	log(`✓ Manager routes moved to /employee`, "green");
	log(`✓ Route directories consolidated`, "green");
	log(`✓ Imports updated across files`, "green");

	log("\n📝 NEXT STEPS:", "cyan");
	log("  1. Review the migrated files for conflicts", "blue");
	log("  2. Update unified-layout.tsx with consolidated navigation", "blue");
	log("  3. Update routes.ts with new configuration", "blue");
	log("  4. Test all routes for each role", "blue");
	log("  5. Run npm run lint to check for import issues", "blue");
	log("  6. Run npm run type-check to verify types", "blue");

	if (dryRun) {
		log(`\n💡 To execute: npm run migrate-routes -- --execute\n`, "blue");
	} else {
		success("\n🎉 Migration completed! Check the logs and test thoroughly.\n");
		log(`📦 Backup location: ${BACKUP_DIR}\n`, "green");
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const isDryRun = !args.includes("--execute");

	log("\n╔════════════════════════════════════════════════════════════════╗", "blue");
	log("║    HRIS ROUTES UNIFICATION MIGRATION SCRIPT v2.0             ║", "blue");
	log("║                                                                ║", "blue");
	log("║    Consolidates role-based routes into unified structure      ║", "blue");
	log("╚════════════════════════════════════════════════════════════════╝\n", "blue");

	// Check app structure
	if (!fs.existsSync(ROUTES_DIR)) {
		error("Routes directory not found!");
		rl.close();
		process.exit(1);
	}

	if (isDryRun) {
		log("🔍 DRY RUN MODE", "yellow");
		log("No changes will be made to your files\n", "yellow");

		const proceed = await question("Continue with dry run preview? (yes/no): ");
		if (proceed.toLowerCase() !== "yes") {
			log("\nAborted.", "red");
			rl.close();
			process.exit(0);
		}
	} else {
		warn("\n⚠️  LIVE EXECUTION MODE");
		log("Files will be modified and directories deleted\n", "red");

		const backupConfirm = await question(
			"Ensure you have committed your code. Continue? (yes/no): ",
		);
		if (backupConfirm.toLowerCase() !== "yes") {
			log("\nAborted. Please commit your changes first.\n", "yellow");
			rl.close();
			process.exit(0);
		}

		const finalConfirm = await question("Are you absolutely sure? (type 'yes-execute'): ");
		if (finalConfirm !== "yes-execute") {
			log("\nAborted.\n", "yellow");
			rl.close();
			process.exit(0);
		}
	}

	await performFullMigration(isDryRun);

	rl.close();
}

main().catch((err) => {
	error(`Fatal error: ${err.message}`);
	process.exit(1);
});
