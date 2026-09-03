import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("boarding notification title contract", () => {
	const source = readFileSync(
		resolve(__dirname, "../app/checklistItem/checklistItem.controller.ts"),
		"utf8",
	);

	it("uses ASCII boarding completion titles without mojibake", () => {
		expect(source).to.include('title: isOffboarding');
		expect(source).to.include('"Exit Clearance Completed!"');
		expect(source).to.include('"Onboarding Completed!"');
		expect(source).to.not.match(/Onboarding Completed!.*ð/);
		expect(source).to.not.match(/Exit Clearance Completed!.*ð/);
		expect(source).to.not.include("ðŸŽ‰");
		expect(source).to.not.include("ðŸ“¢");
	});
});
