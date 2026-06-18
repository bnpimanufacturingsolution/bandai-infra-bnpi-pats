import {
	DocumentReviewEventType,
	DocumentReviewSource,
	DocumentReviewStatus,
	Prisma,
	PrismaClient,
	type Document,
} from "../generated/prisma";

const toRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value)
		? { ...(value as Record<string, any>) }
		: {};

const normalizeStatus = (value: unknown): DocumentReviewStatus | null => {
	const normalized = String(value || "")
		.trim()
		.toUpperCase();
	if (normalized === "PENDING") return DocumentReviewStatus.PENDING;
	if (normalized === "APPROVED") return DocumentReviewStatus.APPROVED;
	if (normalized === "REJECTED") return DocumentReviewStatus.REJECTED;
	if (normalized === "CANCELLED") return DocumentReviewStatus.CANCELLED;
	return null;
};

const normalizeSource = (value: unknown): DocumentReviewSource => {
	const normalized = String(value || "")
		.trim()
		.toUpperCase();
	if (normalized === "HR_UPLOAD") return DocumentReviewSource.HR_UPLOAD;
	if (normalized === "MIGRATION") return DocumentReviewSource.MIGRATION;
	if (normalized === "SYSTEM") return DocumentReviewSource.SYSTEM;
	return DocumentReviewSource.EMPLOYEE_UPLOAD;
};

const parseDate = (value: unknown): Date | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (!value) return null;
	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date;
};

export const getLegacyDocumentReview = (metadata: unknown): Record<string, any> => {
	const metadataRecord = toRecord(metadata);
	return toRecord(metadataRecord.review);
};

export const buildPendingDocumentReviewData = (params: {
	submittedByEmployeeId: string;
	source?: DocumentReviewSource;
	now?: Date;
}): Prisma.DocumentUncheckedUpdateInput => {
	const now = params.now || new Date();
	return {
		reviewStatus: DocumentReviewStatus.PENDING,
		reviewSubmittedAt: now,
		reviewSubmittedById: params.submittedByEmployeeId,
		reviewApprovedAt: null,
		reviewApprovedById: null,
		reviewRejectedAt: null,
		reviewRejectedById: null,
		reviewRejectionReason: null,
		reviewSource: params.source || DocumentReviewSource.EMPLOYEE_UPLOAD,
	};
};

export const buildDocumentReviewCompatibilityMetadata = (params: {
	existingMetadata?: unknown;
	status: DocumentReviewStatus;
	submittedAt?: Date | null;
	submittedByEmployeeId?: string | null;
	approvedAt?: Date | null;
	approvedByEmployeeId?: string | null;
	rejectedAt?: Date | null;
	rejectedByEmployeeId?: string | null;
	rejectionReason?: string | null;
	source?: DocumentReviewSource | null;
}) => {
	const metadata = toRecord(params.existingMetadata);
	const existingReview = getLegacyDocumentReview(metadata);

	return {
		...metadata,
		review: {
			...existingReview,
			status: params.status,
			submittedAt: params.submittedAt?.toISOString() || existingReview.submittedAt || null,
			submittedByEmployeeId:
				params.submittedByEmployeeId || existingReview.submittedByEmployeeId || null,
			approvedAt: params.approvedAt?.toISOString() || null,
			approvedByEmployeeId: params.approvedByEmployeeId || null,
			rejectedAt: params.rejectedAt?.toISOString() || null,
			rejectedByEmployeeId: params.rejectedByEmployeeId || null,
			rejectionReason: params.rejectionReason || null,
			source: params.source || existingReview.source || null,
		},
	};
};

export const extractDocumentReviewSnapshot = (documentOrMetadata: unknown) => {
	const record = toRecord(documentOrMetadata);
	const documentLike = record.metadata !== undefined || record.reviewStatus !== undefined;
	const metadata = documentLike ? record.metadata : documentOrMetadata;
	const legacyReview = getLegacyDocumentReview(metadata);
	const structuredStatus = normalizeStatus(record.reviewStatus);
	const legacyStatus = normalizeStatus(legacyReview.status);
	const status = structuredStatus || legacyStatus;

	if (!status && Object.keys(legacyReview).length === 0) return null;

	const submittedAt =
		parseDate(record.reviewSubmittedAt) || parseDate(legacyReview.submittedAt);
	const approvedAt = parseDate(record.reviewApprovedAt) || parseDate(legacyReview.approvedAt);
	const rejectedAt = parseDate(record.reviewRejectedAt) || parseDate(legacyReview.rejectedAt);
	const source = record.reviewSource || legacyReview.source || null;

	return {
		status,
		submittedAt: submittedAt?.toISOString() || null,
		submittedByEmployeeId:
			String(record.reviewSubmittedById || legacyReview.submittedByEmployeeId || "").trim() ||
			null,
		submittedByLabel: String(legacyReview.submittedByLabel || "").trim() || null,
		approvedAt: approvedAt?.toISOString() || null,
		approvedByEmployeeId:
			String(record.reviewApprovedById || legacyReview.approvedByEmployeeId || "").trim() ||
			null,
		approvedByLabel: String(legacyReview.approvedByLabel || "").trim() || null,
		rejectedAt: rejectedAt?.toISOString() || null,
		rejectedByEmployeeId:
			String(record.reviewRejectedById || legacyReview.rejectedByEmployeeId || "").trim() ||
			null,
		rejectedByLabel: String(legacyReview.rejectedByLabel || "").trim() || null,
		rejectionReason:
			String(record.reviewRejectionReason || legacyReview.rejectionReason || "").trim() ||
			null,
		source,
	};
};

export const getDocumentReviewStatusValue = (documentOrMetadata: unknown) =>
	extractDocumentReviewSnapshot(documentOrMetadata)?.status || "";

export const createDocumentReviewEvent = async (params: {
	prisma: PrismaClient;
	organizationId: string;
	document: Pick<
		Document,
		"id" | "employeeId" | "reviewStatus" | "fileUrl" | "fieldValues" | "metadata"
	>;
	eventType: DocumentReviewEventType;
	toStatus: DocumentReviewStatus;
	actorEmployeeId?: string | null;
	reason?: string | null;
	comments?: string | null;
	source?: DocumentReviewSource;
	fieldChanges?: Prisma.InputJsonValue | null;
	now?: Date;
}) => {
	const snapshot = extractDocumentReviewSnapshot(params.document);
	const fromStatus = normalizeStatus(snapshot?.status);
	await params.prisma.documentReviewEvent.create({
		data: {
			organizationId: params.organizationId,
			documentId: params.document.id,
			employeeId: params.document.employeeId,
			actorEmployeeId: params.actorEmployeeId || null,
			eventType: params.eventType,
			fromStatus,
			toStatus: params.toStatus,
			reason: params.reason || null,
			comments: params.comments || null,
			source: params.source || DocumentReviewSource.EMPLOYEE_UPLOAD,
			fileUrl: params.document.fileUrl || null,
			fieldChanges: params.fieldChanges ?? undefined,
			occurredAt: params.now || new Date(),
		},
	});
};

export {
	DocumentReviewEventType,
	DocumentReviewSource,
	DocumentReviewStatus,
	normalizeSource as normalizeDocumentReviewSource,
	normalizeStatus as normalizeDocumentReviewStatus,
};
