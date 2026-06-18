import { hrisApiClient } from "~/lib/api-client";
import type { LeavePolicyConfig, UpdateLeavePolicyPayload, LeaveType } from "./leave-settings.service";
import type {
	PayrollBusinessDayRule,
	PayrollCycleConfig,
	PayrollCycleRules,
	PayrollFrequency,
} from "./payroll-periods.service";
import type { TimesheetConfig, UpdateTimesheetConfigRequest } from "./timesheet.service";

export type SystemProvisioningMode = "PROVISIONING" | "READY";
export type SystemProvisioningStepStatus = "COMPLETED" | "CURRENT" | "UPCOMING";
export type ProvisioningInitializationStatus = "IDLE" | "RUNNING" | "FAILED" | "COMPLETED";

export type SystemProvisioningStepId =
	| "company-profile"
	| "system-preview"
	| "initialize-system"
	| "admin-account";

export interface SystemProvisioningStep {
	id: SystemProvisioningStepId;
	title: string;
	description: string;
	complete: boolean;
	reason: string;
	route: string;
	status: SystemProvisioningStepStatus;
}

export interface SystemProvisioningStatus {
	mode: SystemProvisioningMode;
	canManageSetup: boolean;
	currentStep: SystemProvisioningStepId;
	isProvisioned: boolean;
	initializationStatus: ProvisioningInitializationStatus;
	provisionedAt?: string;
	provisionedBy?: string;
	seederVersion?: string;
	previewAvailable: boolean;
	steps: SystemProvisioningStep[];
	summary: {
		hasAdmin: boolean;
		isActivated: boolean;
		hasHrSettings: boolean;
		hasTimesheetConfig: boolean;
		hasPayrollCycleConfig: boolean;
		hasOpenPayrollPeriod: boolean;
		hasLeavePolicies: boolean;
		hasDefaultCalculator: boolean;
		isProvisioned: boolean;
		initializationStatus: ProvisioningInitializationStatus;
		previewAvailable: boolean;
	};
	organization: {
		id: string;
		name: string;
		code: string;
		description?: string | null;
		branding?: Record<string, any>;
	};
	provisioning?: {
		activatedAt?: string;
		activatedBy?: string;
		version?: number;
		lastReviewedStepIds?: string[];
		completedAtByStep?: Record<string, string>;
		hrSettings?: {
			companyName?: string;
			timezone?: string;
		};
		isProvisioned?: boolean;
		provisionedAt?: string;
		provisionedBy?: string;
		seederVersion?: string;
		initializationStatus?: ProvisioningInitializationStatus;
		lastError?: string;
	};
}

export interface BootstrapAdminPayload {
	email: string;
	userName: string;
	password: string;
}

export interface BootstrapAdminResponse {
	user: {
		id?: string;
		email: string;
		userName: string;
		role?: string;
		organizationId?: string;
	};
	status?: SystemProvisioningStatus;
}

export interface HrSetupPayload {
	companyName: string;
	timezone: string;
	description?: string;
	logo?: string;
	primaryColor?: string;
	secondaryColor?: string;
	accentColor?: string;
}

