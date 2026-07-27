import { describe, expect, it } from "vitest";
import { REQUEST_TYPE_OPTIONS } from "./workflows";

describe("workflows request type options", () => {
	it("keeps attendance correction available in the admin workflow designer", () => {
		expect(REQUEST_TYPE_OPTIONS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					value: "ATTENDANCE_CORRECTION",
					label: "Attendance Correction",
				}),
			]),
		);
	});
});
