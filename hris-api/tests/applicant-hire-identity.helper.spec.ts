import { expect } from "chai";
import {
	applicantHireIdentitiesMatch,
	lockIncomingPersonToApplicant,
} from "../helper/applicant-hire-identity.helper";

describe("applicant-hire-identity.helper", () => {
	it("does not treat Yan Rubio and Joshua Rodriguez as the same hire identity", () => {
		expect(
			applicantHireIdentitiesMatch(
				{
					personalInfo: { firstName: "Yan", lastName: "Rubio" },
					contactInfo: { email: "yan@gmail.com" },
				},
				{
					personalInfo: { firstName: "Joshua", lastName: "Rodriguez" },
					contactInfo: { email: "bryan02@gmail.com" },
				},
			),
		).to.equal(false);
	});

	it("matches the same applicant identity ignoring case", () => {
		expect(
			applicantHireIdentitiesMatch(
				{
					personalInfo: { firstName: "Yan", lastName: "Rubio" },
					contactInfo: { email: "yan@gmail.com" },
				},
				{
					personalInfo: { firstName: "yan", lastName: "RUBIO" },
					contactInfo: { email: "yan@gmail.com" },
				},
			),
		).to.equal(true);
	});

	it("locks add-employee payload to the public application name and email", () => {
		const locked = lockIncomingPersonToApplicant(
			{
				personalInfo: {
					firstName: "Joshua",
					lastName: "Rodriguez",
					nationality: "Filipino",
				},
				contactInfo: { email: "bryan02@gmail.com" },
			},
			{
				personalInfo: { firstName: "Yan", lastName: "Rubio" },
				contactInfo: { email: "yan@gmail.com" },
			},
		);

		expect(locked.personalInfo.firstName).to.equal("Yan");
		expect(locked.personalInfo.lastName).to.equal("Rubio");
		expect(locked.contactInfo.email).to.equal("yan@gmail.com");
		expect(locked.personalInfo.nationality).to.equal("Filipino");
	});
});
