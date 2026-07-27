import type { PrismaClient } from "../generated/prisma";
import { buildEmployeeFilter } from "./attendance-metrics-common.helper";

export type TurnoverAttritionGroupBy = "day" | "week" | "month" | "year";

export interface TurnoverAttritionBucketDefinition {
	start: Date;
	end: Date;
	label: string;
}

export interface TurnoverAttritionBucketMetrics {
	periodStart: string;
	periodEnd: string;
	label: string;
	openingHeadcount: number;
	closingHeadcount: number;
	averageHeadcount: number;
	totalSeparations: number;
	voluntarySeparations: number;
	involuntarySeparations: number;
	turnoverRate: number;
	attritionRate: number;
}

export interface TurnoverAttritionReportResult {
	summary: TurnoverAttritionBucketMetrics;
	buckets: TurnoverAttritionBucketMetrics[];
}

interface TurnoverAttritionEmployee {
	id: string;
	employeeId: string | null;
	employmentStatus: string | null;
	employmentStartDate: Date | null;
	employmentHireDate: Date | null;
	employmentTerminationDate: Date | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
}

function toUtcDateOnly(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
	const next = new Date(value);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function startOfUtcMonth(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfUtcMonth(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function startOfUtcYear(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
}

function endOfUtcYear(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), 11, 31));
}

function minDate(left: Date, right: Date) {
	return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date) {
	return left.getTime() >= right.getTime() ? left : right;
}

function toIsoDate(value: Date) {
	return value.toISOString().slice(0, 10);
}

function getEmployeeStartDate(employee: TurnoverAttritionEmployee) {
	if (employee.employmentStartDate) return toUtcDateOnly(employee.employmentStartDate);
	if (employee.employmentHireDate) return toUtcDateOnly(employee.employmentHireDate);
	return null;
}

function getEmployeeTerminationDate(employee: TurnoverAttritionEmployee) {
	return employee.employmentTerminationDate
		? toUtcDateOnly(employee.employmentTerminationDate)
		: null;
}

function isFinalizedSeparationStatus(status: string | null | undefined) {
	return status === "RESIGNED" || status === "TERMINATED";
}

function isVoluntarySeparation(status: string | null | undefined) {
	return status === "RESIGNED";
}

function isEmployeeActiveOnDate(employee: TurnoverAttritionEmployee, date: Date) {
	const startDate = getEmployeeStartDate(employee);
	if (!startDate || startDate.getTime() > date.getTime()) {
		return false;
	}

	const terminationDate = getEmployeeTerminationDate(employee);
	return !terminationDate || terminationDate.getTime() >= date.getTime();
}

function isSeparatedWithinRange(employee: TurnoverAttritionEmployee, start: Date, end: Date) {
	if (!isFinalizedSeparationStatus(employee.employmentStatus)) {
		return false;
	}

	const terminationDate = getEmployeeTerminationDate(employee);
	if (!terminationDate) {
		return false;
	}

	return terminationDate.getTime() >= start.getTime() && terminationDate.getTime() <= end.getTime();
}

function getWeekLabel(start: Date, end: Date) {
	const formatter = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
	return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getBucketLabel(start: Date, end: Date, groupBy: TurnoverAttritionGroupBy) {
	switch (groupBy) {
		case "day":
			return new Intl.DateTimeFormat("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
				timeZone: "UTC",
			}).format(start);
		case "week":
			return getWeekLabel(start, end);
		case "year":
			return String(start.getUTCFullYear());
		case "month":
		default:
			return new Intl.DateTimeFormat("en-US", {
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			}).format(start);
	}
}

