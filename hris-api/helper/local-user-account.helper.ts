import { PrismaClient } from "../generated/prisma";

export const DEFAULT_MIGRATION_PASSWORD = "Password123!";
export const DEFAULT_MIGRATION_EMPLOYEE_ROLE = "hris-employee";

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

export const isValidEmailAddress = (value: string): boolean =>
	/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export const sanitizeUserNameSegment = (value: string): string =>
	String(value || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase();

export const buildSafeUserName = (params: {
	email: string;
	firstName: string;
	lastName: string;
}): string => {
	const emailLocalPart = params.email.split("@")[0] || "";
	const fromEmail = sanitizeUserNameSegment(emailLocalPart);
	const fromName = sanitizeUserNameSegment(`${params.firstName}${params.lastName}`);
	let userName = fromEmail || fromName || "user";

	if (!/^[a-z]/.test(userName)) {
		userName = `u${userName}`;
	}

	return userName.slice(0, 30);
};

export const resolveMigrationDefaultPassword = (): string => {
	const overridden = String(process.env.MIGRATION_DEFAULT_PASSWORD || "").trim();
	return overridden || DEFAULT_MIGRATION_PASSWORD;
};

export interface EnsureLocalUserAccountParams {
	prisma: PrismaClient;
	email: string;
	userName: string;
	password: string;
	role: string;
	organizationId: string;
	existingUserId?: string | null;
	metadata?: Record<string, any>;
}

export interface EnsureLocalUserAccountResult {
	userId: string;
	created: boolean;
	userName: string;
	email: string;
}

export const ensureLocalUserAccount = async (
	params: EnsureLocalUserAccountParams,
): Promise<EnsureLocalUserAccountResult> => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const bcrypt = require("bcryptjs") as {
		hash(password: string, rounds: number): Promise<string>;
	};
	const hashedPassword = await bcrypt.hash(params.password, 10);
	const baseMetadata = {
		requirePasswordChange: true,
		isFirstLogin: true,
		...(asRecord(params.metadata) || {}),
	};

	const existing =
		(params.existingUserId
			? await params.prisma.user.findFirst({
					where: { id: params.existingUserId, isDeleted: false },
					select: { id: true },
				})
			: null) ||
		(await params.prisma.user.findFirst({
			where: {
				OR: [{ email: params.email }, { userName: params.userName }],
			},
			select: { id: true },
		}));

	if (existing) {
		await params.prisma.user.update({
			where: { id: existing.id },
			data: {
				email: params.email,
				userName: params.userName,
				password: hashedPassword,
				status: "active",
				loginMethod: "email",
				organizationId: params.organizationId,
				role: params.role,
				isDeleted: false,
				metadata: baseMetadata,
			},
		});
		return {
			userId: existing.id,
			created: false,
			userName: params.userName,
			email: params.email,
		};
	}

	const created = await params.prisma.user.create({
		data: {
			email: params.email,
			userName: params.userName,
			password: hashedPassword,
			status: "active",
			loginMethod: "email",
			organizationId: params.organizationId,
			role: params.role,
			isDeleted: false,
			metadata: baseMetadata,
		},
		select: { id: true },
	});

	return {
		userId: created.id,
		created: true,
		userName: params.userName,
		email: params.email,
	};
};
