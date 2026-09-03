import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export type DayStatusClass =
	| "OUT_OF_TENURE"
	| "REST_SUNDAY"
	| "PRESENT_PUNCH"
	| "PRESENT_SCHEDULE_POSITIVE"
	| "ABSENT_AWOL_EVIDENCED"
	| "LEAVE_PAID"
	| "LEAVE_UNPAID"
	| "REVIEW_NO_EVIDENCE";

export interface DayStatusReviewItem {
	code: string;
	name: string;
	date: string;
	weekday: string;
	status: DayStatusClass;
	reason: string;
	conflictWith?: Array<"punch" | "schedule_positive" | "awol" | "leave">;
	estAmount?: number | null;
}

export interface DayStatusReviewRefinement {
	leaveWorkbook?: { filename: string; sheetName?: string | null; rowsParsed: number; rowsInWindow: number } | null;
	awolWorkbook?: { filename: string; sheetName?: string | null; rowsParsed: number; rowsInWindow: number } | null;
}

export interface DayStatusReviewPayload {
	period: {
		id: string;
		code: string | null;
		name: string | null;
		startDate: string;
		endDate: string;
	};
	scheduleModel: string;
	precedence: string[];
	readOnly: boolean;
	estimateNote: string;
	scope: { employees: number; calendarDays: number; importedPaidLeaveRows?: number };
	buckets: Record<DayStatusClass, number>;
	weekdayHistogramReview: Record<string, number>;
	reviewQueue: {
		total: number;
		offset: number;
		limit: number;
		returned: number;
		truncated: boolean;
		items: DayStatusReviewItem[];
	};
	evidencedAbsent: { total: number; items: DayStatusReviewItem[] };
	perEmployee: Array<{
		code: string;
		name: string;
		counts: Partial<Record<DayStatusClass, number>>;
		reviewDays: number;
		estReviewAmount: number | null;
	}>;
	refinement?: DayStatusReviewRefinement | null;
}

export interface DayStatusReviewResponse {
	status?: string;
	message?: string;
	data: DayStatusReviewPayload;
	code?: number;
}

class DayStatusReviewService extends APIService {
	/**
	 * READ-ONLY day-status resolution for a payroll period.
	 * Mon–Sat schedule truth; bare no-shows land in a review queue.
	 */
	async getDayStatusReview(
		periodIdOrCode: string,
		params?: { limit?: number; offset?: number },
	): Promise<DayStatusReviewPayload> {
		const query = new URLSearchParams();
		if (params?.limit) query.set("limit", String(params.limit));
		if (params?.offset) query.set("offset", String(params.offset));
		const queryString = query.toString();
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${periodIdOrCode}/day-status-review${queryString ? `?${queryString}` : ""}`,
			{ timeoutMs: 120_000 },
		);
		const payload = response?.data?.data ?? response?.data;
		if (!payload) throw new Error("Invalid day-status review response");
		return payload as DayStatusReviewPayload;
	}

	/**
	 * Refine the resolution with Leave / AWOL workbooks. Files are parsed
	 * in-memory server-side; nothing is persisted.
	 */
	async refineWithWorkbooks(
		periodIdOrCode: string,
		files: { leaveFile?: File | null; awolFile?: File | null },
	): Promise<DayStatusReviewPayload> {
		const formData = new FormData();
		if (files.leaveFile) formData.append("leaveFile", files.leaveFile);
		if (files.awolFile) formData.append("awolFile", files.awolFile);
		const response = await hrisApiClient.post<any>(
			`/api/payrollperiod/${periodIdOrCode}/day-status-review/workbook`,
			formData,
			{ timeoutMs: 300_000 },
		);
		const payload = response?.data?.data ?? response?.data;
		if (!payload) throw new Error("Invalid day-status refinement response");
		return payload as DayStatusReviewPayload;
	}
}

const dayStatusReviewService = new DayStatusReviewService();
export default dayStatusReviewService;

/** Pure CSV rows builder for the review-queue export (pinned by vitest). */
export function buildDayStatusReviewCsvRows(items: DayStatusReviewItem[]): string[][] {
	const header = [
		"Employee Code",
		"Employee Name",
		"Date",
		"Weekday",
		"Status",
		"Reason",
		"Est Exposure (ESTIMATE_ONLY)",
	];
	const rows = items.map((item) => [
		item.code,
		item.name,
		item.date,
		item.weekday,
		item.status,
		item.reason,
		item.estAmount == null ? "" : String(item.estAmount),
	]);
	return [header, ...rows];
}
