import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { EnterpriseMigrationDataSchema } from "../zod/migration.zod";
import {
	resolveEnterpriseOrganizationBootstrap,
	type EnterpriseOrganizationBootstrapResult,
} from "../scripts/migration/enterprise-organization-bootstrap";
import type { LoadedEnterpriseCsvData } from "../scripts/migration/enterprise-csv-loader";

type MockOrganizationRecord = {
	id: string;
	code: string;
	name: string;
	description?: string | null;
	branding?: unknown;
	isDeleted?: boolean;
};

const buildLoadedData = (
	organization?: { code: string; name: string; description?: string },
): LoadedEnterpriseCsvData => ({
	data: EnterpriseMigrationDataSchema.parse({
		...(organization ? { organization } : {}),
	}),
	loadedFiles: organization
		? [{ fileName: "organization.csv", datasetKey: "organization" as const, rowCount: 1 }]
		: [],
	inferredStages: ["PRE_MIGRATION_CONTROLS", "FOUNDATION_MASTER"],
});

const buildClient = (organizations: MockOrganizationRecord[] = []) => {
	const records = [...organizations];

	return {
		organization: {
			findFirst: async ({ where }: any) => {
				const match = records.find((record) => {
					if (where?.isDeleted !== undefined && Boolean(record.isDeleted) !== where.isDeleted) {
						return false;
					}
					if (where?.id !== undefined && record.id !== where.id) return false;
					if (where?.code !== undefined && record.code !== where.code) return false;
					return true;
				});

				return match ? { id: match.id, code: match.code, name: match.name } : null;
			},
			create: async ({ data }: any) => {
				const created = {
					id: `created-${records.length + 1}`,
					code: data.code,
					name: data.name,
					description: data.description ?? null,
					branding: data.branding,
					isDeleted: false,
				};
				records.push(created);
				return { id: created.id, code: created.code, name: created.name };
			},
		},
		_records: records,
	};
};

const withEnv = async (
	env: Record<string, string | undefined>,
	run: () => Promise<EnterpriseOrganizationBootstrapResult>,
) => {
	const previous = {
		MIGRATION_ORGANIZATION_ID: process.env.MIGRATION_ORGANIZATION_ID,
		MIGRATION_ORGANIZATION_CODE: process.env.MIGRATION_ORGANIZATION_CODE,
	};

	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		return await run();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
};

describe("enterprise organization bootstrap", () => {
	it("uses an existing organization for explicit MIGRATION_ORGANIZATION_ID", async () => {
		const client = buildClient([{ id: "org-1", code: "bnei", name: "Bandai Namco" }]);

		const result = await withEnv(
			{ MIGRATION_ORGANIZATION_ID: "org-1", MIGRATION_ORGANIZATION_CODE: undefined },
			() =>
				resolveEnterpriseOrganizationBootstrap(
					client as any,
					buildLoadedData({ code: "bnei", name: "Bandai Namco" }),
				),
		);

		assert.equal(result.organizationId, "org-1");
		assert.equal(result.source, "explicit-id");
		assert.deepEqual(result.warnings, []);
	});

	it("uses an existing organization for explicit MIGRATION_ORGANIZATION_CODE", async () => {
		const client = buildClient([{ id: "org-1", code: "bnei", name: "Bandai Namco" }]);

		const result = await withEnv(
			{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: "bnei" },
			() =>
				resolveEnterpriseOrganizationBootstrap(
					client as any,
					buildLoadedData({ code: "bnei", name: "Bandai Namco" }),
				),
		);

		assert.equal(result.organizationId, "org-1");
		assert.equal(result.source, "explicit-code");
	});

	it("creates an organization from organization.csv when none exists", async () => {
		const client = buildClient();

		const result = await withEnv(
			{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: undefined },
			() =>
				resolveEnterpriseOrganizationBootstrap(
					client as any,
					buildLoadedData({
						code: "bnei",
						name: "Bandai Namco Enterprise Integration Sandbox",
						description: "Sample organization row",
					}),
				),
		);

		assert.equal(result.source, "csv-created");
		assert.equal(result.organizationCode, "bnei");
		assert.equal((client as any)._records.length, 1);
	});

	it("reuses an existing organization by organization.csv code", async () => {
		const client = buildClient([
			{
				id: "org-1",
				code: "bnei",
				name: "Bandai Namco Enterprise Integration Sandbox",
			},
		]);

		const result = await withEnv(
			{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: undefined },
			() =>
				resolveEnterpriseOrganizationBootstrap(
					client as any,
					buildLoadedData({
						code: "bnei",
						name: "Bandai Namco Enterprise Integration Sandbox",
					}),
				),
		);

		assert.equal(result.organizationId, "org-1");
		assert.equal(result.source, "csv-existing-code");
		assert.equal((client as any)._records.length, 1);
	});

	it("fails clearly when organization.csv is unavailable and no explicit org is set", async () => {
		const client = buildClient();
		try {
			await withEnv(
				{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: undefined },
				() => resolveEnterpriseOrganizationBootstrap(client as any, buildLoadedData()),
			);
			assert.fail("Expected bootstrap to fail when organization.csv is missing.");
		} catch (error: any) {
			assert.ok(String(error?.message || error).includes("organization.csv"));
		}
	});

	it("fails when explicit organization code is provided but not found", async () => {
		const client = buildClient();
		try {
			await withEnv(
				{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: "missing-org" },
				() =>
					resolveEnterpriseOrganizationBootstrap(
						client as any,
						buildLoadedData({ code: "bnei", name: "Bandai Namco" }),
					),
			);
			assert.fail("Expected bootstrap to fail for a missing explicit organization code.");
		} catch (error: any) {
			assert.ok(
				String(error?.message || error).includes('Organization with code "missing-org" was not found.'),
			);
		}
	});

	it("warns when explicit target differs from organization.csv", async () => {
		const client = buildClient([{ id: "org-1", code: "legacy", name: "Legacy Org" }]);

		const result = await withEnv(
			{ MIGRATION_ORGANIZATION_ID: undefined, MIGRATION_ORGANIZATION_CODE: "legacy" },
			() =>
				resolveEnterpriseOrganizationBootstrap(
					client as any,
					buildLoadedData({ code: "bnei", name: "Bandai Namco" }),
				),
		);

		assert.equal(result.source, "explicit-code");
		assert.equal(result.warnings.length, 2);
		assert.ok(result.warnings[0].includes("organization.csv code"));
	});
});
