import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicantIdentityHistory } from "./ApplicantIdentityHistory";

describe("ApplicantIdentityHistory", () => {
	it("shows why history cannot be checked when birthday is missing", () => {
		const html = renderToStaticMarkup(
			<ApplicantIdentityHistory
				history={{ matched: false, reason: "missing_name_or_birthday" }}
			/>,
		);
		expect(html).toContain("Applicant history");
		expect(html).toContain("Date of birth is missing");
	});

	it("shows no previous record when name and birthday do not match", () => {
		const html = renderToStaticMarkup(
			<ApplicantIdentityHistory history={{ matched: false, reason: "no_match" }} />,
		);
		expect(html).toContain("Applicant history");
		expect(html).toContain("No previous application or employee record");
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
