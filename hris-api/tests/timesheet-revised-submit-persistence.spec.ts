import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);

const getPrepareHelperBlock = () => {
	const start = controllerSource.indexOf("const prepareSubmitBreakdownPersistence = async");
	const end = controllerSource.indexOf("const action = async");
	return controllerSource.slice(start, end);
};

describe("timesheet revised submit persistence contract", () => {
	it("persists client breakdown for non-correction submit when breakdown is provided", () => {
		const block = getPrepareHelperBlock();

		expect(block).to.include("if (hasBreakdown)");
		expect(block).to.include("skipObligationMaterialize: true");
		expect(block).to.include("normalizedBreakdownForLineSync: normalizedBreakdown");
	});

	it("versions REVISED employee resubmits when days changed", () => {
		const block = getPrepareHelperBlock();

		expect(block).to.include('=== "REVISED"');
		expect(block).to.include('lineVersionMode = "version"');
	});

	it("allows status-only correction resubmit after pre-update when permission is CONSUMED", () => {
		const block = getPrepareHelperBlock();

		expect(block).to.include('editPermissionStatus === "CONSUMED"');
		expect(block).to.include("skipObligationMaterialize: true");
	});

	it("skips obligation materialization when breakdown sync or consumed correction is prepared", () => {
		expect(controllerSource).to.include("skipObligationMaterialize");
		expect(controllerSource).to.include("!skipObligationMaterialize");
		expect(controllerSource).to.include("__skipObligationMaterialize");
	});

	it("extends update edit audit eligibility to REVISED employee edits", () => {
		const updateBlockStart = controllerSource.indexOf("const update = async");
		const updateBlockEnd = controllerSource.indexOf("const normalizeBreakdownPreview = async");
		const updateBlock = controllerSource.slice(updateBlockStart, updateBlockEnd);

		expect(updateBlock).to.include('existingTimesheet.status === "REVISED"');
	});

	it("skips duplicate submit line sync when edit permission was consumed by pre-update", () => {
		const block = getPrepareHelperBlock();
		expect(block).to.include('editPermissionStatus === "CONSUMED"');
		expect(block).to.include("normalizedBreakdownForLineSync: null");
		expect(block).to.include("Skip duplicate line sync on submit");
	});

	it("uses editedDayKeys from request when resolving versionDayKeys on update", () => {
		const updateBlockStart = controllerSource.indexOf("const update = async");
		const updateBlockEnd = controllerSource.indexOf("const normalizeBreakdownPreview = async");
		const updateBlock = controllerSource.slice(updateBlockStart, updateBlockEnd);

		expect(updateBlock).to.include("editedDayKeysInput");
		expect(updateBlock).to.include("resolveVersionDayKeys(editedDayKeysInput, changedDays,");
	});
});