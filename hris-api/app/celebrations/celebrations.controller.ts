import { Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { AuthRequest } from "../../middleware/verifyToken";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { BirthdaysQuerySchema, BirthdayFilterType } from "../../zod/celebrations.zod";

type BirthdayItemType = "EMPLOYEE_BIRTHDAY" | "CHILD_BIRTHDAY";

type BirthdayCelebrantItem = {
	id: string;
	type: BirthdayItemType;
	month: number;
	day: number;
	displayName: string;
	personId: string;
	employeeId?: string | null;
	parentDisplayName?: string | null;
	department?: string | null;
};

type EmployeeBirthdayRow = {
	personId?: unknown;
	employeeId?: unknown;
	firstName?: string | null;
	middleName?: string | null;
	lastName?: string | null;
	month?: number;
	day?: number;
	department?: string | null;
};

type ChildBirthdayRow = {
	parentPersonId?: unknown;
	parentEmployeeId?: unknown;
	childIndex?: number;
	childFirstName?: string | null;
	childLastName?: string | null;
	parentFirstName?: string | null;
	parentMiddleName?: string | null;
	parentLastName?: string | null;
	month?: number;
	day?: number;
	department?: string | null;
};

const logger = getLogger();
const celebrationsLogger = logger.child({ module: "celebrations" });

const NO_ORG_MESSAGE = "No organization assigned.";
const SUCCESS_MESSAGE = "Birthday celebrations retrieved successfully";

const toSafeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const extractId = (value: unknown): string | null => {
	if (!value) {
		return null;
	}

	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}

	if (typeof value === "object") {
		const maybeOid = (value as { $oid?: unknown }).$oid;
		if (typeof maybeOid === "string") {
			return maybeOid;
		}

		const maybeToHexString = (value as { toHexString?: () => string }).toHexString;
		if (typeof maybeToHexString === "function") {
			return maybeToHexString();
		}

		const maybeToString = (value as { toString?: () => string }).toString;
		if (typeof maybeToString === "function") {
			const parsed = maybeToString();
			if (parsed && parsed !== "[object Object]") {
				return parsed;
			}
		}
	}

	return null;
};

const normalizeText = (value: string): string => value.toLowerCase();

const buildFullName = (firstName?: unknown, middleName?: unknown, lastName?: unknown): string => {
	return [toSafeString(firstName), toSafeString(middleName), toSafeString(lastName)]
		.filter(Boolean)
		.join(" ");
};

const buildChildDisplayName = (firstName?: unknown, lastName?: unknown): string => {
	const safeFirstName = toSafeString(firstName) || "Unknown";
	const safeLastName = toSafeString(lastName);
	if (!safeLastName) {
		return safeFirstName;
	}
	return `${safeFirstName} ${safeLastName.charAt(0).toUpperCase()}.`;
};

const isValidBirthday = (month?: number, day?: number): month is number => {
	if (typeof month !== "number" || typeof day !== "number") {
		return false;
	}
	return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

const getEmployeeBirthdays = async (
	prisma: PrismaClient,
	organizationId: string,
	month: number,
): Promise<EmployeeBirthdayRow[]> => {
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			person: {
				select: {
					id: true,
					isDeleted: true,
					personalInfo: true,
					metadata: true,
				},
			},
			department: {
				select: {
					name: true,
				},
			},
		},
	});

	return employees
		.map((employee) => {
			const personalInfo =
				employee.person?.personalInfo && typeof employee.person.personalInfo === "object"
					? (employee.person.personalInfo as Record<string, unknown>)
					: {};
			const dobValue = personalInfo.dateOfBirth;
			const dob = dobValue ? new Date(String(dobValue)) : null;
			if (!employee.person || employee.person.isDeleted || !dob || Number.isNaN(dob.getTime())) {
				return null;
			}
			const metadata =
				employee.person.metadata && typeof employee.person.metadata === "object"
					? (employee.person.metadata as Record<string, unknown>)
					: {};
			const metadataDeleted = metadata.isDeleted === true;
			const metadataActive = metadata.isActive;
			if (metadataDeleted || (metadataActive !== undefined && metadataActive !== true)) {
				return null;
			}
			if (dob.getUTCMonth() + 1 !== month) return null;
			return {
				personId: employee.person.id,
				employeeId: employee.id,
				firstName: toSafeString(personalInfo.firstName) || null,
				middleName: toSafeString(personalInfo.middleName) || null,
				lastName: toSafeString(personalInfo.lastName) || null,
				month: dob.getUTCMonth() + 1,
				day: dob.getUTCDate(),
				department: employee.department?.name || null,
			} as EmployeeBirthdayRow;
		})
		.filter((row): row is EmployeeBirthdayRow => Boolean(row));
};

