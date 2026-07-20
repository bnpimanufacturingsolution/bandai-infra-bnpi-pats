import { z } from "zod";

// Notification Type Enum
export const NotificationTypeSchema = z.enum([
	"INFO",
	"SUCCESS",
	"WARNING",
	"ERROR",
	"ALERT",
	"REMINDER",
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// Notification Category Enum
export const NotificationCategorySchema = z.enum([
	"BOARDING",
	"REQUEST",
	"APPROVAL",
	"SYSTEM",
	"ANNOUNCEMENT",
	"REMINDER",
	"ALERT",
]);

export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

// Recipient Employee Schema (embedded type)
export const RecipientEmployeeSchema = z.object({
	employeeId: z.string(),
	readAt: z.string().nullable().optional(),
});

export type RecipientEmployee = z.infer<typeof RecipientEmployeeSchema>;

// Recipients Schema (embedded type with read/unread arrays)
export const RecipientsSchema = z.object({
	read: z.array(RecipientEmployeeSchema).default([]),
	unread: z.array(RecipientEmployeeSchema).default([]),
});

export type Recipients = z.infer<typeof RecipientsSchema>;

// Archive Schema (embedded type)
export const ArchiveSchema = z.object({
	isArchived: z.boolean().default(false),
	archivedAt: z.string().nullable().optional(),
	archivedBy: z.string().nullable().optional(),
	reason: z.string().nullable().optional(),
});

export type Archive = z.infer<typeof ArchiveSchema>;

// Base Notification Schema (matches new Prisma model - API returns ISO date strings)
export const NotificationSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	sourceEmployeeId: z.string().nullable().optional(),
	category: z.string().default("SYSTEM"),
	title: z.string(),
	description: z.string(),
	type: NotificationTypeSchema,
	eventKey: z.string().nullable().optional(),
	recipients: RecipientsSchema,
	metadata: z
		.object({
			entityType: z.string().optional(),
			entityId: z.string().optional(),
			requestType: z.string().optional(),
			timesheetAction: z.string().optional(),
			timesheetId: z.string().optional(),
			routeKey: z.string().optional(),
			targetUrl: z.string().optional(),
			action: z.string().optional(),
			status: z.string().optional(),
			comment: z.any().optional(),
			reason: z.any().optional(),
		})
		.catchall(z.any())
		.nullable()
		.optional(),
	archive: ArchiveSchema.nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// Create Notification Schema (for API input)
export const CreateNotificationSchema = z.object({
	organizationId: z.string(),
	sourceEmployeeId: z.string().optional(),
	category: z.string().default("SYSTEM"),
	title: z.string().min(1, "Title is required").max(200, "Title too long"),
	description: z.string().min(1, "Description is required").max(1000, "Description too long"),
	type: NotificationTypeSchema.default("INFO"),
	eventKey: z.string().optional(),
	recipientEmployeeIds: z.array(z.string()).optional(),
	broadcast: z.boolean().default(false),
	metadata: z
		.object({
			entityType: z.string().optional(),
			entityId: z.string().optional(),
			requestType: z.string().optional(),
			timesheetAction: z.string().optional(),
			timesheetId: z.string().optional(),
			routeKey: z.string().optional(),
			targetUrl: z.string().optional(),
			action: z.string().optional(),
			status: z.string().optional(),
		})
		.catchall(z.any())
		.optional(),
}).refine(
	(data) => {
		if (data.broadcast) {
			return true;
		}
		return data.recipientEmployeeIds && data.recipientEmployeeIds.length > 0;
	},
	{
		message: "recipientEmployeeIds must contain at least one ID when broadcast is false",
		path: ["recipientEmployeeIds"],
	}
);

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

// Update Notification Schema (for general updates)
export const UpdateNotificationSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	description: z.string().min(1).max(1000).optional(),
	type: NotificationTypeSchema.optional(),
	category: z.string().optional(),
	metadata: z.record(z.any(), z.any()).optional(),
});

export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;

// Mark as Read Schema (for single notification)
export const MarkAsReadSchema = z.object({
	notificationId: z.string(),
	employeeId: z.string(),
});

export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;

// Mark Multiple as Read Schema
export const MarkMultipleAsReadSchema = z.object({
	notificationIds: z.array(z.string()).min(1, "At least one notification ID required"),
	employeeId: z.string(),
});

export type MarkMultipleAsReadInput = z.infer<typeof MarkMultipleAsReadSchema>;

// Query/Filter Schema (for fetching notifications)
export const NotificationQuerySchema = z.object({
	organizationId: z.string().optional(),
	employeeId: z.string().optional(), // For filtering by recipient
	category: z.string().optional(),
	type: NotificationTypeSchema.optional(),
	isUnread: z.boolean().optional(), // Filter for unread notifications only
	limit: z.number().min(1).max(100).default(20),
	skip: z.number().min(0).default(0),
	orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

// Notification ID Param Schema (for route params)
export const NotificationIdParamSchema = z.object({
	id: z.string(),
});

export type NotificationIdParam = z.infer<typeof NotificationIdParamSchema>;

// Bulk Create Notifications Schema (send one notification to multiple employees)
export const BulkCreateNotificationSchema = z.object({
	organizationId: z.string(),
	sourceEmployeeId: z.string().optional(),
	category: z.string().default("SYSTEM"),
	recipientEmployeeIds: z.array(z.string()).min(1, "At least one recipient is required"),
	title: z.string().min(1, "Title is required").max(200, "Title too long"),
	description: z.string().min(1, "Description is required").max(1000, "Description too long"),
	type: NotificationTypeSchema.default("INFO"),
	metadata: z.record(z.any(), z.any()).optional(),
});

export type BulkCreateNotificationInput = z.infer<typeof BulkCreateNotificationSchema>;
