import type { PrismaClient } from "../generated/prisma";

const getCollection = (prisma: PrismaClient) =>
	((prisma as any)?.departmentScheduleTemplate || null) as any;

type EnsureLinkParams = {
	organizationId: string;
	departmentId: string;
	scheduleId?: string | null;
	createdByEmployeeId?: string | null;
	source?: "department_default" | "department_head_created" | "department_head_linked";
};

export async function ensureDepartmentScheduleLink(
	prisma: PrismaClient,
	params: EnsureLinkParams,
) {
	const collection = getCollection(prisma);
	if (!collection) return null;
	const {
		organizationId,
		departmentId,
		scheduleId,
		createdByEmployeeId = null,
		source = "department_head_linked",
	} = params;
	if (!scheduleId) return null;

	const existing = await collection.findFirst({
		where: {
			organizationId,
			departmentId,
			scheduleTemplateId: scheduleId,
		},
	});

	if (existing) {
		return collection.update({
			where: { id: existing.id },
			data: {
				isDeleted: false,
				isActive: true,
				source,
				createdByEmployeeId,
			},
		});
	}

	return collection.create({
		data: {
			organizationId,
			departmentId,
			scheduleTemplateId: scheduleId,
			source,
			createdByEmployeeId,
			isActive: true,
		},
	});
}

export async function ensureDepartmentScheduleLinks(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		departmentId: string;
		defaultScheduleId?: string | null;
		scheduleIds?: Array<string | null | undefined>;
		createdByEmployeeId?: string | null;
	},
) {
	const {
		organizationId,
		departmentId,
		defaultScheduleId = null,
		scheduleIds = [],
		createdByEmployeeId = null,
	} = params;
	const normalizedIds = Array.from(
		new Set([defaultScheduleId, ...scheduleIds].filter((value): value is string => !!value)),
	);

	for (const scheduleId of normalizedIds) {
		await ensureDepartmentScheduleLink(prisma, {
			organizationId,
			departmentId,
			scheduleId,
			createdByEmployeeId,
			source: scheduleId === defaultScheduleId ? "department_default" : "department_head_linked",
		});
	}

	const collection = getCollection(prisma);
	if (!collection) return;
	const existing = await collection.findMany({
		where: {
			organizationId,
			departmentId,
			isDeleted: false,
		},
		select: { id: true, scheduleTemplateId: true },
	});
	for (const row of existing) {
		if (normalizedIds.includes(String(row.scheduleTemplateId))) continue;
		await collection.update({
			where: { id: row.id },
			data: { isDeleted: true, isActive: false },
		});
	}
}

export async function replaceScheduleDepartmentLinks(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		scheduleId: string;
		departmentIds?: Array<string | null | undefined>;
	},
) {
	const { organizationId, scheduleId, departmentIds = [] } = params;
	const collection = getCollection(prisma);
	if (!collection) return;

	const normalizedDepartmentIds = Array.from(
		new Set(departmentIds.filter((value): value is string => !!value)),
	);
	const existing = await collection.findMany({
		where: {
			organizationId,
			scheduleTemplateId: scheduleId,
		},
		select: { id: true, departmentId: true, isDeleted: true },
	});

	for (const departmentId of normalizedDepartmentIds) {
		const row = existing.find((item: any) => String(item.departmentId) === String(departmentId));
		if (row) {
			await collection.update({
				where: { id: row.id },
				data: {
					isDeleted: false,
					isActive: true,
				},
			});
		} else {
			await collection.create({
				data: {
					organizationId,
					departmentId,
					scheduleTemplateId: scheduleId,
					source: "department_head_linked",
					isActive: true,
				},
			});
		}
	}

	for (const row of existing) {
		if (normalizedDepartmentIds.includes(String(row.departmentId))) continue;
		await collection.update({
			where: { id: row.id },
			data: { isDeleted: true, isActive: false },
		});
	}
}

export async function replaceDepartmentScheduleLinks(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		departmentId: string;
		defaultScheduleId?: string | null;
		scheduleIds?: Array<string | null | undefined>;
		createdByEmployeeId?: string | null;
	},
) {
	return ensureDepartmentScheduleLinks(prisma, params);
}

export async function syncDepartmentDefaultScheduleLink(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		departmentId: string;
		scheduleId?: string | null;
		createdByEmployeeId?: string | null;
	},
) {
	const { organizationId, departmentId, scheduleId = null, createdByEmployeeId = null } = params;
	await ensureDepartmentScheduleLinks(prisma, {
		organizationId,
		departmentId,
		defaultScheduleId: scheduleId,
		scheduleIds: scheduleId ? [scheduleId] : [],
		createdByEmployeeId,
	});
}
