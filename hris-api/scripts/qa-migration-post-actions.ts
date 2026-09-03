import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ChildProcess, spawn } from "child_process";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { buildBulkPasswordCandidates } from "../helper/bulk-password.helper";

dotenv.config();

type UploadResult = {
	status: number;
	body: any;
	rawText: string;
};

type QaOptions = {
	baseUrl: string;
	orgId: string;
	token: string;
	keepData: boolean;
	artifactDir: string;
	startServer: boolean;
};

type QaEmployees = {
	rowA: string;
	rowB: string;
	rowC: string;
	rowD: string;
};

const REQUIRED_HEADERS = [
	"EMP_ID",
	"NAME",
	"POSITION",
	"LEVEL",
	"DEPARTMENT",
	"TIN",
	"SSS",
	"PHILHEALTH",
	"PAGIBIG",
	"BASIC_SALARY",
	"HIRE_DATE",
	"EMAIL",
	"PHONE",
	"BIRTHDAY",
	"GENDER",
	"NATIONALITY",
	"PLACE_OF_BIRTH",
	"DEVICE_ID",
	"STREET",
	"CITY",
	"STATE",
	"COUNTRY",
	"POSTAL_CODE",
	"ROLE",
	"START_DATE",
	"END_DATE",
	"WORK_LOCATION",
	"REPORT_TO_EMP_ID",
	"CURRENCY",
	"PAY_FREQUENCY",
	"SCHEDULE",
];

const panic = (message: string): never => {
	throw new Error(message);
};

const assert = (condition: unknown, message: string): void => {
	if (!condition) panic(message);
};

const parseArgs = (): {
	keepData: boolean;
	artifactDir: string;
	baseUrl?: string;
	orgId?: string;
	startServer: boolean;
} => {
	const args = process.argv.slice(2);
	let keepData = false;
	let startServer = false;
	let artifactDir = path.join(process.cwd(), "test-artifacts");
	let baseUrl: string | undefined;
	let orgId: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--keep-data") {
			keepData = true;
		} else if (arg === "--start-server") {
			startServer = true;
		} else if (arg === "--artifact-dir" && args[i + 1]) {
			artifactDir = path.resolve(process.cwd(), args[++i]);
		} else if (arg === "--base-url" && args[i + 1]) {
			baseUrl = args[++i];
		} else if (arg === "--org-id" && args[i + 1]) {
			orgId = args[++i];
		}
	}

	return { keepData, artifactDir, baseUrl, orgId, startServer };
};

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, "");

const generateApiToken = (organizationId: string): string => {
	const secret = process.env.JWT_SECRET || "";
	if (!secret) panic("JWT_SECRET is missing. Set TOKEN explicitly or configure JWT_SECRET.");

	const payload = {
		userId: `qa-user-${Date.now()}`,
		role: "admin",
		roleId: "qa-role-id",
		organizationId,
		firstName: "QA",
		lastName: "Runner",
		metadata: {},
	};

	return jwt.sign(payload, secret as jwt.Secret, { expiresIn: "1h" });
};

