const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("../generated/prisma");

const repoRoot = path.resolve(__dirname, "..", "..");
const csvPath = path.join(repoRoot, "data", "import", "employees-import.csv");

const cleanHeader = (value) => String(value || "").replace(/^\uFEFF/, "");

const csvCell = (value) => {
	const text = String(value ?? "");
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
	const prisma = new PrismaClient();
	try {
		const workbook = XLSX.read(fs.readFileSync(csvPath, "utf8"), {
			type: "string",
			raw: true,
		});
		const sheet = workbook.Sheets[workbook.SheetNames[0]];
		const matrix = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: "",
			raw: false,
		});
		const headers = (matrix[0] || []).map(cleanHeader);
		const roleIndex = headers.indexOf("ROLE");
		const employeeIdIndex = headers.indexOf("EMP_ID");
		if (roleIndex < 0 || employeeIdIndex < 0) {
			throw new Error("employees-import.csv must include EMP_ID and ROLE headers.");
		}

		const employees = await prisma.employee.findMany({
			where: { isDeleted: false },
			select: { employeeId: true, role: true },
		});
		const roleByEmployeeId = new Map(
			employees.map((employee) => [String(employee.employeeId), String(employee.role || "")]),
		);

		let updated = 0;
		const rows = matrix.slice(1).map((row) => {
			const next = headers.map((_, index) => row[index] ?? "");
			const employeeId = String(next[employeeIdIndex] || "").trim().padStart(5, "0");
			const dbRole = roleByEmployeeId.get(employeeId);
			if (dbRole && next[roleIndex] !== dbRole) {
				next[roleIndex] = dbRole;
				updated += 1;
			}
			return next;
		});

		const output =
			[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
		fs.writeFileSync(csvPath, output, "utf8");
		console.log(JSON.stringify({ csvPath, scanned: rows.length, updated }, null, 2));
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
