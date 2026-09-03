import fs from "fs";
import path from "path";

type DepartmentConfig = {
	code: string;
	name: string;
	rolesByLevel: Record<number, { title: string; positionCode: string }[]>;
};

const TOTAL = 6000;
const OUTPUT = "prisma/seeds/data/employees-6000.csv";
const ORG = "org-sample-001";
const CURRENCY = "PHP";
const PAY_FREQUENCY = "SEMI_MONTHLY";
const EMPLOYMENT_STATUS = "ACTIVE";

const LEVEL_NAMES: Record<number, string> = {
	1: "Director / Head",
	2: "Manager / Lead",
	3: "Senior",
	4: "Regular",
	5: "Intern / Junior",
};

const LEVEL_SPLIT: Record<number, number> = {
	1: 20,
	2: 80,
	3: 200,
	4: 500,
	5: 200,
};

const SALARY_RANGE: Record<number, [number, number]> = {
	1: [160000, 260000],
	2: [100000, 180000],
	3: [60000, 120000],
	4: [30000, 70000],
	5: [14000, 26000],
};

const EMPLOYMENT_TYPES_BY_LEVEL: Record<number, string[]> = {
	1: ["REGULAR", "REGULAR", "CONSULTANT"],
	2: ["REGULAR", "REGULAR", "PROBATIONARY"],
	3: ["REGULAR", "PROBATIONARY", "CONTRACTUAL"],
	4: ["REGULAR", "PROBATIONARY", "CONTRACTUAL", "PART_TIME"],
	5: ["INTERN", "PROBATIONARY"],
};

const WORK_LOCATIONS = ["ONSITE", "ONSITE", "HYBRID", "REMOTE"];

const DEPARTMENTS: DepartmentConfig[] = [
	{
		code: "IT",
		name: "IT Department",
		rolesByLevel: {
			1: [{ title: "CTO", positionCode: "IT-CTO" }],
			2: [
				{ title: "Tech Lead", positionCode: "IT-TL" },
				{ title: "Project Manager", positionCode: "IT-PM" },
			],
			3: [{ title: "Senior Developer", positionCode: "IT-SR-DEV" }],
			4: [{ title: "Developer", positionCode: "IT-DEV" }],
			5: [{ title: "Junior Developer", positionCode: "IT-JR-DEV" }],
		},
	},
	{
		code: "SALES",
		name: "Sales Department",
		rolesByLevel: {
			1: [{ title: "Head of Sales", positionCode: "SALES-HEAD" }],
			2: [{ title: "Sales Manager", positionCode: "SALES-MGR" }],
			3: [{ title: "Senior Sales Executive", positionCode: "SALES-SR" }],
			4: [{ title: "Sales Executive", positionCode: "SALES-EXEC" }],
			5: [{ title: "Sales Intern", positionCode: "SALES-INT" }],
		},
	},
	{
		code: "HR",
		name: "HR Department",
		rolesByLevel: {
			1: [{ title: "HR Director", positionCode: "HR-DIR" }],
			2: [{ title: "HR Manager", positionCode: "HR-MGR" }],
			3: [{ title: "HR Officer", positionCode: "HR-OFF" }],
			4: [{ title: "HR Assistant", positionCode: "HR-ASST" }],
			5: [{ title: "HR Intern", positionCode: "HR-INT" }],
		},
	},
	{
		code: "MKT",
		name: "Marketing Department",
		rolesByLevel: {
			1: [{ title: "Marketing Director", positionCode: "MKT-DIR" }],
			2: [{ title: "Marketing Manager", positionCode: "MKT-MGR" }],
			3: [{ title: "Senior Marketer", positionCode: "MKT-SR" }],
			4: [{ title: "Marketer", positionCode: "MKT-MKT" }],
			5: [{ title: "Marketing Intern", positionCode: "MKT-INT" }],
		},
	},
	{
		code: "FIN",
		name: "Finance Department",
		rolesByLevel: {
			1: [{ title: "Finance Director", positionCode: "FIN-DIR" }],
			2: [{ title: "Finance Manager", positionCode: "FIN-MGR" }],
			3: [{ title: "Senior Accountant", positionCode: "FIN-SR" }],
			4: [{ title: "Accountant", positionCode: "FIN-ACC" }],
			5: [{ title: "Finance Intern", positionCode: "FIN-INT" }],
		},
	},
	{
		code: "OPS",
		name: "Operations Department",
		rolesByLevel: {
			1: [{ title: "Operations Director", positionCode: "OPS-DIR" }],
			2: [{ title: "Operations Manager", positionCode: "OPS-MGR" }],
			3: [{ title: "Senior Operations Specialist", positionCode: "OPS-SR" }],
			4: [{ title: "Operations Specialist", positionCode: "OPS-SPEC" }],
			5: [{ title: "Operations Intern", positionCode: "OPS-INT" }],
		},
	},
];

