// Hikvision-related types

export interface HikvisionUserInfo {
	employeeNo: string;
	name: string;
	userType: string;
	closeDelayEnabled: boolean;
	Valid: {
		enable: boolean;
		beginTime: string;
		endTime: string;
		timeType: string;
	};
	belongGroup: string;
	password: string;
	doorRight: string;
	RightPlan: Array<{
		doorNo: number;
		planTemplateNo: string;
	}>;
	maxOpenDoorTime: number;
	openDoorTime: number;
	localUIRight: boolean;
	gender: string;
	numOfCard: number;
	numOfFP: number;
	numOfFace: number;
	PersonInfoExtends: Array<{
		value: string;
	}>;
	faceURL: string;
}

export interface HikvisionUserInfoSearchCond {
	searchID: string;
	searchResultPosition: number;
	maxResults: number;
}

export interface HikvisionUserInfoSearchRequest {
	deviceId?: string;
	UserInfoSearchCond: HikvisionUserInfoSearchCond;
}

export interface HikvisionUserInfoSearchResponse {
	searchID: string;
	responseStatusStrg: string;
	numOfMatches: number;
	totalMatches: number;
	UserInfo: HikvisionUserInfo[];
}

export interface HikvisionUserInfoSearchResult {
	status: "success" | "error";
	message: string;
	data: {
		UserInfoSearch: HikvisionUserInfoSearchResponse;
	};
	code: number;
	timestamp: string;
}

export interface UserInfoTableData extends HikvisionUserInfo {
	id?: string;
	syncedAt?: string;
	isActive?: boolean;
}

export type UserInfoSortKey = keyof HikvisionUserInfo | "syncedAt" | "isActive";

export interface UserInfoTableState {
	data: UserInfoTableData[];
	loading: boolean;
	error: string | null;
	pagination: {
		currentPage: number;
		pageSize: number;
		total: number;
	};
	sorting: {
		key: UserInfoSortKey;
		direction: "asc" | "desc";
	};
}

// ACS Event types
export interface FaceRect {
	height: number;
	width: number;
	x: number;
	y: number;
}

export interface AcsEventInfo {
	major: number;
	minor: number;
	time: string;
	cardType: number;
	name: string;
	cardReaderNo: number;
	doorNo: number;
	employeeNoString: string;
	serialNo: number;
	userType: string;
	currentVerifyMode: string;
	attendanceStatus?: string;
	label?: string;
	hrisPanelSelectStatus?: {
		code?: string | null;
		label?: string | null;
		present?: boolean;
	} | null;
	mask: string;
	pictureURL?: string;
	FaceRect?: FaceRect;
	hrisEmployee?: {
		id: string;
		employeeId: string;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
}

export interface AcsEventCond {
	searchID: string;
	searchResultPosition: number;
	maxResults: number;
	startTime: string;
	endTime: string;
	major?: number;
	minor?: number;
	employeeNoString?: string;
	timeReverseOrder?: boolean;
}

export interface AcsEventRequest {
	deviceId?: string;
	AcsEventCond: AcsEventCond;
}

export interface AcsEventResponse {
	searchID: string;
	totalMatches: number;
	responseStatusStrg: string;
	numOfMatches: number;
	InfoList: AcsEventInfo[];
}

export interface AcsEventResult {
	status: "success" | "error";
	message: string;
	data: {
		AcsEvent: AcsEventResponse;
	};
	code: number;
	timestamp: string;
}

export interface AcsEventTableData extends AcsEventInfo {
	id?: string;
}

export type AcsEventSortKey = keyof AcsEventInfo;
