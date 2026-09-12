export interface ChecklistItemMock {
	id: string;
	sectionId: string | null;
	parentId: string | null;
	order: number;
	number: string;
	title: string;
	responsibleDepartment: string;
	completed: boolean;
	dateCompleted: string | null;
	remarks: string;
	signedByName: string;
}

export interface ChecklistSectionMock {
	id: string;
	order: number;
	title: string;
}

export interface OnboardingChecklistResponse {
	id: string;
	name: string;
	sections: ChecklistSectionMock[];
	items: ChecklistItemMock[];
}

export const mockChecklistResponse: OnboardingChecklistResponse = {
	id: "tpl_001",
	name: "Standard Onboarding Checklist",
	sections: [
		{ id: "sec_1", order: 1, title: "Section 1: Pre-Onboarding (Before Day 1)" },
		{ id: "sec_2", order: 2, title: "Section 2: First Day & Orientation" },
		{ id: "sec_3", order: 3, title: "Section 3: IT & Systems Setup" },
	],
	items: [
		// Section 1
		{ id: "item_1_1", sectionId: "sec_1", parentId: null, order: 1, number: "1", title: "Offer letter sent and signed", responsibleDepartment: "HR", completed: true, dateCompleted: "2026-09-01", remarks: "", signedByName: "" },
		{ id: "item_1_2", sectionId: "sec_1", parentId: null, order: 2, number: "2", title: "Job description and contract prepared", responsibleDepartment: "HR", completed: true, dateCompleted: "2026-09-01", remarks: "", signedByName: "" },
		{ id: "item_1_3", sectionId: "sec_1", parentId: null, order: 3, number: "3", title: "Pre-employment requirements collected", responsibleDepartment: "HR", completed: true, dateCompleted: "2026-09-02", remarks: "", signedByName: "" },
		{ id: "item_1_4", sectionId: "sec_1", parentId: null, order: 4, number: "4", title: "Medical exam scheduled/completed", responsibleDepartment: "HR", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_5", sectionId: "sec_1", parentId: null, order: 5, number: "5", title: "201 file created", responsibleDepartment: "HR", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_6", sectionId: "sec_1", parentId: null, order: 6, number: "6", title: "Email and Office365 account creation, if applicable", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_6_1", sectionId: "sec_1", parentId: "item_1_6", order: 1, number: "6.1", title: "Office 365, if applicable", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_6_2", sectionId: "sec_1", parentId: "item_1_6", order: 2, number: "6.2", title: "Microsoft Teams", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7", sectionId: "sec_1", parentId: null, order: 7, number: "7", title: "Office supplies prepared", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_1", sectionId: "sec_1", parentId: "item_1_7", order: 1, number: "7.1", title: "Uniform (Polo Jacket, Shoes, Cap)", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_2", sectionId: "sec_1", parentId: "item_1_7", order: 2, number: "7.2", title: "ID", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_3", sectionId: "sec_1", parentId: "item_1_7", order: 3, number: "7.3", title: "Work Station, if applicable", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_4", sectionId: "sec_1", parentId: "item_1_7", order: 4, number: "7.4", title: "Cellphone, if applicable: _______________", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_5", sectionId: "sec_1", parentId: "item_1_7", order: 5, number: "7.5", title: "Business Card, if applicable", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_1_7_6", sectionId: "sec_1", parentId: "item_1_7", order: 6, number: "7.6", title: "Locker Assignment, if applicable", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		// Section 2
		{ id: "item_2_1", sectionId: "sec_2", parentId: null, order: 1, number: "1", title: "Welcome email sent to team", responsibleDepartment: "HR", completed: true, dateCompleted: "2026-09-03", remarks: "", signedByName: "" },
		{ id: "item_2_2", sectionId: "sec_2", parentId: null, order: 2, number: "2", title: "Workspace and equipment ready", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_2_1", sectionId: "sec_2", parentId: "item_2_2", order: 1, number: "2.1", title: "Desk assigned", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_2_2", sectionId: "sec_2", parentId: "item_2_2", order: 2, number: "2.2", title: "Laptop/PC provisioned", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_2_2_1", sectionId: "sec_2", parentId: "item_2_2_2", order: 1, number: "2.2.1", title: "OS installed and updated", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_2_2_2", sectionId: "sec_2", parentId: "item_2_2_2", order: 2, number: "2.2.2", title: "Company image applied", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_2_3", sectionId: "sec_2", parentId: "item_2_2", order: 3, number: "2.3", title: "Monitor and peripherals", responsibleDepartment: "GA", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_2_3", sectionId: "sec_2", parentId: null, order: 3, number: "3", title: "Introduction to team and manager", responsibleDepartment: "HR", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		// Section 3
		{ id: "item_3_1", sectionId: "sec_3", parentId: null, order: 1, number: "1", title: "Email account created", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_3_2", sectionId: "sec_3", parentId: null, order: 2, number: "2", title: "Active Directory account created", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_3_3", sectionId: "sec_3", parentId: null, order: 3, number: "3", title: "VPN and remote access setup", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_3_3_1", sectionId: "sec_3", parentId: "item_3_3", order: 1, number: "3.1", title: "VPN client installed", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_3_3_2", sectionId: "sec_3", parentId: "item_3_3", order: 2, number: "3.2", title: "VPN credentials issued", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
		{ id: "item_3_4", sectionId: "sec_3", parentId: null, order: 4, number: "4", title: "Security awareness training completed", responsibleDepartment: "IT", completed: false, dateCompleted: null, remarks: "", signedByName: "" },
	],
};
