import { hrisApiClient } from "~/lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import { applyInferredDocumentFieldValidation } from "~/lib/utils/document-field-validation";

export type DocumentTypeFieldOption = {
	label: string;
	value: string;
};

export type DocumentTypeFieldValidation = {
	preset?: "PH_SSS" | "PH_TIN" | "PH_PAGIBIG" | "PH_PHILHEALTH" | "CUSTOM" | string | null;
	pattern?: string | null;
	message?: string | null;
	normalize?: "digits" | "trim" | "none" | string | null;
	minLength?: number | null;
	maxLength?: number | null;
	allowHyphens?: boolean | null;
};

export type DocumentTypeField = {
	key: string;
	label: string;
	type: "text" | "number" | "date" | "select" | "boolean" | "file";
	required?: boolean;
	helperText?: string | null;
	placeholder?: string | null;
	options?: DocumentTypeFieldOption[];
	validation?: DocumentTypeFieldValidation | null;
};

export type DocumentTypeMetadata = Record<string, unknown> & {
	priorityLevel?: "HIGH" | "MEDIUM" | "LOW";
	requiredForPayroll?: boolean;
	requiredForOnboarding?: boolean;
	requireFileForCompliance?: boolean;
	requiredForDepartments?: string[] | string;
	requiredForPositions?: string[] | string;
	requiredForEmploymentTypes?: string[] | string;
	requiredForRoles?: string[] | string;
};

export type DocumentType = {
	id: string;
	organizationId: string;
	code: string;
	name: string;
	category?: string | null;
	uploadBy: "HR" | "EMPLOYEE" | "BOTH";
	isRequired: boolean;
	isEmployeeVisible: boolean;
	isActive: boolean;
	displayOrder: number;
	fields: DocumentTypeField[];
	metadata?: DocumentTypeMetadata | null;
	createdAt: string;
	updatedAt: string;
};

export type CreateDocumentTypeRequest = Omit<
	DocumentType,
	"id" | "createdAt" | "updatedAt"
>;

export type UpdateDocumentTypeRequest = Partial<CreateDocumentTypeRequest>;

export interface DocumentTypesResponse {
	documentTypes: DocumentType[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

class DocumentTypesService extends APIService {
	async getDocumentTypes(): Promise<DocumentTypesResponse> {
		const response = await hrisApiClient.get<any>(`/api/document-type${this.getQueryString()}`);
		const payload = response.data?.data || response.data;
		return {
			...(payload as DocumentTypesResponse),
			documentTypes: ((payload as DocumentTypesResponse).documentTypes || []).map(
				(documentType) => applyInferredDocumentFieldValidation(documentType),
			),
		};
	}

	async getDocumentTypeById(id: string): Promise<DocumentType> {
		const response = await hrisApiClient.get<any>(`/api/document-type/${id}`);
		return applyInferredDocumentFieldValidation(
			(response.data?.data || response.data) as DocumentType,
		);
	}

	async createDocumentType(payload: CreateDocumentTypeRequest): Promise<DocumentType> {
		const response = await hrisApiClient.post<any>("/api/document-type", payload);
		return (response.data?.data || response.data) as DocumentType;
	}

	async updateDocumentType(
		id: string,
		payload: UpdateDocumentTypeRequest,
	): Promise<DocumentType> {
		const response = await hrisApiClient.patch<any>(`/api/document-type/${id}`, payload);
		return (response.data?.data || response.data) as DocumentType;
	}

	async deleteDocumentType(id: string): Promise<{ id: string }> {
		const response = await hrisApiClient.delete<any>(`/api/document-type/${id}`);
		return (response.data?.data || response.data) as { id: string };
	}
}

export type DocumentTypeQueryParams = ApiQueryParams;

const documentTypesService = new DocumentTypesService();
export default documentTypesService;
