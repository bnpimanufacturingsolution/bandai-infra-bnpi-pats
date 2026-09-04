export type ShiftTimeSlotContract = {
	type: string;
	label?: string | null;
	startTime: string;
	endTime: string;
};

export type ShiftTypeSnapshotContract = {
	name?: string | null;
	code?: string | null;
	description?: string | null;
	startTime?: string | null;
	endTime?: string | null;
	breakMinutes?: number | null;
	graceLateMinutes?: number | null;
	graceEarlyOutMinutes?: number | null;
	isOvernight?: boolean;
	isOff?: boolean;
	timeSlots?: ShiftTimeSlotContract[];
};

export type EmployeeEmbeddedScheduleDayContract = {
	day: number;
	shiftTypeId?: string | null;
	shiftSnapshot?: ShiftTypeSnapshotContract | null;
};

export type EmployeeEmbeddedScheduleContract = {
	templateId?: string | null;
	templateCode?: string | null;
	templateName?: string | null;
	cycleDays: number;
	graceLateMinutes?: number | null;
	graceEarlyOutMinutes?: number | null;
	pattern: EmployeeEmbeddedScheduleDayContract[];
	effectiveStartDate?: string | null;
	assignedAt?: string | null;
	assignedByEmployeeId?: string | null;
	reason?: string | null;
	version?: number | null;
};

export interface FormData {
	user: {
		email: string;
		userName: string;
		password: string;
		avatar?: string;
		status: "active" | "inactive";
		loginMethod: "email" | "username";
		roleId: string;
		organizationId: string;
	};
	person: {
		organizationId: string;
		personalInfo: {
			prefix?: string;
			firstName: string;
			middleName?: string;
			lastName: string;
			dateOfBirth: string;
			placeOfBirth?: string;
			age?: number;
			nationality: string;
			primaryLanguage?: string;
			gender:
				| "male"
				| "female"
				| "other"
				| "prefer_not_to_say"
				| "unknown"
				| "not_applicable";
			currency?: string;
			vipCode?: string;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: "mobile" | "home" | "work" | "emergency" | "fax" | "pager" | "main" | "other";
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			fax?: string;
			address: Array<{
				street: string;
				address2?: string;
				city: string;
				state: string;
				country: string;
				postalCode: string;
				zipCode: string;
				houseNumber: string;
			}>;
		};
		identification: {
			type:
				| "passport"
				| "drivers_license"
				| "national_id"
				| "postal_id"
				| "voters_id"
				| "senior_citizen_id"
				| "company_id"
				| "school_id";
			number: string;
			issuingCountry: string;
			expiryDate: string | null;
		};
		children?: Array<{
			id?: string;
			firstName: string;
			middleName?: string;
			lastName?: string;
			dateOfBirth: string;
			gender?: "male" | "female" | "other" | "not_applicable";
			isDependent?: boolean;
			notes?: string;
		}>;
	};
	employee: {
		organizationId: string;
		employeeId: string;
		deviceEmpId?: string | null;
		employmentHireDate: string;
		employmentStartDate: string;
		employmentTerminationDate?: string | null;
		employmentStatus:
			| "ACTIVE"
			| "RESIGNATION_REQUESTED"
			| "SERVING_NOTICE"
			| "FORMER_EMPLOYEE"
			| "INACTIVE"
			| "TERMINATED"
			| "RESIGNED"
			| "RETIRED"
			| "ON_LEAVE"
			| "ONBOARDING"
			| "OFFBOARDING";
		employmentType:
			| "REGULAR"
			| "PROBATIONARY"
			| "CONTRACTUAL"
			| "PART_TIME"
			| "CONSULTANT"
			| "INTERN";
		probationEndDate?: string | undefined;
		departmentId: string;
		sectionId?: string | null;
		positionId: string;
		levelId?: string | null;
		activeSchedule?: {
			assignmentType?: "template" | "manual";
			effectiveStartDate: string;
			scheduleTemplateId?: string | null;
			scheduleTemplateCode?: string | null;
			scheduleTemplateName?: string | null;
			cycleDays?: number;
			graceLateMinutes?: number;
			graceEarlyOutMinutes?: number;
			pattern?: EmployeeEmbeddedScheduleDayContract[];
			manualShiftSnapshot?: ShiftTypeSnapshotContract | null;
		};
		schedules?: Array<{
			entryId?: string;
			scheduleId?: string | null;
			scheduleCode: string;
			scheduleName: string;
			startDate: string;
			endDate?: string | null;
			isActive?: boolean;
			shifts?: Array<Record<string, unknown>>;
			gracePeriodMinutes?: number;
			source?: string | null;
			changedByEmployeeId?: string | null;
			changedAt?: string | null;
			metadata?: unknown | null;
		}>;
		embeddedSchedule?: EmployeeEmbeddedScheduleContract | null;
		basicSalary: number;
		currency: string;
		payFrequency:
			| "DAILY"
			| "WEEKLY"
			| "BIWEEKLY"
			| "SEMI_MONTHLY"
			| "MONTHLY"
			| "QUARTERLY"
			| "ANNUALLY";
		documents: Array<{
			name?: string;
			type: string;
			documentTypeId?: string | null;
			number?: string;
			issueDate?: string;
			expiryDate?: string | null;
			fileUrl?: string;
			ext?: string;
			fieldValues?: Record<string, unknown> | null;
			metadata?: Record<string, unknown> | null;
		}>;
		leaveBalances?: Array<{
			leaveType: string;
			totalEntitled: number;
			periodStart: string;
			periodEnd: string;
		}>;
		workLocation: "ONSITE" | "REMOTE" | "HYBRID";
		workforceSource?: "DIRECT" | "AGENCY";
		agencyId?: string | null;
		isManager: boolean;
		/** true when role is hris-hr-manager (derived; mutually exclusive with isManager) */
		isHrManager?: boolean;
		/** system-derived role name, populated automatically from dept + level */
		derivedRole?: string;
		reportToId?: string | null;
		role?: string;
		employeeBenefits?: Array<{
			id?: string;
			organizationId?: string;
			employeeId?: string;
			benefitTypeId: string;
			payrollPeriodId?: string;
			name: string;
			description?: string;
			amount: number;
			startDate: string;
			endDate?: string;
			isActive: boolean;
		}>;
		metadata?: Record<string, unknown> | null;
	};
}
