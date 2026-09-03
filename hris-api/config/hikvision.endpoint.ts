type HikvisionConfigEnv = {
	HIKVISION_BASE_URL?: string;
	HIKVISION_USERNAME?: string;
	HIKVISION_PASSWORD?: string;
	HIKVISION_PROTOCOL?: string;
};

// Hikvision API Configuration
export const buildHikvisionConfig = (
	env: HikvisionConfigEnv = process.env as HikvisionConfigEnv,
) => ({
	baseUrl: env.HIKVISION_BASE_URL || "",
	username: env.HIKVISION_USERNAME || "",
	password: env.HIKVISION_PASSWORD || "",
	protocol: env.HIKVISION_PROTOCOL || "https",
	timeout: 10000,
	retryCount: 3,
	retryDelay: 1000,
	retryBackoff: true,
	retryBackoffFactor: 2,
	retryBackoffMax: 10000,
});

export const HIKVISION_CONFIG = buildHikvisionConfig();

// Hikvision API Endpoints
export const hikvisionEndpoint = {
	system: {
		time: "/ISAPI/System/time?format=json",
	},
	// Access Control Endpoints
	accessControl: {
		// ACS Event endpoints
		acsEvent: {
			capabilities: "/ISAPI/AccessControl/AcsEvent/capabilities?format=json",
			list: "/ISAPI/AccessControl/AcsEvent?format=json",
			storageCfg: {
				capabilities: "/ISAPI/AccessControl/AcsEvent/StorageCfg/capabilities?format=json",
				get: "/ISAPI/AccessControl/AcsEvent/StorageCfg?format=json",
				update: "/ISAPI/AccessControl/AcsEvent/StorageCfg?format=json",
			},
		},
		// ACS Event Total Number endpoints
		acsEventTotalNum: {
			capabilities: "/ISAPI/AccessControl/AcsEventTotalNum/capabilities?format=json",
			get: "/ISAPI/AccessControl/AcsEventTotalNum?format=json",
		},
		// ACS Work Status endpoints
		acsWorkStatus: {
			capabilities: "/ISAPI/AccessControl/AcsWorkStatus/capabilities?format=json",
			get: "/ISAPI/AccessControl/AcsWorkStatus?format=json",
		},
		// UserInfo endpoints
		userInfo: {
			capabilities: "/ISAPI/AccessControl/UserInfo/capabilities",
			count: "/ISAPI/AccessControl/UserInfo/Count",
			delete: "/ISAPI/AccessControl/UserInfo/Delete",
			modify: "/ISAPI/AccessControl/UserInfo/Modify",
			record: "/ISAPI/AccessControl/UserInfo/Record",
			search: "/ISAPI/AccessControl/UserInfo/Search",
			setUp: "/ISAPI/AccessControl/UserInfo/SetUp",
		},
		// UserInfoDetail endpoints
		userInfoDetail: {
			deleteCapabilities: "/ISAPI/AccessControl/UserInfoDetail/Delete/capabilities",
			delete: "/ISAPI/AccessControl/UserInfoDetail/Delete",
			deleteProcess: "/ISAPI/AccessControl/UserInfoDetail/DeleteProcess",
		},
	},

	// Security/User Management Endpoints
	security: {
		// User Check
		userCheck: "/ISAPI/Security/userCheck",

		// Users endpoints
		users: {
			list: "/ISAPI/Security/users",
			detail: (id: string) => `/ISAPI/Security/users/${id}`,
			create: "/ISAPI/Security/users",
			update: (id: string) => `/ISAPI/Security/users/${id}`,
			delete: (id: string) => `/ISAPI/Security/users/${id}`,
		},

		// User Permissions endpoints
		userPermission: {
			list: "/ISAPI/Security/UserPermission",
			detail: (id: string) => `/ISAPI/Security/UserPermission/${id}`,
			localPermission: (id: string) => `/ISAPI/Security/UserPermission/${id}/localPermission`,
			remotePermission: (id: string) =>
				`/ISAPI/Security/UserPermission/${id}/remotePermission`,
			adminCap: "/ISAPI/Security/UserPermission/adminCap",
			operatorCap: "/ISAPI/Security/UserPermission/operatorCap",
			viewerCap: "/ISAPI/Security/UserPermission/viewerCap",
		},
	},
};
