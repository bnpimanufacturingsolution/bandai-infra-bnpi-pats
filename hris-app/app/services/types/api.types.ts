// Central API type definitions

export interface CreateEmployeeWithAccountRequest {
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
			dateOfBirth: string; // ISO string
			placeOfBirth?: string;
			age?: number;
			nationality?: string;
			primaryLanguage?: string;
			gender?:
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
			expiryDate: string; // ISO string
		};
	};
	employee: {
		organizationId: string;
		employeeId: string;
		deviceEmpId?: string | null;
		employmentHireDate: string; // ISO string
		employmentStartDate?: string;
		employmentTerminationDate?: string | null;
		employmentStatus:
			| "ACTIVE"
			| "INACTIVE"
			| "TERMINATED"
			| "RESIGNED"
			| "RETIRED"
			| "ON_LEAVE";
		employmentType:
			| "REGULAR"
			| "PROBATIONARY"
			| "CONTRACTUAL"
			| "PART_TIME"
			| "CONSULTANT"
			| "INTERN";
		probationEndDate?: string;
		departmentId: string;
		sectionId?: string | null;
		positionId: string;
		levelId?: string | null;
		embeddedSchedule?: {
			templateId?: string | null;
			templateCode?: string | null;
			templateName?: string | null;
			cycleDays: number;
			graceLateMinutes?: number | null;
			graceEarlyOutMinutes?: number | null;
			pattern: Array<{
				day: number;
				shiftTypeId?: string | null;
				shiftSnapshot?: {
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
					timeSlots?: Array<{
						type: string;
						label?: string | null;
						startTime: string;
						endTime: string;
					}>;
				} | null;
			}>;
			effectiveStartDate?: string | null;
			assignedAt?: string | null;
			assignedByEmployeeId?: string | null;
			reason?: string | null;
			version?: number | null;
		};
		defaultScheduleId?: string;
		scheduleIds?: string[];
		schedules?: Array<{
			entryId?: string;
			isActive: boolean;
			scheduleId?: string | null;
			scheduleCode: string;
			scheduleName: string;
			startDate: string;
			endDate?: string | null;
			shifts?: any[];
			gracePeriodMinutes?: number;
			source?: string | null;
			changedByEmployeeId?: string | null;
			changedAt?: string;
			metadata?: any;
		}>;
		basicSalary: number;
		currency: string;
		payFrequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
		documents: Array<{
			name?: string;
			type: string;
			documentTypeId?: string | null;
			number?: string;
			issueDate?: string;
			expiryDate?: string | null;
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
		reportToId?: string | null;
		role?: string; // role name
	};
}

export type ApiResponse<T> = {
	success: boolean;
	data: T;
	message?: string;
};
