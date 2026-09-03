import { describe, expect, it } from "vitest";

import {
	buildRequestCreateSearchParams,
	buildRequestViewSearchParams,
	clearRequestModalSearchParams,
	getActiveRequestId,
	getLeaveRequestPrefillFromSearchParams,
	getRequestCreateKind,
	getRequestRouteAction,
} from "./requests-route";

describe("requests-route", () => {
	it("returns the active request id only for view actions", () => {
		expect(
			getActiveRequestId(new URLSearchParams("action=view&id=request-123&foo=bar")),
		).toBe("request-123");
		expect(getActiveRequestId(new URLSearchParams("action=create&kind=leave"))).toBe("");
		expect(getActiveRequestId(new URLSearchParams("foo=bar"))).toBe("");
	});

	it("returns create kinds only for create actions", () => {
		expect(
			getRequestCreateKind(new URLSearchParams("action=create&kind=time-adjustment")),
		).toBe("time-adjustment");
		expect(getRequestCreateKind(new URLSearchParams("action=view&id=request-123"))).toBeNull();
		expect(getRequestCreateKind(new URLSearchParams("action=create&kind=unknown"))).toBeNull();
	});

	it("builds create search params and preserves unrelated params", () => {
		const next = buildRequestCreateSearchParams(
			new URLSearchParams("foo=bar"),
			"personnel-action",
			{ targetEmployeeId: "emp-9", intent: "TRANSFER" },
		);

		expect(next.toString()).toBe(
			"foo=bar&action=create&kind=personnel-action&targetEmployeeId=emp-9&intent=TRANSFER",
		);
	});

	it("builds view search params and clears create params", () => {
		const next = buildRequestViewSearchParams(
			new URLSearchParams("action=create&kind=leave&targetEmployeeId=emp-1&foo=bar"),
			"request-42",
		);

		expect(next.get("action")).toBe("view");
		expect(next.get("id")).toBe("request-42");
		expect(next.get("foo")).toBe("bar");
		expect(next.get("kind")).toBeNull();
		expect(next.get("targetEmployeeId")).toBeNull();
	});

	it("clears modal search params", () => {
		const next = clearRequestModalSearchParams(
			new URLSearchParams(
				"action=create&kind=overtime&id=request-1&targetEmployeeId=emp-1&intent=PROMOTION&foo=bar",
			),
		);

		expect(next.toString()).toBe("foo=bar");
		expect(getRequestRouteAction(next)).toBeNull();
	});

	it("maps timesheet date param to leave request prefill", () => {
		const prefill = getLeaveRequestPrefillFromSearchParams(
			new URLSearchParams("action=create&kind=leave&date=2026-05-12"),
		);

		expect(prefill).toEqual({
			initialStartDate: "2026-05-12",
			initialEndDate: "2026-05-12",
			initialLeaveType: undefined,
			honorPrefilledDates: true,
		});
	});

	it("prefers explicit start and end dates over date param", () => {
		const prefill = getLeaveRequestPrefillFromSearchParams(
			new URLSearchParams(
				"date=2026-05-12&startDate=2026-05-15&endDate=2026-05-17&leaveType=SICK",
			),
		);

		expect(prefill).toEqual({
			initialStartDate: "2026-05-15",
			initialEndDate: "2026-05-17",
			initialLeaveType: "SICK",
			honorPrefilledDates: true,
		});
	});

	it("clears leave prefill search params", () => {
		const next = clearRequestModalSearchParams(
			new URLSearchParams(
				"action=create&kind=leave&date=2026-05-12&startDate=2026-05-15&endDate=2026-05-17&leaveType=VACATION&foo=bar",
			),
		);

		expect(next.toString()).toBe("foo=bar");
		expect(next.get("date")).toBeNull();
		expect(next.get("startDate")).toBeNull();
		expect(next.get("endDate")).toBeNull();
		expect(next.get("leaveType")).toBeNull();
	});
});