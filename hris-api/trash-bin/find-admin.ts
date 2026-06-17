import { PrismaClient } from "./generated/prisma";

const prisma = new PrismaClient();

async function main() {
	console.log("Fetching first user...");
	const user = await prisma.user.findFirst();
	if (user) {
		console.log(
			`User: ${user.userName} (${user.email}), Role: ${user.role}, OrgID: ${user.organizationId}`,
		);
	} else {
		console.log("No users found.");
	}
}

main().finally(async () => await prisma.$disconnect());
