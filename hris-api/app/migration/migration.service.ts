import { PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";

import {
	BulkMigrationInput,
	EmployeeRowInput,
	inferRoleLevel,
	MigrationConfig,
} from "../../zod/migration.zod";
import {
	CreatedEmployeePostActionInput,
	PostActionFailure,
	PostActionsResult,
	runEmployeePostActions,
} from "../../helper/employee-post-actions.helper";

const logger = getLogger();
const migrationLogger = logger.child({ module: "migration" });

// --- Types -----------------------------------------------

export interface MigrationProgress {
	phase: string;
	total: number;
	processed: number;
	failed: number;
	errors: MigrationError[];
	startedAt: Date;
	completedAt?: Date;
	durationMs?: number;
}

export interface MigrationError {
	row: number;
	employeeId?: string;
	field?: string;
	message: string;
}

export interface MigrationResult {
	success: boolean;
	summary: {
		departments: { created: number; existing: number };
		positions: { created: number; existing: number };
		levels: { created: number; existing: number };
		persons: { created: number; existing: number };
		employees: { created: number; skipped: number; failed: number };
		totalDurationMs: number;
	};
	errors: MigrationError[];
	dryRun: boolean;
	postActions?: PostActionsResult;
}

interface MigrationExecutionOptions {
	maxParallelBatches?: number;
	authToken?: string;
	actorUserId?: string;
	enablePostActions?: boolean;
	requestPath?: string;
	strictPostActions?: boolean;
}

// --- Lookup Maps -----------------------------------------

interface LookupMaps {
	departmentMap: Map<string, string>; // code -> id
	positionMap: Map<string, string>; // code -> id
	levelMap: Map<string, string>; // name -> id
	levelRankMap: Map<number, string>; // rank -> id
	employeeIdMap: Map<string, string>; // employeeId -> id (for reportTo linking)
}

// --- Service ---------------------------------------------

export const migrationService = (prisma: PrismaClient) => {
	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	// --- Tuning constants ----------------------------------
	// MongoDB Atlas free/shared tier supports ~100 connections max.
	// Keep concurrent writes LOW to avoid saturating the connection pool.
	const MAX_WRITE_CONCURRENCY = 5; // parallel upserts per window
	const BATCH_COOLDOWN_MS = 300; // pause between batches to let pool recover
	const MAX_RETRIES = 6; // more retries with longer backoff
	const BASE_RETRY_DELAY_MS = 500; // starting delay (doubles each retry)

	const isRetryablePrismaError = (error: any): boolean => {
		const message = String(error?.message || "");
		const code = String(error?.code || "");

		return (
			message.includes("RetryableWriteError") ||
			message.includes("TransientTransactionError") ||
			message.includes("received fatal alert") ||
			message.includes("Raw query failed") ||
			message.includes("Connection pool") ||
			message.includes("pool cleared") ||
			message.includes("ECONNRESET") ||
			message.includes("socket hang up") ||
			code === "P1001" ||
			code === "P1002" ||
			code === "P1008" ||
			code === "P1017"
		);
	};

	const withPrismaRetry = async <T>(
		operation: string,
		fn: () => Promise<T>,
		maxRetries = MAX_RETRIES,
	): Promise<T> => {
		let lastError: any;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error: any) {
				lastError = error;

				if (!isRetryablePrismaError(error) || attempt === maxRetries) {
					throw error;
				}

				// Exponential backoff: 500, 1000, 2000, 4000, 8000, 16000ms
				const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
				// Add jitter (+/-25%) to prevent all retries hitting at the same moment
				const jitter = delayMs * 0.25 * (Math.random() * 2 - 1);
				const finalDelay = Math.round(delayMs + jitter);

				migrationLogger.warn(
					`Transient error during ${operation} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${finalDelay}ms`,
				);
				await sleep(finalDelay);
			}
		}

		throw lastError;
	};

	/**
	 * Runs async workers with a sliding concurrency window.
	 * After each window completes, pauses briefly to let the connection pool breathe.
	 */
	const runWithConcurrency = async <T>(
		items: T[],
		concurrency: number,
		worker: (item: T, index: number) => Promise<void>,
	) => {
		for (let i = 0; i < items.length; i += concurrency) {
			const window = items.slice(i, i + concurrency);
			await Promise.all(window.map((item, idx) => worker(item, i + idx)));
			// Small pause between windows so MongoDB Atlas connection pool can recycle
			if (i + concurrency < items.length) {
				await sleep(50);
			}
		}
	};

	/**
	 * Main migration entry point.
	 * Implements the hierarchy-aware, batch-processed migration strategy
	 * outlined in the B-tree indexing document.
	 *
	 * Execution order:
	 * 1. Upsert Levels (rank 1->5)
	 * 2. Upsert Departments
	 * 3. Upsert Positions
	 * 4. Group employees by department
	 * 5. Sort each group by roleLevel ascending (top->bottom)
	 * 6. Insert in batches of `batchSize`
	 * 7. Link reportTo references in a second pass
	 */
	const executeMigration = async (
		input: BulkMigrationInput,
		options: MigrationExecutionOptions = {},
	): Promise<MigrationResult> => {
		const startTime = Date.now();
		const { config, employees } = input;
		const errors: MigrationError[] = [];

		const result: MigrationResult = {
			success: true,
			summary: {
				departments: { created: 0, existing: 0 },
				positions: { created: 0, existing: 0 },
				levels: { created: 0, existing: 0 },
				persons: { created: 0, existing: 0 },
				employees: { created: 0, skipped: 0, failed: 0 },
				totalDurationMs: 0,
			},
			errors: [],
			dryRun: config.dryRun,
		};

		try {
			migrationLogger.info(
				`Starting migration for org=${config.organizationId}, employees=${employees.length}, batchSize=${config.batchSize}, dryRun=${config.dryRun}`,
			);

			// -- Step 1: Upsert Levels ---------------------------
			const levelsSummary = await upsertLevels(config, input.levels, config.dryRun);
			result.summary.levels = levelsSummary;

			// -- Step 2: Upsert Departments ----------------------
			const deptsSummary = await upsertDepartments(
				config,
				input.departments,
				employees,
				config.dryRun,
			);
			result.summary.departments = deptsSummary;

			// -- Step 3: Upsert Positions ------------------------
			const posSummary = await upsertPositions(
				config,
				input.positions,
				employees,
				config.dryRun,
			);
			result.summary.positions = posSummary;

			// -- Build lookup maps -------------------------------
			const lookups = await buildLookupMaps(config.organizationId);

			// -- Step 4-6: Group -> Sort -> Batch Insert -----------
			const empResult = await insertEmployeesByHierarchy(
				config,
				employees,
				lookups,
				errors,
				options,
			);
			result.summary.employees = {
				created: empResult.created,
				skipped: empResult.skipped,
				failed: empResult.failed,
			};

			// -- Step 7: Link reportTo references ----------------
			if (!config.dryRun) {
				const strictPostActions = options.strictPostActions === true;
				await linkReportToReferences(config, employees);

				if (options.enablePostActions !== false && empResult.createdEmployees.length > 0) {
					result.postActions = await runEmployeePostActions({
						prisma,
						organizationId: config.organizationId,
						createdEmployees: empResult.createdEmployees,
						authToken: options.authToken,
						actorUserId: options.actorUserId,
						requestPath: options.requestPath || "/api/migration/upload-csv",
						enablePostActions: true,
						maxConcurrency: 3,
						strictMode: strictPostActions,
					});

					if (strictPostActions && result.postActions.failures.length > 0) {
						for (const failure of result.postActions.failures) {
							errors.push({
								row:
									typeof failure.row === "number" && Number.isFinite(failure.row)
										? failure.row
										: 0,
								employeeId: failure.employeeId,
								field: failure.stage,
								message: `[${failure.code}] ${failure.message}`,
							});
						}

						const rolledBackCount = await rollbackStrictFailedEmployees({
							organizationId: config.organizationId,
							createdEmployees: empResult.createdEmployees,
							failures: result.postActions.failures,
							errors,
						});
						result.postActions.summary.strictRowsRolledBack = rolledBackCount;

						result.summary.employees = {
							created: Math.max(0, empResult.created - rolledBackCount),
							skipped: empResult.skipped,
							failed: empResult.failed + result.postActions.failures.length,
						};
					}
				}
			}

			result.errors = errors;
			result.success = errors.length === 0;
		} catch (error: any) {
			migrationLogger.error(`Migration failed: ${error.message}`, { error });
			result.success = false;
			result.errors.push({
				row: 0,
				message: `Critical migration error: ${error.message}`,
			});
		}

		result.summary.totalDurationMs = Date.now() - startTime;
		migrationLogger.info(
			`Migration completed in ${result.summary.totalDurationMs}ms. Created ${result.summary.employees.created} employees, skipped ${result.summary.employees.skipped}, failed ${result.summary.employees.failed}`,
		);

		return result;
	};

	// --- Step 1: Upsert Levels -------------------------------

	const upsertLevels = async (
		config: MigrationConfig,
		levelsInput: BulkMigrationInput["levels"],
		dryRun: boolean,
	): Promise<{ created: number; existing: number }> => {
		const summary = { created: 0, existing: 0 };

		// Default 5-level hierarchy if not provided
		const levels = levelsInput?.length
			? levelsInput
			: [
					{ name: "Director / Head", rank: 1, description: "Level 1 - Top leadership" },
					{ name: "Manager / Lead", rank: 2, description: "Level 2 - Management" },
					{ name: "Senior", rank: 3, description: "Level 3 - Senior staff" },
					{ name: "Regular", rank: 4, description: "Level 4 - Regular staff" },
					{ name: "Intern / Junior", rank: 5, description: "Level 5 - Entry level" },
				];

		for (const level of levels) {
			const isManager = !/\b(entry|junior)\b/i.test(level.name);

			if (dryRun) {
				summary.created++;
				continue;
			}

			const existing = await withPrismaRetry(`level.findFirst(${level.name})`, () =>
				prisma.level.findFirst({
					where: {
						organizationId: config.organizationId,
						name: level.name,
					},
				}),
			);

			if (existing) {
				await withPrismaRetry(`level.update(${level.name})`, () =>
					prisma.level.update({
						where: { id: existing.id },
						data: {
							rank: level.rank,
							description: level.description,
							isManager,
						},
					}),
				);
				summary.existing++;
				migrationLogger.info(`Level already exists: ${level.name}`);
			} else {
				await withPrismaRetry(`level.create(${level.name})`, () =>
					prisma.level.create({
						data: {
							organizationId: config.organizationId,
							name: level.name,
							rank: level.rank,
							description: level.description,
							isManager,
						},
					}),
				);
				summary.created++;
				migrationLogger.info(`Created level: ${level.name} (rank=${level.rank})`);
			}
		}

		return summary;
	};

	// --- Step 2: Upsert Departments --------------------------

	const upsertDepartments = async (
		config: MigrationConfig,
		deptsInput: BulkMigrationInput["departments"],
		employees: EmployeeRowInput[],
		dryRun: boolean,
	): Promise<{ created: number; existing: number }> => {
		const summary = { created: 0, existing: 0 };

		// Collect unique departments from both explicit input and employee rows
		const deptSet = new Map<string, { name: string; code: string; description?: string }>();

		if (deptsInput?.length) {
			for (const d of deptsInput) {
				deptSet.set(d.code, { name: d.name, code: d.code, description: d.description });
			}
		}

		// Auto-discover departments from employee data
		for (const emp of employees) {
			if (!deptSet.has(emp.departmentCode)) {
				deptSet.set(emp.departmentCode, {
					name: emp.departmentName || emp.departmentCode,
					code: emp.departmentCode,
				});
			}
		}

		for (const [, dept] of deptSet) {
			const normalizedName = (dept.name || "").trim().toUpperCase();
			const normalizedCode = (dept.code || "").trim().toUpperCase();
			const isHr = normalizedName === "HUMAN RESOURCES" || normalizedCode === "HR";

			if (dryRun) {
				summary.created++;
				continue;
			}

			const existing = await withPrismaRetry(`department.findFirst(${dept.code})`, () =>
				prisma.department.findFirst({
					where: {
						organizationId: config.organizationId,
						OR: [{ code: dept.code }, { name: dept.name }],
					},
				}),
			);

			if (existing) {
				await withPrismaRetry(`department.update(${dept.code})`, () =>
					prisma.department.update({
						where: { id: existing.id },
						data: { isHr },
					}),
				);
				summary.existing++;
			} else {
				await withPrismaRetry(`department.create(${dept.code})`, () =>
					prisma.department.create({
						data: {
							organizationId: config.organizationId,
							name: dept.name,
							code: dept.code,
							description: dept.description,
							isHr,
						},
					}),
				);
				summary.created++;
				migrationLogger.info(`Created department: ${dept.name} (${dept.code})`);
			}
		}

		return summary;
	};

	// --- Step 3: Upsert Positions ----------------------------

	const upsertPositions = async (
		config: MigrationConfig,
		posInput: BulkMigrationInput["positions"],
		employees: EmployeeRowInput[],
		dryRun: boolean,
	): Promise<{ created: number; existing: number }> => {
		const summary = { created: 0, existing: 0 };

		const posSet = new Map<
			string,
			{ title: string; code: string; description?: string; departmentCode?: string }
		>();

		if (posInput?.length) {
			for (const p of posInput) {
				posSet.set(p.code, {
					title: p.title,
					code: p.code,
					description: p.description,
					departmentCode: p.departmentCode,
				});
			}
		}

		// Auto-discover positions from employee data
		for (const emp of employees) {
			if (!posSet.has(emp.positionCode)) {
				posSet.set(emp.positionCode, {
					title: emp.positionTitle || emp.positionCode,
					code: emp.positionCode,
					departmentCode: emp.departmentCode,
				});
			}
		}

		// Need department lookup for linking
		const deptLookup = new Map<string, string>();
		if (!dryRun) {
			const depts = await withPrismaRetry("department.findMany(deptLookup)", () =>
				prisma.department.findMany({
					where: { organizationId: config.organizationId },
					select: { id: true, code: true },
				}),
			);
			for (const d of depts) deptLookup.set(d.code, d.id);
		}

		for (const [, pos] of posSet) {
			if (dryRun) {
				summary.created++;
				continue;
			}

			const existing = await withPrismaRetry(`position.findFirst(${pos.code})`, () =>
				prisma.position.findFirst({
					where: {
						organizationId: config.organizationId,
						OR: [{ code: pos.code }, { title: pos.title }],
					},
				}),
			);

			if (existing) {
				summary.existing++;
			} else {
				await withPrismaRetry(`position.create(${pos.code})`, () =>
					prisma.position.create({
						data: {
							organizationId: config.organizationId,
							title: pos.title,
							code: pos.code,
							description: pos.description,
						},
					}),
				);
				summary.created++;
				migrationLogger.info(`Created position: ${pos.title} (${pos.code})`);
			}
		}

		return summary;
	};

	// --- Build Lookup Maps -----------------------------------
	// These are loaded once and used for O(1) lookups during batch insert,
	// analogous to how B-tree indexes provide O(log n) disk lookups.

	const buildLookupMaps = async (organizationId: string): Promise<LookupMaps> => {
		const [departments, positions, levels, employees] = await Promise.all([
			withPrismaRetry("department.findMany(lookup)", () =>
				prisma.department.findMany({
					where: { organizationId },
					select: { id: true, code: true },
				}),
			),
			withPrismaRetry("position.findMany(lookup)", () =>
				prisma.position.findMany({
					where: { organizationId },
					select: { id: true, code: true },
				}),
			),
			withPrismaRetry("level.findMany(lookup)", () =>
				prisma.level.findMany({
					where: { organizationId },
					select: { id: true, name: true, rank: true },
				}),
			),
			withPrismaRetry("employee.findMany(lookup)", () =>
				prisma.employee.findMany({
					where: { organizationId },
					select: { id: true, employeeId: true },
				}),
			),
		]);

		const departmentMap = new Map(departments.map((d) => [d.code, d.id]));
		const positionMap = new Map(positions.map((p) => [p.code, p.id]));
		const levelMap = new Map(levels.map((l) => [l.name, l.id]));
		const levelRankMap = new Map(
			levels.filter((l) => l.rank !== null).map((l) => [l.rank!, l.id]),
		);
		const employeeIdMap = new Map(employees.map((e) => [e.employeeId, e.id]));

		return { departmentMap, positionMap, levelMap, levelRankMap, employeeIdMap };
	};

	// --- Step 4-6: Group -> Sort -> Batch Insert --------------
	// Follows the migration execution logic:
	//   1. Group employees by department
	//   2. For each department, sort by roleLevel ascending (1->5)
	//   3. Insert batch by batch

	const insertEmployeesByHierarchy = async (
		config: MigrationConfig,
		employees: EmployeeRowInput[],
		lookups: LookupMaps,
		errors: MigrationError[],
		options: MigrationExecutionOptions,
	): Promise<{
		created: number;
		skipped: number;
		failed: number;
		createdEmployees: CreatedEmployeePostActionInput[];
	}> => {
		const summary = { created: 0, skipped: 0, failed: 0 };
		const createdEmployees: CreatedEmployeePostActionInput[] = [];

		// -- Group by department -----------------------------
		const departmentGroups = new Map<string, EmployeeRowInput[]>();
		for (const emp of employees) {
			const group = departmentGroups.get(emp.departmentCode) || [];
			group.push(emp);
			departmentGroups.set(emp.departmentCode, group);
		}

		migrationLogger.info(`Grouped employees into ${departmentGroups.size} departments`);

		// -- Process each department in order ----------------
		for (const [deptCode, deptEmployees] of departmentGroups) {
			// Sort by roleLevel ascending (Level 1 first -> Level 5 last)
			// This ensures hierarchy is built top-down
			const sorted = deptEmployees.sort((a, b) => {
				const levelA = a.levelRank ?? inferRoleLevel(a.role);
				const levelB = b.levelRank ?? inferRoleLevel(b.role);
				return levelA - levelB;
			});

			migrationLogger.info(
				`Processing department=${deptCode}: ${sorted.length} employees, sorted by hierarchy`,
			);

			// -- Batch insert (chunking) ---------------------
			const batchSize = config.batchSize;
			for (let i = 0; i < sorted.length; i += batchSize) {
				const batch = sorted.slice(i, i + batchSize);
				const batchNum = Math.floor(i / batchSize) + 1;
				const totalBatches = Math.ceil(sorted.length / batchSize);
				const batchStart = Date.now();

				migrationLogger.info(
					`  Batch ${batchNum}/${totalBatches} (${batch.length} records)`,
				);

				if (config.dryRun) {
					summary.created += batch.length;
					continue;
				}

				// Keep concurrency LOW to avoid saturating MongoDB Atlas connection pool.
				// 50 parallel upserts will cause "Connection pool cleared" / RetryableWriteError
				// on free/shared tier. 5 concurrent writes is safe for most Atlas tiers.
				const writeConcurrency = Math.max(
					1,
					options.maxParallelBatches ??
						config.maxParallelBatches ??
						MAX_WRITE_CONCURRENCY,
				);
				await runWithConcurrency(batch, writeConcurrency, async (emp, batchIdx) => {
					const rowIndex = i + batchIdx;
					try {
						// Support pre-resolved IDs (from uploadCsv controller) OR code-based lookup
						const departmentId =
							(emp as any).departmentId ||
							lookups.departmentMap.get(emp.departmentCode);
						const positionId =
							(emp as any).positionId || lookups.positionMap.get(emp.positionCode);

						let levelId: string | undefined = (emp as any).levelId;
						if (!levelId && emp.levelName)
							levelId = lookups.levelMap.get(emp.levelName);
						if (!levelId) {
							const rank = emp.levelRank ?? inferRoleLevel(emp.role);
							levelId = lookups.levelRankMap.get(rank);
						}

						if (!departmentId || !positionId) {
							summary.failed++;
							errors.push({
								row: rowIndex,
								employeeId: emp.employeeId,
								message: `Missing references: dept=${departmentId ? "ok" : "missing"}, pos=${positionId ? "ok" : "missing"}`,
							});
							return;
						}

						const existedBefore = lookups.employeeIdMap.has(emp.employeeId);

						// Determine if employee is a manager based on hierarchy level
						const empRoleLevel = emp.levelRank ?? inferRoleLevel(emp.role);
						const isManager = empRoleLevel <= 2;

						if (existedBefore) {
							// -- UPDATE existing employee --------------------
							if (!config.skipDuplicates) {
								const existingId = lookups.employeeIdMap.get(emp.employeeId)!;
								const embeddedScheduleUpdate =
									(emp as any).embeddedSchedule !== undefined
										? { embeddedSchedule: (emp as any).embeddedSchedule }
										: {};
								await withPrismaRetry(
									`employee.update(batch-${batchNum}-${emp.employeeId})`,
									() =>
										prisma.employee.update({
											where: { id: existingId },
											data: {
												role: emp.role,
												departmentId,
												positionId,
												levelId,
												basicSalary: emp.basicSalary,
												currency: emp.currency,
												payFrequency: emp.payFrequency,
												employmentType: emp.employmentType,
												employmentStatus: emp.employmentStatus,
												workLocation: emp.workLocation,
												employmentHireDate: emp.employmentHireDate,
												employmentStartDate: (emp as any)
													.employmentStartDate,
												employmentTerminationDate: (emp as any)
													.employmentTerminationDate,
												deviceEmpId: (emp as any).deviceEmpId,
												isManager,
												...embeddedScheduleUpdate,
											},
										}),
								);
							}
							summary.skipped++;
						} else {
							// -- CREATE new employee -------------------------
							// Step A: Ensure a Person record exists (Employee.personId is required)
							let person = await withPrismaRetry(
								`person.findFirst(batch-${batchNum}-${emp.employeeId})`,
								() =>
									prisma.person.findFirst({
										where: {
											organizationId: config.organizationId,
											employeeId: emp.employeeId,
											isDeleted: false,
										},
									}),
							);
							if (!person) {
								person = await withPrismaRetry(
									`person.create(batch-${batchNum}-${emp.employeeId})`,
									() =>
										prisma.person.create({
											data: {
												organizationId: config.organizationId,
												employeeId: emp.employeeId,
												personalInfo: {
													firstName: emp.firstName,
													middleName: emp.middleName,
													lastName: emp.lastName,
													...(((emp as any).personalInfo || {}) as any),
												},
												contactInfo: {
													email: emp.email,
													phones: [],
													address: [],
													...(((emp as any).contactInfo || {}) as any),
												},
											},
										}),
								);
							} else {
								await withPrismaRetry(
									`person.update(batch-${batchNum}-${emp.employeeId})`,
									() =>
										prisma.person.update({
											where: { id: person!.id },
											data: {
												personalInfo: {
													firstName: emp.firstName,
													middleName: emp.middleName,
													lastName: emp.lastName,
													...(((emp as any).personalInfo || {}) as any),
												},
												contactInfo: {
													email: emp.email,
													phones: [],
													address: [],
													...(((emp as any).contactInfo || {}) as any),
												},
											},
										}),
								);
							}

							// Step B: Create the Employee linked to the Person
							const createdEmployee = await withPrismaRetry(
								`employee.create(batch-${batchNum}-${emp.employeeId})`,
								() =>
									prisma.employee.create({
										data: {
											organizationId: config.organizationId,
											employeeId: emp.employeeId,
											role: emp.role,
											departmentId,
											positionId,
											levelId,
											personId: person.id,
											basicSalary: emp.basicSalary,
											currency: emp.currency,
											payFrequency: emp.payFrequency,
											employmentType: emp.employmentType,
											employmentStatus: emp.employmentStatus,
											workLocation: emp.workLocation,
											employmentHireDate: emp.employmentHireDate,
											employmentStartDate: (emp as any).employmentStartDate,
											employmentTerminationDate: (emp as any)
												.employmentTerminationDate,
											deviceEmpId: (emp as any).deviceEmpId,
											isManager,
											...((emp as any).embeddedSchedule !== undefined
												? { embeddedSchedule: (emp as any).embeddedSchedule }
												: {}),
											leaveBalances: [],
											employmentHistory: [],
										},
									}),
							);

							summary.created++;
							createdEmployees.push({
								employeeDbId: createdEmployee.id,
								employeeId: createdEmployee.employeeId,
								personId: person.id,
								role: createdEmployee.role,
								email: emp.email,
								sourceRow: Number((emp as any).sourceRow) || undefined,
							});
							lookups.employeeIdMap.set(
								createdEmployee.employeeId,
								createdEmployee.id,
							);
						}
					} catch (singleError: any) {
						summary.failed++;
						errors.push({
							row: rowIndex,
							employeeId: emp.employeeId,
							message: singleError.message,
						});
						migrationLogger.error(
							`Failed to insert employee ${emp.employeeId}: ${singleError.message}`,
						);
					}
				});

				const batchMs = Date.now() - batchStart;
				migrationLogger.info(
					`  Batch ${batchNum}/${totalBatches} done in ${batchMs}ms (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`,
				);

				// Cooldown between batches - let Atlas connection pool recover
				if (i + batchSize < sorted.length) {
					await sleep(BATCH_COOLDOWN_MS);
				}
			}
		}

		return {
			...summary,
			createdEmployees,
		};
	};

	// --- Step 7: Link reportTo references --------------------
	// Second pass: now that all employees exist, link the reporting hierarchy

	const rollbackStrictFailedEmployees = async (params: {
		organizationId: string;
		createdEmployees: CreatedEmployeePostActionInput[];
		failures: PostActionFailure[];
		errors: MigrationError[];
	}): Promise<number> => {
		if (params.failures.length === 0) return 0;

		const createdByEmployeeId = new Map(
			params.createdEmployees.map((created) => [created.employeeId, created]),
		);
		let rolledBackCount = 0;

		for (const failure of params.failures) {
			const created = createdByEmployeeId.get(failure.employeeId);
			if (!created) continue;

			try {
				const rolledBack = await withPrismaRetry(
					`strictRollback(${created.employeeId})`,
					() =>
						prisma.$transaction(async (tx) => {
							const employee = await tx.employee.findFirst({
								where: {
									id: created.employeeDbId,
									organizationId: params.organizationId,
								},
								select: {
									id: true,
									personId: true,
								},
							});

							if (!employee) return false;

							// Break reportTo links that point to this row before deleting.
							await tx.employee.updateMany({
								where: {
									organizationId: params.organizationId,
									reportToId: employee.id,
								},
								data: {
									reportToId: null,
								},
							});

							const processes = await tx.boardingProcess.findMany({
								where: {
									organizationId: params.organizationId,
									employeeId: employee.id,
								},
								select: { id: true },
							});
							const processIds = processes.map((process) => process.id);

							if (processIds.length > 0) {
								await tx.checklistItem.deleteMany({
									where: {
										organizationId: params.organizationId,
										processId: { in: processIds },
									},
								});
							}

							await tx.boardingProcess.deleteMany({
								where: {
									organizationId: params.organizationId,
									employeeId: employee.id,
								},
							});

							await tx.calendarItem.deleteMany({
								where: {
									organizationId: params.organizationId,
									assignedEmployeeId: employee.id,
								},
							});

							await tx.employee.deleteMany({
								where: {
									id: employee.id,
									organizationId: params.organizationId,
								},
							});

							const remainingEmployees = await tx.employee.count({
								where: { personId: employee.personId },
							});
							if (remainingEmployees === 0) {
								await tx.person.deleteMany({
									where: {
										id: employee.personId,
										organizationId: params.organizationId,
									},
								});
							}

							return true;
						}),
				);

				if (rolledBack) {
					rolledBackCount += 1;
				}
			} catch (rollbackError: any) {
				const row =
					typeof failure.row === "number" && Number.isFinite(failure.row)
						? failure.row
						: 0;
				params.errors.push({
					row,
					employeeId: failure.employeeId,
					field: "strictRollback",
					message: `Failed to rollback strict-failed row: ${
						rollbackError?.message || String(rollbackError)
					}`,
				});
			}
		}

		return rolledBackCount;
	};

	const linkReportToReferences = async (
		config: MigrationConfig,
		employees: EmployeeRowInput[],
	): Promise<number> => {
		const employeesWithReports = employees.filter((e) => e.reportToEmployeeId);
		if (employeesWithReports.length === 0) return 0;

		migrationLogger.info(`Linking ${employeesWithReports.length} reportTo references...`);

		// Build fresh lookup
		const allEmployees = await withPrismaRetry("employee.findMany(reportToLookup)", () =>
			prisma.employee.findMany({
				where: { organizationId: config.organizationId },
				select: { id: true, employeeId: true },
			}),
		);
		const empIdMap = new Map(allEmployees.map((e) => [e.employeeId, e.id]));

		let linked = 0;
		const batchSize = config.batchSize;

		for (let i = 0; i < employeesWithReports.length; i += batchSize) {
			const batch = employeesWithReports.slice(i, i + batchSize);
			const batchNum = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(employeesWithReports.length / batchSize);
			const batchStart = Date.now();

			await runWithConcurrency(batch, MAX_WRITE_CONCURRENCY, async (emp) => {
				const employeeDbId = empIdMap.get(emp.employeeId);
				const reportToDbId = empIdMap.get(emp.reportToEmployeeId!);

				if (!employeeDbId || !reportToDbId) return;

				await withPrismaRetry(`employee.update(reportTo-${emp.employeeId})`, () =>
					prisma.employee.update({
						where: { id: employeeDbId },
						data: { reportToId: reportToDbId },
					}),
				);

				linked++;
			});

			const batchMs = Date.now() - batchStart;
			migrationLogger.info(
				`  reportTo batch ${batchNum}/${totalBatches} done in ${batchMs}ms (linked=${linked})`,
			);

			// Cooldown between batches
			if (i + batchSize < employeesWithReports.length) {
				await sleep(BATCH_COOLDOWN_MS);
			}
		}

		migrationLogger.info(`Linked ${linked} reportTo references`);
		return linked;
	};

	// --- Get Migration Status / Stats ------------------------

	const getMigrationStats = async (organizationId: string) => {
		const [
			departmentCount,
			positionCount,
			levelCount,
			employeeCount,
			employeesByDept,
			employeesByLevel,
		] = await Promise.all([
			withPrismaRetry("department.count(stats)", () =>
				prisma.department.count({ where: { organizationId, isDeleted: false } }),
			),
			withPrismaRetry("position.count(stats)", () =>
				prisma.position.count({ where: { organizationId, isDeleted: false } }),
			),
			withPrismaRetry("level.count(stats)", () =>
				prisma.level.count({ where: { organizationId, isDeleted: false } }),
			),
			withPrismaRetry("employee.count(stats)", () =>
				prisma.employee.count({ where: { organizationId, isDeleted: false } }),
			),
			withPrismaRetry("employee.groupBy(departmentId)", () =>
				prisma.employee.groupBy({
					by: ["departmentId"],
					where: { organizationId, isDeleted: false },
					_count: true,
				}),
			),
			withPrismaRetry("employee.groupBy(levelId)", () =>
				prisma.employee.groupBy({
					by: ["levelId"],
					where: { organizationId, isDeleted: false },
					_count: true,
				}),
			),
		]);

		// Enrich with department names
		const deptIds = employeesByDept.map((d) => d.departmentId);
		const departments = await withPrismaRetry("department.findMany(statsEnrich)", () =>
			prisma.department.findMany({
				where: { id: { in: deptIds } },
				select: { id: true, name: true, code: true },
			}),
		);
		const deptMap = new Map(departments.map((d) => [d.id, d]));

		// Enrich with level names
		const lvlIds = employeesByLevel.map((l) => l.levelId).filter(Boolean) as string[];
		const levels = await withPrismaRetry("level.findMany(statsEnrich)", () =>
			prisma.level.findMany({
				where: { id: { in: lvlIds } },
				select: { id: true, name: true, rank: true },
			}),
		);
		const lvlMap = new Map(levels.map((l) => [l.id, l]));

		return {
			totals: {
				departments: departmentCount,
				positions: positionCount,
				levels: levelCount,
				employees: employeeCount,
			},
			hierarchy: {
				byDepartment: employeesByDept.map((d) => ({
					department: deptMap.get(d.departmentId) || { id: d.departmentId },
					employeeCount: d._count,
				})),
				byLevel: employeesByLevel.map((l) => ({
					level: l.levelId
						? lvlMap.get(l.levelId) || { id: l.levelId }
						: { id: null, name: "Unassigned" },
					employeeCount: l._count,
				})),
			},
		};
	};

	// --- Get Hierarchy Tree ----------------------------------
	// Returns the department -> level -> employees tree structure
	// Leverages the compound index @@index([departmentId, levelId])

	const getHierarchyTree = async (organizationId: string, departmentCode?: string) => {
		const whereClause: any = {
			organizationId,
			isDeleted: false,
		};

		if (departmentCode) {
			const dept = await withPrismaRetry(`department.findFirst(${departmentCode})`, () =>
				prisma.department.findFirst({
					where: { organizationId, code: departmentCode },
				}),
			);
			if (dept) whereClause.departmentId = dept.id;
		}

		const employees = await withPrismaRetry("employee.findMany(hierarchy)", () =>
			prisma.employee.findMany({
				where: whereClause,
				include: {
					department: { select: { id: true, name: true, code: true } },
					position: { select: { id: true, title: true, code: true } },
					level: { select: { id: true, name: true, rank: true } },
				},
				orderBy: [{ departmentId: "asc" }, { level: { rank: "asc" } }],
			}),
		);

		// Build tree structure grouped by department -> level
		const tree: Record<string, Record<string, any[]>> = {};

		for (const emp of employees) {
			const deptKey = emp.department?.name || "Unknown";
			const levelKey = emp.level?.name || "Unassigned";

			if (!tree[deptKey]) tree[deptKey] = {};
			if (!tree[deptKey][levelKey]) tree[deptKey][levelKey] = [];

			tree[deptKey][levelKey].push({
				id: emp.id,
				employeeId: emp.employeeId,
				role: emp.role,
				position: emp.position?.title,
				level: emp.level?.name,
				levelRank: emp.level?.rank,
			});
		}

		return tree;
	};

	return {
		executeMigration,
		getMigrationStats,
		getHierarchyTree,
	};
};
