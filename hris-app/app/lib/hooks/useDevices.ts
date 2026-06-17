import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import devicesService, {
	type DevicesResponse,
	type DeviceEventsResponse,
	type DeviceHealthResponse,
	type Device,
	type CreateDeviceRequest,
	type UpdateDeviceRequest,
} from "../../services/devices.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	devices: {
		all: ["devices"] as const,
		lists: () => [...queryKeys.devices.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.devices.lists(), { params }] as const,
		details: () => [...queryKeys.devices.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.devices.details(), id] as const,
		events: (params?: ApiQueryParams) => [...queryKeys.devices.all, "events", { params }] as const,
		health: (id?: string) => [...queryKeys.devices.all, "health", id] as const,
	},
};

/**
 * Hook to fetch list of devices with filters
 */
export const useDevices = (params?: ApiQueryParams) => {
	return useQuery<DevicesResponse>({
		queryKey: queryKeys.devices.list(params),
		queryFn: () => {
			return devicesService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"address",
					"port",
					"protocol",
					"config",
					"access",
					"organizationId",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getDevices();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useDevice = (id: string) => {
	return useQuery({
		queryKey: queryKeys.devices.detail(id),
		queryFn: () => devicesService.getDeviceById(id) as any,
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useDeviceEvents = (params?: ApiQueryParams) => {
	return useQuery<DeviceEventsResponse>({
		queryKey: queryKeys.devices.events(params),
		queryFn: () => devicesService.getDeviceEvents(params),
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
	});
};

export const useDeviceHealth = (deviceId?: string, enabled = true) => {
	return useQuery<DeviceHealthResponse>({
		queryKey: queryKeys.devices.health(deviceId),
		queryFn: () => devicesService.getDeviceHealth(deviceId || ""),
		enabled: Boolean(deviceId) && enabled,
		staleTime: 10 * 1000,
		refetchInterval: enabled && deviceId ? 30 * 1000 : false,
		retry: 1,
	});
};

// Mutation hooks
export const useCreateDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateDeviceRequest) => {
			return await devicesService.createDevice(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create device");
		},
	});
};

export const useUpdateDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateDeviceRequest }) => {
			return await devicesService.updateDevice(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update device");
		},
	});
};

export const useDeleteDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => devicesService.deleteDevice(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete device");
		},
	});
};

export const useImportDeviceEnrollment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await devicesService.importDeviceEnrollment(file);
		},
		onSuccess: (data: any) => {
			// Invalidate relevant queries
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
	});
};