export interface SystemProvisioningPreview {
	companyProfile: {
		name: string;
		code: string;
		description: string;
		timezone: string;
		logo?: string;
	};
	holidays: Array<{
		title: string;
		month: number;
		day: number;
		holidayType: string;
		description?: string;
		year: number;
	}>;
	workflowConfigs: Array<{
		code: string;
		name: string;
		description?: string | null;
		domain: string;
		requestType?: string | null;
		steps: any[];
		states: any[];
		isActive: boolean;
		isDefault?: boolean;
	}>;
	devices: Array<{
		name: string;
		address: string;
		port: number;
		protocol: string;
	}>;
	documentTypes: Array<{
		code: string;
		name: string;
		uploadBy: "HR" | "EMPLOYEE" | "BOTH";
		isRequired: boolean;
	}>;
	leavePolicies: Array<{
		leaveType: string;
		requiresApproval: boolean;
		isPaid: boolean;
		minAdvanceNoticeDays: number;
		maxDaysPerRequest: number;
	}>;
	payrollPeriods: {
		year: number;
		frequency: string;
		totalPeriods: number;
		includesCarryIn: boolean;
		examples: string[];
	};
	defaultCalculator: {
		code: string;
		name: string;
		type: string;
		description: string;
		taxTable: {
			bracketCount: number;
			monthlyZeroTaxCap: number;
			semiMonthlyZeroTaxCap: number;
			topRate: number;
		};
		contributions: {
			sssEmployeeRate: number;
			sssEmployerRate: number;
			philHealthEmployeeRate: number;
			philHealthEmployerRate: number;
			pagIbigRateBelowThreshold: number;
			pagIbigRateAboveThreshold: number;
			pagIbigThreshold: number;
		};
	};
	defaults: {
		timesheet: {
			enableAutoApprove: boolean;
			enableEditBeforeSubmission: boolean;
			rejectBehavior: string;
			overtimeFlagThresholdMinutes: number;
		};
		payroll: {
			defaultPayFrequency: string;
			payDateOffsetDays: number;
			businessDayRule: string;
			includeHolidaysInBusinessDayCheck: boolean;
		};
	};
}

export interface SystemProvisioningInitializeResponse {
	success: boolean;
	alreadyProvisioned?: boolean;
	counts: Record<string, number>;
	status: SystemProvisioningStatus;
}

export interface SystemProvisioningInitializePayload {
	seedPhilippineHolidays?: boolean;
	seedMandated201DocumentTypes?: boolean;
	seedWorkflowTemplates?: boolean;
	seedDefaultLeaveTypes?: boolean;
}

export interface CompanyLogoUploadResponse {
	logo: string;
	organization?: SystemProvisioningStatus["organization"];
}

export type ProvisioningTimesheetPayload = UpdateTimesheetConfigRequest;

export interface ProvisioningPayrollSettingsPayload {
	defaultPayFrequency?: PayrollFrequency;
	payDateOffsetDays?: number;
	businessDayRule?: PayrollBusinessDayRule;
	includeHolidaysInBusinessDayCheck?: boolean;
	cycleRules?: PayrollCycleRules;
	calculator?: {
		name?: string;
		description?: string;
		type?: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
		taxRates?: Record<string, any> | Array<Record<string, any>>;
		sssRates?: Record<string, any>;
		philHealthRates?: Record<string, any>;
		pagibigRates?: Record<string, any>;
		rateMultipliers?: {
			ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
			restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
			specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
			regularHoliday: { work: number; ot: number; nd: number; ndot: number };
			regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
			doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
			doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		};
	};
}

export interface ProvisioningPayrollSettingsResponse {
	cycleConfig: PayrollCycleConfig;
	defaultCalculator: {
		id: string;
		code?: string;
		name: string;
		description?: string;
		type: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
		taxRates?: Record<string, any> | Array<Record<string, any>>;
		sssRates?: Record<string, any>;
		philHealthRates?: Record<string, any>;
		pagibigRates?: Record<string, any>;
		rateMultipliers?: {
			ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
			restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
			specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
			regularHoliday: { work: number; ot: number; nd: number; ndot: number };
			regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
			doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
			doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		};
	};
}

export interface ProvisioningLeavePolicyUpdate {
	leaveType: LeaveType;
	payload: UpdateLeavePolicyPayload;
}

class SystemProvisioningService {
	async getStatus(): Promise<SystemProvisioningStatus> {
		const response = await hrisApiClient.get<any>("/api/system-provisioning/status");
		if (!response?.data) throw new Error("Invalid system provisioning status response");
		return (response.data?.data || response.data) as SystemProvisioningStatus;
	}

