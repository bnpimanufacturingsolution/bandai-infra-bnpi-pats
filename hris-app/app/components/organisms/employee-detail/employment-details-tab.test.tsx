// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Employee } from "~/services/employees.service";
import { EmploymentDetailsTab } from "./employment-details-tab";

const employee = {
	id: "employee-1",
	organizationId: "org-1",
	employeeId: "BN-100",
	personId: "person-1",
	userId: "user-1",
	employmentHireDate: "2024-01-15",
	employmentStartDate: "2024-01-20",
	employmentTerminationDate: "2026-02-01",
	employmentStatus: "ACTIVE",
	employmentType: "REGULAR",
	probationEndDate: "2024-07-20",
	departmentId: "dept-1",
	positionId: "position-1",
	levelId: "level-1",
	workLocation: "ONSITE",
	workforceSource: "DIRECT",
	basicSalary: 30000,
	currency: "PHP",
	payFrequency: "MONTHLY",
	isDeleted: false,
	isTour: false,
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-01T00:00:00.000Z",
	department: {
		id: "dept-1",
		organizationId: "org-1",
		name: "Operations",
		code: "OPS",
		managerId: "manager-1",
		isActive: true,
		isDefault: false,
		isDeleted: false,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	},
	section: {
		id: "section-1",
		name: "Production",
		code: "PROD",
		departmentId: "dept-1",
	},
	position: {
		id: "position-1",
		organizationId: "org-1",
		title: "Production Lead",
		code: "PL-1",
		departmentId: "dept-1",
		isActive: true,
		isDeleted: false,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	},
	level: {
		id: "level-1",
		name: "Level 2",
	},
	documents: [],
	person: {
		id: "person-1",
		organizationId: "org-1",
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		isDeleted: false,
		personalInfo: {
			firstName: "Rina",
			lastName: "Lopez",
			dateOfBirth: "1994-04-11",
		},
		contactInfo: {
			email: "rina.lopez@example.test",
			phones: [],
			address: [],
		},
		identification: {
			type: "passport",
			number: "P1234567",
			issuingCountry: "PH",
			expiryDate: "2030-01-01",
		},
	},
} satisfies Employee;

describe("EmploymentDetailsTab", () => {
	it("keeps the card grouping and key headings stable", () => {
		render(<EmploymentDetailsTab employee={employee} />);

		expect(screen.getByTestId("employment-card-grid")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Employment Status" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Work Arrangement" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Important Dates" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Position & Department" })).toBeInTheDocument();

		expect(screen.getByText("Employee ID")).toBeInTheDocument();
		expect(screen.getByText("Work Location")).toBeInTheDocument();
		expect(screen.getByText("Hire Date")).toBeInTheDocument();
		expect(screen.getByText("Department")).toBeInTheDocument();
	});
});
