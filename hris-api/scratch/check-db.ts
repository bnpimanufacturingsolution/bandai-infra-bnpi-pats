import { PrismaClient } from "../generated/prisma-postgres";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
	console.log("DATABASE_URL from env:", process.env.DATABASE_URL);
	const personId = "cmspnnxl402s3qw01yy2a3rr7";
	const person = await prisma.person.findUnique({
		where: { id: personId },
		include: { children: true },
	});
	console.log("=== PERSON RECORD ===");
	console.log(JSON.stringify(person, null, 2));

	const allChildren = await prisma.child.findMany({
		where: { parentId: personId },
	});
	console.log("=== ALL CHILDREN ===");
	console.log(JSON.stringify(allChildren, null, 2));
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
