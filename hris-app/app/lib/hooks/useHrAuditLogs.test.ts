import { expect, test } from "vitest";
import { useHrAuditLogs } from "./useHrAuditLogs";
import { useHrActivityLogs } from "./useHrActivityLogs";

test("useHrAuditLogs.ts re-exports hooks from useHrActivityLogs", () => {
	expect(useHrAuditLogs).toBe(useHrActivityLogs);
});
