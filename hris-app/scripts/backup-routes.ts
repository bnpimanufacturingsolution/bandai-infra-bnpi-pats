import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_ROOT = path.join(__dirname, "..");
const ROUTES_CONFIG = path.join(APP_ROOT, "app/routes.ts");
const LAYOUTS_DIR = path.join(APP_ROOT, "app/layouts");
const ROUTES_DIR = path.join(APP_ROOT, "app/routes");
const BACKUP_DIR = path.join(APP_ROOT, ".routes-backup");

const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message: string) {
	console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function getTimestamp(): string {
	const now = new Date();
	return (
		now.toISOString().split("T")[0] + "_" + now.toTimeString().split(" ")[0].replace(/:/g, "-")
	);
}

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
		}
	}
}

function createBackup(): void {
	log("\n╔════════════════════════════════════════════════════════════════╗", "blue");
	log("║                  CREATING BACKUP                              ║", "blue");
	log("╚════════════════════════════════════════════════════════════════╝\n", "blue");

	const timestamp = getTimestamp();
	const timestampedBackupDir = path.join(BACKUP_DIR, `backup-${timestamp}`);

	try {
		// Create timestamped backup
		if (!fs.existsSync(timestampedBackupDir)) {
			fs.mkdirSync(timestampedBackupDir, { recursive: true });
		}

		// Backup routes.ts
		log("📄 Backing up routes.ts...", "cyan");
		if (fs.existsSync(ROUTES_CONFIG)) {
			fs.copyFileSync(ROUTES_CONFIG, path.join(timestampedBackupDir, "routes.ts"));
			success("Backed up routes.ts");
		}

		// Backup layouts
		log("📁 Backing up layouts...", "cyan");
		const layoutBackupDir = path.join(timestampedBackupDir, "layouts");
		if (fs.existsSync(LAYOUTS_DIR)) {
			copyDir(LAYOUTS_DIR, layoutBackupDir);
			success("Backed up layout files");
		}

		// Backup route directories
		log("📁 Backing up routes directories...", "cyan");
		const routesBackupDir = path.join(timestampedBackupDir, "routes");
		if (fs.existsSync(ROUTES_DIR)) {
			copyDir(ROUTES_DIR, routesBackupDir);
			success("Backed up routes directories");
		}

		// Create symlink to latest backup
		const latestLink = path.join(BACKUP_DIR, "latest");
		if (fs.existsSync(latestLink)) {
			fs.unlinkSync(latestLink);
		}
		fs.symlinkSync(timestampedBackupDir, latestLink, "dir");

		log("\n" + "=".repeat(70), "green");
		log("✅ BACKUP COMPLETED SUCCESSFULLY", "green");
		log("=".repeat(70), "green");
		log(`\n📦 Backup location: ${timestampedBackupDir}`, "green");
		log(`🔗 Latest link: ${latestLink}\n`, "green");

		// Show backup contents
		log("📋 Backup contents:", "cyan");
		log(`   • routes.ts`, "cyan");
		log(`   • layouts/`, "cyan");
		log(`   • routes/`, "cyan");
	} catch (err) {
		log(`\n❌ Backup failed: ${err}\n`, "red");
		process.exit(1);
	}
}

function listBackups(): void {
	log("\n╔════════════════════════════════════════════════════════════════╗", "blue");
	log("║                  EXISTING BACKUPS                             ║", "blue");
	log("╚════════════════════════════════════════════════════════════════╝\n", "blue");

	if (!fs.existsSync(BACKUP_DIR)) {
		log("No backups found.", "yellow");
		return;
	}

	try {
		const backups = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
		const backupDirs = backups.filter(
			(f) => f.isDirectory() && f.name !== "latest" && f.name.startsWith("backup-"),
		);

		if (backupDirs.length === 0) {
			log("No backups found.", "yellow");
			return;
		}

		log(`Found ${backupDirs.length} backup(s):\n`, "cyan");

		backupDirs.forEach((dir, idx) => {
			const fullPath = path.join(BACKUP_DIR, dir.name);
			const stats = fs.statSync(fullPath);
			const dateStr = stats.mtime.toLocaleString();

			log(`${idx + 1}. ${dir.name}`, "cyan");
			log(`   Created: ${dateStr}`, "yellow");
			log(`   Path: ${fullPath}\n`, "cyan");
		});
	} catch (err) {
		log(`\n❌ Error listing backups: ${err}\n`, "red");
	}
}

function main(): void {
	const args = process.argv.slice(2);

	if (args.includes("--list")) {
		listBackups();
	} else {
		createBackup();
	}
}

main();
