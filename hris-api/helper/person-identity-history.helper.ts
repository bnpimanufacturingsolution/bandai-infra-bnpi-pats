import type { Prisma, PrismaClient } from "../generated/prisma";
import { getUtcDayRange } from "./employee-date-validation.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export type PersonIdentityMatchInput = {
	firstName: string;
	lastName: string;
	dateOfBirth: Date | string | null | undefined;
};

export type PersonIdentityApplicationRecord = {
	id: string;
	applicantId: string | null;
	jobTitle: string | null;
	appliedDate: Date | string | null;
	currentWorkflowStateKey: string;
	convertedToEmployeeId: string | null;
	isCurrent: boolean;
};

export type PersonIdentityEmployeeRecord = {
	id: string;
	employeeId: string | null;
	employmentStatus: string;
	employmentHireDate: Date | string | null;
	employmentTerminationDate: Date | string | null;
	positionTitle: string | null;
	departmentName: string | null;
};

export type PersonIdentityHistory = {
	matched: boolean;
	matchKey: {
		firstName: string;
		lastName: string;
		dateOfBirth: string | null;
	};
	reason: "matched" | "missing_name_or_birthday" | "invalid_birthday" | "no_match";
	previousApplications: PersonIdentityApplicationRecord[];
	employees: PersonIdentityEmployeeRecord[];
	summary: {
		previousApplicationCount: number;
		employeeCount: number;
		latestApplicationStatus: string | null;
		employeeStatuses: string[];
	};
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export const normalizePersonName = (value: unknown): string =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

export const personMatchesNameAndBirthday = (
	personalInfo: unknown,
	input: PersonIdentityMatchInput,
): boolean => {
	const firstName = normalizePersonName(input.firstName);
	const lastName = normalizePersonName(input.lastName);
	if (!firstName || !lastName || !input.dateOfBirth) {
		return false;
	}

	const dayRange = getUtcDayRange(input.dateOfBirth);
	if (!dayRange) {
		return false;
	}

	const info = asRecord(personalInfo);
	const personFirst = normalizePersonName(info.firstName);
	const personLast = normalizePersonName(info.lastName);
	if (personFirst !== firstName || personLast !== lastName) {
		return false;
	}

	const personDobRaw = info.dateOfBirth;
	if (!personDobRaw) {
		return false;
	}

	const personDob = new Date(String(personDobRaw)).getTime();
	if (!Number.isFinite(personDob)) {
		return false;
	}

	return personDob >= dayRange.start.getTime() && personDob <= dayRange.end.getTime();
};

const emptyHistory = (
	input: PersonIdentityMatchInput,
	reason: PersonIdentityHistory["reason"],
): PersonIdentityHistory => ({
	matched: false,
	matchKey: {
		firstName: String(input.firstName || "").trim(),
		lastName: String(input.lastName || "").trim(),
		dateOfBirth: input.dateOfBirth ? String(input.dateOfBirth) : null,
	},
	reason,
	previousApplications: [],
	employees: [],
	summary: {
		previousApplicationCount: 0,
		employeeCount: 0,
		latestApplicationStatus: null,
		employeeStatuses: [],
	},
});

const jobTitleFromApplicant = (applicant: {
	job?: { position?: { title?: string | null } | null } | null;
	position?: { title?: string | null } | null;
}): string | null => {
	const fromJob = String(applicant.job?.position?.title || "").trim();
	if (fromJob) return fromJob;
	const fromPosition = String(applicant.position?.title || "").trim();
	return fromPosition || null;
};

type IdentityMatchApplicantSource = {
	id: string;
	applicantId: string | null;
	appliedDate: Date;
	currentWorkflowStateKey: string;
	convertedToEmployeeId: string | null;
	job?: { position?: { title?: string | null } | null } | null;
	position?: { title?: string | null } | null;
	person?: { personalInfo?: unknown } | null;
};

type IdentityMatchEmployeeSource = {
	id: string;
	employeeId: string | null;
	employmentStatus: string;
	employmentHireDate: Date | null;
	employmentTerminationDate: Date | null;
	position?: { title?: string | null } | null;
	department?: { name?: string | null } | null;
	person?: { personalInfo?: unknown } | null;
};

const personalInfoFromPerson = (person?: { personalInfo?: unknown } | null) => {
	const info = asRecord(person?.personalInfo);
	return {
		firstName: typeof info.firstName === "string" ? info.firstName : "",
		lastName: typeof info.lastName === "string" ? info.lastName : "",
		dateOfBirth:
			info.dateOfBirth instanceof Date || typeof info.dateOfBirth === "string"
				? info.dateOfBirth
				: info.dateOfBirth
					? String(info.dateOfBirth)
					: null,
	};
};

export const buildPersonIdentityHistoryFromSources = (
	sources: {
		applicants: IdentityMatchApplicantSource[];
		employees: IdentityMatchEmployeeSource[];
	},
	params: {
		firstName?: string | null;
		lastName?: string | null;
		dateOfBirth?: Date | string | null;
		excludeApplicantId?: string | null;
	},
): PersonIdentityHistory => {
	const input: PersonIdentityMatchInput = {
		firstName: String(params.firstName || "").trim(),
		lastName: String(params.lastName || "").trim(),
		dateOfBirth: params.dateOfBirth,
	};

	if (!input.firstName || !input.lastName || !input.dateOfBirth) {
		return emptyHistory(input, "missing_name_or_birthday");
	}

	if (!getUtcDayRange(input.dateOfBirth)) {
		return emptyHistory(input, "invalid_birthday");
	}

	const previousApplications = sources.applicants
		.filter((applicant) => personMatchesNameAndBirthday(applicant.person?.personalInfo, input))
		.map((applicant) => ({
			id: applicant.id,
			applicantId: applicant.applicantId,
			jobTitle: jobTitleFromApplicant(applicant),
			appliedDate: applicant.appliedDate,
			currentWorkflowStateKey: applicant.currentWorkflowStateKey,
			convertedToEmployeeId: applicant.convertedToEmployeeId,
			isCurrent: Boolean(
				params.excludeApplicantId && applicant.id === params.excludeApplicantId,
			),
		}))
		.filter((row) => !row.isCurrent);

	const employeeRows = sources.employees
		.filter((employee) => personMatchesNameAndBirthday(employee.person?.personalInfo, input))
		.map((employee) => ({
			id: employee.id,
			employeeId: employee.employeeId,
			employmentStatus: String(employee.employmentStatus || ""),
			employmentHireDate: employee.employmentHireDate,
			employmentTerminationDate: employee.employmentTerminationDate,
			positionTitle: employee.position?.title || null,
			departmentName: employee.department?.name || null,
		}));

	const matched = previousApplications.length > 0 || employeeRows.length > 0;
	const employeeStatuses = Array.from(
		new Set(employeeRows.map((row) => row.employmentStatus).filter(Boolean)),
	);

	return {
		matched,
		matchKey: {
			firstName: input.firstName,
			lastName: input.lastName,
			dateOfBirth: String(input.dateOfBirth),
		},
		reason: matched ? "matched" : "no_match",
		previousApplications,
		employees: employeeRows,
		summary: {
			previousApplicationCount: previousApplications.length,
			employeeCount: employeeRows.length,
			latestApplicationStatus: previousApplications[0]?.currentWorkflowStateKey || null,
			employeeStatuses,
		},
	};
};

export const loadIdentityMatchSources = async (
	prisma: PrismaExecutor,
	organizationId: string,
) => {
	const [applicants, employees] = await Promise.all([
		prisma.applicant.findMany({
			where: {
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				applicantId: true,
				appliedDate: true,
				currentWorkflowStateKey: true,
				convertedToEmployeeId: true,
				job: {
					select: {
						position: {
							select: { title: true },
						},
					},
				},
				position: {
					select: { title: true },
				},
				person: {
					select: {
						personalInfo: true,
					},
				},
			},
			orderBy: { appliedDate: "desc" },
		}),
		prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				employeeId: true,
				employmentStatus: true,
				employmentHireDate: true,
				employmentTerminationDate: true,
				position: {
					select: { title: true },
				},
				department: {
					select: { name: true },
				},
				person: {
					select: {
						personalInfo: true,
					},
				},
			},
			orderBy: { updatedAt: "desc" },
		}),
	]);

	return { applicants, employees };
};

