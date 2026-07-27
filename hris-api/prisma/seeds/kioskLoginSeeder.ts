import { PrismaClient } from "../../generated/prisma";

const KIOSK_CHILD_FIRST_NAME = "Kiosk";
const KIOSK_CHILD_LAST_NAME = "Celebrant";

/** Titles retired from the minimal kiosk demo set (cancelled on re-seed). */
const RETIRED_KIOSK_EVENT_TITLES = ["Wellness Friday"] as const;

/**
 * Minimal company event for emp-app `/auth/login` public carousel.
 * Public feed filters to COMPANY_EVENT so holidays do not flood the carousel.
 */
const KIOSK_EVENT_DEFINITIONS = [
	{
		title: "Bandai Town Hall",
		description: "Quarterly leadership updates for all employees.",
		dayOffset: 7,
		durationHours: 2,
		isAllDay: false,
	},
] as const;

export const buildKioskLoginSeedPlan = (now = new Date()) => {
	const currentYear = now.getUTCFullYear();
	const currentMonth = now.getUTCMonth();

	// One birthday in the current month (employee parent; celebrations uses UTC month).
	const birthdayDate = new Date(Date.UTC(2018, currentMonth, 20, 0, 0, 0, 0));

	const calendarItems = KIOSK_EVENT_DEFINITIONS.map((definition) => {
		const startDate = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate() + definition.dayOffset,
				definition.isAllDay ? 0 : 9,
				0,
				0,
				0,
			),
		);

		const endDate = new Date(startDate);
		if (definition.isAllDay) {
			endDate.setUTCHours(23, 59, 59, 999);
		} else {
			endDate.setUTCHours(startDate.getUTCHours() + definition.durationHours, 0, 0, 0);
		}

		return {
			title: definition.title,
			description: definition.description,
			type: "COMPANY_EVENT" as const,
			startDate,
			endDate,
			isAllDay: definition.isAllDay,
			timezone: "Asia/Manila",
			status: "ACTIVE" as const,
			year: startDate.getUTCFullYear(),
		};
	});

	return {
		child: {
			firstName: KIOSK_CHILD_FIRST_NAME,
			lastName: KIOSK_CHILD_LAST_NAME,
			dateOfBirth: birthdayDate,
		},
		/** Single employee birthday for kiosk (parent person of demo child). */
		parentEmployeeBirthday: birthdayDate,
		calendarItems,
		retiredEventTitles: [...RETIRED_KIOSK_EVENT_TITLES],
		month: currentMonth + 1,
		year: currentYear,
	};
};

const mergePersonPersonalInfoWithBirthday = (
	existingPersonalInfo: unknown,
	dateOfBirth: Date,
): Record<string, unknown> => {
	const base =
		existingPersonalInfo &&
		typeof existingPersonalInfo === "object" &&
		!Array.isArray(existingPersonalInfo)
			? { ...(existingPersonalInfo as Record<string, unknown>) }
			: {};

	return {
		...base,
		dateOfBirth: dateOfBirth.toISOString(),
	};
};

const mergePersonMetadataForKiosk = (existingMetadata: unknown): Record<string, unknown> => {
	const base =
		existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
			? { ...(existingMetadata as Record<string, unknown>) }
			: {};

	return {
		...base,
		isActive: true,
		isDeleted: false,
	};
};

export async function seedKioskLoginContent(
	prisma: Pick<PrismaClient, "employee" | "child" | "calendarItem" | "person">,
	organizationId: string,
	now = new Date(),
) {
	const plan = buildKioskLoginSeedPlan(now);
	const parentEmployee = await prisma.employee.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			personId: {
				not: "",
			},
		},
		select: {
			id: true,
			personId: true,
			person: {
				select: {
					id: true,
					personalInfo: true,
					metadata: true,
				},
			},
		},
	});

	if (!parentEmployee?.personId) {
		throw new Error(
			`Kiosk login seeding requires at least one non-deleted employee with a linked person in organization ${organizationId}.`,
		);
	}

	// One employee birthday in the current month for the login carousel.
	if (parentEmployee.person?.id) {
		await prisma.person.update({
			where: { id: parentEmployee.person.id },
			data: {
				personalInfo: mergePersonPersonalInfoWithBirthday(
					parentEmployee.person.personalInfo,
					plan.parentEmployeeBirthday,
				) as any,
				metadata: mergePersonMetadataForKiosk(parentEmployee.person.metadata) as any,
			},
		});
	}

	// Soft-remove demo child so kiosk shows a single employee birthday, not child+parent.
	const existingChild = await prisma.child.findFirst({
		where: {
			parentId: parentEmployee.personId,
			firstName: plan.child.firstName,
			lastName: plan.child.lastName,
		},
		select: {
			id: true,
		},
	});

	let childSoftDeleted = false;
	if (existingChild?.id) {
		await prisma.child.update({
			where: { id: existingChild.id },
			data: {
				organizationId,
				isDeleted: true,
			},
		});
		childSoftDeleted = true;
	}

	let createdCalendarItems = 0;
	let updatedCalendarItems = 0;
	let retiredCalendarItems = 0;

	for (const title of plan.retiredEventTitles) {
		const retired = await prisma.calendarItem.findFirst({
			where: {
				organizationId,
				type: "COMPANY_EVENT",
				title,
			},
			select: { id: true },
		});
		if (retired?.id) {
			await prisma.calendarItem.update({
				where: { id: retired.id },
				data: { status: "CANCELLED" },
			});
			retiredCalendarItems++;
		}
	}

	for (const item of plan.calendarItems) {
		const existingItem = await prisma.calendarItem.findFirst({
			where: {
				organizationId,
				type: item.type,
				title: item.title,
			},
			select: {
				id: true,
			},
		});

		if (existingItem?.id) {
			await prisma.calendarItem.update({
				where: { id: existingItem.id },
				data: {
					organizationId,
					year: item.year,
					title: item.title,
					description: item.description,
					type: item.type,
					startDate: item.startDate,
					endDate: item.endDate,
					isAllDay: item.isAllDay,
					timezone: item.timezone,
					status: item.status,
				},
			});
			updatedCalendarItems++;
			continue;
		}

		await prisma.calendarItem.create({
			data: {
				organizationId,
				year: item.year,
				title: item.title,
				description: item.description,
				type: item.type,
				startDate: item.startDate,
				endDate: item.endDate,
				isAllDay: item.isAllDay,
				timezone: item.timezone,
				status: item.status,
			},
		});
		createdCalendarItems++;
	}

	return {
		organizationId,
		parentEmployeeId: parentEmployee.id,
		parentPersonId: parentEmployee.personId,
		birthdayMonth: plan.month,
		employeeBirthdaySeeded: true,
		childSoftDeleted,
		calendarItemsSeeded: plan.calendarItems.length,
		createdCalendarItems,
		updatedCalendarItems,
		retiredCalendarItems,
	};
}
