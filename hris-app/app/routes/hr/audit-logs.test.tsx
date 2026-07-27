import { expect, test } from "vitest";
import HrAuditLogsPage from "./audit-logs";
import ActivityLogsPage from "./activity-logs";

test("audit-logs.tsx default export is activity-logs default export", () => {
	expect(HrAuditLogsPage).toBe(ActivityLogsPage);
});
