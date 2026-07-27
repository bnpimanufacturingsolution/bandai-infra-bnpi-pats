import type { PrismaClient } from "../generated/prisma";

export type PublicKioskOrgQuery = {
	organizationId?: string | null;
	organizationCode?: string | null;
};

export type PublicKioskOrgResolution =
	| { ok: true; organizationId: string; resolvedBy: "id" | "code" }
	| { ok: false; field: "organizationId" | "organizationCode"; message: string };

const normalize = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

/**
 * Resolve the tenant for unauthenticated kiosk feeds.
 * Prefer explicit organizationId; otherwise resolve stable organizationCode
 * (seed default: `bnei`) so local DB reset does not break emp-app login.
 */
export async function resolvePublicKioskOrganizationId(
	prisma: Pick<PrismaClient, "organization">,
	query: PublicKioskOrgQuery,
): Promise<PublicKioskOrgResolution> {
	const organizationId = normalize(query.organizationId);
	const organizationCode = normalize(query.organizationCode);

	if (organizationId) {
		const byId = await prisma.organization.findFirst({
			where: { id: organizationId, isDeleted: false },
			select: { id: true },
		});
		if (!byId?.id) {
			return {
				ok: false,
				field: "organizationId",
				message: "organizationId was not found",
			};
		}
		return { ok: true, organizationId: byId.id, resolvedBy: "id" };
	}

	if (organizationCode) {
		const byCode = await prisma.organization.findFirst({
			where: { code: organizationCode, isDeleted: false },
			select: { id: true },
		});
		if (!byCode?.id) {
			return {
				ok: false,
				field: "organizationCode",
				message: "organizationCode was not found",
			};
		}
		return { ok: true, organizationId: byCode.id, resolvedBy: "code" };
	}

	return {
		ok: false,
		field: "organizationId",
		message: "organizationId or organizationCode is required",
	};
}
