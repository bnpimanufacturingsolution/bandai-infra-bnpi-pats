// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "~/services/employees.service";
import EmployeeDetailPage from "./employee.$id";

const mockEmployee = {
	id: "employee-self",
	organizationId: "org-1",
	employeeId: "BN-001",
	personId: "person-1",
	userId: "user-1",
	user: {
		avatar: "https://example.test/avatar.png",
	},
	employmentHireDate: "2024-01-15",
	employmentStartDate: "2024-01-20",
	employmentStatus: "ACTIVE",
	employmentType: "REGULAR",
	probationEndDate: "2024-07-20",
	departmentId: "dept-1",
	positionId: "position-1",
	levelId: "level-1",
	workLocation: "HYBRID",
	workforceSource: "DIRECT",
	basicSalary: 40000,
	currency: "PHP",
	payFrequency: "MONTHLY",
	isDeleted: false,
	isTour: false,
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-01T00:00:00.000Z",
	department: {
		id: "dept-1",
		organizationId: "org-1",
		name: "Manufacturing",
		code: "MFG",
		managerId: "manager-1",
		isActive: true,
		isDefault: false,
		isDeleted: false,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	},
	section: {
		id: "section-1",
		name: "Assembly",
		code: "ASM",
		departmentId: "dept-1",
	},
	position: {
		id: "position-1",
		organizationId: "org-1",
		title: "Line Supervisor",
		code: "LS-1",
		departmentId: "dept-1",
		isActive: true,
		isDeleted: false,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	},
	level: {
		id: "level-1",
		name: "Level 3",
		rank: 3,
	},
	documents: [],
	person: {
		id: "person-1",
		organizationId: "org-1",
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		isDeleted: false,
		personalInfo: {
			firstName: "Aira",
			lastName: "Santos",
			dateOfBirth: "1995-05-10",
		},
		contactInfo: {
			email: "aira.santos@example.test",
			phones: [
				{
					type: "mobile",
					countryCode: "+63",
					number: "9170001111",
					isPrimary: true,
				},
			],
			address: [
				{
					street: "123 Main Street",
					city: "Makati",
					state: "Metro Manila",
					country: "Philippines",
					postalCode: "1200",
					zipCode: "1200",
					houseNumber: "123",
				},
			],
		},
		identification: {
			type: "passport",
			number: "P1234567",
			issuingCountry: "PH",
			expiryDate: "2030-01-01",
		},
	},
} satisfies Employee;

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			avatar: "https://example.test/avatar.png",
			metadata: {
				employee: {
					id: "employee-self",
				},
			},
		},
	}),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployee: vi.fn(() => ({
		data: mockEmployee,
		isLoading: false,
		error: null,
	})),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	useDocumentActionMetrics: vi.fn(() => ({
		data: {
			items: [
				{
					priorityState: "missing_required",
					isActionable: true,
				},
			],
		},
	})),
}));

vi.mock("~/components/organisms/employee-detail/schedule-tab", () => ({
	ScheduleTab: () => <div>Schedule mock</div>,
}));

vi.mock("~/components/organisms/employee-detail/compensation-tab", () => ({
	CompensationTab: () => <div>Compensation mock</div>,
}));

vi.mock("~/components/organisms/employee-detail/leave-balance-tab", () => ({
	LeaveBalanceTab: () => <div>Leave balance mock</div>,
}));

vi.mock("~/components/organisms/employee-detail/documents-tab", () => ({
	DocumentsTab: () => <div>Documents mock</div>,
}));

vi.mock("~/components/organisms/employee-detail/onboarding-tab", () => ({
	OnboardingTab: () => <div>Onboarding mock</div>,
}));

const LocationProbe = () => {
	const location = useLocation();
	return <output aria-label="location-search">{location.search}</output>;
};

const renderRoute = (initialEntry: string) =>
	render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<Routes>
				<Route path="/employee/:id" element={<EmployeeDetailPage />} />
			</Routes>
			<LocationProbe />
		</MemoryRouter>,
	);

describe("Employee detail shell", () => {
	// Verify behavior is preserved after styling tabs as folder tabs and removing Quick Actions
	it("keeps the new shell structure and preserves existing query params when switching tabs", async () => {
		const user = userEvent.setup();
		renderRoute("/employee/employee-self?tab=employment&from=hr-dashboard&source=smoke");

		expect(screen.getByTestId("employee-detail-shell")).toBeInTheDocument();
		expect(screen.queryByTestId("employee-detail-rail")).not.toBeInTheDocument();
		expect(screen.getByTestId("employee-detail-tab-bar")).toBeInTheDocument();
		expect(screen.getByTestId("employee-detail-tab-panel")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Employment Status" })).toBeInTheDocument();
		expect(screen.queryByTestId("employee-profile-hero")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /update profile/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /change password/i })).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /resignation requests/i }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("tab", { name: /^personal$/i }));

		await waitFor(() => {
			expect(screen.getByLabelText("location-search")).toHaveTextContent(
				"tab=personal",
			);
		});
		expect(screen.getByLabelText("location-search")).toHaveTextContent(
			"from=hr-dashboard",
		);
		expect(screen.getByLabelText("location-search")).toHaveTextContent("source=smoke");
		expect(screen.getByTestId("employee-profile-hero")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Contact Information" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /update profile/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /resignation requests/i })).toBeInTheDocument();
	});
});