const getChildBirthdays = async (
	prisma: PrismaClient,
	organizationId: string,
	month: number,
): Promise<ChildBirthdayRow[]> => {
	const children = await prisma.child.findMany({
		where: {
			isDeleted: false,
			parent: {
				isDeleted: false,
				organizationId,
				employee: {
					is: {
						isDeleted: false,
						organizationId,
					},
				},
			},
		},
		select: {
			id: true,
			firstName: true,
			lastName: true,
			dateOfBirth: true,
			parent: {
				select: {
					id: true,
					personalInfo: true,
					employee: {
						select: {
							id: true,
							department: {
								select: {
									name: true,
								},
							},
						},
					},
				},
			},
		},
	});

	return children
		.map((child, index) => {
			const dob = child.dateOfBirth ? new Date(child.dateOfBirth) : null;
			if (!dob || Number.isNaN(dob.getTime()) || dob.getUTCMonth() + 1 !== month) return null;
			const parentInfo =
				child.parent.personalInfo && typeof child.parent.personalInfo === "object"
					? (child.parent.personalInfo as Record<string, unknown>)
					: {};
			return {
				parentPersonId: child.parent.id,
				parentEmployeeId: child.parent.employee?.id,
				childIndex: index,
				childFirstName: child.firstName,
				childLastName: child.lastName,
				month: dob.getUTCMonth() + 1,
				day: dob.getUTCDate(),
				parentFirstName: toSafeString(parentInfo.firstName) || null,
				parentMiddleName: toSafeString(parentInfo.middleName) || null,
				parentLastName: toSafeString(parentInfo.lastName) || null,
				department: child.parent.employee?.department?.name || null,
			} as ChildBirthdayRow;
		})
		.filter((row): row is ChildBirthdayRow => Boolean(row));
};

const filterByType = (
	items: BirthdayCelebrantItem[],
	type: BirthdayFilterType,
): BirthdayCelebrantItem[] => {
	if (type === "EMPLOYEES") {
		return items.filter((item) => item.type === "EMPLOYEE_BIRTHDAY");
	}
	if (type === "KIDS") {
		return items.filter((item) => item.type === "CHILD_BIRTHDAY");
	}
	return items;
};

const filterBySearch = (
	items: BirthdayCelebrantItem[],
	search: string,
): BirthdayCelebrantItem[] => {
	const normalizedSearch = normalizeText(search.trim());
	if (!normalizedSearch) {
		return items;
	}

	return items.filter((item) => {
		if (item.type === "EMPLOYEE_BIRTHDAY") {
			return normalizeText(item.displayName).includes(normalizedSearch);
		}

		return (
			normalizeText(item.displayName).includes(normalizedSearch) ||
			normalizeText(item.parentDisplayName || "").includes(normalizedSearch)
		);
	});
};

const groupByDay = (
	items: BirthdayCelebrantItem[],
): Array<{ day: number; items: BirthdayCelebrantItem[] }> => {
	const grouped = new Map<number, BirthdayCelebrantItem[]>();

	for (const item of items) {
		const current = grouped.get(item.day) || [];
		current.push(item);
		grouped.set(item.day, current);
	}

	return Array.from(grouped.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([day, dayItems]) => ({ day, items: dayItems }));
};

