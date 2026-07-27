import { expect, test } from "vitest";
import { useHrAuditLogs, useHrActivityLogs } from "./useHrActivityLogs";

test("useHrActivityLogs hook exists", () => {
	expect(typeof useHrAuditLogs).toBe("function");
	expect(useHrActivityLogs).toBe(useHrAuditLogs);
});
