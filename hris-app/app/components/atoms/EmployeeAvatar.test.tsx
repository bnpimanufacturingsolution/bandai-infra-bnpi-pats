// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BANDAI_SIDEBAR_LOGO_URL } from "~/constants/branding";

vi.mock("~/components/ui/avatar", () => ({
	Avatar: ({ children, className }: any) => (
		<div data-testid="avatar-root" className={className}>
			{children}
		</div>
	),
	AvatarImage: ({ src, alt, className }: any) => (
		<img data-testid="avatar-image" src={src} alt={alt} className={className} />
	),
	AvatarFallback: ({ children, className }: any) => (
		<div data-testid="avatar-fallback" className={className}>
			{children}
		</div>
	),
}));

import { EmployeeAvatar } from "./EmployeeAvatar";

describe("EmployeeAvatar", () => {
	it("renders the employee photo when a source is provided", () => {
		render(
			<EmployeeAvatar src="https://example.test/avatar.png" alt="Juan Dela Cruz" />,
		);

		expect(screen.getByTestId("avatar-image")).toHaveAttribute(
			"src",
			"https://example.test/avatar.png",
		);
	});

	it("falls back to the Bandai logo when no source is provided", () => {
		render(<EmployeeAvatar alt="Maria Santos" />);

		expect(screen.queryByTestId("avatar-image")).toBeNull();
		expect(screen.getByAltText("Bandai logo")).toHaveAttribute(
			"src",
			BANDAI_SIDEBAR_LOGO_URL,
		);
		expect(screen.getByTestId("avatar-root")).toHaveClass("border");
		expect(screen.getByTestId("avatar-root")).toHaveClass("border-gray-200");
	});
});