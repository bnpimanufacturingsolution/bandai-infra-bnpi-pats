import { expect } from "chai";
import fs from "fs";
import path from "path";

import { resolvePublicJobListOrganizationId } from "../helper/public-job-org.helper";

describe("resolvePublicJobListOrganizationId", () => {
	it("uses the authenticated token org when it exists", async () => {
		const prisma = {
			organization: {
				findFirst: async (args: any) => {
					expect(args.where.id).to.equal("token-org");
					return { id: "token-org" };
				},
				findMany: async () => {
					throw new Error("findMany should not run when token org resolves");
				},
			},
		};

		const result = await resolvePublicJobListOrganizationId(prisma as any, {
			tokenOrganizationId: "token-org",
		});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "token-org",
			resolvedBy: "token",
		});
	});

	it("falls back to the sole active org for anonymous careers listing", async () => {
		const prisma = {
			organization: {
				findFirst: async () => null,
				findMany: async () => [{ id: "sole-org", code: "bnpi" }],
			},
		};

		const result = await resolvePublicJobListOrganizationId(prisma as any, {});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "sole-org",
			resolvedBy: "sole",
		});
	});

	it("uses seed code bnei when more than one org exists", async () => {
		const prisma = {
			organization: {
				findFirst: async () => null,
				findMany: async () => [
					{ id: "org-a", code: "other" },
					{ id: "org-b", code: "bnei" },
				],
			},
		};

		const result = await resolvePublicJobListOrganizationId(prisma as any, {});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "org-b",
			resolvedBy: "default_code",
		});
	});

	it("resolves explicit organizationCode for public listing", async () => {
		const prisma = {
			organization: {
				findFirst: async (args: any) => {
					expect(args.where.code).to.equal("bnei");
					return { id: "code-org" };
				},
				findMany: async () => {
					throw new Error("findMany should not run when code resolves");
				},
			},
		};

		const result = await resolvePublicJobListOrganizationId(prisma as any, {
			organizationCode: "bnei",
		});

		expect(result).to.deep.equal({
			ok: true,
			organizationId: "code-org",
			resolvedBy: "code",
		});
	});

	it("fails when no organization exists", async () => {
		const prisma = {
			organization: {
				findFirst: async () => null,
				findMany: async () => [],
			},
		};

		const result = await resolvePublicJobListOrganizationId(prisma as any, {});

		expect(result.ok).to.equal(false);
		if (!result.ok) {
			expect(result.message).to.equal(
				"No organization is available for public job listings",
			);
		}
	});
});

describe("public job list router contract", () => {
	it("lists jobs without verifyToken and keeps writes authenticated", () => {
		const source = fs.readFileSync(
			path.resolve(process.cwd(), "app/job/job.router.ts"),
			"utf8",
		);

		expect(source).to.match(/routes\.get\(\s*"\/",\s*optionalVerifyToken/);
		expect(source).to.not.match(/routes\.get\(\s*"\/",\s*verifyToken/);
		expect(source).to.match(/routes\.post\(\s*"\/",\s*verifyToken/);
		expect(source).to.match(/routes\.patch\(\s*"\/:id",\s*verifyToken/);
		expect(source).to.match(/routes\.delete\(\s*"\/:id",\s*verifyToken/);
	});
});
