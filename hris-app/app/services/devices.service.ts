import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Device {
	id: string;
	organizationId?: string;
	name: string;
	address: string;
	port: number;
	protocol: "http" | "https" | "tcp" | "udp";
	config: any;
	access: {
		username?: string;
		password?: string;
	};
	createdAt?: string;
	updatedAt?: string;
}

export type DeviceEventStatus =
	| "RECEIVED"
	| "MATCHED"
	| "ATTENDANCE_CREATED"
	| "ATTENDANCE_UPDATED"
	| "IGNORED"
	| "UNMATCHED"
	| "FAILED";

export type DeviceEventSource = "HIKVISION_CALLBACK" | "EN_HCNETSDK_ALARM" | "ZKTECO_EVENT";

export interface DeviceEvent {
	id: string;
	organizationId: string;
	deviceId: string;
	device?: Pick<Device, "id" | "name" | "address" | "port" | "protocol">;
	deviceUserId?: string | null;
	deviceUser?: {
		id: string;
		vendorUserId: string;
		employeeNo?: string | null;
		displayName?: string | null;
		status: DeviceUserStatus;
		employeeId?: string | null;
	} | null;
	employee?: {
		id: string;
		employeeId: string;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
	employeeId?: string | null;
	attendanceId?: string | null;
	eventTime: string;
	receivedAt: string;
	employeeNo?: string | null;
	source: DeviceEventSource;
	status: DeviceEventStatus;
	eventType?: string | null;
	major?: string | null;
	minor?: string | null;
	doorNo?: string | null;
	verifyMode?: string | null;
	dedupeKey: string;
	payload?: any;
	errorMessage?: string | null;
}

export interface DeviceEventsResponse {
	events: DeviceEvent[];
	summary: {
		total: number;
		byStatus: Partial<Record<DeviceEventStatus, number>>;
		bySource: Partial<Record<DeviceEventSource, number>>;
	};
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export interface DeviceHealthResponse {
	device: Pick<Device, "id" | "name" | "address" | "port" | "protocol"> & {
		baseUrl?: string;
		vendor?: string;
	};
	summary: {
		status: "online" | "degraded" | "offline";
		checkedAt: string;
		durationMs: number;
	};
	checks: {
		hrisApi: { ok: boolean; status: string };
		hikvisionListener?: {
			ok: boolean;
			status: "running" | "not_running" | "unknown";
			pid?: number;
			error?: string;
		};
		zktecoWebhook?: {
			ok: boolean;
			status: "ready" | "disabled" | string;
			path: string;
		};
		zktecoBridge?: {
			ok: boolean;
			status: "online" | "degraded" | "offline" | string;
			statusUrl?: string;
			latencyMs?: number | null;
			configuredDevices?: number | null;
			connectedDevices?: number | null;
			lastEventAt?: string | null;
			device?: {
				ip: string;
				port: number;
				connected: boolean;
				streaming?: boolean;
				lastConnectedAt?: string | null;
				lastEventAt?: string | null;
				lastPostedAt?: string | null;
				lastError?: string | null;
			} | null;
			error?: string;
			runtime?: string;
		};
		lastZktecoEvent?: {
			id: string;
			status: DeviceEventStatus | string;
			eventTime: string;
			receivedAt: string;
			employeeNo?: string | null;
			errorMessage?: string | null;
		} | null;
		network: {
			ok: boolean;
			status: "reachable" | "unreachable";
			host: string;
			port: number;
			latencyMs: number | null;
			error?: string;
		};
		deviceApi?: {
			ok: boolean;
			status: "online" | "offline";
			latencyMs: number | null;
			error?: string;
			time?: unknown;
		};
	};
}

export interface DeviceSyncPreviewRow {
	deviceId: string;
	name: string;
	address: string;
	port: number;
	vendor: "ZKTeco" | "Hikvision" | string;
	source: DeviceEventSource | string;
	syncedEvents: number;
	totalEvents: number | null;
	needsSyncEvents: number | null;
	hrisSavedCount?: number;
	vendorEventCount?: number | null;
	vendorUserCount?: number | null;
	knownSkippedEventCount?: number;
	totalUnsavedEventCount?: number | null;
	importableIfSkipMissingEmployeeNo?: number | null;
	importableIfSaveMissingEmployeeNo?: number | null;
	failedEventCount?: number;
	importableSavedCount?: number;
	missingEventCount?: number | null;
	canStartSync?: boolean;
	syncAction?: "zkteco-bridge-sync" | "hikvision-import" | string | null;
	status: "synced" | "needs_sync" | "source_total_unavailable" | string;
	lastSourceEventAt?: string | null;
	error?: string | null;
}

export interface DeviceSyncPreviewResponse {
	generatedAt: string;
	scope: {
		deviceId: string;
		source: string;
	};
	bridge?: {
		ok: boolean;
		status: string;
		statusUrl?: string | null;
		error?: string | null;
	} | null;
	devices: DeviceSyncPreviewRow[];
}

export interface DeviceSyncRun {
	id: string;
	organizationId: string;
	deviceId: string;
	runType: "DEVICE_USERS" | "DEVICE_LOGS" | string;
	status: "PROCESSING" | "COMPLETED" | "FAILED" | string;
	source?: DeviceEventSource | string | null;
	totalSourceRecords: number;
	importableRecords: number;
	savedRecords: number;
	skippedRecords: number;
	failedRecords: number;
	missingRecords: number;
	skipSummary?: Record<string, unknown> | null;
	failureSummary?: Record<string, unknown> | null;
	rawSummary?: Record<string, unknown> | null;
	startedAt: string;
	completedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface DeviceSyncRunsResponse {
	syncRuns: DeviceSyncRun[];
}

export interface DeviceImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed" | "cancelled";
	deviceId: string;
	deviceName: string;
	total: number;
	sourceTotal?: number | null;
	targetImportCount?: number | null;
	scanLimit?: number | null;
	processed: number;
	imported: number;
	skipped: number;
	alreadySaved?: number;
	knownSkipped?: number;
	skipMissingEmployeeNo?: boolean;
	cancelRequested?: boolean;
	cancelRequestedAt?: string;
	failed: number;
	message: string;
	errors?: Array<{ row: number; error: string }>;
	startedAt: string;
	completedAt?: string;
}

export interface DeviceEventsResetScope {
	deviceId?: string;
	source?: string;
	status?: string;
	from?: string;
	to?: string;
	dateField?: "eventTime" | "receivedAt";
	includeLinkedAttendance?: boolean;
	execute?: boolean;
}

export interface DeviceEventsResetResponse {
	mode: "preview" | "executed";
	scope: {
		organizationId: string;
		deviceId: string;
		source: string;
		status: string;
		from: string | null;
		to: string | null;
		dateField: "eventTime" | "receivedAt";
	};
	counts?: {
		devices: number;
		deviceEvents: number;
		linkedAttendance: number;
		importJobs: number;
	};
	countsBefore?: {
		devices: number;
		deviceEvents: number;
		linkedAttendance: number;
		importJobs: number;
	};
	countsAfter?: {
		deviceEvents: number;
		linkedAttendance: number;
	};
	deleted?: {
		deviceEvents: number;
		linkedAttendance: number;
	};
	backupDir?: string;
	affectedModels?: string[];
}

export interface CreateDeviceRequest {
	name: string;
	address: string;
	port: number;
	protocol?: "http" | "https" | "tcp" | "udp";
	config?: any;
	access?: {
		username?: string;
		password?: string;
	};
}

export interface UpdateDeviceRequest {
	name?: string;
	address?: string;
	port?: number;
	protocol?: "http" | "https" | "tcp" | "udp";
	config?: any;
	access?: {
		username?: string;
		password?: string;
	};
}

export interface ImportDeviceResponse {
	summary: {
		totalRows: number;
		processedRows: number;
		enrolled: number;
		failed: number;
		errors: Array<{
			row: number;
			error: string;
			data: any;
		}>;
	};
}

export interface ZktecoAttendanceSyncRequest {
	deviceId?: string;
	deviceIp?: string;
}

export interface EnrollDeviceUserRequest {
	userId: string;
	deviceId: string;
	deviceUserId: string;
}

export type DeviceUserStatus = "ACTIVE" | "UNMATCHED" | "CONFLICT" | "DISABLED";

export interface DeviceUser {
	id: string;
	organizationId: string;
	deviceId: string;
	employeeId?: string | null;
	vendorUserId: string;
	employeeNo?: string | null;
	displayName?: string | null;
	userType?: string | null;
	status: DeviceUserStatus;
	validFrom?: string | null;
	validTo?: string | null;
	doorRight?: string | null;
	accessPlan?: any;
	rawPayload?: any;
	lastSyncedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
	device?: Pick<Device, "id" | "name" | "address" | "port" | "protocol">;
	employee?: {
		id: string;
		employeeId: string;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
}

export interface DeviceUsersResponse {
	deviceUsers: DeviceUser[];
	summary: {
		total: number;
		active: number;
		matched: number;
		unmatched: number;
		conflict: number;
		disabled: number;
	};
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export interface DeviceUserSyncResponse {
	run?: any;
	summary: {
		totalSourceRecords: number;
		importableRecords: number;
		created: number;
		updated: number;
		linked: number;
		unmatched: number;
		conflict: number;
		disabled: number;
	};
}

export interface DevicesResponse {
	data: Device[] | { devices: Device[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class DevicesService extends APIService {
	/**
	 * Get all devices with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<DevicesResponse> - Devices response with pagination
	 */
	async getDevices(): Promise<DevicesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/device${queryString}`;

			console.log("Fetching devices from HRIS API:", endpoint);

			const response = await hrisApiClient.get<DevicesResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let devicesData = response.data;
			if (devicesData && typeof devicesData === "object" && "data" in devicesData) {
				devicesData = (devicesData as any).data;
			}

			if (!devicesData) {
				throw new Error("Failed to fetch devices");
			}
			return devicesData as DevicesResponse;
		} catch (error: any) {
			console.error("Error fetching devices:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching devices",
			);
		}
	}

	/**
	 * Create a new device
	 * @param payload Device creation payload
	 * @returns Promise<Device> - Created device
	 */
	async createDevice(payload: CreateDeviceRequest): Promise<Device> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating device with payload:", payload);

			const response = await hrisApiClient.post<Device>("/api/device", payload);
			if (!response.data) {
				throw new Error("Failed to create device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating device",
			);
		}
	}

	/**
	 * Update an existing device
	 * @param deviceId Device ID
	 * @param payload Device update payload
	 * @returns Promise<Device> - Updated device
	 */
	async updateDevice(deviceId: string, payload: UpdateDeviceRequest): Promise<Device> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating device:", deviceId, "with payload:", payload);

			const response = await hrisApiClient.patch<Device>(`/api/device/${deviceId}`, payload);
			if (!response.data) {
				throw new Error("Failed to update device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating device",
			);
		}
	}

	/**
	 * Delete a device
	 * @param deviceId Device ID
	 * @returns Promise<{ id: string }> - Deleted device ID
	 */
	async deleteDevice(deviceId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting device:", deviceId);

			const response = await hrisApiClient.delete<{ id: string }>(`/api/device/${deviceId}`);
			if (!response.data) {
				throw new Error("Failed to delete device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting device",
			);
		}
	}

	/**
	 * Get device by ID with optional field selection
	 * @param deviceId Device ID
	 * @returns Promise<Device> - Device data
	 */
	async getDeviceById(deviceId: string): Promise<Device> {
		try {

			const endpoint = `/api/device/${deviceId}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Device not found");
			}

			// Extract device from nested structure: response.data.data
			let deviceData = response.data;
			if (deviceData && typeof deviceData === "object" && "data" in deviceData) {
				deviceData = deviceData.data;
			}

			if (!deviceData) {
				throw new Error("Device data is undefined");
			}

			return deviceData as Device;
		} catch (error: any) {
			console.error("Error fetching device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device",
			);
		}
	}

