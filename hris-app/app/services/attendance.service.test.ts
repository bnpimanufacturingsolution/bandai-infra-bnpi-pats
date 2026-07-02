import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const hrisGetMock = vi.fn();
const hrisPostMock = vi.fn();

vi.mock("../lib/api-client", () => ({
	apiClient: {
		get: apiGetMock,
		post: apiPostMock,
	},
	hrisApiClient: {
		get: hrisGetMock,
		post: hrisPostMock,
	},
}));

describe("attendanceService client contract", () => {
	beforeEach(() => {
		apiGetMock.mockReset();
		apiPostMock.mockReset();
		hrisGetMock.mockReset();
		hrisPostMock.mockReset();
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches HRIS attendances from the backend API with default query flags", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		hrisGetMock.mockResolvedValueOnce({
			data: {
				attendances: [],
				pagination: { total: 0, page: 1, limit: 10 },
			},
		});

		await attendanceService.getAttendances();

		expect(hrisGetMock).toHaveBeenCalledWith(
			"/api/attendance?document=true&pagination=true&count=false",
		);
	});

	it("serializes HRIS attendance filters without leaking query params into the next call", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		hrisGetMock
			.mockResolvedValueOnce({ data: { attendances: [{ id: "attendance-1" }] } })
			.mockResolvedValueOnce({ data: { attendances: [] } });

		await attendanceService
			.setParams({
				page: 2,
				limit: 25,
				filter: { employeeId: "employee-1", status: "PRESENT" },
			})
			.getAttendances();
		await attendanceService.getAttendances();

		expect(hrisGetMock).toHaveBeenNthCalledWith(
			1,
			"/api/attendance?page=2&limit=25&filter=employeeId%3Aemployee-1%2Cstatus%3APRESENT&document=true&pagination=true&count=false",
		);
		expect(hrisGetMock).toHaveBeenNthCalledWith(
			2,
			"/api/attendance?document=true&pagination=true&count=false",
		);
	});

	it("posts attendance corrections to the HRIS correction endpoint", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					attendance: { id: "attendance-correction-1", ledgerType: "CORRECTION" },
				},
			},
		});

		const payload = {
			attendanceId: "attendance-1",
			employeeId: "employee-1",
			correctionDate: "2026-05-25",
			status: "PRESENT" as const,
			timeIn: "2026-05-25T08:00:00.000Z",
			timeOut: "2026-05-25T17:00:00.000Z",
			reasonCategory: "MISSED_PUNCH" as const,
			notes: "Corrected by employee request",
		};

		const result = await attendanceService.createAttendanceCorrection(payload);

		expect(hrisPostMock).toHaveBeenCalledWith("/api/attendance/corrections", payload);
		expect(result).toMatchObject({
			id: "attendance-correction-1",
			ledgerType: "CORRECTION",
		});
	});

	it("posts attendance backfills to the HRIS backfill endpoint", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					attendance: { id: "attendance-backfill-1", ledgerType: "RAW" },
				},
			},
		});

		const payload = {
			employeeId: "employee-1",
			correctionDate: "2026-05-25",
			status: "PRESENT" as const,
			timeIn: "2026-05-25T08:00:00.000Z",
			timeOut: "2026-05-25T17:00:00.000Z",
			reasonCategory: "MISSED_PUNCH" as const,
			notes: "Created missing attendance",
		};

		const result = await attendanceService.createAttendanceBackfill(payload);

		expect(hrisPostMock).toHaveBeenCalledWith("/api/attendance/backfill", payload);
		expect(result).toMatchObject({
			id: "attendance-backfill-1",
			ledgerType: "RAW",
		});
	});

	it("rethrows structured correction API errors for form-level handling", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		const apiError = {
			status: 409,
			message: "Timesheet is locked",
			errors: [{ field: "correctionDate", message: "TIMESHEET_LOCKED" }],
		};
		hrisPostMock.mockRejectedValueOnce(apiError);

		await expect(
			attendanceService.createAttendanceCorrection({
				attendanceId: "attendance-1",
				employeeId: "employee-1",
				correctionDate: "2026-05-25",
				status: "PRESENT",
				reasonCategory: "MISSED_PUNCH" as const,
				notes: "Needs correction review",
			}),
		).rejects.toBe(apiError);
	});

	it("rethrows structured backfill API errors for form-level handling", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		const apiError = {
			status: 409,
			message: "Attendance already exists",
			errors: [{ field: "correctionDate", message: "ALREADY_EXISTS" }],
		};
		hrisPostMock.mockRejectedValueOnce(apiError);

		await expect(
			attendanceService.createAttendanceBackfill({
				employeeId: "employee-1",
				correctionDate: "2026-05-25",
				status: "PRESENT",
				reasonCategory: "MISSED_PUNCH" as const,
				notes: "Needs backfill review",
			}),
		).rejects.toBe(apiError);
	});

	it("imports attendance files through FormData and preserves createTimesheets intent", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					jobId: "import-job-1",
					message: "Import started",
					total: 10,
				},
			},
		});
		const file = new File(["employeeId,date,timeIn"], "attendance.csv", {
			type: "text/csv",
		});

		await attendanceService.importAttendance(file, { createTimesheets: true });

		const formData = hrisPostMock.mock.calls[0][1] as FormData;
		expect(hrisPostMock.mock.calls[0][0]).toBe("/api/attendance/import");
		expect(formData.get("file")).toBe(file);
		expect(formData.get("createTimesheets")).toBe("true");
	});

	it("keeps legacy clock-in payloads on the app API client", async () => {
		const { default: attendanceService } = await import("./attendance.service");
		apiPostMock.mockResolvedValueOnce({
			data: {
				id: "attendance-legacy-1",
				employeeId: "employee-1",
			},
		});

		await attendanceService.clockIn("employee-1", { lat: 14.5995, lng: 120.9842 });

		expect(apiPostMock).toHaveBeenCalledWith("/attendance/clock-in", {
			employeeId: "employee-1",
			location: { lat: 14.5995, lng: 120.9842 },
		});
	});
});
