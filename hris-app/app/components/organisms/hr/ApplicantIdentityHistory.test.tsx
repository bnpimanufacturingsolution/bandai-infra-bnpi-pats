import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicantIdentityHistory } from "./ApplicantIdentityHistory";

describe("ApplicantIdentityHistory", () => {
	it("renders nothing when identity is not matched", () => {
		const html = renderToStaticMarkup(
			<ApplicantIdentityHistory history={{ matched: false, reason: "no_match" }} />,
		);
		expect(html).toBe("");
	});

	it("shows rejected application and resigned employee history", () => {
		const html = renderToStaticMarkup(
			<ApplicantIdentityHistory
				history={{
					matched: true,
					reason: "matched",
					previousApplications: [
						{
							id: "app-1",
							jobTitle: "Assembler",
							appliedDate: "2024-01-10T00:00:00.000Z",
							currentWorkflowStateKey: "REJECTED",
						},
					],
					employees: [
						{
							id: "emp-1",
							employeeId: "01234",
							employmentStatus: "RESIGNED",
							positionTitle: "Operator",
							departmentName: "Production",
							employmentHireDate: "2020-02-01T00:00:00.000Z",
							employmentTerminationDate: "2023-11-30T00:00:00.000Z",
						},
					],
					summary: {
						previousApplicationCount: 1,
						employeeCount: 1,
						latestApplicationStatus: "REJECTED",
						employeeStatuses: ["RESIGNED"],
					},
				}}
			/>,
		);

		expect(html).toContain("Previous Bandai record");
		expect(html).toContain("Previous application: Rejected");
		expect(html).toContain("Employee record: Resigned");
		expect(html).toContain("Full history");
	});
});
