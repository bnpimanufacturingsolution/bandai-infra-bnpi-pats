// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BANDAI_SIDEBAR_LOGO_URL } from "~/constants/branding";

vi.mock("react-router-dom", () => ({
	useNavigate: () => vi.fn(),
}));

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

import { EmployeeTableCell } from "./EmployeeTableCell";

describe("EmployeeTableCell", () => {
	it("renders the employee avatar when one is available", () => {
		render(
			<EmployeeTableCell
				profileId="emp-1"
				fullName="Juan Dela Cruz"
				employeeId="EMP-001"
				avatar="https://example.test/avatar.png"
			/>,
		);

		expect(screen.getByTestId("avatar-image")).toHaveAttribute(
			"src",
			"https://example.test/avatar.png",
		);
		expect(screen.getByText("Juan Dela Cruz")).toBeInTheDocument();
	});

	it("falls back to the Bandai logo when the avatar is missing", () => {
		render(
			<EmployeeTableCell
				fullName="Maria Santos"
				employeeId="EMP-002"
				avatar={null}
			/>,
		);

		expect(screen.queryByTestId("avatar-image")).toBeNull();
		expect(screen.getByAltText("Bandai logo")).toHaveAttribute(
			"src",
			BANDAI_SIDEBAR_LOGO_URL,
		);
		expect(screen.getByText("EMP-002")).toBeInTheDocument();
	});

	it("renders compact type for dense attendance rows", () => {
		render(
			<EmployeeTableCell
				fullName="Adrian Cabugayan Ambal"
				employeeId="00121"
				avatar={null}
				size="sm"
			/>,
		);

		expect(screen.getByText("Adrian Cabugayan Ambal")).toHaveClass("text-xs");
		expect(screen.getByText("00121")).toHaveClass("text-[10px]");
	});
});