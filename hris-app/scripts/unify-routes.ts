import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface UnificationPlan {
	removedDirectories: string[];
	mergedRoutes: Record<string, string[]>;
	renamedLayouts: Record<string, string>;
	newStructure: string[];
	estimatedChanges: number;
}

const APP_ROOT = path.join(__dirname, "..");
const ROUTES_DIR = path.join(APP_ROOT, "app/routes");
const LAYOUTS_DIR = path.join(APP_ROOT, "app/layouts");
const ROUTES_CONFIG = path.join(APP_ROOT, "app/routes.ts");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const question = (query: string): Promise<string> => {
	return new Promise((resolve) => rl.question(query, resolve));
};

// Color codes for terminal output
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

function getDirectorySize(dirPath: string): number {
	let size = 0;
	const files = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const file of files) {
		if (file.isDirectory()) {
			size += getDirectorySize(path.join(dirPath, file.name));
		} else {
			size += fs.statSync(path.join(dirPath, file.name)).size;
		}
	}
	return size;
}

function countFiles(dirPath: string): number {
	let count = 0;
	const files = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const file of files) {
		if (file.isDirectory()) {
			count += countFiles(path.join(dirPath, file.name));
		} else {
			count++;
		}
	}
	return count;
}

function analyzeCurrentStructure(): UnificationPlan {
	log("\n📊 Analyzing current structure...\n", "blue");

	const plan: UnificationPlan = {
		removedDirectories: [],
		mergedRoutes: {},
		renamedLayouts: {},
		newStructure: [],
		estimatedChanges: 0,
	};

	// Directories to remove/consolidate
	const dirsToRemove = ["hr-manager", "hr-user", "manager"];
	for (const dir of dirsToRemove) {
		const dirPath = path.join(ROUTES_DIR, dir);
		if (fs.existsSync(dirPath)) {
			plan.removedDirectories.push(dir);
			const fileCount = countFiles(dirPath);
			plan.estimatedChanges += fileCount;
			log(`  • ${dir}/ - ${fileCount} files`, "yellow");
		}
	}

	// Layouts to consolidate
	plan.renamedLayouts = {
		"hr-layout.tsx": "unified-layout.tsx (update)",
		"hr-user-layout.tsx": "DELETE - merge to unified",
		"employee-layout.tsx": "DELETE - merge to unified",
		"manager-layout.tsx": "DELETE - merge to unified",
	};

	// New structure
	plan.newStructure = [
		"app/routes/employee/ - shared employee routes",
		"app/routes/hr/ - HR-only routes (access controlled)",
		"app/routes/hr/recruitment/ - recruitment pages",
		"app/layouts/unified-layout.tsx - single layout",
	];

	plan.estimatedChanges += 4; // layout files
	plan.estimatedChanges += 1; // routes.ts update

	return plan;
}

function generateDryRunReport(plan: UnificationPlan): string {
	let report = `
╔════════════════════════════════════════════════════════════════╗
║           ROUTE UNIFICATION - DRY RUN REPORT                   ║
╚════════════════════════════════════════════════════════════════╝

📋 DIRECTORIES TO BE CONSOLIDATED
${plan.removedDirectories.map((dir) => `   ✗ routes/${dir}/ → consolidated to shared routes`).join("\n")}

📋 LAYOUTS TO BE CONSOLIDATED
   ✗ hr-layout.tsx → unified-layout.tsx
   ✗ hr-user-layout.tsx → unified-layout.tsx
   ✗ employee-layout.tsx → unified-layout.tsx
   ✗ manager-layout.tsx → unified-layout.tsx

📋 NEW UNIFIED STRUCTURE
${plan.newStructure.map((item) => `   ✓ ${item}`).join("\n")}

📋 ROUTE CONSOLIDATION MAP
   /employee/*
   ├── dashboard
   ├── profile
   ├── attendance
   ├── payroll
   ├── benefits
   ├── requests/:type
   ├── performance
   ├── learning
   ├── messages
   ├── notifications
   └── settings

   /hr/* (HR Manager + HR User roles only)
   ├── dashboard
   ├── employees
   ├── attendance
   ├── payroll
   ├── payroll-periods
   ├── recruitment
   ├── announcements
   ├── reports
   └── requests/:type

📊 ESTIMATED CHANGES
   • Directories to consolidate: ${plan.removedDirectories.length}
   • Layout files to update: 4
   • Route configuration file: 1 (routes.ts)
   • Total estimated file changes: ${plan.estimatedChanges}

⚠️  IMPORTANT NOTES:
   1. Role-based access will be enforced at route/component level
   2. Manager role will be treated as Employee with extra permissions
   3. All shared functionality moves to /employee
   4. HR-specific features stay under /hr with role checks
`;

	return report;
}