const toCsvValue = (value: string | number | undefined | null): string => {
	if (value === undefined || value === null) return "";
	const text = String(value);
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const writeCsv = async (
	filePath: string,
	rows: Array<Record<string, string | number | undefined | null>>,
): Promise<void> => {
	const lines = [REQUIRED_HEADERS.join(",")];
	for (const row of rows) {
		const line = REQUIRED_HEADERS.map((header) => toCsvValue(row[header])).join(",");
		lines.push(line);
	}
	await fs.promises.writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
};

const uploadCsv = async (
	params: {
		baseUrl: string;
		token: string;
		orgId: string;
		filePath: string;
		dryRun: boolean;
		enablePostActions: boolean;
		autoCreate: boolean;
		skipDuplicates: boolean;
	},
): Promise<UploadResult> => {
	const csvBuffer = await fs.promises.readFile(params.filePath);
	const form = new FormData();
	form.append("file", new Blob([csvBuffer], { type: "text/csv" }), path.basename(params.filePath));
	form.append("organizationId", params.orgId);
	form.append("batchSize", "50");
	form.append("skipDuplicates", String(params.skipDuplicates));
	form.append("dryRun", String(params.dryRun));
	form.append("autoCreate", String(params.autoCreate));
	form.append("enablePostActions", String(params.enablePostActions));

	const response = await fetch(`${params.baseUrl}/api/migration/upload-csv`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${params.token}`,
		},
		body: form,
	});
	const rawText = await response.text();

	let body: any = null;
	try {
		body = rawText ? JSON.parse(rawText) : null;
	} catch {
		body = null;
	}

	return {
		status: response.status,
		body,
		rawText,
	};
};

const collectArtifacts = async (
	params: {
		artifactDir: string;
		runId: string;
		payload: unknown;
	},
): Promise<string> => {
	await fs.promises.mkdir(params.artifactDir, { recursive: true });
	const outputPath = path.join(params.artifactDir, `qa-migration-post-actions-${params.runId}.json`);
	await fs.promises.writeFile(outputPath, JSON.stringify(params.payload, null, 2), "utf-8");
	return outputPath;
};

const waitForHealth = async (baseUrl: string, timeoutMs = 15_000): Promise<void> => {
	const started = Date.now();
	let lastError = "";

	while (Date.now() - started < timeoutMs) {
		try {
			const res = await fetch(`${baseUrl}/health`, { method: "GET" });
			if (res.ok) return;
			lastError = `HTTP ${res.status}`;
		} catch (error: any) {
			lastError = error?.message || String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 750));
	}

	panic(`API health check failed for ${baseUrl}/health: ${lastError}`);
};

const startLocalApiServer = (workdir: string): ChildProcess => {
	const command = process.platform === "win32" ? "cmd.exe" : "npx";
	const args =
		process.platform === "win32"
			? ["/c", "npx ts-node index.ts"]
			: ["ts-node", "index.ts"];

	const child = spawn(command, args, {
		cwd: workdir,
		stdio: "inherit",
		shell: false,
		env: process.env,
	});

	child.on("error", (error) => {
		console.error("Failed to start API process:", error.message);
	});

	return child;
};

const stopLocalApiServer = async (child: ChildProcess | null): Promise<void> => {
	if (!child || child.exitCode !== null) return;
	const pid = child.pid;
	if (!pid) return;

	if (process.platform === "win32") {
		await new Promise<void>((resolve) => {
			const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
				stdio: "ignore",
				shell: false,
			});
			killer.on("exit", () => resolve());
			killer.on("error", () => resolve());
		});
		return;
	}

	child.kill("SIGTERM");
};

const cleanupByPrefix = async (
	prisma: PrismaClient,
	organizationId: string,
	prefix: string,
): Promise<void> => {
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			employeeId: { startsWith: prefix },
		},
		select: {
			id: true,
			personId: true,
		},
	});

	if (employees.length === 0) return;

	const employeeIds = employees.map((employee) => employee.id);
	const personIds = employees.map((employee) => employee.personId).filter(Boolean);

	const processes = await prisma.boardingProcess.findMany({
		where: {
			organizationId,
			employeeId: { in: employeeIds },
		},
		select: { id: true },
	});
	const processIds = processes.map((process) => process.id);

	if (processIds.length > 0) {
		await prisma.checklistItem.deleteMany({
			where: {
				organizationId,
				processId: { in: processIds },
			},
		});
	}

	await prisma.boardingProcess.deleteMany({
		where: {
			organizationId,
			employeeId: { in: employeeIds },
		},
	});

	await prisma.calendarItem.deleteMany({
		where: {
			organizationId,
			assignedEmployeeId: { in: employeeIds },
		},
	});

	await prisma.employee.updateMany({
		where: {
			organizationId,
			id: { in: employeeIds },
		},
		data: {
			reportToId: null,
		},
	});

	await prisma.employee.deleteMany({
		where: {
			organizationId,
			id: { in: employeeIds },
		},
	});

	if (personIds.length > 0) {
		await prisma.person.deleteMany({
			where: {
				id: { in: personIds },
			},
		});
	}
};

const resolveExistingLabels = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<{ department: string; position: string; level: string }> => {
	const [department, position, level] = await Promise.all([
		prisma.department.findFirst({
			where: { organizationId, isDeleted: false },
			select: { name: true },
		}),
		prisma.position.findFirst({
			where: { organizationId, isDeleted: false },
			select: { title: true },
		}),
		prisma.level.findFirst({
			where: { organizationId, isDeleted: false },
			select: { name: true },
		}),
	]);

	return {
		department: department?.name || "Quality Assurance",
		position: position?.title || "QA Specialist",
		level: level?.name || "Regular",
	};
};

const ensureObjectId = (orgId: string): void => {
	assert(/^[a-fA-F0-9]{24}$/.test(orgId), `organizationId must be a 24-char ObjectId. Received: ${orgId}`);
};

const buildRows = (
	employees: QaEmployees,
	labels: { department: string; position: string; level: string },
): Array<Record<string, string>> => {
	return [
		{
			EMP_ID: employees.rowA,
			NAME: "Alpha Manager QA",
			POSITION: labels.position,
			LEVEL: labels.level,
			DEPARTMENT: labels.department,
			TIN: "111-111-111-111",
			SSS: "11-1111111-1",
			PHILHEALTH: "11-111111111-1",
			PAGIBIG: "1111-1111-1111",
			BASIC_SALARY: "85000",
			HIRE_DATE: "01/01/2026",
			EMAIL: `qa.alpha.${employees.rowA.toLowerCase()}@example.com`,
			PHONE: "09170000001",
			BIRTHDAY: "01/15/1990",
			GENDER: "male",
			NATIONALITY: "Filipino",
			PLACE_OF_BIRTH: "Manila",
			DEVICE_ID: "",
			STREET: "1 QA St",
			CITY: "Makati",
			STATE: "Metro Manila",
			COUNTRY: "Philippines",
			POSTAL_CODE: "1200",
			ROLE: "hris-employee-manager",
			START_DATE: "01/01/2026",
			END_DATE: "",
			WORK_LOCATION: "ONSITE",
			REPORT_TO_EMP_ID: "",
			CURRENCY: "PHP",
			PAY_FREQUENCY: "MONTHLY",
			SCHEDULE: "",
		},
		{
			EMP_ID: employees.rowB,
			NAME: "Bravo Staff QA",
			POSITION: labels.position,
			LEVEL: labels.level,
			DEPARTMENT: labels.department,
			TIN: "222-222-222-222",
			SSS: "22-2222222-2",
			PHILHEALTH: "22-222222222-2",
			PAGIBIG: "2222-2222-2222",
			BASIC_SALARY: "45000",
			HIRE_DATE: "01/02/2026",
			EMAIL: `qa.bravo.${employees.rowB.toLowerCase()}@example.com`,
			PHONE: "09170000002",
			BIRTHDAY: "02/20/1992",
			GENDER: "female",
			NATIONALITY: "Filipino",
			PLACE_OF_BIRTH: "Quezon City",
			DEVICE_ID: "QA-DEVICE-001",
			STREET: "2 QA St",
			CITY: "Taguig",
			STATE: "Metro Manila",
			COUNTRY: "Philippines",
			POSTAL_CODE: "1630",
			ROLE: "hris-employee",
			START_DATE: "01/02/2026",
			END_DATE: "",
			WORK_LOCATION: "ONSITE",
			REPORT_TO_EMP_ID: employees.rowA,
			CURRENCY: "PHP",
			PAY_FREQUENCY: "MONTHLY",
			SCHEDULE: "",
		},
		{
			EMP_ID: employees.rowC,
			NAME: "Charlie NoEmail QA",
			POSITION: labels.position,
			LEVEL: labels.level,
			DEPARTMENT: labels.department,
			TIN: "333-333-333-333",
			SSS: "33-3333333-3",
			PHILHEALTH: "33-333333333-3",
			PAGIBIG: "3333-3333-3333",
			BASIC_SALARY: "40000",
			HIRE_DATE: "01/03/2026",
			EMAIL: "",
			PHONE: "09170000003",
			BIRTHDAY: "03/12/1994",
			GENDER: "male",
			NATIONALITY: "Filipino",
			PLACE_OF_BIRTH: "Pasig",
			DEVICE_ID: "",
			STREET: "3 QA St",
			CITY: "Pasig",
			STATE: "Metro Manila",
			COUNTRY: "Philippines",
			POSTAL_CODE: "1600",
			ROLE: "hris-employee",
			START_DATE: "01/03/2026",
			END_DATE: "",
			WORK_LOCATION: "ONSITE",
			REPORT_TO_EMP_ID: employees.rowA,
			CURRENCY: "PHP",
			PAY_FREQUENCY: "MONTHLY",
			SCHEDULE: "",
		},
		{
			EMP_ID: employees.rowD,
			NAME: "Delta Existing QA",
			POSITION: labels.position,
			LEVEL: labels.level,
			DEPARTMENT: labels.department,
			TIN: "444-444-444-444",
			SSS: "44-4444444-4",
			PHILHEALTH: "44-444444444-4",
			PAGIBIG: "4444-4444-4444",
			BASIC_SALARY: "39000",
			HIRE_DATE: "01/04/2026",
			EMAIL: `qa.delta.${employees.rowD.toLowerCase()}@example.com`,
			PHONE: "09170000004",
			BIRTHDAY: "04/08/1996",
			GENDER: "female",
			NATIONALITY: "Filipino",
			PLACE_OF_BIRTH: "Mandaluyong",
			DEVICE_ID: "",
			STREET: "4 QA St",
			CITY: "Mandaluyong",
			STATE: "Metro Manila",
			COUNTRY: "Philippines",
			POSTAL_CODE: "1550",
			ROLE: "hris-employee",
			START_DATE: "01/04/2026",
			END_DATE: "",
			WORK_LOCATION: "ONSITE",
			REPORT_TO_EMP_ID: employees.rowA,
			CURRENCY: "PHP",
			PAY_FREQUENCY: "MONTHLY",
			SCHEDULE: "",
		},
	];
};

const run = async (): Promise<void> => {
	const cli = parseArgs();
	const defaultPort = process.env.PORT || "3000";
	const baseUrl = normalizeBaseUrl(
		cli.baseUrl || process.env.HRIS_BASE || `http://localhost:${defaultPort}`,
	);
	const orgId =
		cli.orgId ||
		process.env.ORG_ID ||
		process.env.MIGRATION_ORG_ID ||
		"69884da971e2dc9d6ac67b59";
	ensureObjectId(orgId);

	const token = process.env.TOKEN || generateApiToken(orgId);
	const options: QaOptions = {
		baseUrl,
		orgId,
		token,
		keepData: cli.keepData,
		artifactDir: cli.artifactDir,
		startServer: cli.startServer,
	};

	const runId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
	const prefix = `QA-PA-${runId}`;
	const ids: QaEmployees = {
		rowA: `${prefix}-A`,
		rowB: `${prefix}-B`,
		rowC: `${prefix}-C`,
		rowD: `${prefix}-D`,
	};

	const prisma = new PrismaClient();
	let apiProcess: ChildProcess | null = null;
	let artifactPath = "";
	const auditPayload: Record<string, any> = {
		runId,
		baseUrl: options.baseUrl,
		orgId: options.orgId,
		startedAt: new Date().toISOString(),
	};

	try {
		if (options.startServer) {
			apiProcess = startLocalApiServer(process.cwd());
		}
		await waitForHealth(options.baseUrl, options.startServer ? 90_000 : 15_000);
		await prisma.$connect();

		const currentYear = new Date().getFullYear();
		const passwordCandidateCheck = buildBulkPasswordCandidates(
			"  Dela   Cruz  ",
			"EMP-049",
			currentYear,
		);
		assert(
			passwordCandidateCheck[0] === `delacruzEMP-049!${currentYear}`,
			`Expected normalized bulk password candidate. Received: ${passwordCandidateCheck[0]}`,
		);
		assert(
			passwordCandidateCheck.includes(`dela   cruzEMP-049!${currentYear}`),
			"Expected legacy bulk password candidate with preserved internal spaces for compatibility.",
		);
		auditPayload.passwordCandidates = passwordCandidateCheck;

		await cleanupByPrefix(prisma, options.orgId, prefix);

		const labels = await resolveExistingLabels(prisma, options.orgId);
		const allRows = buildRows(ids, labels);

		const tempDir = await fs.promises.mkdtemp(path.join(process.cwd(), "tmp-qa-post-actions-"));
		const precreateFile = path.join(tempDir, "qa-precreate-existing.csv");
		const mainFile = path.join(tempDir, "qa-post-actions.csv");
		await writeCsv(precreateFile, [allRows[3]]);
		await writeCsv(mainFile, allRows);

		const precreateResult = await uploadCsv({
			baseUrl: options.baseUrl,
			token: options.token,
			orgId: options.orgId,
			filePath: precreateFile,
			dryRun: false,
			enablePostActions: false,
			autoCreate: true,
			skipDuplicates: true,
		});

		assert(
			precreateResult.status === 200 || precreateResult.status === 207,
			`Pre-create import failed. status=${precreateResult.status}, body=${precreateResult.rawText}`,
		);
		auditPayload.precreate = precreateResult.body || precreateResult.rawText;

		const importResult = await uploadCsv({
			baseUrl: options.baseUrl,
			token: options.token,
			orgId: options.orgId,
			filePath: mainFile,
			dryRun: false,
			enablePostActions: true,
			autoCreate: true,
			skipDuplicates: true,
		});

		assert(
			importResult.status === 200 || importResult.status === 207,
			`Main import failed. status=${importResult.status}, body=${importResult.rawText}`,
		);
		auditPayload.mainImport = importResult.body || importResult.rawText;

		const payload = importResult.body?.data;
		assert(payload, "Main import response missing `data` payload.");
		assert(payload.summary?.employees, "Response missing summary.employees.");
		assert(payload.postActions, "Response missing postActions.");
		assert(
			payload.summary.employees.created <= 3,
			`Expected created rows to be <= 3 under strict rollback. Received: ${payload.summary.employees.created}`,
		);
		assert(
			payload.postActions.summary?.attempted === 3,
			`Expected postActions.summary.attempted=3. Received: ${payload.postActions.summary?.attempted}`,
		);
		assert(
			Array.isArray(payload.postActions.warnings),
			"Expected postActions.warnings[] to be present.",
		);
		assert(
			payload.postActions.summary?.completed === payload.postActions.summary?.attempted,
			`Expected postActions completed==attempted. completed=${payload.postActions.summary?.completed}, attempted=${payload.postActions.summary?.attempted}`,
		);

		const employees = await prisma.employee.findMany({
			where: {
				organizationId: options.orgId,
				employeeId: { in: [ids.rowA, ids.rowB, ids.rowC, ids.rowD] },
			},
			include: {
				person: true,
			},
		});

		const byEmpId = new Map(employees.map((employee) => [employee.employeeId, employee]));
		const warnings = payload.postActions.warnings as Array<{
			employeeId: string;
			stage: string;
			message: string;
		}>;
		const failures = payload.postActions.failures as Array<{
			row?: number;
			employeeId: string;
			stage: string;
			code: string;
			message: string;
		}>;
		const strictMode = Boolean(payload.postActions.summary?.strictMode);
		const strictRowsFailed = Number(payload.postActions.summary?.strictRowsFailed ?? 0);
		const strictRowsRolledBack = Number(
			payload.postActions.summary?.strictRowsRolledBack ?? 0,
		);

		assert(strictMode, "Expected strictMode=true for upload-csv post-actions.");
		assert(Array.isArray(failures), "Expected postActions.failures[] to be present.");
		assert(
			strictRowsFailed === failures.length,
			`strictRowsFailed must equal failures length. strictRowsFailed=${strictRowsFailed}, failures=${failures.length}`,
		);
		assert(
			strictRowsRolledBack === strictRowsFailed,
			`strictRowsRolledBack must equal strictRowsFailed in strict mode. strictRowsRolledBack=${strictRowsRolledBack}, strictRowsFailed=${strictRowsFailed}`,
		);

		// Row D is pre-created and should remain untouched by strict failures.
		assert(byEmpId.has(ids.rowD), "Row D should still exist (pre-created skip row).");

		const rowCFailure = failures.find((failure) => failure.employeeId === ids.rowC);
		assert(rowCFailure, "Row C must fail strict mode (missing email).");
		assert(
			rowCFailure!.code === "AUTH_REGISTER_FAILED",
			`Row C expected AUTH_REGISTER_FAILED. Received: ${rowCFailure!.code}`,
		);

		// Every strict failed row should be rolled back and absent in DB.
		for (const failure of failures) {
			assert(
				!byEmpId.has(failure.employeeId),
				`Strict failed row ${failure.employeeId} should be rolled back and absent in DB.`,
			);
		}

		const createdRowsInDb = [ids.rowA, ids.rowB, ids.rowC].filter((id) =>
			byEmpId.has(id),
		).length;
		assert(
			createdRowsInDb === payload.summary.employees.created,
			`Created rows mismatch. summary.created=${payload.summary.employees.created}, actualInDb=${createdRowsInDb}`,
		);
		assert(
			payload.summary.employees.created + strictRowsRolledBack === 3,
			`Expected original 3 newly-created rows to equal created+rolledBack. created=${payload.summary.employees.created}, rolledBack=${strictRowsRolledBack}`,
		);

		const survivingRows = [ids.rowA, ids.rowB]
			.map((id) => byEmpId.get(id))
			.filter(Boolean) as Array<{ id: string; employeeId: string; userId?: string | null; person?: any }>;

		for (const employee of survivingRows) {
			if (employee.userId) {
				assert(
					employee.person?.userId === employee.userId,
					`person.userId must match employee.userId for ${employee.employeeId}.`,
				);
			}
		}

		const survivingEmployeeIds = survivingRows.map((employee) => employee.id);
		const birthdayItems = await prisma.calendarItem.findMany({
			where: {
				organizationId: options.orgId,
				type: "BIRTHDAY",
				assignedEmployeeId: { in: survivingEmployeeIds },
			},
			select: {
				id: true,
				assignedEmployeeId: true,
				title: true,
			},
		});

		const processes = await prisma.boardingProcess.findMany({
			where: {
				organizationId: options.orgId,
				type: "ONBOARDING",
				employeeId: { in: survivingEmployeeIds },
			},
			select: { id: true, employeeId: true },
		});

		const processIds = processes.map((process) => process.id);
		const checklistCount = await prisma.checklistItem.count({
			where: {
				organizationId: options.orgId,
				processId: { in: processIds },
			},
		});
		const credentialsEmailSent = Number(
			payload.postActions.summary?.credentialsEmailSent ?? 0,
		);
		const credentialsEmailFailed = Number(
			payload.postActions.summary?.credentialsEmailFailed ?? 0,
		);
		assert(
			Number.isFinite(credentialsEmailSent) && credentialsEmailSent >= 0,
			`Invalid credentialsEmailSent value: ${payload.postActions.summary?.credentialsEmailSent}`,
		);
		assert(
			Number.isFinite(credentialsEmailFailed) && credentialsEmailFailed >= 0,
			`Invalid credentialsEmailFailed value: ${payload.postActions.summary?.credentialsEmailFailed}`,
		);

		auditPayload.assertions = {
			createdRows: payload.summary.employees.created,
			postActionsAttempted: payload.postActions.summary.attempted,
			postActionsWarnings: warnings.length,
			strictMode,
			strictRowsFailed,
			strictRowsRolledBack,
			postActionsFailures: failures.length,
			credentialsEmailSent,
			credentialsEmailFailed,
			birthdayItems: birthdayItems.length,
			boardingProcesses: processes.length,
			checklistItems: checklistCount,
		};
		auditPayload.completedAt = new Date().toISOString();
		artifactPath = await collectArtifacts({
			artifactDir: options.artifactDir,
			runId,
			payload: auditPayload,
		});

		console.log("QA_PASS migration post-actions smoke test passed");
		console.log(`Artifact: ${artifactPath}`);
		console.log(`Prefix: ${prefix}`);
	} catch (error: any) {
		auditPayload.failedAt = new Date().toISOString();
		auditPayload.error = {
			message: error?.message || String(error),
			stack: error?.stack || undefined,
		};
		try {
			artifactPath = await collectArtifacts({
				artifactDir: options.artifactDir,
				runId,
				payload: auditPayload,
			});
			console.error(`QA_FAIL artifact: ${artifactPath}`);
		} catch {}
		console.error("QA_FAIL", error?.message || String(error));
		process.exitCode = 1;
	} finally {
		try {
			if (!options.keepData) {
				await cleanupByPrefix(prisma, options.orgId, prefix);
			}
		} catch (cleanupError: any) {
			console.error("Cleanup warning:", cleanupError?.message || String(cleanupError));
		}
		await prisma.$disconnect();
		await stopLocalApiServer(apiProcess);
	}
};

run().catch((error) => {
	console.error("Fatal QA script error:", error?.message || String(error));
	process.exit(1);
});
