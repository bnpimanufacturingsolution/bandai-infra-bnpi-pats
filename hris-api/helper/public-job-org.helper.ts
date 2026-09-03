import type { PrismaClient } from "../generated/prisma";
import {
	resolvePublicKioskOrganizationId,
	type PublicKioskOrgQuery,
} from "./public-kiosk-org.helper";

const DEFAULT_PUBLIC_ORGANIZATION_CODE = "bnei";

export type PublicJobOrgResolution =
	| {
			ok: true;
			organizationId: string;
			resolvedBy: "token" | "id" | "code" | "sole" | "default_code";
	  }
	| { ok: false; field: "organizationId"; message: string };

const normalize = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

/**
 * Resolve the tenant for the public careers job list.
 * Token/query win when present. Otherwise use the sole org, then seed code `bnei`.
 */
export async function resolvePublicJobListOrganizationId(
	prisma: Pick<PrismaClient, "organization">,
	query: PublicKioskOrgQuery & { tokenOrganizationId?: string | null },
): Promise<PublicJobOrgResolution> {
	const tokenOrganizationId = normalize(query.tokenOrganizationId);
	if (tokenOrganizationId) {
		const byToken = await prisma.organization.findFirst({
			where: { id: tokenOrganizationId, isDeleted: false },
			select: { id: true },
		});
		if (byToken?.id) {
			return { ok: true, organizationId: byToken.id, resolvedBy: "token" };
		}
	}

	const explicit = await resolvePublicKioskOrganizationId(prisma, {
		organizationId: query.organizationId,
		organizationCode: query.organizationCode,
	});
	if (explicit.ok) {
		return explicit;
	}

	const askedExplicitly = Boolean(
		normalize(query.organizationId) || normalize(query.organizationCode),
	);
	if (askedExplicitly) {
		return {
			ok: false,
			field: "organizationId",
			message: explicit.message,
		};
	}

	const activeOrgs = await prisma.organization.findMany({
		where: { isDeleted: false },
		select: { id: true, code: true },
		orderBy: { createdAt: "asc" },
		take: 8,
	});

	if (activeOrgs.length === 1 && activeOrgs[0]?.id) {
		return { ok: true, organizationId: activeOrgs[0].id, resolvedBy: "sole" };
	}

	const defaultByCode = activeOrgs.find(
		(org) => org.code === DEFAULT_PUBLIC_ORGANIZATION_CODE,
	);
	if (defaultByCode?.id) {
		return {
			ok: true,
			organizationId: defaultByCode.id,
			resolvedBy: "default_code",
		};
	}

	if (activeOrgs[0]?.id) {
		return { ok: true, organizationId: activeOrgs[0].id, resolvedBy: "sole" };
	}

	return {
		ok: false,
		field: "organizationId",
		message: "No organization is available for public job listings",
	};
}