function generateNewRoutesConfig(): string {
	return `import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

const authRoutes = [
  route("auth/login", "routes/auth/login.tsx"),
  route("auth/register", "routes/auth/register.tsx"),
];

const legalRoutes = [
  route("terms", "routes/legal/terms-of-use.tsx"),
  route("privacy", "routes/legal/privacy-policy.tsx"),
];

const supportRoutes = [
  route("help", "routes/support/help-desk.tsx"),
  route("faq", "routes/support/faq.tsx"),
];

const userRoutes = [
  route("home", "routes/profile/home.tsx"),
  route("profile/:id", "routes/profile/user-profile.tsx"),
  route("notifications", "routes/profile/notifications.tsx"),
  ...prefix("history", [
    index("routes/profile/history.tsx"),
    route(":id", "routes/profile/history-details.tsx"),
  ]),
];

const adminRoutes = [
  route("dashboard", "routes/admin/dashboard.tsx"),
  route("analytics", "routes/admin/analytics.tsx"),
  ...prefix("configuration", [
    route("departments", "routes/admin/configuration/departments.tsx"),
    route("positions", "routes/admin/configuration/positions.tsx"),
    route("levels", "routes/admin/configuration/levels.tsx"),
    route("employees", "routes/admin/configuration/employees.tsx"),
    route("employees/new", "routes/hr/employees.new.tsx", {
      id: "admin-configuration-employees-new",
    }),
    route("employees/:id", "routes/employee/employee.$id.tsx", {
      id: "admin-configuration-employees-profile",
    }),
    route("employees/:id/edit", "routes/hr/employees.$id.edit.tsx", {
      id: "admin-configuration-employees-edit",
    }),
    route("users", "routes/admin/configuration/users.tsx"),
    route("schedules", "routes/admin/configuration/schedules.tsx"),
    route("benefit-types", "routes/admin/configuration/benefit-types.tsx"),
    route("loan-types", "routes/admin/configuration/loan-types.tsx"),
    route("calendars", "routes/admin/configuration/calendars.tsx"),
    route("calendars/:id", "components/organisms/calendars/calendar-view-page.tsx"),
    route("guide", "routes/admin/configuration/admin-guide-page.tsx"),
  ]),
  ...prefix("devices", [
    route("manage", "routes/admin/devices/manage.tsx"),
    route("manage/:id", "routes/admin/devices/manage.$id.tsx"),
    route("enroll", "routes/admin/devices/enroll.tsx"),
  ]),
  route("audit-logs", "routes/admin/audit-logs.tsx"),
  route("disciplinary-action", "routes/admin/disciplinary-action.tsx"),
  route("messages", "routes/admin/messages.tsx"),
  route("notifications", "routes/admin/notifications.tsx"),
  route("settings", "routes/admin/settings.tsx"),
  route("help", "routes/admin/help.tsx"),
  route("profile", "routes/admin/profile.tsx"),
];

// Unified employee routes (for employee, hr-manager, hr-user, manager)
const employeeRoutes = [
  route("dashboard", "routes/employee/dashboard.tsx"),
  route("profile", "routes/employee/profile.tsx"),
  route(":id", "routes/employee/employee.$id.tsx"),
  route("payroll", "routes/employee/payroll.tsx"),
  route("attendance", "routes/employee/attendance.tsx"),
  ...prefix("benefits", [
    index("routes/employee/benefits.tsx"),
    route(":tab", "routes/employee/benefits.$tab.tsx"),
  ]),
  route("learning", "routes/employee/learning.tsx"),
  ...prefix("performance", [
    index("routes/employee/performance.tsx"),
    route(":tab", "routes/employee/performance.$tab.tsx"),
  ]),
  route("team", "routes/employee/team.tsx"),
  route("messages", "routes/employee/messages.tsx"),
  route("notifications", "routes/employee/notifications.tsx"),
  route("settings", "routes/employee/settings.tsx"),
  route("help", "routes/employee/help.tsx"),
  ...prefix("requests", [route(":type", "routes/employee/requests.$type.tsx")]),
];

// HR-specific routes (HR Manager + HR User - role-gated in components)
const hrRoutes = [
  route("dashboard", "routes/hr/dashboard.tsx"),
  route("employees", "routes/hr/employees.tsx"),
  route("employees/new", "routes/hr/employees.new.tsx"),
  route("employees/:id/edit", "routes/hr/employees.$id.edit.tsx"),
  route("employee-profile", "routes/hr/employee-profile.tsx"),
  route("attendance", "routes/hr/attendance.tsx"),
  route("my-attendance", "routes/hr/my-attendance.tsx"),
  route("performance", "routes/hr/performance.tsx"),
  route("performance/:type", "routes/hr/performance.$type.tsx"),
  route("messages", "routes/hr/messages.tsx"),
  route("notifications", "routes/hr/notifications.tsx"),
  route("settings", "routes/hr/settings.tsx"),
  route("payroll", "routes/hr/payroll.tsx"),
  route("hr-payroll", "routes/hr/hr-payroll.tsx"),
  route("payroll-periods", "routes/hr/payroll-periods.tsx"),
  route("announcements", "routes/hr/announcements.tsx"),
  ...prefix("recruitment", [
    route("", "routes/hr/recruitment/recruitment-page.tsx"),
    route("interview-schedule/:id", "routes/hr/recruitment/interview-scheduling-page.tsx"),
  ]),
  route("recruitment-page", "routes/hr/recruitment-page.tsx"),
  route("document-viewer", "routes/hr/document-viewer.tsx"),
  route("add-user", "routes/hr/add-user.tsx"),
  route("reports", "routes/hr/reports.tsx"),
  ...prefix("requests", [route(":type", "routes/hr/requests.$type.tsx")]),
];

const pdfRoutes = [
  route("pdf-mapper", "routes/pdf-mapper.tsx"),
  route("pdf-generator-demo", "routes/pdf-generator-demo.tsx"),
];

const siteRoutes = [
  route("login", "routes/site/login.tsx"),
  index("routes/site/index.tsx"),
  route("leaves", "routes/site/leaves.tsx"),
  route("attendance", "routes/site/attendance.tsx"),
  route("payslip", "routes/site/payslip.tsx"),
];

export default [
  index("routes/landing.tsx"),
  route("public", "routes/public-landing.tsx"),
  route("announcements", "routes/announcements.tsx"),
  route("time-logging", "routes/time-logging.tsx"),
  route("apply", "routes/hr-public/apply.tsx"),
  route("guide", "routes/hr-public/public-guide-page.tsx"),
  route("jobs", "routes/hr-public/job-page.tsx"),
  route("interview/schedule/:id", "routes/hr-public/interview-scheduling-page.tsx"),
  route("403", "routes/403.tsx"),
  ...pdfRoutes,
  ...prefix("site", [...siteRoutes]),
  layout("./layouts/auth-layout.tsx", [...authRoutes, ...legalRoutes]),
  layout("./layouts/main-layout.tsx", [...supportRoutes, ...userRoutes]),
  layout("./layouts/admin-layout.tsx", [...prefix("admin", [...adminRoutes])]),
  // Unified layout for employee, hr-manager, hr-user, and manager
  layout("./layouts/unified-layout.tsx", [
    ...prefix("employee", [...employeeRoutes]),
    ...prefix("hr", [...hrRoutes]),
  ]),
] satisfies RouteConfig;
`;
}

