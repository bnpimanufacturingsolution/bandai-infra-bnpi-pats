import type { PrismaClient } from "../../generated/prisma";
import type { LoadedEnterpriseCsvData } from "./enterprise-csv-loader";

type OrganizationRecord = {
	id: string;
	code: string;
	name: string;
	description?: string | null;
	branding?: unknown;
	isDeleted?: boolean;
};

type OrganizationBootstrapClient = Pick<PrismaClient, "organization">;

export interface EnterpriseOrganizationBootstrapResult {
	organizationId: string;
	organizationCode?: string;
	organizationName?: string;
	source: "explicit-id" | "explicit-code" | "csv-existing-code" | "csv-created";
	warnings: string[];
}

const readTrimmedEnv = (key: string) => String(process.env[key] || "").trim();

const compareExplicitSelectionToCsv = (
	resolvedOrganization: Pick<OrganizationRecord, "id" | "code" | "name">,
	loadedData: LoadedEnterpriseCsvData,
): string[] => {
	const csvOrganization = loadedData.data.organization;
	if (!csvOrganization) return [];

	const warnings: string[] = [];
	const csvCode = String(csvOrganization.code || "").trim();
	const csvName = String(csvOrganization.name || "").trim();

	if (csvCode && csvCode !== resolvedOrganization.code) {
		warnings.push(
			`Explicit organization target "${resolvedOrganization.code}" differs from organization.csv code "${csvCode}".`,
		);
	}

	if (csvName && csvName !== resolvedOrganization.name) {
		warnings.push(
			`Explicit organization target "${resolvedOrganization.name}" differs from organization.csv name "${csvName}".`,
		);
	}

	return warnings;
};

const requireCsvOrganization = (loadedData: LoadedEnterpriseCsvData) => {
	const csvOrganization = loadedData.data.organization;
	if (!csvOrganization) {
		throw new Error(
			'Enterprise CSV organization bootstrap requires a valid "organization.csv" foundation row when no explicit MIGRATION_ORGANIZATION_ID or MIGRATION_ORGANIZATION_CODE is provided.',
		);
	}

	return csvOrganization;
};

export const resolveEnterpriseOrganizationBootstrap = async (
	client: OrganizationBootstrapClient,
	loadedData: LoadedEnterpriseCsvData,
): Promise<EnterpriseOrganizationBootstrapResult> => {
	const explicitId = readTrimmedEnv("MIGRATION_ORGANIZATION_ID");
	if (explicitId) {
		const organization = await client.organization.findFirst({
			where: {
				id: explicitId,
				isDeleted: false,
			},
			select: { id: true, code: true, name: true },
		});

		if (!organization) {
			throw new Error(
				`Organization with id "${explicitId}" was not found. Verify MIGRATION_ORGANIZATION_ID or remove it to bootstrap from organization.csv.`,
			);
		}

		return {
			organizationId: organization.id,
			organizationCode: organization.code,
			organizationName: organization.name,
			source: "explicit-id",
			warnings: compareExplicitSelectionToCsv(organization, loadedData),
		};
	}

	const explicitCode = readTrimmedEnv("MIGRATION_ORGANIZATION_CODE");
	if (explicitCode) {
		const organization = await client.organization.findFirst({
			where: {
				code: explicitCode,
				isDeleted: false,
			},
			select: { id: true, code: true, name: true },
		});

		if (!organization) {
			throw new Error(
				`Organization with code "${explicitCode}" was not found. Verify MIGRATION_ORGANIZATION_CODE or remove it to bootstrap from organization.csv.`,
			);
		}

		return {
			organizationId: organization.id,
			organizationCode: organization.code,
			organizationName: organization.name,
			source: "explicit-code",
			warnings: compareExplicitSelectionToCsv(organization, loadedData),
		};
	}

	const csvOrganization = requireCsvOrganization(loadedData);
	const existingOrganization = await client.organization.findFirst({
		where: {
			code: csvOrganization.code,
			isDeleted: false,
		},
		select: { id: true, code: true, name: true },
	});

	if (existingOrganization) {
		return {
			organizationId: existingOrganization.id,
			organizationCode: existingOrganization.code,
			organizationName: existingOrganization.name,
			source: "csv-existing-code",
			warnings: [],
		};
	}

	const createdOrganization = await client.organization.create({
		data: {
			code: csvOrganization.code,
			name: csvOrganization.name,
			description: csvOrganization.description,
			branding: csvOrganization.branding,
			isDeleted: false,
		},
		select: { id: true, code: true, name: true },
	});

	return {
		organizationId: createdOrganization.id,
		organizationCode: createdOrganization.code,
		organizationName: createdOrganization.name,
		source: "csv-created",
		warnings: [],
	};
};
