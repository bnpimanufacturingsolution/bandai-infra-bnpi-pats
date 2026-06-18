import { describe, expect, it } from "vitest";
import type { FormData } from "~/types/employee-form.types";
import {
	EMPLOYEE_FORM_DRAFT_TTL_MS,
	buildEmployeeFormDraftSnapshot,
	hasMeaningfulEmployeeFormDraftData,
	sanitizeEmployeeFormDraftData,
	validateEmployeeFormDraftSnapshot,
} from "./employee-form-draft-idb";

const buildDefaultFormData = (): FormData => ({
	person: {
		organizationId: "org-1",
		personalInfo: {
			prefix: "",
			firstName: "",
			middleName: "",
			lastName: "",
			dateOfBirth: "",
			placeOfBirth: "",
			age: 0,
			nationality: "Filipino",
			primaryLanguage: "",
			gender: "male",
			currency: "PHP",
			vipCode: "",
		},
		contactInfo: {
			email: "",
			phones: [{ type: "mobile", countryCode: "+63", number: "", isPrimary: true }],
			fax: "",
			address: [
				{
					street: "",
					address2: "",
					city: "",
					state: "",
					country: "Philippines",
					postalCode: "",
					zipCode: "",
					houseNumber: "",
				},
			],
		},
		identification: {
			type: "national_id",
			number: "",
			issuingCountry: "Philippines",
			expiryDate: "",
		},
	},
	employee: {
		organizationId: "org-1",
		employeeId: "",
		employmentHireDate: "2026-04-20",
		employmentStartDate: "2026-04-20",
		employmentTerminationDate: null,
		employmentStatus: "ONBOARDING",
		employmentType: "PROBATIONARY",
		probationEndDate: undefined,
		departmentId: "",
		positionId: "",
		levelId: "",
		activeSchedule: {
			effectiveStartDate: "2026-04-20",
			scheduleTemplateId: "",
			scheduleTemplateCode: "",
			scheduleTemplateName: "",
			cycleDays: 7,
			graceLateMinutes: 15,
			graceEarlyOutMinutes: 0,
			pattern: Array.from({ length: 7 }).map((_, index) => ({
				day: index + 1,
				shiftTypeId: "",
				shiftSnapshot: {
					name: "",
					code: "",
					description: "",
					startTime: "",
					endTime: "",
					breakMinutes: 0,
					graceLateMinutes: 0,
					graceEarlyOutMinutes: 0,
					isOvernight: false,
					isOff: false,
					timeSlots: [
						{
							type: "work",
							label: "Work Slot",
							startTime: "09:00",
							endTime: "18:00",
						},
					],
				},
			})),
		},
		basicSalary: 0,
		currency: "PHP",
		payFrequency: "SEMI_MONTHLY",
		documents: [],
		leaveBalances: [
			{
				leaveType: "VACATION",
				totalEntitled: 15,
				periodStart: "2026-01-01",
				periodEnd: "2026-12-31",
			},
			{
				leaveType: "SICK",
				totalEntitled: 15,
				periodStart: "2026-01-01",
				periodEnd: "2026-12-31",
			},
		],
		workLocation: "ONSITE",
		workforceSource: "DIRECT",
		agencyId: null,
		isManager: false,
		isHrManager: false,
		derivedRole: undefined,
		reportToId: null,
		employeeBenefits: [],
	},
	user: {
		email: "",
		userName: "",
		password: "",
		avatar: "",
		status: "active",
		loginMethod: "email",
		roleId: "",
		organizationId: "org-1",
	},
});

describe("employee-form-draft-idb", () => {
	it("serializes a sanitized snapshot and strips the password", () => {
		const formData = buildDefaultFormData();
		formData.person.personalInfo.firstName = "Jamie";
		formData.user.password = "super-secret";

		const snapshot = buildEmployeeFormDraftSnapshot({
			entityKey: "/hr/employees/new::org-1::user-1",
			organizationId: "org-1",
			userId: "user-1",
			currentStep: 2,
			enabledDocuments: { tin: true },
			formData,
			savedAt: 1713571200000,
		});

		expect(snapshot.formData.user.password).to.equal("");
		expect(snapshot.currentStep).to.equal(2);
		expect(snapshot.enabledDocuments).to.deep.equal({ tin: true });
		expect(snapshot.formData.person.personalInfo.firstName).to.equal("Jamie");
	});

	it("sanitizes raw form data directly", () => {
		const formData = buildDefaultFormData();
		formData.user.password = "keep-me-out";

		const sanitized = sanitizeEmployeeFormDraftData(formData);

		expect(sanitized.user.password).to.equal("");
		expect(sanitized.employee.employeeId).to.equal("");
	});

	it("rejects expired snapshots", () => {
		const snapshot = buildEmployeeFormDraftSnapshot({
			entityKey: "/hr/employees/new::org-1::user-1",
			organizationId: "org-1",
			userId: "user-1",
			currentStep: 1,
			enabledDocuments: {},
			formData: buildDefaultFormData(),
			savedAt: 1000,
			ttlMs: 500,
		});

		const hydrated = validateEmployeeFormDraftSnapshot(
			snapshot,
			{
				entityKey: snapshot.entityKey,
				organizationId: "org-1",
				userId: "user-1",
			},
			2000,
		);

		expect(hydrated).to.equal(null);
	});

	it("rejects version mismatches", () => {
		const snapshot = {
			...buildEmployeeFormDraftSnapshot({
				entityKey: "/hr/employees/new::org-1::user-1",
				organizationId: "org-1",
				userId: "user-1",
				currentStep: 1,
				enabledDocuments: {},
				formData: buildDefaultFormData(),
				savedAt: 1713571200000,
				ttlMs: EMPLOYEE_FORM_DRAFT_TTL_MS,
			}),
			version: 999,
		};

		const hydrated = validateEmployeeFormDraftSnapshot(snapshot, {
			entityKey: snapshot.entityKey,
			organizationId: "org-1",
			userId: "user-1",
		});

		expect(hydrated).to.equal(null);
	});

	it("treats default-only payloads as non-persistable even if an employee ID was auto-reserved", () => {
		const defaultValues = buildDefaultFormData();
		const formData = {
			...buildDefaultFormData(),
			employee: {
				...buildDefaultFormData().employee,
				employeeId: "EMP041",
			},
		};

		expect(
			hasMeaningfulEmployeeFormDraftData({
				formData,
				defaultValues,
				enabledDocuments: {},
				currentStep: 0,
			}),
		).to.equal(false);
	});

	it("treats user-entered changes as persistable", () => {
		const defaultValues = buildDefaultFormData();
		const formData = buildDefaultFormData();
		formData.person.personalInfo.firstName = "Taylor";

		expect(
			hasMeaningfulEmployeeFormDraftData({
				formData,
				defaultValues,
				enabledDocuments: {},
				currentStep: 0,
			}),
		).to.equal(true);
	});
});