export const loadPersonIdentityHistory = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		firstName?: string | null;
		lastName?: string | null;
		dateOfBirth?: Date | string | null;
		excludeApplicantId?: string | null;
	},
): Promise<PersonIdentityHistory> => {
	const input: PersonIdentityMatchInput = {
		firstName: String(params.firstName || "").trim(),
		lastName: String(params.lastName || "").trim(),
		dateOfBirth: params.dateOfBirth,
	};

	if (!params.organizationId || !input.firstName || !input.lastName || !input.dateOfBirth) {
		return emptyHistory(input, "missing_name_or_birthday");
	}

	if (!getUtcDayRange(input.dateOfBirth)) {
		return emptyHistory(input, "invalid_birthday");
	}

	const sources = await loadIdentityMatchSources(prisma, params.organizationId);
	return buildPersonIdentityHistoryFromSources(sources, {
		firstName: input.firstName,
		lastName: input.lastName,
		dateOfBirth: input.dateOfBirth,
		excludeApplicantId: params.excludeApplicantId,
	});
};

export const attachIdentityHistoryToApplicants = async (
	prisma: PrismaExecutor,
	organizationId: string,
	applicants: Array<Record<string, any>>,
) => {
	if (!organizationId || applicants.length === 0) {
		return applicants;
	}

	const sources = await loadIdentityMatchSources(prisma, organizationId);
	for (const applicant of applicants) {
		const personInfo = personalInfoFromPerson(applicant.person);
		applicant.identityHistory = buildPersonIdentityHistoryFromSources(sources, {
			firstName: personInfo.firstName,
			lastName: personInfo.lastName,
			dateOfBirth: personInfo.dateOfBirth,
			excludeApplicantId: applicant.id,
		});
	}
	return applicants;
};

export const identityHistoryFromPerson = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		person?: { personalInfo?: unknown } | null;
		excludeApplicantId?: string | null;
	},
): Promise<PersonIdentityHistory> => {
	const info = asRecord(params.person?.personalInfo);
	return loadPersonIdentityHistory(prisma, {
		organizationId: params.organizationId,
		firstName: typeof info.firstName === "string" ? info.firstName : "",
		lastName: typeof info.lastName === "string" ? info.lastName : "",
		dateOfBirth:
			info.dateOfBirth instanceof Date || typeof info.dateOfBirth === "string"
				? info.dateOfBirth
				: info.dateOfBirth
					? String(info.dateOfBirth)
					: null,
		excludeApplicantId: params.excludeApplicantId,
	});
};
