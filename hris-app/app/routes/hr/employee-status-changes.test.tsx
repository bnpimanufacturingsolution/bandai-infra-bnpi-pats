// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EmployeeStatusChangesPage from "./employee-status-changes";

vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useNavigate: () => vi.fn(),
		useSearchParams: () => [new URLSearchParams(), vi.fn()],
	};
});

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, ...props }: any) => (
		<div data-testid="badge" {...props}>
			{children}
		</div>
	),
}));

vi.mock("~/components/ui/avatar", () => ({
	Avatar: ({ children, ...props }: any) => (
		<div data-testid="avatar-root" {...props}>
			{children}
		</div>
	),
	AvatarImage: ({ src, alt, ...props }: any) => (
		<img data-testid="avatar-image" src={src} alt={alt} {...props} />
	),
	AvatarFallback: ({ children, ...props }: any) => (
		<div data-testid="avatar-fallback" {...props}>
			{children}
		</div>
	),
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({ columns, data }: any) => (
		<div data-testid="status-change-table">
			{data.map((item: any, rowIndex: number) => (
				<div key={item.id || rowIndex} data-testid={`row-${rowIndex}`}>
					{columns.map((column: any) => (
						<div key={String(column.key)} data-testid={`cell-${String(column.key)}`}>
							{column.render ? column.render(item[column.key], item) : item[column.key]}
						</div>
					))}
				</div>
			))}
		</div>
	),
}));

vi.mock("~/components/modals/CandidateDetailsModal", () => ({
	CandidateDetailsModal: () => null,
}));

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			organizationId: "org-1",
		},
	}),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	queryKeys: { metrics: { all: ["metrics", "all"] } },
	useMetrics: () => ({
		data: {
			metrics: {
				eligibilityCandidates: [
					{
						id: "candidate-1",
						employeeName: "Ana Reyes",
						avatar: "https://example.test/avatar.png",
						position: "Operator",
						department: "Manufacturing",
						currentEmploymentStatus: "ACTIVE",
						tenureMonths: 24,
						eligibleFor: "PROMOTION",
						eligibilityReason: "Meets all promotion criteria",
					},
					{
						id: "candidate-2",
						employeeName: "Juan Dela Cruz",
						position: "Technician",
						department: "Manufacturing",
						currentEmploymentStatus: "ACTIVE",
						tenureMonths: 18,
						eligibleFor: "REGULARIZATION",
						eligibilityReason: "Approaching probation end",
						matchScore: 88,
					},
				],
			},
		},
		isLoading: false,
	}),
}));

vi.mock("~/lib/api-url.helper", () => ({
	normalizeApiBase: (base: string) => base,
	resolveSocketBaseUrl: () => null,
}));

vi.mock("~/lib/runtime-api-base", () => ({
	getRuntimeApiBase: () => "",
}));

vi.mock("socket.io-client", () => ({
	io: vi.fn(),
}));

const renderPage = () =>
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={["/hr/employee-status-changes"]}>
				<EmployeeStatusChangesPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);

describe("EmployeeStatusChangesPage", () => {
	it("renders employment status as dot text and keeps eligibleFor as a badge", () => {
		renderPage();

		const table = screen.getByTestId("status-change-table");
		const firstRow = within(table).getByTestId("row-0");
		const secondRow = within(table).getByTestId("row-1");
		const employmentStatusCell = within(firstRow).getByTestId("cell-currentEmploymentStatus");
		const eligibleForCell = within(firstRow).getByTestId("cell-eligibleFor");

		expect(within(employmentStatusCell).getByText("Active")).toBeInTheDocument();
		expect(employmentStatusCell.querySelector(".status-badge")).toBeNull();
		expect(
			employmentStatusCell.querySelector("[aria-hidden='true']"),
		).toHaveClass("bg-green-500");

		const badge = within(eligibleForCell).getByText("Promotion");
		expect(badge).toHaveClass("bg-blue-100");
		expect(badge).toHaveClass("text-blue-700");

		expect(within(firstRow).getByTestId("avatar-image")).toHaveAttribute(
			"src",
			"https://example.test/avatar.png",
		);
		expect(within(secondRow).queryByTestId("avatar-image")).toBeNull();
		expect(within(secondRow).getByAltText("Bandai logo")).toBeInTheDocument();
	});
});
