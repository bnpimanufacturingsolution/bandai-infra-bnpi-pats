import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileInitialsAvatar } from "./ProfileInitialsAvatar";

describe("ProfileInitialsAvatar", () => {
	it("renders first and last initials for employee names", () => {
		const html = renderToStaticMarkup(<ProfileInitialsAvatar name="Ada Lovelace" />);

		expect(html).toContain(">AL<");
		expect(html).toContain("rounded-full");
	});

	it("uses two letters for single-word names", () => {
		const html = renderToStaticMarkup(<ProfileInitialsAvatar name="Madonna" />);

		expect(html).toContain(">MA<");
	});

	it("falls back to U when the employee name is missing", () => {
		const html = renderToStaticMarkup(<ProfileInitialsAvatar />);

		expect(html).toContain(">U<");
	});

	it("renders a semantic button with an employee-specific accessible label when clickable", () => {
		const html = renderToStaticMarkup(
			<ProfileInitialsAvatar name="Juan Dela Cruz" clickable />,
		);

		expect(html).toContain("<button");
		expect(html).toContain('type="button"');
		expect(html).toContain('aria-label="Open Juan Dela Cruz profile"');
		expect(html).toContain(">JC<");
	});

	it("marks clickable avatars disabled without losing the profile label", () => {
		const html = renderToStaticMarkup(
			<ProfileInitialsAvatar name="Maria Santos" clickable disabled />,
		);

		expect(html).toContain("disabled");
		expect(html).toContain('aria-label="Open Maria Santos profile"');
	});
});