function performMigration(dryRun: boolean = true): void {
	log("\n🔄 Starting migration process...\n", "blue");

	if (dryRun) {
		log("(DRY RUN MODE - No files will be modified)\n", "yellow");
	}

	// Create backup
	const backupDir = path.join(APP_ROOT, "routes.backup");
	if (!dryRun) {
		log("Creating backup...", "cyan");
		if (!fs.existsSync(backupDir)) {
			fs.mkdirSync(backupDir, { recursive: true });
		}

		// Backup routes.ts
		fs.copyFileSync(ROUTES_CONFIG, path.join(backupDir, "routes.ts.bak"));
		log("✓ Backed up routes.ts", "green");

		// Backup layouts
		const layoutBackupDir = path.join(backupDir, "layouts");
		if (!fs.existsSync(layoutBackupDir)) {
			fs.mkdirSync(layoutBackupDir, { recursive: true });
		}
		for (const file of [
			"hr-layout.tsx",
			"hr-user-layout.tsx",
			"employee-layout.tsx",
			"manager-layout.tsx",
		]) {
			const src = path.join(LAYOUTS_DIR, file);
			if (fs.existsSync(src)) {
				fs.copyFileSync(src, path.join(layoutBackupDir, file));
			}
		}
		log("✓ Backed up layout files", "green");
	}

	// Step 1: Create unified structure
	log("\n1️⃣  Creating unified route structure...", "blue");

	const routesToCreate = ["app/routes/employee", "app/routes/hr", "app/routes/hr/recruitment"];

	for (const route of routesToCreate) {
		const fullPath = path.join(APP_ROOT, route);
		if (!dryRun && !fs.existsSync(fullPath)) {
			fs.mkdirSync(fullPath, { recursive: true });
			log(`✓ Created ${route}/`, "green");
		} else if (dryRun) {
			log(`[DRY] Would create ${route}/`, "cyan");
		}
	}

	// Step 2: Update routes.ts
	log("\n2️⃣  Updating routes.ts...", "blue");
	if (!dryRun) {
		fs.writeFileSync(ROUTES_CONFIG, generateNewRoutesConfig());
		log("✓ Updated routes.ts with unified configuration", "green");
	} else {
		log("[DRY] Would update routes.ts with unified configuration", "cyan");
	}

	// Step 3: Migration plan
	log("\n3️⃣  Migration plan for route files...", "blue");

	const migrations = [
		{
			source: "routes/hr/*",
			destination: "routes/hr/",
			description: "HR Manager routes",
		},
		{
			source: "routes/hr/*",
			destination: "routes/hr/",
			description: "HR User routes",
		},
		{
			source: "routes/employee/*",
			destination: "routes/employee/",
			description: "Manager routes (manager = employee + permissions)",
		},
		{
			source: "routes/employee/*",
			destination: "routes/employee/",
			description: "Employee routes (already here)",
		},
	];

	for (const migration of migrations) {
		if (dryRun) {
			log(`[DRY] ${migration.source} → ${migration.destination}`, "cyan");
			log(`      (${migration.description})`, "yellow");
		}
	}

	// Step 4: Layout consolidation
	log("\n4️⃣  Layout consolidation plan...", "blue");

	const layoutMigrations = [
		{ old: "hr-layout.tsx", action: "Keep (already unified)" },
		{ old: "hr-user-layout.tsx", action: "DELETE - use unified-layout.tsx" },
		{ old: "employee-layout.tsx", action: "DELETE - use unified-layout.tsx" },
		{ old: "manager-layout.tsx", action: "DELETE - use unified-layout.tsx" },
	];

	for (const layout of layoutMigrations) {
		if (layout.action.includes("DELETE")) {
			if (dryRun) {
				log(`[DRY] ${layout.old} - ${layout.action}`, "yellow");
			} else {
				const filePath = path.join(LAYOUTS_DIR, layout.old);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
					log(`✓ Deleted ${layout.old}`, "green");
				}
			}
		} else {
			if (dryRun) {
				log(`[DRY] ${layout.old} - ${layout.action}`, "cyan");
			}
		}
	}

	// Step 5: Directory removal
	log("\n5️⃣  Directory consolidation...", "blue");

	const dirsToRemove = ["hr-manager", "hr-user", "manager"];
	for (const dir of dirsToRemove) {
		if (dryRun) {
			const dirPath = path.join(ROUTES_DIR, dir);
			if (fs.existsSync(dirPath)) {
				const fileCount = countFiles(dirPath);
				log(`[DRY] Would remove routes/${dir}/ (${fileCount} files)`, "yellow");
			}
		}
	}

	log("\n✅ Migration plan generated!", "green");
	if (dryRun) {
		log("\n💡 Run with --execute flag to apply these changes\n", "blue");
	}
}

async function main(): Promise<void> {
	log("\n╔════════════════════════════════════════════════════════════════╗", "blue");
	log("║         HRIS ROUTES UNIFICATION SCRIPT v1.0                   ║", "blue");
	log("╚════════════════════════════════════════════════════════════════╝\n", "blue");

	// Check for command line arguments
	const args = process.argv.slice(2);
	const isDryRun = !args.includes("--execute");

	const plan = analyzeCurrentStructure();
	const report = generateDryRunReport(plan);
	console.log(report);

	if (isDryRun) {
		log("\n🔍 DRY RUN MODE ACTIVE\n", "yellow");
		const continueAnyway = await question("Continue to migration plan preview? (yes/no): ");
		if (continueAnyway.toLowerCase() !== "yes") {
			log("\nAborted.", "red");
			rl.close();
			process.exit(0);
		}
	}

	performMigration(isDryRun);

	if (isDryRun) {
		log("\n📝 To apply these changes, run:\n   npm run unify-routes -- --execute\n", "blue");
	} else {
		log("\n✅ All changes applied! Please review the changes and test your app.\n", "green");
	}

	rl.close();
}

main().catch((err) => {
	log(`\n❌ Error: ${err.message}\n`, "red");
	process.exit(1);
});
