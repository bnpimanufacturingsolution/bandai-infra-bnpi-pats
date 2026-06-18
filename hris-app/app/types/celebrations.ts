export type BirthdayItemType = "EMPLOYEE_BIRTHDAY" | "CHILD_BIRTHDAY";
export type BirthdayFilterType = "EMPLOYEES" | "KIDS" | "ALL";

export interface BirthdayCelebrantItem {
	id: string;
	type: BirthdayItemType;
	month: number;
	day: number;
	displayName: string;
	personId: string;
	employeeId?: string | null;
	parentDisplayName?: string | null;
	department?: string | null;
}

export interface BirthdayCelebrantsResponseData {
	month: number;
	year: number;
	organizationId: string | null;
	state: "OK" | "NO_ORG";
	message: string | null;
	filters: {
		type: BirthdayFilterType;
		search: string;
	};
	counts: {
		employees: number;
		kids: number;
		total: number;
	};
	items: BirthdayCelebrantItem[];
	groups: Array<{
		day: number;
		items: BirthdayCelebrantItem[];
	}>;
}
