import { hrisApiClient } from "~/lib/api-client";

export interface WorkforceRecruitmentPolicy {
	id: string;
	departmentId?: string | null;
	sectionId?: string | null;
	positionId?: string | null;
	levelId?: string | null;
	targetHeadcount: number;
	limitBehavior: "WARN" | "BLOCK";
	defaultWorkflowCode?: string | null;
	autoCreateJobOnApproval?: boolean;
	jobType?: string | null;
	jobLocation?: string | null;
	jobTags?: string[];
	jobDescriptionTemplate?: string | null;
	isActive: boolean;
	currentHeadcount?: number;
	availableHeadcount?: number;
}

export interface WorkforceRecruitmentPolicyInput
	extends Omit<WorkforceRecruitmentPolicy, "id" | "currentHeadcount" | "availableHeadcount"> {
	id?: string;
}

export interface WorkforceRecruitmentSettings {
	isEnabled: boolean;
	enforceDepartmentManagerScope: boolean;
	defaultWorkflowCode: string;
	requestSubtype: "DEPARTMENT_JOB_REQUISITION";
	autoCreateJobOnApproval: boolean;
	policies: WorkforceRecruitmentPolicy[];
	seededAt?: string;
	updatedAt?: string;
}

export interface UpdateWorkforceRecruitmentSettingsPayload
	extends Partial<Omit<WorkforceRecruitmentSettings, "policies">> {
	policies?: WorkforceRecruitmentPolicyInput[];
}

export interface WorkforceRecruitmentRequestContext {
	settings: Pick<
		WorkforceRecruitmentSettings,
		| "isEnabled"
		| "enforceDepartmentManagerScope"
		| "defaultWorkflowCode"
		| "requestSubtype"
		| "autoCreateJobOnApproval"
	>;
	requester: {
		id: string;
		role: string;
		departmentId?: string | null;
		departmentName?: string | null;
		sectionId?: string | null;
		sectionName?: string | null;
		isDepartmentManager: boolean;
		positionId?: string | null;
		positionTitle?: string | null;
		levelId?: string | null;
		levelName?: string | null;
	};
	scope: {
		department?: { id: string; name: string; managerId?: string | null } | null;
		section?: { id: string; name: string } | null;
		position?: { id: string; title: string } | null;
		level?: { id: string; name: string } | null;
		description?: string | null;
	};
	policy: WorkforceRecruitmentPolicy | null;
	headcount: {
		currentHeadcount: number;
		availableHeadcount: number | null;
	};
	permissions: {
		canSubmit: boolean;
		reason?: string | null;
	};
}

class WorkforceRecruitmentSettingsService {
	async getSettings(): Promise<WorkforceRecruitmentSettings> {
		const response = await hrisApiClient.get<any>("/api/workforce-recruitment-setting");
		const data = response.data?.data || response.data;
		const settings = data?.settings || data;
		if (!settings) {
			throw new Error("Failed to fetch workforce recruitment settings");
		}
		return settings as WorkforceRecruitmentSettings;
	}

	async updateSettings(payload: UpdateWorkforceRecruitmentSettingsPayload) {
		const response = await hrisApiClient.patch<any>(
			"/api/workforce-recruitment-setting",
			payload,
		);
		const data = response.data?.data || response.data;
		const settings = data?.settings || data;
		if (!settings) {
			throw new Error("Failed to update workforce recruitment settings");
		}
		return settings as WorkforceRecruitmentSettings;
	}

	async getRequestContext(params?: {
		departmentId?: string | null;
		sectionId?: string | null;
		positionId?: string | null;
		levelId?: string | null;
	}) {
		const searchParams = new URLSearchParams();
		if (params?.departmentId) searchParams.set("departmentId", params.departmentId);
		if (params?.sectionId) searchParams.set("sectionId", params.sectionId);
		if (params?.positionId) searchParams.set("positionId", params.positionId);
		if (params?.levelId) searchParams.set("levelId", params.levelId);
		const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
		const response = await hrisApiClient.get<any>(
			`/api/workforce-recruitment-setting/request-context${suffix}`,
		);
		const data = response.data?.data || response.data;
		if (!data) {
			throw new Error("Failed to fetch hiring requisition context");
		}
		return data as WorkforceRecruitmentRequestContext;
	}
}

const workforceRecruitmentSettingsService = new WorkforceRecruitmentSettingsService();
export default workforceRecruitmentSettingsService;
