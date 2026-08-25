import { hrisApiClient } from "../lib/api-client";

export interface ManpowerDistributionWorkbookReference {
	sourceWorkbook: string;
	month: string;
	genderSummary: {
		female: number;
		male: number;
		total: number;
	};
	bnpiGenderSummary: {
		female: number;
		male: number;
		total: number;
	};
	agencyGenderSummary: {
		female: number;
		male: number;
		total: number;
	};
	directAgencySnapshot: {
		date: string;
		direct: number;
		agency: number;
		total: number;
	} | null;
	averageManpower: {
		month: string;
		directAverage: number;
		agencyAverage: number;
		totalAverage: number;
	} | null;
}

class ReportsService {
	async getManpowerDistributionReference(
		month = "2026-04",
	): Promise<ManpowerDistributionWorkbookReference> {
		const response = await hrisApiClient.get<any>(
			`/api/reports/manpower-distribution/reference?month=${encodeURIComponent(month)}`,
		);

		const data = response.data?.data || response.data;

		if (!data) {
			throw new Error("Failed to load manpower distribution workbook reference.");
		}

		return data as ManpowerDistributionWorkbookReference;
	}

	async downloadBir2316(employeeId: string, year: number): Promise<Blob> {
		try {
			return await hrisApiClient.getBlob(
				`/api/reports/bir/2316?employeeId=${encodeURIComponent(employeeId)}&year=${encodeURIComponent(String(year))}`,
			);
		} catch (error: unknown) {
			const apiError = error as { status?: number; message?: string };
			if (apiError?.status === 500) {
				throw new Error("BIR 2316 template or field mapping is not configured on server.");
			}
			if (apiError?.status === 404) {
				throw new Error("Employee not found for BIR 2316 generation.");
			}
			if (apiError?.status === 400) {
				throw new Error("employeeId and year are required query parameters.");
			}
			throw new Error(apiError?.message || "Failed to download BIR Form 2316.");
		}
	}

	async downloadPhilhealthRf1(periodId: string): Promise<Blob> {
		try {
			return await hrisApiClient.getBlob(
				`/api/reports/philhealth/rf1?periodId=${encodeURIComponent(periodId)}`,
			);
		} catch (error: unknown) {
			const apiError = error as { status?: number; message?: string };
			if (apiError?.status === 404) {
				throw new Error("Payroll period not found for PhilHealth RF-1.");
			}
			if (apiError?.status === 400) {
				throw new Error("periodId is a required query parameter.");
			}
			throw new Error(apiError?.message || "Failed to download PhilHealth RF-1.");
		}
	}
}

export default new ReportsService();

