export type ProvisioningAccessMode = "PROVISIONING" | "READY";
export type ProvisioningInitializationStatus =
	| "IDLE"
	| "RUNNING"
	| "FAILED"
	| "COMPLETED";

export type ProvisioningHrSettings = {
	companyName?: string;
	timezone?: string;
	businessDays?: string[];
};

export type ProvisioningWorkflowDomain =
	| "REQUEST"
	| "RECRUITMENT"
	| "PAYROLL";

export type ProvisioningWorkflowState = {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
};

export type ProvisioningWorkflowStep = {
	step_number: number;
	step_name: string;
	step_type: "SUBMISSION" | "APPROVAL" | "TASK";
	assignee_type:
		| "REQUESTER"
		| "SUPERVISOR"
		| "TARGET_DEPARTMENT_MANAGER"
		| "HR"
		| "SYSTEM";
	is_required?: boolean;
	state_on_enter?: string;
	state_on_approve?: string;
	state_on_reject?: string;
	state_on_complete?: string;
	state_on_skip?: string;
};

export type ProvisioningWorkflowConfig = {
	code: string;
	name: string;
	description?: string | null;
	domain: ProvisioningWorkflowDomain;
	requestType?: string | null;
	states: ProvisioningWorkflowState[];
	steps: ProvisioningWorkflowStep[];
	isActive: boolean;
	isDefault?: boolean;
	createdAt?: string;
	updatedAt?: string;
};

export type ProvisioningBrandingState = {
	activatedAt?: string;
	activatedBy?: string;
	version?: number;
	lastReviewedStepIds?: string[];
	completedAtByStep?: Record<string, string>;
	completedByStep?: Record<string, string>;
	hrSettings?: ProvisioningHrSettings;
	isProvisioned?: boolean;
	provisionedAt?: string;
	provisionedBy?: string;
	seederVersion?: string;
	initializationStatus?: ProvisioningInitializationStatus;
	lastError?: string;
	hasAdmin?: boolean;
	hasHrSettings?: boolean;
	previewAvailable?: boolean;
	mode?: ProvisioningAccessMode;
	workflowConfigs?: ProvisioningWorkflowConfig[];
};

export type ProvisioningAccessSnapshot = {
	hasAdmin: boolean;
	hasHrSettings: boolean;
	isProvisioned: boolean;
	initializationStatus: ProvisioningInitializationStatus;
	previewAvailable: boolean;
	mode: ProvisioningAccessMode;
};

export const DEFAULT_PROVISIONING_TIMEZONE = "Asia/Manila";
export const DEFAULT_PROVISIONING_SEEDER_VERSION = "v1.0";

export const DEFAULT_ORG_BRANDING = {
	logo: "assets/images/bandai_logo.png",
	background: "",
	font: "",
	colors: {
		primary: "#E60012",
		secondary: "#FF8200",
		accent: "#f59e0b",
		success: "#10b981",
		warning: "#f59e0b",
		danger: "#ef4444",
		info: "#3b82f6",
		light: "#f8fafc",
		dark: "#1f2937",
		neutral: "#6b7280",
	},
} as const;

export const extractProvisioningState = (branding: unknown): ProvisioningBrandingState => {
	if (!branding || typeof branding !== "object" || Array.isArray(branding)) return {};
	const provisioning = (branding as Record<string, any>).provisioning;
	if (!provisioning || typeof provisioning !== "object" || Array.isArray(provisioning)) {
		return {};
	}
	return provisioning as ProvisioningBrandingState;
};

export const mergeBrandingProvisioning = (
	existingBranding: unknown,
	provisioningUpdates: Partial<ProvisioningBrandingState>,
) => {
	const currentBranding =
		existingBranding && typeof existingBranding === "object" && !Array.isArray(existingBranding)
			? ({ ...(existingBranding as Record<string, any>) } as Record<string, any>)
			: {};
	const currentProvisioning = extractProvisioningState(currentBranding);

	return {
		...currentBranding,
		provisioning: {
			...currentProvisioning,
			...provisioningUpdates,
			hrSettings: {
				...(currentProvisioning.hrSettings || {}),
				...(provisioningUpdates.hrSettings || {}),
			},
			completedAtByStep: {
				...(currentProvisioning.completedAtByStep || {}),
				...(provisioningUpdates.completedAtByStep || {}),
			},
			completedByStep: {
				...(currentProvisioning.completedByStep || {}),
				...(provisioningUpdates.completedByStep || {}),
			},
		},
	};
};

