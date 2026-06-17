import { PrismaClient } from "../generated/prisma";
import { EmployeeImportHelper, EmployeeImportRow } from "../helper/employee-import.helper";

const prisma = new PrismaClient();

// Test data - sample CSV rows
const SAMPLE_IMPORT_DATA: EmployeeImportRow[] = [
	{
		EMP_ID: "TEST-001",
		NAME: "John Cruz Doe", // Full name with middle name
		POSITION: "Software Engineer",
		DEPARTMENT: "Information Technology",
		TIN: "123-456-789-000",
		SSS: "12-3456789-0",
		PHILHEALTH: "12-345678901-2",
		PAGIBIG: "1234-5678-9012",
		HIRE_DATE: "2025-01-01",
		BASIC_SALARY: "50000",
		// Optional
		EMAIL: "john.doe@test.com",
		PHONE: "09171234567",
		BIRTHDAY: "1990-01-15",
		GENDER: "male",
		STREET: "123 Test Street",
		CITY: "Manila",
		STATE: "Metro Manila",
		COUNTRY: "Philippines",
		POSTAL_CODE: "1000",
		LEVEL: "Mid",
		EMPLOYMENT_STATUS: "ACTIVE",
		EMPLOYMENT_TYPE: "REGULAR",
	},
	{
		EMP_ID: "TEST-002",
		NAME: "Jane Smith", // First and last only
		POSITION: "HR Specialist",
		DEPARTMENT: "Human Resources",
		TIN: "234-567-890-000",
		SSS: "23-4567890-1",
		PHILHEALTH: "23-456789012-3",
		PAGIBIG: "2345-6789-0123",
		HIRE_DATE: "2025-01-05",
		BASIC_SALARY: "45000",
		// Optional
		EMAIL: "jane.smith@test.com",
		LEVEL: "Junior",
	},
	{
		EMP_ID: "TEST-003",
		NAME: "Maria Santos",
		POSITION: "Software Engineer",
		DEPARTMENT: "Information Technology",
		TIN: "345-678-901-000",
		SSS: "34-5678901-2",
		PHILHEALTH: "34-567890123-4",
		PAGIBIG: "3456-7890-1234",
		HIRE_DATE: "2025-01-10",
		BASIC_SALARY: "55000",
		// Optional
		EMAIL: "maria.santos@test.com",
		PHONE: "09171111111",
	},
];

async function testEmployeeImport() {
	console.log("=".repeat(80));
	console.log("EMPLOYEE IMPORT TEST");
	console.log("=".repeat(80));

	// Get organization ID - use your actual org ID
	const ORG_ID = "69884da971e2dc9d6ac67b59";

	console.log(`\nOrganization ID: ${ORG_ID}`);
	console.log(`Sample records: ${SAMPLE_IMPORT_DATA.length}\n`);

	// Initialize helper
	const helper = new EmployeeImportHelper(prisma, ORG_ID);

	console.log("Loading caches...");
	await helper.loadCaches();
	console.log("✓ Caches loaded\n");

	// Test mapping
	console.log("-".repeat(80));
	console.log("TESTING ROW MAPPING");
	console.log("-".repeat(80));

	for (let i = 0; i < SAMPLE_IMPORT_DATA.length; i++) {
		const row = SAMPLE_IMPORT_DATA[i];
		console.log(`\nRow ${i + 1}: ${row.EMP_ID} - ${row.NAME}`);

		try {
			const mapped = helper.mapRowToEmployeeData(row);

			console.log("\n✓ Mapped successfully!");
			console.log("\nEmployee Data:");
			console.log(JSON.stringify(mapped.employee, null, 2));

			console.log("\nPerson Data:");
			console.log(JSON.stringify(mapped.person, null, 2));
		} catch (error: any) {
			console.error("\n✗ Mapping failed:", error.message);
		}
	}

	console.log("\n" + "=".repeat(80));
	console.log("TEST COMPLETE");
	console.log("=".repeat(80));
}

// Run test
testEmployeeImport()
	.catch((error) => {
		console.error("Test failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
