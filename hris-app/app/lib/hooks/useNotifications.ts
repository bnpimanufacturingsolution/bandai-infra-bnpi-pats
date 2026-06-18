import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import notificationsService, { type NotificationsResponse } from "~/services/notifications.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import type {
	Notification,
	CreateNotificationInput,
	UpdateNotificationInput,
} from "~/zod/notification";

// Query keys structure
export const notificationsQueryKeys = {
	notifications: {
		all: ["notifications"] as const,
		lists: () => [...notificationsQueryKeys.notifications.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...notificationsQueryKeys.notifications.lists(), { params }] as const,
		details: () => [...notificationsQueryKeys.notifications.all, "detail"] as const,
		detail: (id: string) => [...notificationsQueryKeys.notifications.details(), id] as const,
		unreadCount: (employeeId: string) =>
			[...notificationsQueryKeys.notifications.all, "unreadCount", employeeId] as const,
	},
};

/**
 * Hook to fetch list of notifications with filters
 */
export const useNotificationsList = (params?: ApiQueryParams) => {
	return useQuery<NotificationsResponse>({
		queryKey: notificationsQueryKeys.notifications.list(params),
		queryFn: () => {
			return notificationsService
				.select([
					"id",
					"title",
					"description",
					"type",
					"category",
					"recipients",
					"sourceEmployeeId",
					"createdAt",
					"metadata",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 20)
				.sort(params?.sort || "createdAt", params?.order || "desc")
				.setParams(params || {})
				.getNotifications();
		},
		staleTime: 1 * 60 * 1000, // 1 minute - shorter for notifications
	});
};

/**
 * Hook to fetch notifications for a specific employee
 */
export const useEmployeeNotifications = (employeeId: string, limit: number = 20) => {
	return useQuery<NotificationsResponse>({
		queryKey: notificationsQueryKeys.notifications.list({ filter: { employeeId }, limit }),
		queryFn: () => {
			return notificationsService
				.select([
					"id",
					"title",
					"description",
					"type",
					"category",
					"recipients",
					"sourceEmployeeId",
					"createdAt",
					"metadata",
				])
				.sort("createdAt", "desc")
				.paginate(1, limit)
				.setParams({ recipientEmployeeId: employeeId })
				.getNotifications();
		},
		enabled: !!employeeId,
		staleTime: 30 * 1000, // 30 seconds
		refetchInterval: 60 * 1000, // Refetch every minute
	});
};

/**
 * Hook to fetch a single notification by ID
 */
export const useNotification = (id: string) => {
	return useQuery<Notification>({
		queryKey: notificationsQueryKeys.notifications.detail(id),
		queryFn: () => notificationsService.getNotificationById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch unread notification count
 */
export const useUnreadNotificationCount = (employeeId: string) => {
	return useQuery<number>({
		queryKey: notificationsQueryKeys.notifications.unreadCount(employeeId),
		queryFn: () => notificationsService.getUnreadCount(employeeId),
		enabled: !!employeeId,
		staleTime: 30 * 1000, // 30 seconds
		refetchInterval: 60 * 1000, // Refetch every minute
	});
};

/**
 * Mutation hook to create a new notification
 */
export const useCreateNotification = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateNotificationInput) => {
			return await notificationsService.createNotification(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.notifications.all });
			sonnerToast.success("Notification created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create notification");
		},
	});
};

/**
 * Mutation hook to update a notification
 */
export const useUpdateNotification = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateNotificationInput }) => {
			return await notificationsService.updateNotification(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.notifications.all });
			queryClient.invalidateQueries({
				queryKey: notificationsQueryKeys.notifications.detail(data.id),
			});
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update notification");
		},
	});
};

/**
 * Mutation hook to mark a notification as read
 */
export const useMarkNotificationAsRead = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
			return await notificationsService.markAsRead(id, employeeId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.notifications.all });
		},
		onError: (error: any) => {
			console.error("Failed to mark notification as read:", error);
		},
	});
};

/**
 * Mutation hook to mark multiple notifications as read
 */
export const useMarkAllNotificationsAsRead = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ ids, employeeId }: { ids: string[]; employeeId: string }) => {
			return await notificationsService.markMultipleAsRead(ids, employeeId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.notifications.all });
			sonnerToast.success("All notifications marked as read");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to mark notifications as read");
		},
	});
};

/**
 * Mutation hook to delete a notification
 */
export const useDeleteNotification = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await notificationsService.deleteNotification(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.notifications.all });
			sonnerToast.success("Notification deleted");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete notification");
		},
	});
};
