import { Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "../../generated/prisma";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import {
	CreateEmployeeScheduleSchema,
	UpdateEmployeeScheduleSchema,
} from "../../zod/employeeSchedule.zod";
import {
	appendEmployeeScheduleHistory,
	collectShiftTypeIdsFromEmployeeScheduleData,
	copyTemplateToEmployeeEmbeddedSchedule,
	resolveEffectiveShiftFromEmployeeData,
} from "../../helper/employee-schedule.helper";
import { invalidateCache } from "../../middleware/cache";
import { recomputeAttendanceObligationsForRange } from "../../helper/attendance-obligation.helper";

const getOrganizationId = (req: Request): string | null =>
	((req as any).organizationId ||
		(req as any)?.user?.organizationId ||
		(req as any)?.user?.organization ||
		null) as string | null;

const parseDateValue = (value: unknown): Date | null => {
	if (!value) return null;
	const parsed = new Date(String(value));
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
};

const toUtcStartOfDay = (value: Date) => {
	const normalized = new Date(value);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
};

const getNextMondayUtc = (value: Date = new Date()) => {
	const current = toUtcStartOfDay(value);
	const day = current.getUTCDay();
	const daysUntilNextMonday = day === 1 ? 7 : day === 0 ? 1 : 8 - day;
	current.setUTCDate(current.getUTCDate() + daysUntilNextMonday);
	return current;
};

const isMondayUtc = (value: Date) => toUtcStartOfDay(value).getUTCDay() === 1;

const resolveEffectiveStartDate = (value?: Date | null) => value || getNextMondayUtc();

const normalizeManualSnapshot = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object") return null;
	const normalized = {
		...snapshot,
		breakMinutes:
			snapshot.breakMinutes === null || snapshot.breakMinutes === undefined
				? 0
				: Math.max(0, Number(snapshot.breakMinutes)),
		graceLateMinutes:
			snapshot.graceLateMinutes === null || snapshot.graceLateMinutes === undefined
				? 0
				: Math.max(0, Number(snapshot.graceLateMinutes)),
		graceEarlyOutMinutes:
			snapshot.graceEarlyOutMinutes === null || snapshot.graceEarlyOutMinutes === undefined
				? 0
				: Math.max(0, Number(snapshot.graceEarlyOutMinutes)),
		isOvernight: Boolean(snapshot.isOvernight),
		isOff: Boolean(snapshot.isOff),
		timeSlots: Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [],
	} as any;
	if (
		(!normalized.timeSlots || normalized.timeSlots.length === 0) &&
		normalized.startTime &&
		normalized.endTime
	) {
		normalized.timeSlots = [
			{
				type: "work",
				label: "Work",
				startTime: normalized.startTime,
				endTime: normalized.endTime,
			},
		];
	}
	return normalized;
};

const buildManualEmbeddedSchedule = (params: {
	shiftSnapshot: any;
	shiftTypeId?: string | null;
	startDate?: Date | null;
	assignedByEmployeeId?: string | null;
	reason?: string | null;
}) => ({
	templateId: null,
	templateCode: null,
	templateName: params.shiftSnapshot?.name || params.shiftSnapshot?.code || "Manual Shift",
	cycleDays: 1,
	pattern: [
		{
			day: 1,
			shiftTypeId: params.shiftTypeId || null,
			shiftSnapshot: params.shiftSnapshot,
		},
	],
	effectiveStartDate: params.startDate || new Date(),
	assignedAt: new Date(),
	assignedByEmployeeId: params.assignedByEmployeeId || null,
	reason: params.reason || null,
	version: 1,
});

const summarizePrimarySnapshot = (embeddedSchedule: any) => {
	const pattern = Array.isArray(embeddedSchedule?.pattern) ? embeddedSchedule.pattern : [];
	const first = pattern.find((item: any) => Number(item?.day) === 1) || pattern[0] || null;
	return first?.shiftSnapshot || null;
};

