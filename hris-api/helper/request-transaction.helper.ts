import {
	Prisma,
	PrismaClient,
	RequestTransactionActorType,
	RequestTransactionEventCategory,
	RequestTransactionEventKey,
	RequestTransactionVisibility,
} from "../generated/prisma";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

type RequestFieldChange = {
	field: string;
	label: string;
	before: unknown;
	after: unknown;
};

type CreateRequestTransactionParams = {
	organizationId: string;
	requestId: string;
	workflowInstanceId?: string | null;
	stepExecutionId?: string | null;
	actorEmployeeId?: string | null;
	actorRole?: string | null;
	actorDisplayName?: string | null;
	actorType?: RequestTransactionActorType;
	eventCategory: RequestTransactionEventCategory;
	eventKey: RequestTransactionEventKey;
	eventSource?: string | null;
	title: string;
	description?: string | null;
	comments?: string | null;
	fromStateKey?: string | null;
	toStateKey?: string | null;
	fieldChanges?: RequestFieldChange[] | null;
	metadata?: Record<string, unknown> | null;
	visibility?: RequestTransactionVisibility;
	isSystemGenerated?: boolean;
	occurredAt?: Date;
};

const ROLE_TO_ACTOR_TYPE: Record<string, RequestTransactionActorType> = {
	"hris-admin": RequestTransactionActorType.HR,
	"hris-hr-manager": RequestTransactionActorType.HR,
	"hris-hr-user": RequestTransactionActorType.HR,
	"hris-employee-manager": RequestTransactionActorType.MANAGER,
	"hris-line-leader": RequestTransactionActorType.MANAGER,
	"hris-employee": RequestTransactionActorType.EMPLOYEE,
	admin: RequestTransactionActorType.HR,
	super_admin: RequestTransactionActorType.HR,
	superadmin: RequestTransactionActorType.HR,
};

const normalizeLabel = (field: string): string =>
	field
		.split(".")
		.at(-1)!
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

export const resolveRequestTransactionActorType = (
	role?: string | null,
	isSystemGenerated?: boolean,
): RequestTransactionActorType => {
	if (isSystemGenerated) {
		return RequestTransactionActorType.SYSTEM;
	}

	const normalizedRole = String(role || "")
		.trim()
		.toLowerCase();

	return ROLE_TO_ACTOR_TYPE[normalizedRole] || RequestTransactionActorType.UNKNOWN;
};

export const buildRequestFieldChanges = (
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): RequestFieldChange[] => {
	const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

	return keys
		.filter((key) => {
			const beforeValue = before[key];
			const afterValue = after[key];
			return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
		})
		.map((key) => ({
			field: key,
			label: normalizeLabel(key),
			before: before[key],
			after: after[key],
		}));
};

export async function createRequestTransaction(
	prisma: PrismaExecutor,
	params: CreateRequestTransactionParams,
) {
	const sequenceNumber =
		(await prisma.requestTransaction.count({
			where: {
				requestId: params.requestId,
			},
		})) + 1;

	return prisma.requestTransaction.create({
		data: {
			organizationId: params.organizationId,
			requestId: params.requestId,
			workflowInstanceId: params.workflowInstanceId ?? null,
			stepExecutionId: params.stepExecutionId ?? null,
			actorEmployeeId: params.actorEmployeeId ?? null,
			actorRole: params.actorRole ?? null,
			actorDisplayName: params.actorDisplayName ?? null,
			actorType:
				params.actorType ??
				resolveRequestTransactionActorType(params.actorRole, params.isSystemGenerated),
			eventCategory: params.eventCategory,
			eventKey: params.eventKey,
			eventSource: params.eventSource ?? null,
			title: params.title,
			description: params.description ?? null,
			comments: params.comments ?? null,
			fromStateKey: params.fromStateKey ?? null,
			toStateKey: params.toStateKey ?? null,
			fieldChanges: params.fieldChanges
				? (params.fieldChanges as unknown as Prisma.InputJsonValue)
				: undefined,
			metadata: params.metadata
				? (params.metadata as unknown as Prisma.InputJsonValue)
				: undefined,
			visibility: params.visibility ?? RequestTransactionVisibility.SHARED,
			isSystemGenerated: params.isSystemGenerated ?? false,
			occurredAt: params.occurredAt ?? new Date(),
			sequenceNumber,
		},
	});
}
