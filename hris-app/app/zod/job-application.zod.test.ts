import { describe, expect, it } from "vitest";
import { JobApplicationFormSchema } from "./job-application.zod";

describe("JobApplicationFormSchema date of birth", () => {
	const validFile = new File(["resume"], "resume.pdf", { type: "application/pdf" });

	const base = {
		resume: validFile,
		firstName: "Juan",
		lastName: "Dela Cruz",
		email: "juan@example.com",
		phone: "+63 9123456789",
		location: "",
		linkedinProfile: "",
		currentJobTitle: "",
		whyJoinTeam: "",
		challengingProject: "",
		expectedSalary: "25000",
		availabilityDate: "",
		requiresVisaSponsorship: false,
		additionalInfo: "",
	};

	it("requires date of birth for identity matching", () => {
		const parsed = JobApplicationFormSchema.safeParse({ ...base, dateOfBirth: "" });
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues.some((issue) => issue.path[0] === "dateOfBirth")).toBe(true);
		}
	});

	it("accepts a past date of birth", () => {
		const parsed = JobApplicationFormSchema.safeParse({
			...base,
			dateOfBirth: "1994-03-12",
		});
		expect(parsed.success).toBe(true);
	});
});
