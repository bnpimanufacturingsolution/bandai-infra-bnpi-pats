import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

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
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	readAt: z.date().nullable().optional(),
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
	archivedAt: z.date().nullable().optional(),
	archivedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	reason: z.string().nullable().optional(),
});

export type Archive = z.infer<typeof ArchiveSchema>;

// Base Notification Schema (matches new Prisma model)
export const NotificationSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	sourceEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	category: z.string().default("SYSTEM"),
	title: z.string(),
	description: z.string(),
	type: NotificationTypeSchema,
	eventKey: z.string().nullable().optional(),
	recipients: RecipientsSchema,
	metadata: z.record(z.any()).nullable().optional(),
	archive: ArchiveSchema.nullable().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// Create Notification Schema (for API input)
export const CreateNotificationSchema = z.object({
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	sourceEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	category: z.string().default("SYSTEM"),
	title: z.string().min(1, "Title is required").max(200, "Title too long"),
	description: z.string().min(1, "Description is required").max(1000, "Description too long"),
	type: NotificationTypeSchema.default("INFO"),
	eventKey: z.string().min(1).max(255).optional(),
	recipientEmployeeIds: z
		.array(z.string().refine((val) => isValidObjectId(val)))
		.optional(),
	broadcast: z.boolean().default(false),
	metadata: z.record(z.any()).optional(),
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
	metadata: z.record(z.any()).optional(),
});

export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;

// Mark as Read Schema (for single notification)
export const MarkAsReadSchema = z.object({
	notificationId: z.string().refine((val) => isValidObjectId(val)),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
});

export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;

// Mark Multiple as Read Schema
export const MarkMultipleAsReadSchema = z.object({
	notificationIds: z
		.array(z.string().refine((val) => isValidObjectId(val)))
		.min(1, "At least one notification ID required"),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
});

export type MarkMultipleAsReadInput = z.infer<typeof MarkMultipleAsReadSchema>;

// Query/Filter Schema (for fetching notifications)
export const NotificationQuerySchema = z.object({
	organizationId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	employeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	category: z.string().optional(),
	type: NotificationTypeSchema.optional(),
	isRead: z.boolean().optional(),
	limit: z.number().min(1).max(100).default(20),
	skip: z.number().min(0).default(0),
	orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

// Notification ID Param Schema (for route params)
export const NotificationIdParamSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
});

export type NotificationIdParam = z.infer<typeof NotificationIdParamSchema>;

// Bulk Create Notifications Schema (send one notification to multiple employees)
export const BulkCreateNotificationSchema = z.object({
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	sourceEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	category: z.string().default("SYSTEM"),
	recipientEmployeeIds: z
		.array(z.string().refine((val) => isValidObjectId(val)))
		.min(1, "At least one recipient is required"),
	title: z.string().min(1, "Title is required").max(200, "Title too long"),
	description: z.string().min(1, "Description is required").max(1000, "Description too long"),
	type: NotificationTypeSchema.default("INFO"),
	metadata: z.record(z.any()).optional(),
});

export type BulkCreateNotificationInput = z.infer<typeof BulkCreateNotificationSchema>;

// Archive Notification Schema
export const ArchiveNotificationSchema = z.object({
	notificationId: z.string().refine((val) => isValidObjectId(val)),
	archivedBy: z.string().refine((val) => isValidObjectId(val)),
	reason: z.string().optional(),
});

export type ArchiveNotificationInput = z.infer<typeof ArchiveNotificationSchema>;