export function buildTurnoverAttritionBuckets(
	dateFrom: Date,
	dateTo: Date,
	groupBy: TurnoverAttritionGroupBy,
) {
	const rangeStart = toUtcDateOnly(dateFrom);
	const rangeEnd = toUtcDateOnly(dateTo);
	const buckets: TurnoverAttritionBucketDefinition[] = [];

	let cursor = rangeStart;
	while (cursor.getTime() <= rangeEnd.getTime()) {
		let bucketStart = cursor;
		let bucketEnd = cursor;

		switch (groupBy) {
			case "day":
				bucketEnd = cursor;
				break;
			case "week": {
				const day = cursor.getUTCDay();
				const daysUntilSunday = (7 - day) % 7;
				bucketEnd = minDate(addUtcDays(cursor, daysUntilSunday), rangeEnd);
				break;
			}
			case "year":
				bucketStart = maxDate(startOfUtcYear(cursor), rangeStart);
				bucketEnd = minDate(endOfUtcYear(cursor), rangeEnd);
				break;
			case "month":
			default:
				bucketStart = maxDate(startOfUtcMonth(cursor), rangeStart);
				bucketEnd = minDate(endOfUtcMonth(cursor), rangeEnd);
				break;
		}

		buckets.push({
			start: bucketStart,
			end: bucketEnd,
			label: getBucketLabel(bucketStart, bucketEnd, groupBy),
		});

		cursor = addUtcDays(bucketEnd, 1);
	}

	return buckets;
}

function buildBucketMetrics(
	employees: TurnoverAttritionEmployee[],
	bucket: TurnoverAttritionBucketDefinition,
): TurnoverAttritionBucketMetrics {
	const openingHeadcount = employees.filter((employee) =>
		isEmployeeActiveOnDate(employee, bucket.start),
	).length;
	const closingHeadcount = employees.filter((employee) =>
		isEmployeeActiveOnDate(employee, bucket.end),
	).length;
	const averageHeadcount = (openingHeadcount + closingHeadcount) / 2;
	const separatedEmployees = employees.filter((employee) =>
		isSeparatedWithinRange(employee, bucket.start, bucket.end),
	);
	const voluntarySeparations = separatedEmployees.filter((employee) =>
		isVoluntarySeparation(employee.employmentStatus),
	).length;
	const involuntarySeparations = separatedEmployees.length - voluntarySeparations;

	return {
		periodStart: toIsoDate(bucket.start),
		periodEnd: toIsoDate(bucket.end),
		label: bucket.label,
		openingHeadcount,
		closingHeadcount,
		averageHeadcount,
		totalSeparations: separatedEmployees.length,
		voluntarySeparations,
		involuntarySeparations,
		turnoverRate: averageHeadcount > 0 ? separatedEmployees.length / averageHeadcount : 0,
		attritionRate: averageHeadcount > 0 ? voluntarySeparations / averageHeadcount : 0,
	};
}

export async function calculateTurnoverAttritionReport(
	prisma: PrismaClient,
	input: {
		organizationId?: string;
		dateFrom: Date;
		dateTo: Date;
		groupBy: TurnoverAttritionGroupBy;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
	},
): Promise<TurnoverAttritionReportResult> {
	const employeeWhere = input.organizationId
		? buildEmployeeFilter(input.organizationId, {
				departmentId: input.departmentId,
				sectionId: input.sectionId,
				positionId: input.positionId,
				levelId: input.levelId,
			})
		: {
				isDeleted: false,
				...(input.departmentId ? { departmentId: input.departmentId } : {}),
				...(input.sectionId ? { position: { sectionId: input.sectionId } } : {}),
				...(input.positionId ? { positionId: input.positionId } : {}),
				...(input.levelId ? { levelId: input.levelId } : {}),
			};

	const employees = (await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			employmentStatus: true,
			employmentStartDate: true,
			employmentHireDate: true,
			employmentTerminationDate: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	})) as unknown as TurnoverAttritionEmployee[];

	const overallBucket: TurnoverAttritionBucketDefinition = {
		start: toUtcDateOnly(input.dateFrom),
		end: toUtcDateOnly(input.dateTo),
		label: "Selected period",
	};
	const buckets = buildTurnoverAttritionBuckets(input.dateFrom, input.dateTo, input.groupBy).map(
		(bucket) => buildBucketMetrics(employees, bucket),
	);

	return {
		summary: buildBucketMetrics(employees, overallBucket),
		buckets,
	};
}
