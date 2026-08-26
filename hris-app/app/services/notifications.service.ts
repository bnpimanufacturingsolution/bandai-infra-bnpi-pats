import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type {
	Notification,
	CreateNotificationInput,
	UpdateNotificationInput,
	NotificationQuery,
} from "~/zod/notification";

export interface NotificationsResponse {
	notifications: Notification[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

class NotificationsService extends APIService {
	/**
	 * Get all notifications with optional filters
	 */
	async getNotifications(): Promise<NotificationsResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/notification${queryString}`;

			const response = await hrisApiClient.get<NotificationsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let notificationsData = response.data;
			if (
				notificationsData &&
				typeof notificationsData === "object" &&
				"data" in notificationsData
			) {
				notificationsData = (notificationsData as any).data;
			}

			if (!notificationsData) {
				return { notifications: [] };
			}
			return notificationsData as NotificationsResponse;
		} catch (error: any) {
			console.error("Error fetching notifications:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching notifications",
			);
		}
	}

	/**
	 * Get a single notification by ID
	 */
	async getNotificationById(id: string): Promise<Notification> {
		try {
			const response = await hrisApiClient.get<Notification>(`/api/notification/${id}`);

			// Handle nested data structure
			let notificationData = response.data;
			if (
				notificationData &&
				typeof notificationData === "object" &&
				"data" in notificationData
			) {
				notificationData = (notificationData as any).data;
			}

			if (!notificationData) {
				throw new Error("Notification not found");
			}
			return notificationData as Notification;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching notification",
			);
		}
	}

	/**
	 * Create a new notification
	 */
	async createNotification(data: CreateNotificationInput): Promise<Notification> {
		try {
			const response = await hrisApiClient.post<Notification>("/api/notification", data);

			// Handle nested data structure
			let notificationData = response.data;
			if (
				notificationData &&
				typeof notificationData === "object" &&
				"data" in notificationData
			) {
				notificationData = (notificationData as any).data;
			}

			if (!notificationData) {
				throw new Error("Failed to create notification");
			}
			return notificationData as Notification;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating notification",
			);
		}
	}

	/**
	 * Update a notification (mark as read, etc.)
	 */
	async updateNotification(id: string, data: UpdateNotificationInput): Promise<Notification> {
		try {
			const response = await hrisApiClient.put<Notification>(`/api/notification/${id}`, data);

			// Handle nested data structure
			let notificationData = response.data;
			if (
				notificationData &&
				typeof notificationData === "object" &&
				"data" in notificationData
			) {
				notificationData = (notificationData as any).data;
			}

			if (!notificationData) {
				throw new Error("Failed to update notification");
			}
			return notificationData as Notification;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating notification",
			);
		}
	}

	/**
	 * Mark a notification as read for a specific employee
	 */
	async markAsRead(id: string, employeeId: string): Promise<Notification> {
		try {
			const response = await hrisApiClient.post<Notification>(
				`/api/notification/${id}/mark-read`,
				{ employeeId },
			);

			// Handle nested data structure
			let notificationData = response.data;
			if (
				notificationData &&
				typeof notificationData === "object" &&
				"data" in notificationData
			) {
				notificationData = (notificationData as any).data;
			}

			if (!notificationData) {
				throw new Error("Failed to mark notification as read");
			}
			return (notificationData as any).notification || notificationData;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error marking notification as read",
			);
		}
	}

	/**
	 * Mark multiple notifications as read for a specific employee
	 */
	async markMultipleAsRead(ids: string[], employeeId: string): Promise<void> {
		try {
			await Promise.all(ids.map((id) => this.markAsRead(id, employeeId)));
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error marking notifications as read",
			);
		}
	}

	/**
	 * Delete a notification
	 */
	async deleteNotification(id: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/notification/${id}`);
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting notification",
			);
		}
	}

	/**
	 * Get unread notification count for an employee
	 */
	async getUnreadCount(employeeId: string): Promise<number> {
		try {
			const response = await hrisApiClient.get<{ count: number }>(
				`/api/notification?recipientEmployeeId=${encodeURIComponent(employeeId)}&unreadOnly=true&count=true&document=false`,
			);

			// Handle nested data structure
			let data = response.data;
			if (data && typeof data === "object" && "data" in data) {
				data = (data as any).data;
			}

			return (data as any)?.count || 0;
		} catch (error: any) {
			console.error("Error fetching unread count:", error);
			return 0;
		}
	}
}

// Export singleton instance
const notificationsService = new NotificationsService();
export default notificationsService;

