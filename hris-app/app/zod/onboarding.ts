export interface OnboardingChecklistSummary {
	id: string;
	title: string;
	status: "DRAFT" | "ACTIVE" | "COMPLETED";
	completionPercentage: number;
}

export interface OnboardingRosterPagination {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface OnboardingRosterEmployee {
	employeeId: string;
	employeeNumber: string;
	name: string;
	department: string | null;
	departmentId: string | null;
	employmentStartDate: string | null;
	checklist: OnboardingChecklistSummary | null;
}

export interface OnboardingVisibleItem {
	id: string;
	sectionId: string;
	parentId: string | null;
	number: string;
	title: string;
	description: string | null;
	responsibleDepartmentId: string | null;
	responsibleDepartmentName: string | null;
	order: number;
	status: "PENDING" | "COMPLETED";
	completedDate: string | null;
	completedByEmployeeId: string | null;
	signedByName: string | null;
	remarks: string | null;
	canSign: boolean;
	isContextOnly: boolean;
	children: OnboardingVisibleItem[];
}

export interface OnboardingVisibleSection {
	id: string;
	title: string;
	order: number;
	items: OnboardingVisibleItem[];
}

export interface OnboardingVisibleChecklist {
	id: string;
	title: string;
	status: "DRAFT" | "ACTIVE" | "COMPLETED";
	completionPercentage: number;
	startDate: string;
	targetDate: string | null;
	employee: {
		id: string;
		employeeNumber: string;
		name: string;
		department: string | null;
	};
	view: "full" | "department" | "self";
	viewer: {
		department: string | null;
		isAdmin: boolean;
		isHr: boolean;
	};
	sections: OnboardingVisibleSection[];
}

export interface OnboardingTemplateSummary {
	id: string;
	name: string;
	description: string | null;
	isActive: boolean;
	createdAt: string;
	_count?: { sections: number };
}

export interface OnboardingTemplateTreeItem {
	id: string;
	sectionId: string;
	parentId: string | null;
	number: string;
	title: string;
	description: string | null;
	responsibleDepartmentId: string | null;
	responsibleDepartmentName: string | null;
	order: number;
	children: OnboardingTemplateTreeItem[];
}

export interface OnboardingTemplateTree {
	id: string;
	name: string;
	description: string | null;
	isActive: boolean;
	sections: {
		id: string;
		title: string;
		order: number;
		items: OnboardingTemplateTreeItem[];
	}[];
}

export interface TemplateTreeItemPayload {
	id?: string | null;
	tempId?: string;
	parentTempId?: string | null;
	number?: string;
	title: string;
	description?: string | null;
	responsibleDepartmentId?: string | null;
	responsibleDepartmentName?: string | null;
	order?: number;
}

export interface TemplateTreeSectionPayload {
	id?: string | null;
	tempId?: string;
	title: string;
	order?: number;
	items: TemplateTreeItemPayload[];
}

export interface ReplaceTemplateTreePayload {
	name?: string;
	description?: string | null;
	isActive?: boolean;
	sections: TemplateTreeSectionPayload[];
}

export interface SignOnboardingItemPayload {
	password: string;
	remarks?: string | null;
}

export interface CreateOnboardingChecklistPayload {
	employeeId: string;
	templateId?: string | null;
	title?: string;
	targetDate?: string | null;
}
