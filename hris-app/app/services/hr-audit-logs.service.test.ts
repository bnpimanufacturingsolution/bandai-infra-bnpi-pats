import { expect, test } from "vitest";
import hrAuditLogsService from "./hr-audit-logs.service";
import hrActivityLogsService from "./hr-activity-logs.service";

test("hr-audit-logs.service.ts re-exports hr-activity-logs.service default", () => {
	expect(hrAuditLogsService).toBe(hrActivityLogsService);
});
