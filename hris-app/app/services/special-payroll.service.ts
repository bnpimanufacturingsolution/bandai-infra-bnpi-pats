import { hrisApiClient } from "../lib/api-client";

export type SpecialPayrollRunStatus = "FINALIZED" | "RELEASED" | "CANCELLED";

export type SpecialPayrollManualRow = {
	employeeNumber: string;
	compensationCode: string;
	amount: number;
	employeeName?: string | null;
	sourcePayDate?: string | null;
	sourceRowNumber?: number | null;
	employeeId?: string;
};

export type SpecialPayrollPreviewRow = {
	rowNumber: number;
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	benefitTypeId: string;
	compensationCode: string;
	compensationName: string;
	direction: string;
	isTaxable: boolean;
	amount: number;
	gross: number;
	net: number;
	sourcePayDate: string | null;
};

export type SpecialPayrollPreviewError = {
	rowNumber: number;
	employeeNumber?: string;
	compensationCode?: string;
	error: string;
	code: string;
};

export type SpecialPayrollPreview = {
	previewId: string;
	valid: boolean;
	label: string;
	periodContext: {
		contextPayrollPeriodId: string | null;
		contextPeriodCode: string | null;
		contextPeriodName: string | null;
		contextStartDate: string;
		contextEndDate: string;
		contextPayDate: string;
	};
	rows: SpecialPayrollPreviewRow[];
	errors: SpecialPayrollPreviewError[];
	totals: {
		lineCount: number;
		employeeCount: number;
		totalGross: number;
		totalNet: number;
		currency: string;
	};
	sourceFingerprint: string;
	sourceFilename: string | null;
	sourceHash: string | null;
	expiresAt: string;
};

export type SpecialPayrollRun = {
	id: string;
	runCode: string;
	label: string;
	status: SpecialPayrollRunStatus;
	contextPayrollPeriodId?: string | null;
	contextPeriodCode?: string | null;
	contextPeriodName?: string | null;
	contextStartDate: string;
	contextEndDate: string;
	contextPayDate: string;
	totalGross: number;
	totalNet: number;
	lineCount: number;
	employeeCount: number;
	currency?: string;
	sourceFilename?: string | null;
	createdAt: string;
	releasedAt?: string | null;
	cancelledAt?: string | null;
	lines?: any[];
	payslips?: SpecialPayrollPayslip[];
};

export type SpecialPayrollPayslip = {
	id: string;
	runId: string;
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	payslipNumber: string;
	grossPay: number;
	netPay: number;
	lineSnapshot: any;
	isReleased: boolean;
	releasedAt?: string | null;
	run?: {
		id: string;
		runCode: string;
		label: string;
		status: SpecialPayrollRunStatus;
		contextPeriodCode?: string | null;
		contextPeriodName?: string | null;
		contextStartDate: string;
		contextEndDate: string;
		contextPayDate: string;
		releasedAt?: string | null;
	};
};

function unwrapData<T>(response: any): T {
	let data = response?.data ?? response;
	if (data && typeof data === "object" && "data" in data) {
		data = (data as any).data;
	}
	return data as T;
}

class SpecialPayrollService {
	async previewManual(body: {
		label: string;
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
		rows: SpecialPayrollManualRow[];
	}): Promise<SpecialPayrollPreview> {
		const response = await hrisApiClient.post("/api/special-payroll/preview", body);
		return unwrapData<SpecialPayrollPreview>(response);
	}

	async previewImport(params: {
		file: File;
		label: string;
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
	}): Promise<SpecialPayrollPreview> {
		const form = new FormData();
		form.append("file", params.file);
		form.append("label", params.label);
		if (params.contextPayrollPeriodId) {
			form.append("contextPayrollPeriodId", params.contextPayrollPeriodId);
		}
		if (params.contextPeriodCode) {
			form.append("contextPeriodCode", params.contextPeriodCode);
		}
		const response = await hrisApiClient.post(
			"/api/special-payroll/import/preview",
			form,
		);
		return unwrapData<SpecialPayrollPreview>(response);
	}

	async createRun(body: {
		previewId: string;
		idempotencyKey: string;
		label?: string;
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
		sourceFingerprint?: string | null;
		sourceFilename?: string | null;
		sourceHash?: string | null;
	}): Promise<{ run: SpecialPayrollRun; reused: boolean; message?: string }> {
		const response = await hrisApiClient.post("/api/special-payroll/runs", body);
		return unwrapData(response);
	}

	async listRuns(params?: {
		status?: string;
		contextPayrollPeriodId?: string;
		page?: number;
		limit?: number;
	}): Promise<{
		runs: SpecialPayrollRun[];
		total: number;
		page: number;
		limit: number;
	}> {
		const query = new URLSearchParams();
		if (params?.status) query.set("status", params.status);
		if (params?.contextPayrollPeriodId) {
			query.set("contextPayrollPeriodId", params.contextPayrollPeriodId);
		}
		if (params?.page) query.set("page", String(params.page));
		if (params?.limit) query.set("limit", String(params.limit));
		const qs = query.toString();
		const response = await hrisApiClient.get(
			`/api/special-payroll/runs${qs ? `?${qs}` : ""}`,
		);
		return unwrapData(response);
	}

	async getRun(id: string): Promise<{ run: SpecialPayrollRun }> {
		const response = await hrisApiClient.get(`/api/special-payroll/runs/${id}`);
		return unwrapData(response);
	}

	async releaseRun(id: string): Promise<{ run: SpecialPayrollRun; alreadyReleased: boolean }> {
		const response = await hrisApiClient.post(`/api/special-payroll/runs/${id}/release`, {});
		return unwrapData(response);
	}

	async cancelRun(
		id: string,
		reason?: string,
	): Promise<{ run: SpecialPayrollRun; alreadyCancelled: boolean }> {
		const response = await hrisApiClient.post(`/api/special-payroll/runs/${id}/cancel`, {
			reason,
		});
		return unwrapData(response);
	}

	async listRunPayslips(runId: string): Promise<{ payslips: SpecialPayrollPayslip[] }> {
		const response = await hrisApiClient.get(
			`/api/special-payroll/runs/${runId}/payslips`,
		);
		return unwrapData(response);
	}

	async getPayslip(id: string): Promise<{ payslip: SpecialPayrollPayslip }> {
		const response = await hrisApiClient.get(`/api/special-payroll/payslips/${id}`);
		return unwrapData(response);
	}

	async listMyPayslips(employeeId?: string): Promise<{ payslips: SpecialPayrollPayslip[] }> {
		const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
		const response = await hrisApiClient.get(`/api/special-payroll/my-payslips${qs}`);
		return unwrapData(response);
	}

	async downloadTemplate(): Promise<Blob> {
		return hrisApiClient.getBlob("/api/special-payroll/template");
	}

	async downloadPayslipPdf(id: string): Promise<Blob> {
		return hrisApiClient.getBlob(`/api/special-payroll/payslips/${id}?format=pdf`);
	}

	getPayslipPdfUrl(id: string): string {
		return `/api/special-payroll/payslips/${id}?format=pdf`;
	}
}

export const specialPayrollService = new SpecialPayrollService();
export default specialPayrollService;
