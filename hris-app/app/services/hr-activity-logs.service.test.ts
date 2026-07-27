import { describe, expect, it, vi } from "vitest";
import hrAuditLogsService from "./hr-activity-logs.service";
import { hrisApiClient } from "../lib/api-client";

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		get: vi.fn(),
	},
}));

describe("HrAuditLogsService", () => {
	it("fetches hr audit logs with correct URL", async () => {
		const mockResponse = {
			success: true,
			message: "Success",
			data: {
				auditLoggings: [],
			},
		};
		vi.mocked(hrisApiClient.get).mockResolvedValue(mockResponse);

		const result = await hrAuditLogsService.getHrAuditLogs();
		expect(hrisApiClient.get).toHaveBeenCalledWith(expect.stringContaining("/api/auth/hr/audit-logs"));
		expect(result).toEqual({ auditLoggings: [] });
	});
});
