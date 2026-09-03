import { createContext, useContext, useEffect, useCallback, type ReactNode } from "react";
import { useSocket } from "./socket-context";
import { useAuth } from "~/lib/hooks/use-auth";
import { toast } from "sonner";
import {
	useEmployeeNotifications,
	useMarkNotificationAsRead,
	useMarkAllNotificationsAsRead,
	notificationsQueryKeys,
} from "~/lib/hooks/useNotifications";
import { useQueryClient } from "@tanstack/react-query";
import type { Notification } from "~/zod/notification";

// Re-export the Notification type for use in other components
export type { Notification } from "~/zod/notification";

// Helper function to check if a notification is unread for a specific employee
export const isNotificationUnread = (notification: Notification, employeeId: string): boolean => {
	return notification.recipients?.unread?.some((r) => r.employeeId === employeeId) ?? false;
};

// Helper function to check if a notification is relevant to an employee
export const isNotificationForEmployee = (
	notification: Notification,
	employeeId: string,
): boolean => {
	const inUnread =
		notification.recipients?.unread?.some((r) => r.employeeId === employeeId) ?? false;
	const inRead = notification.recipients?.read?.some((r) => r.employeeId === employeeId) ?? false;
	return inUnread || inRead;
};

interface NotificationContextType {
	notifications: Notification[];
	unreadCount: number;
	isLoading: boolean;
	addNotification: (notification: Notification) => void;
	markAsRead: (id: string) => Promise<void>;
	markAllAsRead: () => Promise<void>;
	refetchNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
	children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
	const { socket, isConnected } = useSocket();
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id;
	const queryClient = useQueryClient();

	// Use the React Query hook to fetch notifications
	const {
		data: notificationsData,
		isLoading,
		refetch: refetchNotifications,
	} = useEmployeeNotifications(employeeId || "", 20);

	// Get notifications from the query data
	const notifications = notificationsData?.notifications || [];

	// Calculate unread count based on new recipients structure
	const unreadCount = notifications.filter(
		(n) => employeeId && isNotificationUnread(n, employeeId),
	).length;

	// Mutations
	const markAsReadMutation = useMarkNotificationAsRead();
	const markAllAsReadMutation = useMarkAllNotificationsAsRead();

	// Add a new notification to the cache (for real-time updates)
	const addNotification = useCallback(
		(notification: Notification) => {
			// Add to the query cache
			queryClient.setQueryData<{ notifications: Notification[] }>(
				notificationsQueryKeys.notifications.list({ filter: { employeeId }, limit: 20 }),
				(oldData) => {
					if (!oldData) return { notifications: [notification] };

					// Check if notification already exists to prevent duplicates
					const exists = oldData.notifications.some((n) => n.id === notification.id);
					if (exists) {
						console.log(
							"📬 Notification already in cache, skipping add:",
							notification.id,
						);
						return oldData;
					}

					return {
						...oldData,
						notifications: [notification, ...oldData.notifications],
					};
				},
			);

			// Show toast notification
			toast.success(notification.title, {
				description: notification.description,
				duration: 5000,
			});
		},
		[queryClient, employeeId],
	);

	// Mark a notification as read
	const markAsRead = useCallback(
		async (id: string) => {
			if (!employeeId) {
				console.error("Cannot mark notification as read: No employee ID");
				return;
			}
			try {
				await markAsReadMutation.mutateAsync({ id, employeeId });
			} catch (error) {
				console.error("Failed to mark notification as read:", error);
			}
		},
		[markAsReadMutation, employeeId],
	);

	// Mark all notifications as read
	const markAllAsRead = useCallback(async () => {
		if (!employeeId) {
			console.error("Cannot mark notifications as read: No employee ID");
			return;
		}
		const unreadIds = notifications
			.filter((n) => employeeId && isNotificationUnread(n, employeeId))
			.map((n) => n.id);
		if (unreadIds.length > 0) {
			try {
				await markAllAsReadMutation.mutateAsync({ ids: unreadIds, employeeId });
			} catch (error) {
				console.error("Failed to mark all notifications as read:", error);
			}
		}
	}, [notifications, markAllAsReadMutation, employeeId]);

	// Listen for real-time notifications via Socket.io
	useEffect(() => {
		if (!socket || !isConnected) {
			console.log("📬 Socket not ready for notifications", { socket: !!socket, isConnected });
			return;
		}

		console.log("📬 Setting up notification listeners on socket:", socket.id);

		// Track already processed notification IDs to prevent duplicates
		const processedNotifications = new Set<string>();

		const handleNewNotification = (notification: Notification) => {
			console.log("📬 Received notification:new event:", notification);

			// Prevent duplicates
			if (processedNotifications.has(notification.id)) {
				console.log("📬 Notification already processed, skipping:", notification.id);
				return;
			}

			// Verify this notification is for the current employee
			if (employeeId && isNotificationForEmployee(notification, employeeId)) {
				processedNotifications.add(notification.id);
				addNotification(notification);
			} else {
				console.log("📬 Notification not for current employee, skipping");
			}
		};

		// Also listen for broadcast notifications (for debugging)
		const handleBroadcastNotification = (notification: Notification) => {
			console.log("📢 Received notification:broadcast event:", notification);

			// Prevent duplicates
			if (processedNotifications.has(notification.id)) {
				console.log(
					"📢 Broadcast notification already processed, skipping:",
					notification.id,
				);
				return;
			}

			// Check if this notification is for the current employee using new recipients structure
			if (employeeId && isNotificationForEmployee(notification, employeeId)) {
				console.log("📬 Broadcast notification is for current employee, adding...");
				processedNotifications.add(notification.id);
				addNotification(notification);
			}
		};

		socket.on("notification:new", handleNewNotification);
		socket.on("notification:broadcast", handleBroadcastNotification);

		return () => {
			socket.off("notification:new", handleNewNotification);
			socket.off("notification:broadcast", handleBroadcastNotification);
		};
	}, [socket, isConnected, addNotification, employeeId]);

	return (
		<NotificationContext.Provider
			value={{
				notifications,
				unreadCount,
				isLoading,
				addNotification,
				markAsRead,
				markAllAsRead,
				refetchNotifications: () => refetchNotifications(),
			}}>
			{children}
		</NotificationContext.Provider>
	);
}

export function useNotifications() {
	const context = useContext(NotificationContext);
	if (!context) {
		throw new Error("useNotifications must be used within a NotificationProvider");
	}
	return context;
}

export { NotificationContext };