	/**
	 * Get devices with specific parameters
	 * @param params Query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async getDevicesWithParams(params: ApiQueryParams): Promise<DevicesResponse> {
		return this.setParams(params).getDevices();
	}

	async getDeviceEvents(params: ApiQueryParams = {}): Promise<DeviceEventsResponse> {
		try {
			const query = new URLSearchParams();
			Object.entries(params).forEach(([key, value]) => {
				if (value === undefined || value === null || value === "") return;
				query.set(key, String(value));
			});

			const endpoint = `/api/device/events${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			let eventsData = response.data;
			if (eventsData && typeof eventsData === "object" && "data" in eventsData) {
				eventsData = eventsData.data;
			}

			return {
				events: eventsData?.events || [],
				summary: eventsData?.summary || { total: 0, byStatus: {}, bySource: {} },
				pagination: eventsData?.pagination,
			};
		} catch (error: any) {
			console.error("Error fetching device events:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device events",
			);
		}
	}

	async getDeviceHealth(deviceId: string): Promise<DeviceHealthResponse> {
		try {
			if (!String(deviceId || "").trim()) {
				throw new Error("Select a device before checking health");
			}
			const response = await hrisApiClient.get<any>(`/api/device/${deviceId}/health`);
			let healthData = response.data;
			if (healthData && typeof healthData === "object" && "data" in healthData) {
				healthData = healthData.data;
			}
			if (!healthData) {
				throw new Error("Failed to check device health");
			}
			return healthData as DeviceHealthResponse;
		} catch (error: any) {
			console.error("Error checking device health:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error checking device health",
			);
		}
	}

	async getDeviceSyncPreview(params: { deviceId?: string; source?: string } = {}): Promise<DeviceSyncPreviewResponse> {
		try {
			const query = new URLSearchParams();
			if (params.deviceId && params.deviceId !== "all") query.set("deviceId", params.deviceId);
			if (params.source && params.source !== "all") query.set("source", params.source);
			const endpoint = `/api/device/sync-preview${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const previewData = response.data?.data || response.data;
			if (!previewData) {
				throw new Error("Failed to build device sync preview");
			}
			return previewData as DeviceSyncPreviewResponse;
		} catch (error: any) {
			console.error("Error building device sync preview:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error building device sync preview",
			);
		}
	}

	async getDeviceUsers(
		deviceId: string,
		params: { page?: number; limit?: number; query?: string; status?: string; vendorUserId?: string; vendorUserIds?: string[] } = {},
	): Promise<DeviceUsersResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const query = new URLSearchParams();
			if (params.page) query.set("page", String(params.page));
			if (params.limit) query.set("limit", String(params.limit));
			if (params.query) query.set("query", params.query);
			if (params.status && params.status !== "all") query.set("status", params.status);
			if (params.vendorUserId) query.set("vendorUserId", params.vendorUserId);
			if (params.vendorUserIds?.length) {
				query.set(
					"vendorUserIds",
					params.vendorUserIds.map((vendorUserId) => String(vendorUserId).trim()).filter(Boolean).join(","),
				);
			}
			const endpoint = `/api/device/${deviceId}/users${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load device users");
			return data as DeviceUsersResponse;
		} catch (error: any) {
			console.error("Error loading device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error loading device users",
			);
		}
	}

	async syncDeviceUsers(deviceId: string): Promise<DeviceUserSyncResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const response = await hrisApiClient.post<any>(`/api/device/${deviceId}/users/sync`, {});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to sync device users");
			return data as DeviceUserSyncResponse;
		} catch (error: any) {
			console.error("Error syncing device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error syncing device users",
			);
		}
	}

	async getDeviceSyncRuns(
		deviceId: string,
		params: { limit?: number } = {},
	): Promise<DeviceSyncRunsResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const query = new URLSearchParams();
			if (params.limit) query.set("limit", String(params.limit));
			const endpoint = `/api/device/${deviceId}/sync-runs${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load device sync runs");
			return data as DeviceSyncRunsResponse;
		} catch (error: any) {
			console.error("Error loading device sync runs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error loading device sync runs",
			);
		}
	}

	async backfillDeviceUsers(deviceId: string): Promise<any> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const response = await hrisApiClient.post<any>(`/api/device/${deviceId}/users/backfill`, {});
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error backfilling device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error backfilling device users",
			);
		}
	}

	async linkDeviceUser(deviceUserId: string, employeeId: string): Promise<DeviceUser> {
		try {
			const response = await hrisApiClient.post<any>(`/api/device/users/${deviceUserId}/link`, {
				employeeId,
			});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to link device user");
			return data as DeviceUser;
		} catch (error: any) {
			console.error("Error linking device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error linking device user",
			);
		}
	}

	async unlinkDeviceUser(deviceUserId: string): Promise<DeviceUser> {
		try {
			const response = await hrisApiClient.post<any>(`/api/device/users/${deviceUserId}/unlink`, {});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to unlink device user");
			return data as DeviceUser;
		} catch (error: any) {
			console.error("Error unlinking device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error unlinking device user",
			);
		}
	}

	/**
	 * Search devices by name or address
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async searchDevices(query: string, params?: ApiQueryParams): Promise<DevicesResponse> {
		return this.search(query)
			.setParams(params || {})
			.getDevices();
	}

	/**
	 * Get devices grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async getDevicesGrouped(groupBy: string, params?: ApiQueryParams): Promise<DevicesResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getDevices();
	}

	/**
	 * Enroll a single user to device and sync employee.deviceEmpId
	 */
	async enrollDeviceUser(payload: EnrollDeviceUserRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/enroll", payload);
			if (!response.data) {
				throw new Error("Failed to enroll user to device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error enrolling user to device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error enrolling user to device",
			);
		}
	}

