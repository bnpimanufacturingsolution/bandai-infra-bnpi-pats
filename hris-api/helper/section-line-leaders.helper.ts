import { PrismaClient, Prisma } from "../generated/prisma";

/**
 * Section line-leader assignment reconciliation.
 *
 * The join model `SectionLineLeader` (section_line_leaders) holds the
 * many-to-many membership: one section can have multiple line leaders and an
 * employee can lead many sections. The section create/update API accepts
 * `lineLeaderIds` (employee ids) and the controller reconciles the join rows
 * through this helper, then re-derives roles for affected employees.
 */

export type LineLeaderResolveResult =
	| { ok: true; ids: string[] | null }
	| { ok: false; missing: string[] };

/**
 * Validate a requested lineLeaderIds payload against same-org active employees.
 * Returns `ids: null` when the caller omitted the field (no reconciliation).
 */
export async function resolveLineLeaderIds(
	prisma: PrismaClient,
	lineLeaderIds: string[] | undefined,
	organizationId: string | null | undefined,
): Promise<LineLeaderResolveResult> {
	if (lineLeaderIds === undefined) return { ok: true, ids: null };
	const requested = Array.from(
		new Set((lineLeaderIds || []).map((id) => String(id).trim()).filter(Boolean)),
	);
	if (requested.length === 0) return { ok: true, ids: [] };
	if (!organizationId) return { ok: false, missing: requested };
	const found = await prisma.employee.findMany({
		where: {
			id: { in: requested },
			organizationId,
			isDeleted: false,
		},
		select: { id: true },
	});
	const foundIds = new Set(found.map((row) => row.id));
	const missing = requested.filter((id) => !foundIds.has(id));
	if (missing.length > 0) return { ok: false, missing };
	return { ok: true, ids: requested };
}

/**
 * Reconcile the section_line_leaders join rows for one section to the
 * requested employee-id list. No-op when ids === null (field omitted).
 * Returns employee ids whose membership changed (added + removed).
 */
export async function reconcileSectionLineLeaders(
	prisma: PrismaClient,
	sectionId: string,
	organizationId: string,
	ids: string[] | null,
): Promise<string[]> {
	if (ids === null) return [];
	return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const current = await tx.sectionLineLeader.findMany({
			where: { sectionId },
			select: { id: true, employeeId: true },
		});
		const desired = new Set(ids);
		const toDelete = current.filter((row) => !desired.has(row.employeeId));
		const currentIds = new Set(current.map((row) => row.employeeId));
		const toCreate = ids.filter((employeeId) => !currentIds.has(employeeId));
		if (toDelete.length > 0) {
			await tx.sectionLineLeader.deleteMany({
				where: { id: { in: toDelete.map((row) => row.id) } },
			});
		}
		if (toCreate.length > 0) {
			await tx.sectionLineLeader.createMany({
				data: toCreate.map((employeeId) => ({
					organizationId,
					sectionId,
					employeeId,
				})),
				skipDuplicates: true,
			});
		}
		return [...toDelete.map((row) => row.employeeId), ...toCreate];
	});
}