export const isHrSettingsComplete = (value: ProvisioningHrSettings | undefined) =>
	Boolean(
		value?.companyName && value.companyName.trim() && value?.timezone && value.timezone.trim(),
	);

export const buildProvisioningAccessSnapshot = (params: {
	provisioning?: ProvisioningBrandingState;
	hasAdmin?: boolean;
}): ProvisioningAccessSnapshot => {
	const provisioning = params.provisioning || {};
	const hrSettingsComplete = isHrSettingsComplete(provisioning.hrSettings);
	const hasHrSettings =
		provisioning.hasHrSettings === true ? true : hrSettingsComplete;
	const isProvisioned = provisioning.isProvisioned === true;
	const initializationStatus = provisioning.initializationStatus || "IDLE";
	const hasAdmin =
		typeof params.hasAdmin === "boolean"
			? params.hasAdmin
			: provisioning.hasAdmin === true;

	return {
		hasAdmin,
		hasHrSettings,
		isProvisioned,
		initializationStatus,
		previewAvailable: provisioning.previewAvailable === true ? true : hasHrSettings,
		mode: isProvisioned && hasAdmin ? "READY" : "PROVISIONING",
	};
};

export const buildSeededProvisioningState = (params: {
	companyName: string;
	actor?: string;
	hasAdmin: boolean;
	now?: Date;
	timezone?: string;
	seederVersion?: string;
}): ProvisioningBrandingState => {
	const nowIso = (params.now || new Date()).toISOString();
	const actor = params.actor || "SYSTEM_INIT";
	const timezone = params.timezone || DEFAULT_PROVISIONING_TIMEZONE;
	const access = buildProvisioningAccessSnapshot({
		provisioning: {
			hrSettings: {
				companyName: params.companyName,
				timezone,
			},
			isProvisioned: true,
			initializationStatus: "COMPLETED",
			hasAdmin: params.hasAdmin,
			hasHrSettings: true,
			previewAvailable: true,
		},
		hasAdmin: params.hasAdmin,
	});

	return {
		activatedAt: params.hasAdmin ? nowIso : undefined,
		activatedBy: params.hasAdmin ? actor : undefined,
		version: 1,
		hrSettings: {
			companyName: params.companyName,
			timezone,
		},
		isProvisioned: true,
		provisionedAt: nowIso,
		provisionedBy: actor,
		seederVersion: params.seederVersion || DEFAULT_PROVISIONING_SEEDER_VERSION,
		initializationStatus: "COMPLETED",
		hasAdmin: access.hasAdmin,
		hasHrSettings: access.hasHrSettings,
		previewAvailable: access.previewAvailable,
		mode: access.mode,
		completedAtByStep: {
			"company-profile": nowIso,
			"system-preview": nowIso,
			"initialize-system": nowIso,
			...(params.hasAdmin ? { "admin-account": nowIso } : {}),
		},
		completedByStep: {
			"company-profile": actor,
			"system-preview": actor,
			"initialize-system": actor,
			...(params.hasAdmin ? { "admin-account": actor } : {}),
		},
	};
};

export const buildSeededOrganizationBranding = (params: {
	existingBranding?: unknown;
	companyName: string;
	actor?: string;
	hasAdmin: boolean;
	now?: Date;
	timezone?: string;
	seederVersion?: string;
}) =>
	mergeBrandingProvisioning(
		{
			...DEFAULT_ORG_BRANDING,
			...((params.existingBranding as Record<string, any> | undefined) || {}),
		},
		buildSeededProvisioningState({
			companyName: params.companyName,
			actor: params.actor,
			hasAdmin: params.hasAdmin,
			now: params.now,
			timezone: params.timezone,
			seederVersion: params.seederVersion,
		}),
	);
