/**
 * Period-scoped schedule change deltas for Run Payroll (source of truth:
 * EmployeeScheduleHistory from WorkSharing backfill / schedule reassignment).
 */
import type { PrismaClient } from "../generated/prisma";

export type PayrollScheduleDeltaRow = {
	historyId: string;
	employeeId: string;
	employeeCode: string | null;
	name: string;
	action: string;
	effectiveAt: string | null;
	createdAt: string;
	reason: string | null;
	beforeTemplateCode: string | null;
	afterTemplateCode: string | null;
	sourceWorkbook: string | null;
	sourceSheet: string | null;
	sourceRow: number | null;
	isWorkshare: boolean;
};

export type PayrollScheduleDeltaResult = {
	period: {
		id: string;
		code: string | null;
		startDate: string;
		endDate: string;
	};
	summary: {
		totalDeltas: number;
		workshareDeltas: number;
		otherDeltas: number;
		uniqueEmployees: number;
		templateChanges: number;
		alreadySameSkipped: number;
	};
	rows: PayrollScheduleDeltaRow[];
	pagination: {
		page: number;
		limit: number;
		totalItems: number;
		totalPages: number;
		hasNextPage: boolean;
	};
	truth: {
		source: string;
		note: string;
	};
};

const asRecord = (v: unknown): Record<string, any> =>
	v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};

const templateCodeOf = (schedule: unknown): string | null => {
	const s = asRecord(schedule);
	const code = s.templateCode || s.code || null;
	return code ? String(code) : null;
};

const employeeDisplayName = (employee: any): string => {
	const pi = employee?.person?.personalInfo || {};
	const parts = [pi.firstName, pi.middleName, pi.lastName, pi.suffix].filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
};

export async function getPayrollPeriodScheduleDeltas(
	prisma: PrismaClient,
	params: {
		payrollPeriodId: string;
		organizationId: string;
		page?: number;
		limit?: number;
		onlyWorkshare?: boolean;
	},
): Promise<PayrollScheduleDeltaResult> {
	const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
	const limit =
		params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), 100) : 25;
	const onlyWorkshare = params.onlyWorkshare !== false;

	const period = await prisma.payrollPeriod.findFirst({
		where: {
			id: params.payrollPeriodId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			startDate: true,
			endDate: true,
		},
	});
	if (!period) {
		throw new Error(`Payroll period not found: ${params.payrollPeriodId}`);
	}

	// Window: history created during/after period start (workshare often applied later)
	// or effectiveAt overlapping the cutoff. Prefer DB-side workshare filter (fast path).
	const windowStart = new Date(period.startDate);
	windowStart.setUTCDate(windowStart.getUTCDate() - 7);

	// Window OR: effective in cutoff, or created after period start−7d (late backfill).
	const windowOr = [
		{ effectiveAt: { gte: windowStart, lte: period.endDate } },
		{ createdAt: { gte: windowStart } },
	];

	// WorkSharing backfill reason is always "…WorkSharingSchedule…".
	const workshareReasonOr = [
		{ reason: { contains: "WorkSharing" } },
		{ reason: { contains: "Work Sharing" } },
		{ reason: { contains: "worksharing" } },
	];

	const baseWhere = {
		organizationId: params.organizationId,
		OR: windowOr,
	};

	const workshareWhere = {
		organizationId: params.organizationId,
		AND: [{ OR: windowOr }, { OR: workshareReasonOr }],
	};

	const listWhere = onlyWorkshare ? workshareWhere : baseWhere;

	// Summary counts without pulling 5k join rows (stable over flaky SSH tunnels).
	const [totalDeltasRaw, workshareDeltasRaw, uniqueEmpRows, pageHistories] =
		await Promise.all([
			onlyWorkshare
				? Promise.resolve(-1)
				: prisma.employeeScheduleHistory.count({ where: baseWhere as any }),
			prisma.employeeScheduleHistory.count({ where: workshareWhere as any }),
			prisma.employeeScheduleHistory.findMany({
				where: listWhere as any,
				select: { employeeId: true },
				distinct: ["employeeId"],
				take: 5000,
			}),
			prisma.employeeScheduleHistory.findMany({
				where: listWhere as any,
				select: {
					id: true,
					employeeId: true,
					action: true,
					effectiveAt: true,
					createdAt: true,
					reason: true,
					beforeSchedule: true,
					afterSchedule: true,
					metadata: true,
					employee: {
						select: {
							id: true,
							employeeId: true,
							person: { select: { personalInfo: true } },
						},
					},
				},
				orderBy: [{ createdAt: "desc" }],
				// Page slice only — do not hydrate thousands of rows for accordion preview.
				skip: (page - 1) * limit,
				take: limit,
			}),
		]);

	const workshareDeltas = workshareDeltasRaw;
	const totalItems = onlyWorkshare
		? workshareDeltas
		: Math.max(totalDeltasRaw, workshareDeltas);
	const uniqueEmployees = uniqueEmpRows.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / limit));
	const safePage = Math.min(page, totalPages);

	const rows: PayrollScheduleDeltaRow[] = [];
	let templateChangesOnPage = 0;
	for (const h of pageHistories) {
		const meta = asRecord(h.metadata);
		const reason = h.reason ? String(h.reason) : null;
		const sourceWorkbook = meta.sourceWorkbook ? String(meta.sourceWorkbook) : null;
		const isWorkshare =
			/worksharing|work.?sharing|WorkSharing/i.test(String(reason || "")) ||
			/WorkSharing|worksharing|new-cutoff/i.test(String(sourceWorkbook || ""));
		const beforeTemplateCode = templateCodeOf(h.beforeSchedule);
		const afterTemplateCode = templateCodeOf(h.afterSchedule);
		if (beforeTemplateCode !== afterTemplateCode) templateChangesOnPage += 1;
		rows.push({
			historyId: h.id,
			employeeId: h.employeeId,
			employeeCode: h.employee?.employeeId || null,
			name: employeeDisplayName(h.employee),
			action: String(h.action || ""),
			effectiveAt: h.effectiveAt ? h.effectiveAt.toISOString() : null,
			createdAt: h.createdAt.toISOString(),
			reason,
			beforeTemplateCode,
			afterTemplateCode,
			sourceWorkbook,
			sourceSheet: meta.sourceSheet ? String(meta.sourceSheet) : null,
			sourceRow:
				typeof meta.sourceRow === "number"
					? meta.sourceRow
					: meta.sourceRow
						? Number(meta.sourceRow)
						: null,
			isWorkshare,
		});
	}

	// Approximate templateChanges from page ratio when full scan would be too heavy.
	const templateChanges =
		rows.length > 0
			? Math.round((templateChangesOnPage / rows.length) * totalItems)
			: 0;

	return {
		period: {
			id: period.id,
			code: period.code || null,
			startDate: period.startDate.toISOString(),
			endDate: period.endDate.toISOString(),
		},
		summary: {
			totalDeltas: totalItems,
			workshareDeltas,
			otherDeltas: totalItems - workshareDeltas,
			uniqueEmployees,
			templateChanges,
			alreadySameSkipped: 0,
		},
		rows,
		pagination: {
			page: safePage,
			limit,
			totalItems,
			totalPages,
			hasNextPage: safePage < totalPages,
		},
		truth: {
			source: "EmployeeScheduleHistory (workshare backfill + schedule reassignment)",
			note:
				"Deltas are audit rows from schedule assignment history. WorkSharing apply writes action assigned/reassigned with reason containing WorkSharingSchedule. Already-matching schedules are not written as history (count as skipped in backfill stats, not here).",
		},
	};
}
