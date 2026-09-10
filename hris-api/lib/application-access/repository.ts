import { PrismaClient, Prisma } from "../../generated/prisma";

/**
 * Data access for Training & Performance employee access configuration.
 *
 * Scope rules (frozen): every query is organization-scoped and filters
 * soft-deleted rows. Rows are created lazily (§18).
 */

export interface AccessConfigRecord {
	id: string;
	organizationId: string;
	employeeId: string | null;
	lmsRoleOverride: string | null;
	epmrGrants: string[];
	epmrRemovals: string[];
	provisioningStatus: string;
	lastProvisionedAt: Date | null;
	lastBridgeSnapshot: unknown;
	lastSyncError: string | null;
	isDeleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}

const toRecord = (row: any): AccessConfigRecord => ({
	id: row.id,
	organizationId: row.organizationId,
	employeeId: row.employeeId,
	lmsRoleOverride: row.lmsRoleOverride ?? null,
	epmrGrants: Array.isArray(row.epmrGrants) ? row.epmrGrants : [],
	epmrRemovals: Array.isArray(row.epmrRemovals) ? row.epmrRemovals : [],
	provisioningStatus: row.provisioningStatus,
	lastProvisionedAt: row.lastProvisionedAt ?? null,
	lastBridgeSnapshot: row.lastBridgeSnapshot ?? null,
	lastSyncError: row.lastSyncError ?? null,
	isDeleted: Boolean(row.isDeleted),
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

export const accessRepository = (prisma: PrismaClient) => ({
	async findByEmployee(
		organizationId: string,
		employeeId: string,
	): Promise<AccessConfigRecord | null> {
		const row = await prisma.employeeApplicationAccess.findFirst({
			where: { organizationId, employeeId, isDeleted: false },
		});
		return row ? toRecord(row) : null;
	},

	async listByOrganization(
		organizationId: string,
	): Promise<AccessConfigRecord[]> {
		const rows = await prisma.employeeApplicationAccess.findMany({
			where: { organizationId, isDeleted: false },
		});
		return rows.map(toRecord);
	},

	async create(
		data: {
			organizationId: string;
			employeeId: string;
			lmsRoleOverride: string | null;
			epmrGrants: string[];
			epmrRemovals: string[];
		},
	): Promise<AccessConfigRecord> {
		const row = await prisma.employeeApplicationAccess.create({
			data: {
				organizationId: data.organizationId,
				employeeId: data.employeeId,
				lmsRoleOverride: data.lmsRoleOverride,
				epmrGrants: data.epmrGrants,
				epmrRemovals: data.epmrRemovals,
				provisioningStatus: "PENDING",
			},
		});
		return toRecord(row);
	},

	async replace(
		id: string,
		data: {
			lmsRoleOverride: string | null;
			epmrGrants: string[];
			epmrRemovals: string[];
		},
	): Promise<AccessConfigRecord> {
		const row = await prisma.employeeApplicationAccess.update({
			where: { id },
			data: {
				lmsRoleOverride: data.lmsRoleOverride,
				epmrGrants: data.epmrGrants,
				epmrRemovals: data.epmrRemovals,
				provisioningStatus: "PENDING",
				lastSyncError: null,
			},
		});
		return toRecord(row);
	},

	async upsertTelemetry(
		organizationId: string,
		employeeId: string,
		telemetry: {
			provisioningStatus: "SYNCED" | "FAILED";
			lastBridgeSnapshot?: unknown;
			lastSyncError?: string | null;
		},
	): Promise<void> {
		const data: Prisma.EmployeeApplicationAccessUpdateInput = {
			provisioningStatus: telemetry.provisioningStatus,
			lastProvisionedAt: new Date(),
			lastBridgeSnapshot: telemetry.lastBridgeSnapshot === undefined
				? undefined
				: (telemetry.lastBridgeSnapshot as any),
			lastSyncError: telemetry.lastSyncError ?? null,
		};
		await prisma.employeeApplicationAccess.upsert({
			where: { organizationId_employeeId: { organizationId, employeeId } },
			create: {
				organizationId,
				employeeId,
				lmsRoleOverride: null,
				epmrGrants: [],
				epmrRemovals: [],
				provisioningStatus: telemetry.provisioningStatus,
				lastProvisionedAt: new Date(),
				lastBridgeSnapshot: telemetry.lastBridgeSnapshot === undefined
					? Prisma.JsonNull
					: (telemetry.lastBridgeSnapshot as any),
				lastSyncError: telemetry.lastSyncError ?? null,
			},
			update: data,
		});
	},
});

export type AccessRepository = ReturnType<typeof accessRepository>;
