import cron from "node-cron";
import { getEligibilityCandidates } from "../../helper/eligibility.helper";
import { prisma } from "../../config/database";
import { redisClient } from "../../config/redis";
import {
	buildAutoEvaluateProposals,
	DISCIPLINARY_AUTO_OFFENSE_TYPE,
	DISCIPLINARY_AUTO_RULE_VERSION,
	DISCIPLINARY_ESCALATION_LOOKBACK_DAYS,
} from "../../helper/disciplinary-escalation.helper";
import { isScheduledWorkday } from "../../helper/day-status-resolution.helper";

/**
 * Auto-file trigger threshold. Operator requirement 2026-09-02: when an
 * employee accumulates this many evidenced absent days in an occurrence,
 * the app automatically files a DRAFT disciplinary action for HR review.
 */
export const DISCIPLINARY_AUTO_MIN_ABSENT_DAYS = 3;

export const initCronJobs = () => {
	console.log("Initializing Cron Jobs...");

	// 1. Eligibility Check (Runs every minute for testing)
	cron.schedule("* * * * *", async () => {
		console.log("[Cron] Checking Employee Eligibility...");
		try {
			// Fetch all organizations (assuming multi-tenant)
			// If Organization model doesn't exist, we can group employees by organizationId
			// For now, let's try to fetch distinct organizationIds from Employee table to be safe
			const employees = await prisma.employee.findMany({
				select: { organizationId: true },
				distinct: ["organizationId"],
			});

			const orgIds = employees.map((e) => e.organizationId);

			for (const orgId of orgIds) {
				if (!orgId) continue;
				console.log(`Checking Organization: ${orgId}`);
				const candidates = await getEligibilityCandidates(prisma, orgId);

				if (candidates.length > 0) {
					console.log(
						`[Eligibility] Found ${candidates.length} candidates for Org ${orgId}`,
					);
					// Log details for debugging
					candidates.forEach((c) => {
						console.log(
							`   - ${c.employeeName} (${c.eligibleFor}): ${c.eligibilityReason}`,
						);
					});

					// Publish event to Redis for API to pick up and emit via Socket.IO
					try {
						await redisClient.publish(
							"events:eligibility-updated",
							JSON.stringify({
								organizationId: orgId,
								count: candidates.length,
								timestamp: new Date().toISOString(),
							}),
						);
						console.log(`Published eligibility-updated event for Org ${orgId}`);
					} catch (redisError) {
						console.error("Failed to publish Redis event:", redisError);
					}
				} else {
					console.log(`   No candidates found.`);
				}
			}
		} catch (error) {
			console.error("[Cron] Error checking eligibility:", error);
		}
	});

	// 2. Daily disciplinary auto-escalation (runs every 60 minutes)
	cron.schedule("0 * * * *", async () => {
		console.log("[Cron] Running disciplinary auto-escalation...");
		try {
			const orgRows = await prisma.employee.findMany({
				select: { organizationId: true },
				distinct: ["organizationId"],
				where: { organizationId: { not: null } },
			});
			const orgIds = orgRows.map((e) => e.organizationId).filter(Boolean) as string[];

			for (const organizationId of orgIds) {
				await runDisciplinaryAutoEscalation(organizationId);
			}
		} catch (error) {
			console.error("[Cron] Error in disciplinary auto-escalation:", error);
		}
	});

	// 3. Daily midnight maintenance
	cron.schedule("0 0 * * *", async () => {
		console.log("Running daily midnight maintenance...");
		try {
			console.log("Daily maintenance completed.");
		} catch (error) {
			console.error("Error in daily maintenance:", error);
		}
	});

	console.log("Cron Jobs initialized and scheduled.");
};

/**
 * Scan the last 30 days for evidenced absences and file DRAFT disciplinary cases.
 * Dedups against existing auto-filed cases so re-runs are safe.
 *
 * Evidence per operator decision 2026-09-03: a scheduled workday (Mon-Sat) whose
 * AttendanceObligation stays EXPECTED/ABSENT with NO biometric punch counts as an
 * evidenced absent day (day-status REVIEW_NO_EVIDENCE class). Occurrence clusters
 * with >= DISCIPLINARY_AUTO_MIN_ABSENT_DAYS evidenced days auto-file DRAFT cases
 * that HR confirms on the /hr/disciplinary-action page. Sundays, tenure-out days,
 * leave/holiday/rest/cancelled obligations, punch days, and effective ABSENT
 * timesheet-line duplicates are excluded.
 */
