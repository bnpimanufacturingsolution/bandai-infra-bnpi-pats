/**
 * Document Request Handler Utilities
 * Handles downloading and generation of requested documents
 */

import { toast } from "sonner";
import { downloadBIR2316PDF } from "./generate-bir2316-pdf";
import employeesService from "~/services/employees.service";
import type { Request } from "~/services/requests.service";

/**
 * Helper to get metadata field from request
 */
export const getMetadataField = (request: Request | null | undefined, field: string): any => {
	if (!request || !request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

/**
 * Employee fields needed for BIR Form 2316 generation
 */
const BIR_2316_EMPLOYEE_FIELDS = [
	"id",
	"employeeId",
	"employmentHireDate",
	"employmentTerminationDate",
	"employmentStatus",
	"basicSalary",
	"employer",
	"person.personalInfo",
	"person.contactInfo",
	"employmentHistory",
	"employeePayrolls",
].join(",");

/**
 * Fetch full employee data for document generation
 */
export async function fetchEmployeeForDocument(employeeId: string) {
	try {
		const fullEmployeeData = await employeesService
			.clearQueryParams()
			.select(BIR_2316_EMPLOYEE_FIELDS)
			.document(true)
			.getEmployeeById(employeeId);

		return fullEmployeeData;
	} catch (error) {
		console.error("Failed to fetch employee data:", error);
		throw new Error("Failed to fetch employee data for document generation");
	}
}

/**
 * Get employee name from employee data
 */
export function getEmployeeName(employeeData: any): string {
	const firstName = employeeData?.person?.personalInfo?.firstName || "";
	const lastName = employeeData?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || "Employee";
}

/**
 * Handle BIR Form 2316 download
 */
export async function handleBIR2316Download(request: Request): Promise<void> {
	try {
		const year = getMetadataField(request, "year") || new Date().getFullYear();

		// Fetch full employee data
		const fullEmployeeData = await fetchEmployeeForDocument(request.requesterId);

		// Get employee name for filename
		const employeeName = getEmployeeName(fullEmployeeData);

		// Download PDF
		await downloadBIR2316PDF({
			employeeData: fullEmployeeData,
			year: parseInt(year.toString()),
			employeeName,
		});

		toast.success("BIR Form 2316 downloaded successfully");
	} catch (error: any) {
		console.error("Error downloading BIR Form 2316:", error);
		toast.error(error?.message || "Failed to download BIR Form 2316");
		throw error;
	}
}

/**
 * Handle Certificate of Employment download
 */
export async function handleCOEDownload(request: Request): Promise<void> {
	// TODO: Implement COE download
	toast.info("Certificate of Employment download not yet implemented");
}

/**
 * Main document download handler
 * Routes to appropriate download function based on document type
 */
export async function handleDocumentDownload(request: Request): Promise<void> {
	const docType = getMetadataField(request, "documentType");
	const requestStatus = String(request.currentWorkflowStateKey || "").toUpperCase();

	// Only allow downloads for approved requests
	if (requestStatus !== "APPROVED" && requestStatus !== "COMPLETED") {
		toast.warning("Document can only be downloaded when approved");
		return;
	}

	switch (docType) {
		case "BIR_FORM_2316":
			await handleBIR2316Download(request);
			break;

		case "CERTIFICATE_OF_EMPLOYMENT":
			await handleCOEDownload(request);
			break;

		default:
			console.log("Download document request:", request);
			toast.info(
				`Download functionality not yet implemented for ${docType || "this document type"}`,
			);
	}
}

/**
 * Get document type label
 */
export function getDocumentTypeLabel(value: string): string {
	const labels: Record<string, string> = {
		CERTIFICATE_OF_EMPLOYMENT: "Certificate of Employment",
		BIR_FORM_2316: "BIR Form 2316",
	};

	return labels[value] || value || "-";
}

export function hasGeneratedDocumentFile(request?: Request | null): boolean {
	return Boolean(
		getMetadataField(request, "documentNumber") || getMetadataField(request, "documentUrl"),
	);
}

export function getDocumentRequestChangeAfterLabel(params: {
	requestState: string;
	documentTypeLabel: string;
	hasGeneratedFile: boolean;
}): string {
	const state = String(params.requestState || "").toUpperCase();
	if (state === "REJECTED") return "No document generated";
	if (state === "APPROVED") return `Generate ${params.documentTypeLabel}`;
	if (state === "COMPLETED") {
		return params.hasGeneratedFile
			? `${params.documentTypeLabel} Issued`
			: "Approved — file not generated";
	}
	return params.requestState;
}
