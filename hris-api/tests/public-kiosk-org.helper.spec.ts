import { expect } from "chai";

import { resolvePublicKioskOrganizationId } from "../helper/public-kiosk-org.helper";

describe("resolvePublicKioskOrganizationId", () => {
	it("resolves by organizationId when the org exists", async () => {
		const prisma = {
			organization: {
				findFirst: async (args: any) => {
					expect(args.where.id).to.equal("org-cuid-1");
					return { id: "org-cuid-1" };
				},
			},
		};

		const result = await resolvePublicKioskOrganizationId(prisma as any, {
			organizationId: "org-cuid-1",
		});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "org-cuid-1",
			resolvedBy: "id",
		});
	});

	it("resolves by stable organizationCode after DB reset-style id changes", async () => {
		const prisma = {
			organization: {
				findFirst: async (args: any) => {
					expect(args.where.code).to.equal("bnei");
					return { id: "new-org-after-reset" };
				},
			},
		};

		const result = await resolvePublicKioskOrganizationId(prisma as any, {
			organizationCode: "bnei",
		});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "new-org-after-reset",
			resolvedBy: "code",
		});
	});

	it("prefers organizationId when both id and code are provided", async () => {
		const calls: any[] = [];
		const prisma = {
			organization: {
				findFirst: async (args: any) => {
					calls.push(args);
					return { id: "pinned-id" };
				},
			},
		};

		const result = await resolvePublicKioskOrganizationId(prisma as any, {
			organizationId: "pinned-id",
			organizationCode: "bnei",
		});

		expect(result.ok).to.equal(true);
		if (result.ok) {
			expect(result.resolvedBy).to.equal("id");
		}
		expect(calls[0].where).to.have.property("id", "pinned-id");
	});

	it("fails clearly when neither id nor code is provided", async () => {
		const result = await resolvePublicKioskOrganizationId(
			{ organization: { findFirst: async () => null } } as any,
			{},
		);

		expect(result).to.deep.equal({
			ok: false,
			field: "organizationId",
			message: "organizationId or organizationCode is required",
		});
	});

	it("fails when organizationCode does not exist", async () => {
		const result = await resolvePublicKioskOrganizationId(
			{ organization: { findFirst: async () => null } } as any,
			{ organizationCode: "missing" },
		);

		expect(result).to.deep.equal({
			ok: false,
			field: "organizationCode",
			message: "organizationCode was not found",
		});
	});
});
