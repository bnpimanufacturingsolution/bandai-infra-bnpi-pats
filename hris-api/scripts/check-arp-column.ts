import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const cols = (await p.$queryRawUnsafe(
		`SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'employee_payrolls'
		ORDER BY ordinal_position`,
	)) as any[];
	console.log("COL_COUNT", cols.length);
	console.log("HAS_ARP", cols.some((c) => c.column_name === "attendanceRecognitionProgram"));
	const names = cols.map((c) => c.column_name);
	console.log("ARP_NEIGHBORS", JSON.stringify(names.slice(Math.max(0, names.indexOf("attendanceRecognitionProgram") - 4), Math.max(0, names.indexOf("attendanceRecognitionProgram") + 5))));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
