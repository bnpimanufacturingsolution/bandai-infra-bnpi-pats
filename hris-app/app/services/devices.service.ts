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
		baseUrl: string;
	};
	summary: {
		status: "online" | "degraded" | "offline";
		checkedAt: string;
		durationMs: number;
	};
	checks: {
		hrisApi: { ok: boolean; status: string };
		alarmDemo: {
			ok: boolean;
			status: "running" | "not_running" | "unknown";
			pid?: number;
			error?: string;
		};
		network: {
			ok: boolean;
			status: "reachable" | "unreachable";
			host: string;
			port: number;
			latencyMs: number | null;
			error?: string;
		};
		deviceApi: {
			ok: boolean;
			status: "online" | "offline";
			latencyMs: number | null;
			error?: string;
			time?: unknown;
		};
	};
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

export interface EnrollDeviceUserRequest {
	userId: string;
	deviceId: string;
	deviceUserId: string;
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

