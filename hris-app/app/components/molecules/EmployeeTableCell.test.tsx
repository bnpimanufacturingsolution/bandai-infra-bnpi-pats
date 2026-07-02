import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({
	useNavigate: () => vi.fn(),
}));

import { EmployeeTableCell } from "./EmployeeTableCell";

describe("EmployeeTableCell", () => {
	it("renders the employee avatar when one is available", () => {
		const html = renderToStaticMarkup(
			<EmployeeTableCell
				profileId="emp-1"
				fullName="Juan Dela Cruz"
				employeeId="EMP-001"
				avatar="https://example.test/avatar.png"
			/>,
		);

		expect(html).toContain('data-slot="avatar"');
		expect(html).toContain('data-slot="avatar-fallback"');
		expect(html).toContain(">JC<");
		expect(html).toContain("Juan Dela Cruz");
	});

	it("falls back to initials when the avatar is missing", () => {
		const html = renderToStaticMarkup(
			<EmployeeTableCell
				fullName="Maria Santos"
				employeeId="EMP-002"
				avatar={null}
			/>,
		);

		expect(html).toContain(">MS<");
		expect(html).toContain("EMP-002");
	});
});