const FIRST_NAMES = [
	"James",
	"Maria",
	"Juan",
	"Ana",
	"Jose",
	"Grace",
	"Miguel",
	"Sofia",
	"Carlos",
	"Isabella",
	"Daniel",
	"Camille",
	"Rafael",
	"Angela",
	"Mark",
	"Patricia",
	"John",
	"Christine",
	"Kevin",
	"Nicole",
];

const LAST_NAMES = [
	"Santos",
	"Reyes",
	"Cruz",
	"Garcia",
	"Torres",
	"Mendoza",
	"Rivera",
	"Flores",
	"Lopez",
	"Gonzales",
	"Hernandez",
	"Aquino",
	"Ramos",
	"Bautista",
	"Castro",
	"Fernandez",
	"Vargas",
	"Manalo",
	"Soriano",
	"Pascual",
];

function rand<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function salaryForLevel(level: number): number {
	const [min, max] = SALARY_RANGE[level];
	return Math.round(min + Math.random() * (max - min));
}

function makeDate(level: number): string {
	const year =
		level <= 2 ? 2020 + Math.floor(Math.random() * 2) : 2021 + Math.floor(Math.random() * 5);
	const month = 1 + Math.floor(Math.random() * 12);
	const day = 1 + Math.floor(Math.random() * 28);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function empId(n: number): string {
	return `EMP-${String(n).padStart(5, "0")}`;
}

function generate() {
	const rows: string[] = [];
	rows.push(
		[
			"employeeId",
			"firstName",
			"lastName",
			"middleName",
			"email",
			"role",
			"departmentCode",
			"departmentName",
			"positionCode",
			"positionTitle",
			"levelName",
			"levelRank",
			"basicSalary",
			"currency",
			"payFrequency",
			"employmentType",
			"employmentStatus",
			"workLocation",
			"hireDate",
			"reportToEmployeeId",
		].join(","),
	);

	let seq = 0;
	let total = 0;

	for (const dept of DEPARTMENTS) {
		const byLevelIds: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

		for (let level = 1; level <= 5; level++) {
			const count = LEVEL_SPLIT[level];
			const rolePool = dept.rolesByLevel[level];

			for (let i = 0; i < count; i++) {
				seq++;
				total++;
				const id = empId(seq);
				const firstName = rand(FIRST_NAMES);
				const lastName = rand(LAST_NAMES);
				const middleName = Math.random() < 0.35 ? rand(FIRST_NAMES) : "";
				const role = rand(rolePool);
				const reportTo =
					level === 1
						? ""
						: byLevelIds[level - 1][
								Math.floor(Math.random() * byLevelIds[level - 1].length)
							];

				byLevelIds[level].push(id);

				rows.push(
					[
						id,
						firstName,
						lastName,
						middleName,
						`${firstName.toLowerCase()}.${lastName.toLowerCase()}.${seq}@example.com`,
						role.title,
						dept.code,
						dept.name,
						role.positionCode,
						role.title,
						LEVEL_NAMES[level],
						String(level),
						String(salaryForLevel(level)),
						CURRENCY,
						PAY_FREQUENCY,
						rand(EMPLOYMENT_TYPES_BY_LEVEL[level]),
						EMPLOYMENT_STATUS,
						rand(WORK_LOCATIONS),
						makeDate(level),
						reportTo,
					].join(","),
				);
			}
		}
	}

	if (total !== TOTAL) {
		throw new Error(`Expected ${TOTAL} rows but generated ${total}`);
	}

	const outPath = path.resolve(process.cwd(), OUTPUT);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, rows.join("\n"), "utf-8");
	console.log(`Generated ${TOTAL} employees for ${ORG}: ${OUTPUT}`);
}

generate();
