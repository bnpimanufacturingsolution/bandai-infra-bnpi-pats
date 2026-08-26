import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_ROOT = path.join(__dirname, "..");
const ROUTES_DIR = path.join(APP_ROOT, "app/routes");

function copyDir(src: string, dest: string): void {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const files = fs.readdirSync(src, { withFileTypes: true });

	for (const file of files) {
		const srcPath = path.join(src, file.name);
		const destPath = path.join(dest, file.name);

		if (file.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
			console.log(`  ✓ Copied ${path.relative(ROUTES_DIR, srcPath)}`);
		}
	}
}

function removeDir(dirPath: string): void {
	if (fs.existsSync(dirPath)) {
		fs.rmSync(dirPath, { recursive: true, force: true });
		console.log(`  ✓ Removed ${path.relative(ROUTES_DIR, dirPath)}`);
	}
}

console.log("\n🚀 ROUTE CONSOLIDATION - EXECUTION\n");

// Step 1: Copy hr-manager to hr/
console.log("1️⃣ Copying hr-manager/ → hr/");
const hrManagerSrc = path.join(ROUTES_DIR, "hr-manager");
const hrDest = path.join(ROUTES_DIR, "hr");
copyDir(hrManagerSrc, hrDest);

// Step 2: Copy hr-user to hr/
console.log("\n2️⃣ Copying hr-user/ → hr/");
const hrUserSrc = path.join(ROUTES_DIR, "hr-user");
copyDir(hrUserSrc, hrDest);

// Step 3: Copy manager to employee/
console.log("\n3️⃣ Copying manager/ → employee/");
const managerSrc = path.join(ROUTES_DIR, "manager");
const employeeDest = path.join(ROUTES_DIR, "employee");
copyDir(managerSrc, employeeDest);

// Step 4: Delete old directories
console.log("\n4️⃣ Removing old directories");
removeDir(hrManagerSrc);
removeDir(hrUserSrc);
removeDir(managerSrc);

console.log("\n✅ CONSOLIDATION COMPLETE\n");
console.log("Next step: Update app/routes.ts to use the new structure");
