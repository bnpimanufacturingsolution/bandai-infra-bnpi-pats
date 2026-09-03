import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
	join(process.cwd(), "app", "routes", "hr", "reports", "workforce.tsx"),
	"utf8",
);

describe("workforce analytics tabs registry", () => {
	it("mounts the previously orphaned No Work Report and Daily Active Manpower tabs", () => {
		expect(source).to.contain('import { NoWorkReportTab }');
		expect(source).to.contain('import { DailyManpowerTab }');
		expect(source).to.contain('"no-work"');
		expect(source).to.contain('"daily-manpower"');
		expect(source).to.contain("No Work Report");
		expect(source).to.contain("Daily Active Manpower");
		expect(source).to.contain("<NoWorkReportTab />");
		expect(source).to.contain("<DailyManpowerTab />");
	});

	it("keeps the original three tabs intact", () => {
		expect(source).to.contain('"agency"');
		expect(source).to.contain('"labor"');
		expect(source).to.contain('"direct-indirect"');
	});
});
