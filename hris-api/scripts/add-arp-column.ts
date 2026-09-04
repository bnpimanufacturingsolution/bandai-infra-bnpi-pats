import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const hasCol = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt FROM information_schema.columns
		WHERE table_schema='public' AND table_name='employee_payrolls' AND column_name='attendanceRecognitionProgram'`,
	)) as any[];
	if (Number(hasCol[0].cnt) === 0) {
		await p.$executeRawUnsafe(
			'ALTER TABLE employee_payrolls ADD COLUMN "attendanceRecognitionProgram" DOUBLE PRECISION NOT NULL DEFAULT 0',
		);
		console.log("column added");
	} else {
		console.log("column already present");
	}
	const verify = (await p.$queryRawUnsafe(
		`SELECT column_name, data_type, column_default FROM information_schema.columns
		WHERE table_schema='public' AND table_name='employee_payrolls' AND column_name='attendanceRecognitionProgram'`,
	)) as any[];
	console.log("VERIFY", JSON.stringify(verify));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
