const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const normalizeName = (value: unknown): string =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

const normalizeEmail = (value: unknown): string => String(value || "").trim().toLowerCase();

export type ApplicantHireIdentity = {
	firstName: string;
	lastName: string;
	email: string;
};

export const readPersonHireIdentity = (person: {
	personalInfo?: unknown;
	contactInfo?: unknown;
} | null | undefined): ApplicantHireIdentity => {
	const personalInfo = asRecord(person?.personalInfo);
	const contactInfo = asRecord(person?.contactInfo);
	return {
		firstName: String(personalInfo.firstName || "").trim(),
		lastName: String(personalInfo.lastName || "").trim(),
		email: String(contactInfo.email || "").trim(),
	};
};

export const applicantHireIdentitiesMatch = (
	applicantPerson: { personalInfo?: unknown; contactInfo?: unknown } | null | undefined,
	employeePerson: { personalInfo?: unknown; contactInfo?: unknown } | null | undefined,
): boolean => {
	const applicant = readPersonHireIdentity(applicantPerson);
	const employee = readPersonHireIdentity(employeePerson);
	if (!applicant.firstName || !applicant.lastName || !employee.firstName || !employee.lastName) {
		return false;
	}
	if (
		normalizeName(applicant.firstName) !== normalizeName(employee.firstName) ||
		normalizeName(applicant.lastName) !== normalizeName(employee.lastName)
	) {
		return false;
	}
	if (applicant.email && employee.email && normalizeEmail(applicant.email) !== normalizeEmail(employee.email)) {
		return false;
	}
	return true;
};

export const lockIncomingPersonToApplicant = (
	incomingPerson: Record<string, any>,
	applicantPerson: { personalInfo?: unknown; contactInfo?: unknown },
): Record<string, any> => {
	const applicant = readPersonHireIdentity(applicantPerson);
	const incomingPersonalInfo = asRecord(incomingPerson?.personalInfo);
	const incomingContactInfo = asRecord(incomingPerson?.contactInfo);
	const applicantPersonalInfo = asRecord(applicantPerson.personalInfo);
	const applicantContactInfo = asRecord(applicantPerson.contactInfo);

	return {
		...incomingPerson,
		personalInfo: {
			...incomingPersonalInfo,
			firstName: applicant.firstName || incomingPersonalInfo.firstName,
			lastName: applicant.lastName || incomingPersonalInfo.lastName,
			middleName:
				applicantPersonalInfo.middleName ?? incomingPersonalInfo.middleName,
			dateOfBirth:
				incomingPersonalInfo.dateOfBirth || applicantPersonalInfo.dateOfBirth,
		},
		contactInfo: {
			...incomingContactInfo,
			email: applicant.email || incomingContactInfo.email,
			phones: Array.isArray(incomingContactInfo.phones) && incomingContactInfo.phones.length
				? incomingContactInfo.phones
				: applicantContactInfo.phones,
		},
	};
};
