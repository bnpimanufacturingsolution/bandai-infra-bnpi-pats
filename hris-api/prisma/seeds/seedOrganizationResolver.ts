import { loginSeedAuth, resolveSeedOrganization } from "../../helper/seed-auth.helper";
import { PrismaClient } from "../../generated/prisma";

export async function resolveDefaultSeedOrganizationId(): Promise<string> {
	if (process.env.IDP_ENABLED !== "true") {
		const prisma = new PrismaClient();
		try {
			const organization =
				(await prisma.organization.findUnique({ where: { code: "bnei" } })) ||
				(await prisma.organization.findFirst({
					where: { isDeleted: false },
					orderBy: { createdAt: "asc" },
				}));

			if (organization?.id) {
				return organization.id;
			}

			try {
				const created = await prisma.organization.create({
					data: {
						name: "Bandai Namco",
						code: "bnei",
						description:
							"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company",
						isDeleted: false,
					},
				});
				return created.id;
			} catch (error: any) {
				// Handle concurrent seeding race where another seeder created the same organization code.
				if (error?.code === "P2002") {
					const existingByCode = await prisma.organization.findUnique({
						where: { code: "bnei" },
						select: { id: true },
					});
					if (existingByCode?.id) return existingByCode.id;
				}
				throw error;
			}
		} finally {
			await prisma.$disconnect();
		}
	}

	const authSession = await loginSeedAuth();
	const organization = await resolveSeedOrganization(authSession.token);
	return organization.id;
}