export const controller = (prisma: PrismaClient) => {
	const getBirthdays = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const parsed = BirthdaysQuerySchema.safeParse(req.query);
		if (!parsed.success) {
			const formattedErrors = formatZodErrors(parsed.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const organizationId = req.organizationId;
		const { month, year, type, search } = parsed.data;

		if (!organizationId) {
			res.status(200).json(
				buildSuccessResponse(SUCCESS_MESSAGE, {
					month,
					year,
					organizationId: null,
					state: "NO_ORG",
					message: NO_ORG_MESSAGE,
					filters: { type, search },
					counts: { employees: 0, kids: 0, total: 0 },
					items: [],
					groups: [],
				}),
			);
			return;
		}

		try {
			const [employeeRows, childRows] = await Promise.all([
				getEmployeeBirthdays(prisma, organizationId, month),
				getChildBirthdays(prisma, organizationId, month),
			]);

			const employeeItems: BirthdayCelebrantItem[] = [];
			for (const row of employeeRows) {
				if (!isValidBirthday(row.month, row.day)) {
					continue;
				}

				const personId = extractId(row.personId);
				if (!personId) {
					continue;
				}

				const displayName = buildFullName(row.firstName, row.middleName, row.lastName);
				if (!displayName) {
					continue;
				}

				employeeItems.push({
					id: `EMP:${personId}`,
					type: "EMPLOYEE_BIRTHDAY",
					month: Number(row.month),
					day: Number(row.day),
					displayName,
					personId,
					employeeId: extractId(row.employeeId),
					parentDisplayName: null,
					department: toSafeString(row.department) || null,
				});
			}

			const childItems: BirthdayCelebrantItem[] = [];
			for (const row of childRows) {
				if (!isValidBirthday(row.month, row.day)) {
					continue;
				}

				const parentPersonId = extractId(row.parentPersonId);
				if (!parentPersonId) {
					continue;
				}

				const displayName = buildChildDisplayName(row.childFirstName, row.childLastName);
				const parentDisplayName = buildFullName(
					row.parentFirstName,
					row.parentMiddleName,
					row.parentLastName,
				);

				childItems.push({
					id: `CHILD:${parentPersonId}:${row.childIndex ?? 0}`,
					type: "CHILD_BIRTHDAY",
					month: Number(row.month),
					day: Number(row.day),
					displayName,
					personId: parentPersonId,
					employeeId: extractId(row.parentEmployeeId),
					parentDisplayName: parentDisplayName || null,
					department: toSafeString(row.department) || null,
				});
			}

			const mergedItems = [...employeeItems, ...childItems];
			const typeFilteredItems = filterByType(mergedItems, type);
			const searchFilteredItems = filterBySearch(typeFilteredItems, search);

			searchFilteredItems.sort((a, b) => {
				if (a.day !== b.day) {
					return a.day - b.day;
				}
				return a.displayName.localeCompare(b.displayName, undefined, {
					sensitivity: "base",
				});
			});

			const employeesCount = searchFilteredItems.filter(
				(item) => item.type === "EMPLOYEE_BIRTHDAY",
			).length;
			const kidsCount = searchFilteredItems.filter(
				(item) => item.type === "CHILD_BIRTHDAY",
			).length;

			res.status(200).json(
				buildSuccessResponse(SUCCESS_MESSAGE, {
					month,
					year,
					organizationId,
					state: "OK",
					message: null,
					filters: { type, search },
					counts: {
						employees: employeesCount,
						kids: kidsCount,
						total: searchFilteredItems.length,
					},
					items: searchFilteredItems,
					groups: groupByDay(searchFilteredItems),
				}),
			);
		} catch (error: any) {
			celebrationsLogger.error("Failed to get birthday celebrations:", error);
			res.status(500).json(
				buildErrorResponse("Failed to retrieve birthday celebrations", 500, [
					{
						field: "system",
						message: error?.message || "Unexpected error",
					},
				]),
			);
		}
	};

	return {
		getBirthdays,
	};
};
