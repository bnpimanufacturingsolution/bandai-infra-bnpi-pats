import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

export const ObjectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId format",
});

// Enums matching the Prisma schema
export const GenderTypeSchema = z.enum([
	"male",
	"female",
	"other",
	"prefer_not_to_say",
	"unknown",
	"not_applicable",
]);

export const PhoneTypeSchema = z.enum([
	"mobile",
	"home",
	"work",
	"emergency",
	"fax",
	"pager",
	"main",
	"other",
]);

export const IdentificationTypeSchema = z.enum([
	"passport",
	"drivers_license",
	"national_id",
	"postal_id",
	"voters_id",
	"senior_citizen_id",
	"company_id",
	"school_id",
]);

const OptionalStringSchema = z.preprocess(
	(value) => (value === null ? undefined : value),
	z.string().optional(),
);

const OptionalEmailSchema = z.preprocess(
	(value) => (value === null || value === "" ? undefined : value),
	z.string().email("Invalid email format").optional(),
);

// Nested schemas
export const PersonalInfoSchema = z.object({
	prefix: OptionalStringSchema,
	firstName: z.string().min(1, "First name is required"),
	middleName: OptionalStringSchema,
	lastName: z.string().min(1, "Last name is required"),
	dateOfBirth: z.coerce.date().optional(),
	placeOfBirth: OptionalStringSchema,
	age: z.number().int().min(0).max(150).optional(),
	nationality: OptionalStringSchema,
	primaryLanguage: OptionalStringSchema,
	gender: GenderTypeSchema.optional(),
	currency: OptionalStringSchema,
	vipCode: OptionalStringSchema,
});

export const PhoneSchema = z.object({
	type: PhoneTypeSchema.optional(),
	countryCode: OptionalStringSchema,
	number: OptionalStringSchema,
	isPrimary: z.boolean().optional(),
});

export const ContactAddressSchema = z.object({
	street: OptionalStringSchema,
	address2: OptionalStringSchema,
	city: OptionalStringSchema,
	state: OptionalStringSchema,
	country: OptionalStringSchema,
	postalCode: OptionalStringSchema,
	zipCode: OptionalStringSchema,
	houseNumber: OptionalStringSchema,
});

export const ContactInfoSchema = z.object({
	email: OptionalEmailSchema,
	phones: z.array(PhoneSchema).optional(),
	fax: OptionalStringSchema,
	address: z.array(ContactAddressSchema).optional(),
});

export const IdentificationSchema = z.object({
	type: IdentificationTypeSchema.optional(),
	number: OptionalStringSchema,
	issuingCountry: OptionalStringSchema,
	expiryDate: z.coerce.date().optional(),
});

export const MetadataSchema = z.object({
	isActive: z.boolean().optional(),
	status: OptionalStringSchema,
	createdBy: ObjectIdSchema.optional(),
	updatedBy: ObjectIdSchema.optional(),
	lastLoginAt: z.coerce.date().optional(),
	isDeleted: z.boolean().optional(),
});

export const ChildSchema = z.object({
	id: ObjectIdSchema.optional(),
	firstName: z.string().min(1, "Beneficiary first name is required"),
	middleName: OptionalStringSchema,
	lastName: OptionalStringSchema,
	dateOfBirth: z.coerce.date(),
	gender: GenderTypeSchema.optional(),
	isDependent: z.boolean().optional(),
	notes: OptionalStringSchema,
});

// Main schemas
export const PersonSchema = z.object({
	id: ObjectIdSchema,
	organizationId: ObjectIdSchema.optional(),
	userId: z.string().optional(),
	employeeId: z.string().optional(),
	personalInfo: PersonalInfoSchema.optional(),
	contactInfo: ContactInfoSchema,
	identification: IdentificationSchema.optional(),
	metadata: MetadataSchema.optional(),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional(),
	isDeleted: z.boolean().optional(),
});

export const CreatePersonSchema = z.object({
	organizationId: ObjectIdSchema.optional(),
	userId: z.string().optional(),
	employeeId: z.string().optional(),
	personalInfo: PersonalInfoSchema.optional(),
	contactInfo: ContactInfoSchema,
	identification: IdentificationSchema.optional(),
	metadata: MetadataSchema.optional(),
	children: z.array(ChildSchema).optional(),
});

export const UpdatePersonSchema = z.object({
	organizationId: ObjectIdSchema.optional(),
	userId: z.string().optional(),
	employeeId: z.string().optional(),
	personalInfo: PersonalInfoSchema.optional(),
	contactInfo: ContactInfoSchema.optional(),
	identification: IdentificationSchema.optional(),
	metadata: MetadataSchema.optional(),
	children: z.array(ChildSchema).optional(),
});

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});

// Export types
export type Person = z.infer<typeof PersonSchema>;
export type CreatePersonType = z.infer<typeof CreatePersonSchema>;
export type UpdatePersonType = z.infer<typeof UpdatePersonSchema>;
export type GroupByType = z.infer<typeof GroupBySchema>;
export type PersonalInfoType = z.infer<typeof PersonalInfoSchema>;
export type ContactInfoType = z.infer<typeof ContactInfoSchema>;
export type IdentificationType = z.infer<typeof IdentificationSchema>;
export type MetadataType = z.infer<typeof MetadataSchema>;
export type ChildType = z.infer<typeof ChildSchema>;
