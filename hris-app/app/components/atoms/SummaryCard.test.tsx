import { renderToStaticMarkup } from "react-dom/server";
import { BriefcaseBusiness } from "lucide-react";
import { describe, expect, it } from "vitest";
import { SummaryCard } from "./SummaryCard";

describe("SummaryCard", () => {
	it("passes inline icon styles to the configured icon component for themed variants", () => {
		const html = renderToStaticMarkup(
			<SummaryCard
				title="Open roles"
				value={12}
				icon={BriefcaseBusiness}
				variant="yellow"
			/>,
		);

		expect(html).toContain("Open roles");
		expect(html).toContain("12");
		expect(html).toContain("color:");
	});
});
