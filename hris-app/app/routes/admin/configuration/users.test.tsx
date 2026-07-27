// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import UsersPage from "./users";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/atoms/Input", () => ({
	Input: (props: any) => <input {...props} />,
}));

vi.mock("~/components/atoms/Modal", () => ({
	Modal: ({ open, children, title }: any) =>
		open ? (
			<div aria-label={title}>
				<h2>{title}</h2>
				{children}
			</div>
		) : null,
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, variant }: any) => (
		<span data-testid="badge" data-variant={variant}>
			{children}
		</span>
	),
}));

vi.mock("~/components/atoms/Select", () => ({
	Select: () => null,
}));

vi.mock("~/components/molecules/ConfigurationEmptyGuide", () => ({
	ConfigurationEmptyGuide: () => null,
}));

vi.mock("~/components/molecules/ConstraintTokens", () => ({
	ConstraintTokenRow: () => null,
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({ title, data, columns }: any) => (
		<section>
			<h1>{title}</h1>
			{data.map((item: any) => (
				<article key={item.id}>
					{columns.map((column: any) => (
						<div key={String(column.key)}>
							<div>{column.label}</div>
							<div>
								{column.render
									? column.render(item[column.key], item)
									: item[column.key]}
							</div>
						</div>
					))}
				</article>
			))}
		</section>
	),
}));

vi.mock("~/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: any) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
	DropdownMenuItem: ({ children, ...props }: any) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			organizationId: "org-1",
			organization: { id: "org-1" },
		},
	}),
}));

vi.mock("~/lib/hooks/useUsers", () => ({
	useUsers: vi.fn((params: any, options?: any) => ({
		data: {
			data: {
				users: [
					{
						id: "user-1",
						userName: "jane.santos",
						email: "jane.santos@example.com",
						status: "active",
						createdAt: "2026-06-09T00:00:00.000Z",
						updatedAt: "2026-06-09T00:00:00.000Z",
						userRoles: ["HR Admin"],
						metadata: {
							employee: {
								personalInfo: { firstName: "Jane", lastName: "Santos" },
								department: { name: "People Operations" },
								position: { title: "HR Officer" },
							},
							device: {
								access: { status: "enrolled" },
							},
						},
					},
				],
				pagination: { total: 1, totalPages: 1, page: 1, limit: 10 },
			},
		},
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({
			data: { data: { users: [] } },
		}),
		enabled: options?.enabled ?? true,
		query: params?.query,
	})),
	useUser: vi.fn((id: string) => ({
		data: id
			? {
					id: "user-1",
					userName: "jane.santos",
					email: "jane.santos@example.com",
					status: "active",
					createdAt: "2026-06-09T00:00:00.000Z",
					updatedAt: "2026-06-09T00:00:00.000Z",
					userRoles: ["HR Admin"],
					metadata: {
						employee: {
							id: "emp-1",
							personalInfo: { firstName: "Jane", lastName: "Santos" },
							department: { name: "People Operations" },
							position: { title: "HR Officer" },
						},
						device: {
							access: { status: "enrolled" },
						},
					},
				}
			: null,
		isLoading: false,
	})),
	useCreateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useResetUserPassword: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	buildAuthAppUserFilter: vi.fn(() => "organizationId:org-1"),
	buildAuthUserFields: vi.fn(() => ["userName", "email"]),
	getAppRoleNames: vi.fn(() => "HR Admin"),
}));

vi.mock("~/lib/hooks/useRoles", () => ({
	useRoles: vi.fn(() => ({
		data: { data: { roles: [{ id: "role-1", name: "HR Admin" }] } },
		isLoading: false,
	})),
}));

vi.mock("~/lib/ui/admin-configuration-form", () => ({
	useAdminFormErrorNavigation: () => vi.fn(),
}));

describe("UsersPage", () => {
	it("hides the username in the users table while keeping the employee name and email visible", () => {
		render(
			<MemoryRouter initialEntries={["/admin/configuration/users"]}>
				<UsersPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Jane Santos")).toBeInTheDocument();
		expect(screen.getByText("jane.santos@example.com")).toBeInTheDocument();
		expect(screen.queryByText("jane.santos")).not.toBeInTheDocument();
	});

	it("keeps access status as a badge while rendering account status as inline text", () => {
		render(
			<MemoryRouter initialEntries={["/admin/configuration/users"]}>
				<UsersPage />
			</MemoryRouter>,
		);

		const accessStatus = screen.getByText("Enrolled");
		const accountStatus = screen.getByText("Active");

		expect(accessStatus.closest("[data-testid='badge']")).toHaveAttribute(
			"data-variant",
			"success",
		);
		expect(accountStatus).toBeInTheDocument();
		expect(accountStatus.closest("[data-testid='badge']")).toBeNull();
	});

	it("keeps access status as the view header badge and account status as dot text", () => {
		render(
			<MemoryRouter initialEntries={["/admin/configuration/users?action=view&id=user-1"]}>
				<UsersPage />
			</MemoryRouter>,
		);

		const details = screen.getByLabelText("User Details");
		const accessStatus = within(details)
			.getAllByText("Enrolled")
			.find((node) => node.closest("[data-testid='badge']"));
		const accountStatus = within(details).getByText("Active");

		expect(accessStatus?.closest("[data-testid='badge']")).toHaveAttribute("data-variant", "success");
		expect(accountStatus.closest("[data-testid='badge']")).toBeNull();
	});

	it("navigates to the user activity logs page from the view modal", () => {
		render(
			<MemoryRouter initialEntries={["/admin/configuration/users?action=view&id=user-1"]}>
				<UsersPage />
			</MemoryRouter>,
		);

		screen.getByRole("button", { name: "Activity Logs" }).click();

		expect(mockNavigate).toHaveBeenCalledWith("/admin/configuration/users/user-1/activity-logs");
	});
});
