import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
	const records = await prisma.request.findMany({
		where: {
			type: "DOCUMENT_REQUEST",
			OR: [{ status: "APPROVED" }, { status: "COMPLETED" }],
		},
	});
	console.log("Found requests:", records.length);
	if (records.length > 0) {
		console.dir(records[0], { depth: null });
	}
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