export async function runDisciplinaryAutoEscalation(organizationId: string): Promise<void> {
	const dateTo = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
	const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
	const lookbackStart = new Date(Date.now() - DISCIPLINARY_ESCALATION_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

	// Load employees with tenure and code mapping
	const employees = await prisma.employee.findMany({
		where: { organizationId, isDeleted: false },
		select: { id: true, employeeId: true, employmentHireDate: true, employmentTerminationDate: true, person: { select: { personalInfo: true } } },
	});
	const employeeIdByCode = new Map<string, { id: string; name: string; tenureStart?: string | null; tenureEnd?: string | null }>();
	const codeByEmployeeId = new Map<string, string>();
	for (const e of employees) {
		const code = String(e.employeeId || "").trim().padStart(5, "0");
		if (!code) continue;
		const info = (e.person && e.person.personalInfo) || {};
		let term = e.employmentTerminationDate ? new Date(e.employmentTerminationDate).toISOString().slice(0, 10) : null;
		if (term && new Date(`${term}T00:00:00Z`).getUTCFullYear() <= 1971) term = null;
		employeeIdByCode.set(code, {
			id: e.id,
			name: [info.firstName, info.lastName].filter(Boolean).join(" ").trim() || code,
			tenureStart: e.employmentHireDate ? new Date(e.employmentHireDate).toISOString().slice(0, 10) : null,
			tenureEnd: term,
		});
		codeByEmployeeId.set(e.id, code);
	}

	// Evidence source 1: effective ABSENT timesheet lines
	const absentLines = await prisma.timesheetline.findMany({
		where: {
			organizationId,
			isDeleted: false,
			isEffective: true,
			status: "ABSENT",
			date: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) },
		},
		select: { employeeId: true, date: true },
	});
	const dateKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
	const absentLineKeys = new Set(absentLines.map((l) => `${l.employeeId}|${dateKey(l.date)}`));

	// Evidence source 2: Attendance punches in the window (to exclude present days)
	const punches = await prisma.attendance.findMany({
		where: { organizationId, isDeleted: false, date: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) } },
		select: { employeeId: true, date: true },
	});
	const punchKeys = new Set(punches.map((p) => `${p.employeeId}|${dateKey(p.date)}`));

	// Evidence source 3: AttendanceObligation — scheduled workdays (EXPECTED or ABSENT) without a punch,
	// excluding Sundays, tenure-out days, and days already covered by effective ABSENT timesheet lines.
	const obligations = await prisma.attendanceObligation.findMany({
		where: {
			organizationId,
			isDeleted: false,
			status: { in: ["EXPECTED", "ABSENT"] },
			date: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) },
		},
		select: { employeeId: true, date: true },
	});

	const obligationAbsentDays: Array<{ employeeId: string; date: string }> = [];
	for (const o of obligations) {
		const d = dateKey(o.date);
		const empKey = `${o.employeeId}|${d}`;

		// Skip if already covered by an effective ABSENT timesheet line
		if (absentLineKeys.has(empKey)) continue;
		// Skip if the employee has a biometric punch that day
		if (punchKeys.has(empKey)) continue;
		// Skip Sunday (rest day)
		if (!isScheduledWorkday(d)) continue;
		// Skip tenure-out days
		const code = codeByEmployeeId.get(o.employeeId);
		if (!code) continue;
		const emp = employeeIdByCode.get(code);
		if (emp && (emp.tenureStart && d < emp.tenureStart)) continue;
		if (emp && (emp.tenureEnd && d > emp.tenureEnd)) continue;

		obligationAbsentDays.push({ employeeId: o.employeeId, date: d });
	}

	const allAbsentRows = [
		...absentLines.map((l) => ({ employeeId: l.employeeId, date: dateKey(l.date) })),
		...obligationAbsentDays,
	];

	if (!allAbsentRows.length) {
		console.log(`[DisciplinaryAuto] ${organizationId}: no absent days found`);
		return;
	}

	const evidencedRows = allAbsentRows
		.map((r) => ({ code: codeByEmployeeId.get(r.employeeId) || "", date: r.date }))
		.filter((r) => r.code);

	// Prior attempts: non-dismissed ABSENTEEISM DAs in lookback window
	const priorCases = await prisma.disciplinaryAction.findMany({
		where: {
			organizationId,
			isDeleted: false,
			status: { not: "DISMISSED" },
			offenseType: { equals: DISCIPLINARY_AUTO_OFFENSE_TYPE, mode: "insensitive" },
			offenseDate: { gte: new Date(`${lookbackStart}T00:00:00Z`), lt: new Date(`${dateFrom}T00:00:00Z`) },
		},
		select: { employeeId: true },
	});
	const priorAttemptsByCode = new Map<string, number>();
	for (const c of priorCases) {
		const code = codeByEmployeeId.get(c.employeeId);
		if (!code) continue;
		priorAttemptsByCode.set(code, (priorAttemptsByCode.get(code) || 0) + 1);
	}

	const proposals = buildAutoEvaluateProposals({
		evidencedAbsentRows: evidencedRows,
		employeeIdByCode,
		priorAttemptsByCode,
	});

	// Dedup against existing auto-filed cases in the window
	const existingAuto = await prisma.disciplinaryAction.findMany({
		where: {
			organizationId,
			isDeleted: false,
			offenseType: { equals: DISCIPLINARY_AUTO_OFFENSE_TYPE, mode: "insensitive" },
			offenseDate: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) },
		},
		select: { metadata: true, employeeId: true, offenseDate: true },
	});
	const existingKeys = new Set<string>();
	for (const c of existingAuto) {
		const meta = c.metadata as Record<string, unknown> | null;
		const autoRule = meta && typeof meta === "object" ? (meta.autoRule as Record<string, unknown> | null) : null;
		if (autoRule && typeof autoRule.dedupKey === "string") {
			existingKeys.add(autoRule.dedupKey);
		} else {
			const code = codeByEmployeeId.get(c.employeeId);
			if (code) existingKeys.add(`${code}|${new Date(c.offenseDate).toISOString().slice(0, 10)}`);
		}
	}

	const actionable = proposals
		.filter((p) => p.absentDays >= DISCIPLINARY_AUTO_MIN_ABSENT_DAYS)
		.filter((p) => !existingKeys.has(p.dedupKey) && !existingKeys.has(`${p.employeeCode}|${p.offenseDate}`));
	if (!actionable.length) {
		console.log(`[DisciplinaryAuto] ${organizationId}: ${proposals.length} clusters, ${proposals.filter((p) => p.absentDays < DISCIPLINARY_AUTO_MIN_ABSENT_DAYS).length} below ${DISCIPLINARY_AUTO_MIN_ABSENT_DAYS}-day threshold, rest deduped`);
		return;
	}

	let created = 0;
	for (const p of actionable) {
		await prisma.disciplinaryAction.create({
			data: {
				organizationId,
				employeeId: p.employeeId,
				employeeName: p.employeeName,
				offenseType: p.offenseType,
				offenseDate: new Date(`${p.offenseDate}T00:00:00Z`),
				description: p.description,
				severity: p.severity,
				status: "DRAFT",
				createdByUserId: "auto-escalation-cron",
				metadata: {
					autoRule: {
						version: DISCIPLINARY_AUTO_RULE_VERSION,
						dedupKey: p.dedupKey,
						source: "attendance-auto-escalation",
						evaluatedAt: new Date().toISOString(),
						window: { start: dateFrom, end: dateTo },
						occurrenceWindow: p.occurrenceWindow,
						absentDays: p.absentDays,
						baseSeverity: p.baseSeverity,
						priorAttempts: p.priorAttempts,
						evidenceClasses: p.evidenceClasses,
					},
				},
			},
		});
		created += 1;
	}

	console.log(`[DisciplinaryAuto] ${organizationId}: ${created} DRAFT case(s) filed from ${actionable.length} actionable proposals`);
}
