import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportEmployeeCell, resolveReportEmployeeCell } from "./ReportEmployeeCell";

vi.mock("react-router-dom", () => ({
	useNavigate: () => vi.fn(),
}));

describe("ReportEmployeeCell", () => {
	it("renders the avatar image when the roster record has one", () => {
		const resolved = resolveReportEmployeeCell({
			rosterEmployees: [
				{
					id: "employee-1",
					employeeId: "EMP-001",
					person: {
						personalInfo: { firstName: "Ana", lastName: "Reyes" },
					},
					user: { avatar: "https://example.test/avatar.png" },
				},
			],
			employeeId: "employee-1",
			fullName: "Ana Reyes",
		});

		expect(resolved.avatar).toBe("https://example.test/avatar.png");
		expect(resolved.fullName).toBe("Ana Reyes");
		expect(resolved.employeeId).toBe("employee-1");
		expect(resolved.profileId).toBe("employee-1");
	});

	it("matches by employee name when the row id differs from the roster id", () => {
		const resolved = resolveReportEmployeeCell({
			rosterEmployees: [
				{
					id: "employee-2",
					employeeId: "EMP-002",
					person: {
						personalInfo: { firstName: "Maria", middleName: "L.", lastName: "Santos" },
					},
					user: { avatar: "https://example.test/maria.png" },
				},
			],
			employeeId: "BIR-ROW-2",
			fullName: "Maria Santos",
		});

		expect(resolved.avatar).toBe("https://example.test/maria.png");
		expect(resolved.fullName).toBe("Maria Santos");
		expect(resolved.employeeId).toBe("BIR-ROW-2");
		expect(resolved.profileId).toBe("employee-2");
	});

	it("prefers explicit profileId for navigation target", () => {
		const resolved = resolveReportEmployeeCell({
			rosterEmployees: [
				{
					id: "roster-uuid",
					employeeId: "EMP-010",
					person: { personalInfo: { firstName: "Lee", lastName: "Tan" } },
				},
			],
			profileId: "explicit-uuid",
			employeeCode: "EMP-010",
			fullName: "Lee Tan",
		});

		expect(resolved.profileId).toBe("explicit-uuid");
		expect(resolved.employeeId).toBe("EMP-010");
	});

	it("renders employee identity when no roster avatar exists", () => {
		const html = renderToStaticMarkup(
			<ReportEmployeeCell
				rosterEmployees={[]}
				employeeId="EMP-003"
				fullName="Juan Dela Cruz"
			/>,
		);

		expect(html).toContain("Juan Dela Cruz");
		expect(html).toContain("EMP-003");
		expect(html).toContain('data-slot="avatar"');
	});
});