	async triggerZktecoAttendanceSync(payload: ZktecoAttendanceSyncRequest = {}): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/zkteco/sync", payload);
			if (!response.data) {
				throw new Error("Failed to start ZKTeco sync");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error starting ZKTeco sync:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting ZKTeco sync",
			);
		}
	}

	async triggerHikvisionAttendanceImport(payload: {
		deviceId: string;
		skipMissingEmployeeNo?: boolean;
		targetImportCount?: number | null;
	}): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/hikvision/sync", payload);
			if (!response.data) {
				throw new Error("Failed to start device log sync");
			}
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error starting Hikvision sync:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting device log sync",
			);
		}
	}

	async getDeviceImportJob(jobId: string): Promise<DeviceImportJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Import job is required");
			const response = await hrisApiClient.get<any>(`/api/device/import-jobs/${jobId}`);
			const progress = response.data?.data || response.data;
			if (!progress) throw new Error("Import job was not found");
			return progress as DeviceImportJobProgress;
		} catch (error: any) {
			console.error("Error loading device import job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error loading import progress",
			);
		}
	}

	async cancelDeviceImportJob(jobId: string): Promise<DeviceImportJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Import job is required");
			const response = await hrisApiClient.post<any>(`/api/device/import-jobs/${jobId}/cancel`, {});
			const progress = response.data?.data || response.data;
			if (!progress) throw new Error("Import job was not found");
			return progress as DeviceImportJobProgress;
		} catch (error: any) {
			console.error("Error cancelling device import job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error cancelling import job",
			);
		}
	}

	async resetDeviceEvents(payload: DeviceEventsResetScope): Promise<DeviceEventsResetResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/events/reset", payload);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to reset saved device events");
			return data as DeviceEventsResetResponse;
		} catch (error: any) {
			console.error("Error resetting device events:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error resetting saved device events",
			);
		}
	}

	/**
	 * Import device enrollment data from a file
	 * @param file File to import (CSV/XLSX)
	 * @returns Promise<any> - Import summary
	 */
	async importDeviceEnrollment(file: File): Promise<any> {
		try {

			const formData = new FormData();
			formData.append("file", file);

			const response = await hrisApiClient.post<any>("/api/device/enroll/import", formData);

			if (!response.data) {
				throw new Error("Failed to import device enrollment");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error importing device enrollment:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error importing device enrollment",
			);
		}
	}
}

// Export singleton instance
const devicesService = new DevicesService();

export default devicesService;