	async bootstrapAdmin(payload: BootstrapAdminPayload): Promise<BootstrapAdminResponse> {
		const response = await hrisApiClient.post<any>("/api/system-provisioning/bootstrap-admin", payload);
		if (!response?.data) throw new Error("Invalid bootstrap admin response");
		return (response.data?.data || response.data) as BootstrapAdminResponse;
	}

	async updateHrSettings(payload: HrSetupPayload) {
		const response = await hrisApiClient.patch<any>("/api/system-provisioning/hr-settings", payload);
		if (!response?.data) throw new Error("Invalid HR setup response");
		return response.data?.data || response.data;
	}

	async uploadLogo(file: File): Promise<CompanyLogoUploadResponse> {
		const formData = new FormData();
		formData.append("logo", file);
		const response = await hrisApiClient.post<any>("/api/system-provisioning/logo", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		if (!response?.data) throw new Error("Invalid logo upload response");
		return (response.data?.data || response.data) as CompanyLogoUploadResponse;
	}

	async getPreview(): Promise<SystemProvisioningPreview> {
		const response = await hrisApiClient.get<any>("/api/system-provisioning/preview");
		if (!response?.data) throw new Error("Invalid system provisioning preview response");
		return (response.data?.data || response.data) as SystemProvisioningPreview;
	}

	async initialize(
		payload?: SystemProvisioningInitializePayload,
	): Promise<SystemProvisioningInitializeResponse> {
		const response = await hrisApiClient.post<any>(
			"/api/system-provisioning/initialize",
			payload || {},
		);
		if (!response?.data) throw new Error("Invalid system provisioning initialize response");
		return (response.data?.data || response.data) as SystemProvisioningInitializeResponse;
	}

	async getTimesheetSettings(): Promise<TimesheetConfig> {
		const response = await hrisApiClient.get<any>("/api/system-provisioning/timesheet-settings");
		if (!response?.data) throw new Error("Invalid timesheet settings response");
		return (response.data?.data || response.data) as TimesheetConfig;
	}

	async updateTimesheetSettings(payload: ProvisioningTimesheetPayload): Promise<TimesheetConfig> {
		const response = await hrisApiClient.patch<any>(
			"/api/system-provisioning/timesheet-settings",
			payload,
		);
		if (!response?.data) throw new Error("Invalid timesheet settings update response");
		return (response.data?.data || response.data) as TimesheetConfig;
	}

	async getPayrollSettings(): Promise<ProvisioningPayrollSettingsResponse> {
		const response = await hrisApiClient.get<any>("/api/system-provisioning/payroll-settings");
		if (!response?.data) throw new Error("Invalid payroll settings response");
		return (response.data?.data || response.data) as ProvisioningPayrollSettingsResponse;
	}

	async updatePayrollSettings(
		payload: ProvisioningPayrollSettingsPayload,
	): Promise<ProvisioningPayrollSettingsResponse> {
		const response = await hrisApiClient.patch<any>(
			"/api/system-provisioning/payroll-settings",
			payload,
		);
		if (!response?.data) throw new Error("Invalid payroll settings update response");
		return (response.data?.data || response.data) as ProvisioningPayrollSettingsResponse;
	}

	async getLeaveSettings(): Promise<LeavePolicyConfig[]> {
		const response = await hrisApiClient.get<any>("/api/system-provisioning/leave-settings");
		if (!response?.data) throw new Error("Invalid leave settings response");
		return (response.data?.data || response.data) as LeavePolicyConfig[];
	}

	async updateLeaveSettings(policies: ProvisioningLeavePolicyUpdate[]): Promise<LeavePolicyConfig[]> {
		const response = await hrisApiClient.patch<any>("/api/system-provisioning/leave-settings", {
			policies,
		});
		if (!response?.data) throw new Error("Invalid leave settings update response");
		return (response.data?.data || response.data) as LeavePolicyConfig[];
	}

	async activate() {
		const response = await hrisApiClient.post<any>("/api/system-provisioning/activate");
		if (!response?.data) throw new Error("Invalid activation response");
		return response.data?.data || response.data;
	}
}

export default new SystemProvisioningService();
