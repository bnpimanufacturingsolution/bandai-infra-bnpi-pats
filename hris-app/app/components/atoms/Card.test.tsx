import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
	it("renders the shared darker neutral border token", () => {
		const html = renderToStaticMarkup(<Card />);

		expect(html).toContain("border-neutral-300");
	});

	it("merges caller-provided classes without dropping the base border", () => {
		const html = renderToStaticMarkup(<Card className="border-neutral-300 px-10" />);

		expect(html).toContain("border-neutral-300");
		expect(html).toContain("px-10");
		expect(html).not.toContain("border-neutral-200");
	});
});