export const controller = (prisma: PrismaClient) => {
	const buildCalendarDays = async (params: {
		organizationId: string;
		employeeId: string;
		start: Date;
		end: Date;
	}) => {
		const employee = await (prisma as any).employee.findFirst({
			where: {
				id: params.employeeId,
				organizationId: params.organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				employeeId: true,
				organizationId: true,
				embeddedSchedule: true,
				employmentStartDate: true,
				employmentHireDate: true,
				scheduleHistoryRecords: {
					where: {
						organizationId: params.organizationId,
						effectiveAt: {
							lte: new Date(params.end),
						},
					},
					orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
					select: {
						effectiveAt: true,
						createdAt: true,
						afterSchedule: true,
					},
				},
				scheduleOverrides: {
					where: {
						isDeleted: false,
						date: {
							gte: new Date(params.start),
							lte: new Date(params.end),
						},
					},
					select: {
						id: true,
						date: true,
						shiftTypeId: true,
						shiftSnapshot: true,
						createdAt: true,
						updatedAt: true,
						isDeleted: true,
						shiftType: true,
					},
				},
			},
		});
		if (!employee) return [];

		const shiftTypeIds = collectShiftTypeIdsFromEmployeeScheduleData(employee);
		const shiftTypes =
			shiftTypeIds.length > 0
				? await (prisma as any).shiftType.findMany({
						where: {
							organizationId: params.organizationId,
							isDeleted: false,
							id: { in: shiftTypeIds },
						},
					})
				: [];
		const shiftTypeById = new Map<string, any>(
			shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
		);

		const days: any[] = [];
		const cursor = new Date(params.start);
		cursor.setUTCHours(0, 0, 0, 0);
		const endDate = new Date(params.end);
		endDate.setUTCHours(0, 0, 0, 0);

		while (cursor <= endDate) {
			const dayStart = new Date(cursor);
			const shift = resolveEffectiveShiftFromEmployeeData(employee, dayStart, shiftTypeById);
			days.push({
				date: dayStart.toISOString(),
				source: shift?.source || null,
				shift,
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}

		return days;
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = getOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization context is required", 401));
			return;
		}

		const validation = CreateEmployeeScheduleSchema.safeParse(req.body);
		if (!validation.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(validation.error.format()),
				),
			);
			return;
		}

		const targetEmployee = await (prisma as any).employee.findFirst({
			where: {
				id: validation.data.employeeId,
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				embeddedSchedule: true,
			},
		});
		if (!targetEmployee) {
			res.status(404).json(buildErrorResponse("Employee not found", 404));
			return;
		}

		let nextEmbeddedSchedule: any = null;
		let source: "template" | "manual" = "template";
		let scheduleTemplate: any = null;
		const effectiveStartDate = resolveEffectiveStartDate(validation.data.startDate);

		if (validation.data.scheduleTemplateId) {
			scheduleTemplate = await (prisma as any).scheduleTemplate.findFirst({
				where: {
					id: validation.data.scheduleTemplateId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					code: true,
					name: true,
					cycleDays: true,
					graceLateMinutes: true,
					graceEarlyOutMinutes: true,
					pattern: true,
				},
			});
			if (!scheduleTemplate) {
				res.status(404).json(buildErrorResponse("Schedule template not found", 404));
				return;
			}
			if (Number(scheduleTemplate.cycleDays || 0) % 7 === 0 && !isMondayUtc(effectiveStartDate)) {
				res.status(400).json(
					buildErrorResponse("Weekly schedules must start on a Monday (UTC).", 400),
				);
				return;
			}
			nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
				template: scheduleTemplate,
				assignedByEmployeeId: validation.data.createdByEmployeeId || null,
				effectiveStartDate,
				reason: validation.data.reason || null,
			});
			source = "template";
		} else {
			const manualSnapshot = normalizeManualSnapshot(validation.data.shiftSnapshot);
			if (!manualSnapshot) {
				res.status(400).json(buildErrorResponse("Manual shiftSnapshot is required", 400));
				return;
			}
			nextEmbeddedSchedule = buildManualEmbeddedSchedule({
				shiftSnapshot: manualSnapshot,
				shiftTypeId: validation.data.shiftTypeId || null,
				startDate: effectiveStartDate,
				assignedByEmployeeId: validation.data.createdByEmployeeId || null,
				reason: validation.data.reason || null,
			});
			source = "manual";
		}

		const created = await (prisma as any).employee.update({
			where: { id: targetEmployee.id },
			data: {
				embeddedSchedule: nextEmbeddedSchedule as any,
			},
			select: {
				id: true,
				embeddedSchedule: true,
			},
		});
		await appendEmployeeScheduleHistory(prisma, {
			organizationId,
			employeeId: validation.data.employeeId,
			action: targetEmployee.embeddedSchedule ? "reassigned" : "assigned",
			actorEmployeeId: validation.data.createdByEmployeeId || null,
			effectiveAt: effectiveStartDate,
			beforeSchedule: targetEmployee.embeddedSchedule || null,
			afterSchedule: nextEmbeddedSchedule,
			metadata: {
				source: "employeeSchedule.controller.create",
				assignmentMode: source,
				scheduleTemplateId: validation.data.scheduleTemplateId || null,
				shiftTypeId: validation.data.shiftTypeId || null,
			},
		});
		await recomputeAttendanceObligationsForRange(prisma, {
			organizationId,
			employeeId: validation.data.employeeId,
			fromDate: effectiveStartDate,
			toDate: new Date(effectiveStartDate.getTime() + 60 * 24 * 60 * 60 * 1000),
			reason: "ScheduleChanged",
		});
		await invalidateCache.byPattern(`cache:employee:byId:${validation.data.employeeId}:*`);
		await invalidateCache.byPattern("cache:employee:list:*");
		await invalidateCache.byPattern("cache:attendance:*");
		await invalidateCache.byPattern("cache:timesheet:*");
		await invalidateCache.byPattern("cache:metrics:*");
		const response = {
			id: created.id,
			employeeId: validation.data.employeeId,
			scheduleTemplateId: scheduleTemplate?.id || null,
			startDate: (
				nextEmbeddedSchedule?.effectiveStartDate ||
				effectiveStartDate
			).toISOString(),
			endDate: validation.data.endDate
				? new Date(validation.data.endDate).toISOString()
				: null,
			departmentId: validation.data.departmentId || null,
			createdByEmployeeId: validation.data.createdByEmployeeId || null,
			source,
			shiftTypeId: validation.data.shiftTypeId || null,
			shiftSnapshot: summarizePrimarySnapshot(nextEmbeddedSchedule),
			scheduleTemplate,
		};
		res.status(201).json(buildSuccessResponse("Employee schedule created", response, 201));
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = getOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization context is required", 401));
			return;
		}

		const employees = await (prisma as any).employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				embeddedSchedule: { not: Prisma.DbNull },
				...(req.query.employeeId ? { id: String(req.query.employeeId) } : {}),
			},
			select: {
				id: true,
				employeeId: true,
				departmentId: true,
				employmentStartDate: true,
				employmentHireDate: true,
				embeddedSchedule: true,
				person: {
					select: {
						personalInfo: true,
					},
				},
				scheduleHistoryRecords: {
					where: { organizationId },
					orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
					select: {
						id: true,
						action: true,
						effectiveAt: true,
						actorEmployeeId: true,
						reason: true,
						metadata: true,
						createdAt: true,
						beforeSchedule: true,
						afterSchedule: true,
					},
				},
			},
			orderBy: [{ employeeId: "asc" }],
		});

		const templateIds = Array.from(
			new Set(
				employees
					.flatMap((employee: any) => {
						const ids: string[] = [];
						const embeddedTemplateId = employee?.embeddedSchedule?.templateId;
						if (embeddedTemplateId) ids.push(String(embeddedTemplateId));
						for (const row of employee?.scheduleHistoryRecords || []) {
							const afterTemplateId = row?.afterSchedule?.templateId;
							const beforeTemplateId = row?.beforeSchedule?.templateId;
							if (afterTemplateId) ids.push(String(afterTemplateId));
							if (beforeTemplateId) ids.push(String(beforeTemplateId));
						}
						return ids;
					})
					.filter(Boolean),
			),
		);
		const scheduleTemplates = templateIds.length
			? await (prisma as any).scheduleTemplate.findMany({
					where: {
						organizationId,
						id: { in: templateIds },
						isDeleted: false,
					},
					select: {
						id: true,
						name: true,
						code: true,
						cycleDays: true,
						graceLateMinutes: true,
						graceEarlyOutMinutes: true,
						pattern: true,
					},
				})
			: [];
		const templateMap = new Map(
			scheduleTemplates.map((template: any) => [String(template.id), template]),
		);

		const buildTimelineWindows = (employee: any) => {
			const windows: Array<{
				snapshot: any;
				startDate: Date | null;
				endDate: Date | null;
				actorEmployeeId?: string | null;
				reason?: string | null;
				metadata?: any;
			}> = [];
			const historyRows = Array.isArray(employee?.scheduleHistoryRecords)
				? employee.scheduleHistoryRecords
				: [];
			if (historyRows.length > 0) {
				const earliest = historyRows[0];
				const earliestEffective = earliest?.effectiveAt ? new Date(earliest.effectiveAt) : null;
				if (earliest?.beforeSchedule && typeof earliest.beforeSchedule === "object") {
					windows.push({
						snapshot: earliest.beforeSchedule,
						startDate: earliest.beforeSchedule?.effectiveStartDate
							? new Date(earliest.beforeSchedule.effectiveStartDate)
							: employee?.employmentStartDate
								? new Date(employee.employmentStartDate)
								: employee?.employmentHireDate
									? new Date(employee.employmentHireDate)
									: earliestEffective
										? new Date(earliestEffective)
							: null,
						endDate: earliestEffective ? new Date(earliestEffective.getTime() - 1) : null,
						actorEmployeeId: earliest.actorEmployeeId || null,
						reason: earliest.reason || null,
						metadata: { ...(earliest.metadata || {}), source: "history.before" },
					});
				}
				for (let index = 0; index < historyRows.length; index += 1) {
					const row = historyRows[index];
					const next = historyRows[index + 1];
					if (!row?.afterSchedule || typeof row.afterSchedule !== "object") continue;
					const rowStart = row.effectiveAt
						? new Date(row.effectiveAt)
						: row.afterSchedule?.effectiveStartDate
							? new Date(row.afterSchedule.effectiveStartDate)
							: row?.createdAt
								? new Date(row.createdAt)
							: null;
					const rowEnd = next?.effectiveAt
						? new Date(new Date(next.effectiveAt).getTime() - 1)
						: null;
					windows.push({
						snapshot: row.afterSchedule,
						startDate: rowStart,
						endDate: rowEnd,
						actorEmployeeId: row.actorEmployeeId || null,
						reason: row.reason || null,
						metadata: row.metadata || null,
					});
				}
			}
			if (windows.length === 0 && employee?.embeddedSchedule) {
				const embedded = employee.embeddedSchedule;
				windows.push({
					snapshot: embedded,
					startDate: embedded?.effectiveStartDate
						? new Date(embedded.effectiveStartDate)
						: embedded?.assignedAt
							? new Date(embedded.assignedAt)
							: null,
					endDate: null,
					actorEmployeeId: embedded?.assignedByEmployeeId || null,
					reason: embedded?.reason || null,
					metadata: { source: "embedded.fallback" },
				});
			}
			return windows;
		};

		const schedules = employees
			.flatMap((employee: any) => {
				const windows = buildTimelineWindows(employee);
				return windows.map((window, index) => {
					const snapshot = window.snapshot || {};
					const templateId = snapshot?.templateId ? String(snapshot.templateId) : null;
					const scheduleTemplate: any = templateId
						? templateMap.get(templateId) || null
						: null;
					const source = templateId ? "template" : "manual";
					const scheduleCode = String(
						snapshot?.templateCode || snapshot?.templateName || "UNKNOWN",
					);
					const startDate = window.startDate || new Date();
					return {
						id: `${String(employee.id)}:${index}:${startDate.toISOString()}`,
						employeeId: String(employee.id),
						startDate: startDate.toISOString(),
						endDate: window.endDate ? window.endDate.toISOString() : null,
						departmentId: employee.departmentId || null,
						createdByEmployeeId: window.actorEmployeeId || null,
						source,
						reason: window.reason || snapshot?.reason || null,
						scheduleTemplateId: templateId,
						shiftTypeId: snapshot?.pattern?.[0]?.shiftTypeId
							? String(snapshot.pattern[0].shiftTypeId)
							: null,
						shiftSnapshot: summarizePrimarySnapshot(snapshot),
						scheduleTemplate,
						scheduleCode,
						scheduleName: String(
							snapshot?.templateName || scheduleTemplate?.name || "Unknown Schedule",
						),
						employee: {
							id: String(employee.id),
							employeeId: employee.employeeId,
							person: employee.person,
						},
						metadata: window.metadata || null,
					};
				});
			})
			.sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
		res.status(200).json(
			buildSuccessResponse("Employee schedules retrieved", { schedules }, 200),
		);
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = UpdateEmployeeScheduleSchema.safeParse(req.body);
		if (!validation.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(validation.error.format()),
				),
			);
			return;
		}

		const organizationId = getOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization context is required", 401));
			return;
		}
		let targetEmployeeId = req.params.id;
		let targetEmployee = await (prisma as any).employee.findFirst({
			where: {
				id: targetEmployeeId,
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				organizationId: true,
				embeddedSchedule: true,
			},
		});
		if (!targetEmployee) {
			const historyRecord = await (prisma as any).employeeScheduleHistory.findFirst({
				where: {
					id: req.params.id,
					organizationId,
				},
				select: {
					employeeId: true,
				},
			});
			if (historyRecord?.employeeId) {
				targetEmployeeId = String(historyRecord.employeeId);
				targetEmployee = await (prisma as any).employee.findFirst({
					where: {
						id: targetEmployeeId,
						organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						organizationId: true,
						embeddedSchedule: true,
					},
				});
			}
		}
		if (!targetEmployee) {
			res.status(404).json(buildErrorResponse("Employee schedule assignment not found", 404));
			return;
		}

		const hasTemplate = Boolean(validation.data.scheduleTemplateId);
		const hasManual = Boolean(validation.data.shiftSnapshot);
		if (hasTemplate && hasManual) {
			res.status(400).json(
				buildErrorResponse(
					"Provide either scheduleTemplateId or shiftSnapshot, not both.",
					400,
				),
			);
			return;
		}
		let source: "template" | "manual" = targetEmployee.embeddedSchedule?.templateId
			? "template"
			: "manual";
		let scheduleTemplate: any = null;
		let updatedEmbeddedSchedule = targetEmployee.embeddedSchedule || null;
		const effectiveStartDate =
			validation.data.startDate ||
			targetEmployee.embeddedSchedule?.effectiveStartDate ||
			getNextMondayUtc();

		if (hasTemplate) {
			scheduleTemplate = await (prisma as any).scheduleTemplate.findFirst({
				where: {
					id: validation.data.scheduleTemplateId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					code: true,
					name: true,
					cycleDays: true,
					graceLateMinutes: true,
					graceEarlyOutMinutes: true,
					pattern: true,
				},
			});
			if (!scheduleTemplate) {
				res.status(404).json(buildErrorResponse("Schedule template not found", 404));
				return;
			}
			if (Number(scheduleTemplate.cycleDays || 0) % 7 === 0 && !isMondayUtc(effectiveStartDate)) {
				res.status(400).json(
					buildErrorResponse("Weekly schedules must start on a Monday (UTC).", 400),
				);
				return;
			}
			updatedEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
				template: scheduleTemplate,
				assignedByEmployeeId: validation.data.createdByEmployeeId || null,
				effectiveStartDate,
				reason: validation.data.reason || targetEmployee.embeddedSchedule?.reason || null,
			});
			source = "template";
		} else if (hasManual) {
			const manualSnapshot = normalizeManualSnapshot(validation.data.shiftSnapshot);
			if (!manualSnapshot) {
				res.status(400).json(buildErrorResponse("Manual shiftSnapshot is required", 400));
				return;
			}
			updatedEmbeddedSchedule = buildManualEmbeddedSchedule({
				shiftSnapshot: manualSnapshot,
				shiftTypeId: validation.data.shiftTypeId || null,
				startDate: effectiveStartDate,
				assignedByEmployeeId: validation.data.createdByEmployeeId || null,
				reason: validation.data.reason || null,
			});
			source = "manual";
		} else if (!updatedEmbeddedSchedule) {
			res.status(400).json(
				buildErrorResponse("No existing embedded schedule to update", 400),
			);
			return;
		} else {
			updatedEmbeddedSchedule = {
				...updatedEmbeddedSchedule,
				effectiveStartDate,
				reason:
					validation.data.reason === undefined
						? updatedEmbeddedSchedule.reason || null
						: validation.data.reason,
				assignedByEmployeeId:
					validation.data.createdByEmployeeId ||
					updatedEmbeddedSchedule.assignedByEmployeeId ||
					null,
			};
		}

		const updated = await (prisma as any).employee.update({
			where: { id: targetEmployeeId },
			data: {
				embeddedSchedule: updatedEmbeddedSchedule as any,
			},
			select: {
				id: true,
				embeddedSchedule: true,
			},
		});
		await appendEmployeeScheduleHistory(prisma, {
			organizationId,
			employeeId: targetEmployeeId,
			action: "reassigned",
			actorEmployeeId: validation.data.createdByEmployeeId || null,
			effectiveAt: updatedEmbeddedSchedule?.effectiveStartDate || effectiveStartDate,
			beforeSchedule: targetEmployee.embeddedSchedule || null,
			afterSchedule: updatedEmbeddedSchedule,
			metadata: {
				source: "employeeSchedule.controller.update",
				assignmentMode: source,
				scheduleTemplateId: validation.data.scheduleTemplateId || null,
				shiftTypeId: validation.data.shiftTypeId || null,
			},
		});
		await recomputeAttendanceObligationsForRange(prisma, {
			organizationId,
			employeeId: targetEmployeeId,
			fromDate: updatedEmbeddedSchedule?.effectiveStartDate || effectiveStartDate,
			toDate: new Date(
				(updatedEmbeddedSchedule?.effectiveStartDate || effectiveStartDate).getTime() +
					60 * 24 * 60 * 60 * 1000,
			),
			reason: "ScheduleChanged",
		});
		await invalidateCache.byPattern(`cache:employee:byId:${targetEmployeeId}:*`);
		await invalidateCache.byPattern("cache:employee:list:*");
		await invalidateCache.byPattern("cache:attendance:*");
		await invalidateCache.byPattern("cache:timesheet:*");
		await invalidateCache.byPattern("cache:metrics:*");
		const response = {
			id: targetEmployeeId,
			employeeId: targetEmployeeId,
			scheduleTemplateId: scheduleTemplate?.id || updatedEmbeddedSchedule?.templateId || null,
			startDate: (
				updatedEmbeddedSchedule?.effectiveStartDate ||
				effectiveStartDate
			).toISOString(),
			endDate: validation.data.endDate
				? new Date(validation.data.endDate).toISOString()
				: null,
			departmentId: validation.data.departmentId || null,
			createdByEmployeeId: validation.data.createdByEmployeeId || null,
			source,
			shiftTypeId: validation.data.shiftTypeId || null,
			shiftSnapshot: summarizePrimarySnapshot(updatedEmbeddedSchedule),
			scheduleTemplate:
				scheduleTemplate ||
				(updatedEmbeddedSchedule?.templateId
					? {
							id: updatedEmbeddedSchedule.templateId,
							name: updatedEmbeddedSchedule.templateName,
							code: updatedEmbeddedSchedule.templateCode,
						}
					: null),
			updated,
		};
		res.status(200).json(buildSuccessResponse("Employee schedule updated", response, 200));
	};

	const getEmployeeCalendar = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = getOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization context is required", 401));
			return;
		}

		const employeeId = req.params.id;
		const start = parseDateValue(req.query.start);
		const end = parseDateValue(req.query.end);
		if (!employeeId || !start || !end || end < start) {
			res.status(400).json(buildErrorResponse("Invalid employee or date range", 400));
			return;
		}

		const days = await buildCalendarDays({ organizationId, employeeId, start, end });

		res.status(200).json(
			buildSuccessResponse("Employee schedule calendar retrieved", { employeeId, days }, 200),
		);
	};

	const getEmployeeCalendarPre = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = getOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization context is required", 401));
			return;
		}

		const employeeId = req.params.id;
		if (!employeeId) {
			res.status(400).json(buildErrorResponse("Invalid employee", 400));
			return;
		}

		const now = new Date();
		const start =
			parseDateValue(req.query.start) ||
			new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		const end = parseDateValue(req.query.end) || start;
		if (end < start) {
			res.status(400).json(buildErrorResponse("Invalid employee or date range", 400));
			return;
		}

		const days = await buildCalendarDays({ organizationId, employeeId, start, end });
		res.status(200).json(
			buildSuccessResponse(
				"Employee pre-schedule calendar retrieved",
				{ employeeId, days },
				200,
			),
		);
	};

	return { create, getAll, update, getEmployeeCalendar, getEmployeeCalendarPre };
};
