import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hrisGetMock = vi.hoisted(() => vi.fn());
const hrisPostMock = vi.hoisted(() => vi.fn());
const hrisPatchMock = vi.hoisted(() => vi.fn());
const hrisPatchFormMock = vi.hoisted(() => vi.fn());
const hrisDeleteMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api-client", () => ({
	apiClient: {},
	hrisApiClient: {
		get: hrisGetMock,
		post: hrisPostMock,
		patch: hrisPatchMock,
		patchForm: hrisPatchFormMock,
		delete: hrisDeleteMock,
	},
}));

describe("employeesService client contract", () => {
	beforeEach(() => {
		vi.resetModules();
		hrisGetMock.mockReset();
		hrisPostMock.mockReset();
		hrisPatchMock.mockReset();
		hrisPatchFormMock.mockReset();
		hrisDeleteMock.mockReset();
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("serializes employee list filters and clears them before the next read", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisGetMock
			.mockResolvedValueOnce({ data: { employees: [{ id: "employee-1" }] } })
			.mockResolvedValueOnce({ data: { employees: [] } });

		await employeesService.getEmployeesWithParams({
			fields: ["id", "employeeId", "employmentStatus"],
			page: 2,
			limit: 25,
			filter: { employmentStatus: "ACTIVE" },
		});
		await employeesService.getEmployees();

		expect(hrisGetMock).toHaveBeenNthCalledWith(
			1,
			"/api/employee?fields=id%2CemployeeId%2CemploymentStatus&page=2&limit=25&filter=employmentStatus%3AACTIVE&document=true&pagination=true&count=false",
		);
		expect(hrisGetMock).toHaveBeenNthCalledWith(
			2,
			"/api/employee?document=true&pagination=true&count=false",
		);
	});

	it("uses the employee endpoint contract for organization reporting counts", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisGetMock
			.mockResolvedValueOnce({ data: { count: 138 } })
			.mockResolvedValueOnce({ data: { count: 24 } })
			.mockResolvedValueOnce({ data: { count: 7 } });

		await expect(
			employeesService.getOrganizationReportingCounts({ departmentId: "dept-1" }),
		).resolves.toEqual({
			totalEmployees: 138,
			withDirectReports: 24,
			withoutImmediateSupervisor: 7,
		});

		expect(hrisGetMock).toHaveBeenNthCalledWith(
			1,
			"/api/employee?fields=id&page=1&limit=1&filter=departmentId%3Adept-1&document=false&pagination=false&count=true",
		);
		expect(hrisGetMock).toHaveBeenNthCalledWith(
			2,
			"/api/employee?fields=id&page=1&limit=1&filter=directReports%3Aexists%2CdepartmentId%3Adept-1&document=false&pagination=false&count=true",
		);
		expect(hrisGetMock).toHaveBeenNthCalledWith(
			3,
			"/api/employee?fields=id&page=1&limit=1&filter=reportToId%3Anull%2CdepartmentId%3Adept-1&document=false&pagination=false&count=true",
		);
	});

	it("sends timeIn when clocking in through the employee attendance endpoint", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-05T08:30:00.000Z"));
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				id: "attendance-1",
				employeeId: "employee-1",
				timeIn: "2026-06-05T08:30:00.000Z",
				timeOut: null,
			},
		});

		await employeesService.clockIn("employee-1", { lat: 14.5995, lng: 120.9842 });

		expect(hrisPostMock).toHaveBeenCalledWith("/api/employee/employee-1/attendance", {
			date: "2026-06-05",
			timeIn: "2026-06-05T08:30:00.000Z",
			status: "PRESENT",
			location: { lat: 14.5995, lng: 120.9842 },
			notes: undefined,
		});
	});

	it("uses the Manila business date when clocking in after UTC date lag", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-07T16:30:00.000Z"));
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				id: "attendance-2",
				employeeId: "employee-1",
				date: "2026-06-08T00:00:00.000Z",
				timeIn: "2026-06-07T16:30:00.000Z",
				timeOut: null,
			},
		});

		await employeesService.clockIn("employee-1");

		expect(hrisPostMock).toHaveBeenCalledWith("/api/employee/employee-1/attendance", {
			date: "2026-06-08",
			timeIn: "2026-06-07T16:30:00.000Z",
			status: "PRESENT",
			location: undefined,
			notes: undefined,
		});
	});

	it("builds organization reporting deep links for chart counts and gap lists", async () => {
		const { buildOrganizationReportingDeepLink } = await import("./employees.service");

		expect(
			buildOrganizationReportingDeepLink("withoutImmediateSupervisor", {
				departmentId: "dept-1",
			}),
		).toBe(
			"/hr/employees?view=list&filter=reportToId%3Anull&departmentId=dept-1",
		);
		expect(buildOrganizationReportingDeepLink("withDirectReports")).toBe(
			"/hr/employees?view=list&filter=directReports%3Aexists",
		);
		expect(
			buildOrganizationReportingDeepLink("withDirectReports", {
				departmentId: "dept-1",
			}),
		).toBe(
			"/hr/employees?view=list&filter=directReports%3Aexists&departmentId=dept-1",
		);
	});

	it("creates an employee with account as FormData when document files are present", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				id: "employee-2",
				documents: [],
				schedules: [],
			},
		});
		const governmentId = new File(["id"], "government-id.pdf", {
			type: "application/pdf",
		});

		await employeesService.createEmployeeWithAccount({
			person: { personalInfo: { firstName: "Ada", lastName: "Lovelace" } },
			user: { email: "ada@example.test" },
			files: {
				governmentId,
				emptySlot: null,
			},
		});

		const formData = hrisPostMock.mock.calls[0][1] as FormData;
		expect(hrisPostMock).toHaveBeenCalledWith("/api/employee", expect.any(FormData));
		expect(formData.get("documents")).toBe(governmentId);
		expect(formData.getAll("documentTypes")).toEqual(["governmentId"]);
		expect(JSON.parse(String(formData.get("data")))).toMatchObject({
			user: { email: "ada@example.test" },
		});
		expect(String(formData.get("data"))).not.toContain("files");
	});

	it("updates employee documents with files through patchForm and document type metadata", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisPatchFormMock.mockResolvedValueOnce({
			data: {
				id: "employee-3",
				documents: [],
				schedules: [],
			},
		});
		const taxDocument = new File(["tax"], "tax.pdf", { type: "application/pdf" });

		await employeesService.updateEmployeeDocuments("employee-3", {
			documents: [{ type: "tax", name: "Tax Form" } as any],
			files: {
				taxDocument,
			},
		});

		const formData = hrisPatchFormMock.mock.calls[0][1] as FormData;
		expect(hrisPatchFormMock).toHaveBeenCalledWith(
			"/api/employee/employee-3",
			expect.any(FormData),
		);
		expect(formData.get("documents")).toBe(taxDocument);
		expect(formData.get("documentTypes")).toBe("taxDocument");
		expect(JSON.parse(String(formData.get("data")))).toEqual({
			documents: [{ type: "tax", name: "Tax Form" }],
		});
	});

	it("imports employees with provisioning and default leave-balance intent in FormData", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({ data: { jobId: "import-job-1" } });
		const file = new File(["employeeId,email"], "employees.csv", { type: "text/csv" });

		await employeesService.importEmployees(file, {
			autoCreate: true,
			applyDefaultLeaveBalances: true,
			importMode: "full",
			enableAccountProvisioning: false,
			enableCredentialEmails: false,
		});

		const formData = hrisPostMock.mock.calls[0][1] as FormData;
		expect(hrisPostMock.mock.calls[0][0]).toBe("/api/employee/import");
		expect(formData.get("file")).toBe(file);
		expect(formData.get("autoCreate")).toBe("true");
		expect(formData.get("applyDefaultLeaveBalances")).toBe("true");
		expect(formData.get("importMode")).toBe("full");
		expect(formData.get("enableAccountProvisioning")).toBe("false");
		expect(formData.get("enableCredentialEmails")).toBe("false");
	});

	it("returns null for expired import progress jobs when the API client throws a 404 status", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisGetMock.mockRejectedValueOnce({ status: 404, message: "Job not found" });

		await expect(employeesService.getImportProgress("missing-job")).resolves.toBeNull();
	});

	it("encodes document keys before deleting employee documents", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisDeleteMock.mockResolvedValueOnce({ data: { deleted: true } });

		await employeesService.deleteDocument("employee-4", "BIR 2316/2026");

		expect(hrisDeleteMock).toHaveBeenCalledWith(
			"/api/employee/documents/BIR%202316%2F2026?employeeId=employee-4",
		);
	});

	it("previews employee hard delete before any execute request", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					mode: "preview",
					execute: false,
					safeToExecute: false,
					summary: { blockerCount: 1 },
					blockers: [{ reason: "attendance records exist", count: 4 }],
				},
			},
		});

		await employeesService.previewEmployeeHardDelete("employee-5");

		expect(hrisPostMock).toHaveBeenCalledWith(
			"/api/employee/employee-5/hard-delete-preview",
			{ execute: false, dryRun: true },
		);
	});

	it("requires explicit confirmation to execute employee hard delete", async () => {
		const { default: employeesService } = await import("./employees.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					mode: "executed",
					execute: true,
					safeToExecute: true,
					summary: { blockerCount: 0 },
				},
			},
		});

		await employeesService.executeEmployeeHardDelete("employee-6", "DELETE BNPI-0006");

		expect(hrisPostMock).toHaveBeenCalledWith(
			"/api/employee/employee-6/hard-delete-preview",
			{ execute: true, dryRun: false, confirmation: "DELETE BNPI-0006" },
		);
	});
});
