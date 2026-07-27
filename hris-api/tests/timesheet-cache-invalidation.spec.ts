import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);

describe("timesheet cache invalidation contract", () => {
	it("invalidates byIdentifier cache keys in invalidateTimesheetCaches", () => {
		const helperStart = controllerSource.indexOf("const invalidateTimesheetCaches = async");
		const helperEnd = controllerSource.indexOf("const getRequestStateKey = (");
		const helperBlock = controllerSource.slice(helperStart, helperEnd);

		expect(helperBlock).to.include("cache:timesheet:byIdentifier:${timesheetId}:*");
		expect(helperBlock).to.include("cache:timesheet:byIdentifier:${code}:*");
	});

	it("routes update, action, submit, and remove through invalidateTimesheetCaches", () => {
		for (const marker of [
			"Cache invalidated after timesheet update",
			"Cache invalidated after timesheet ${id} action",
			"Cache invalidated after timesheet resubmission",
			"Cache invalidated after timesheet ${id} deletion",
		]) {
			const markerIndex = controllerSource.indexOf(marker);
			expect(markerIndex).to.be.greaterThan(-1);
			const surrounding = controllerSource.slice(
				Math.max(0, markerIndex - 250),
				markerIndex + marker.length,
			);
			expect(surrounding).to.include("invalidateTimesheetCaches(");
		}
	});

	it("documents getById cache key shape used by the router", () => {
		expect(controllerSource).to.include(
			"cache:timesheet:byIdentifier:${id}:${fields || \"full\"}",
		);
	});
});