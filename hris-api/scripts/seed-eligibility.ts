import { PrismaClient } from "../generated/prisma";
import { anchorToMondayUtc } from "../helper/employee-schedule.helper";
import { assertSeedDryRunNotRequested } from "../prisma/seeds/seedDryRunGuard";

const prisma = new PrismaClient();

// ==================== LEVELS ====================
interface LevelDefinition {
	name: string;
	rank: number;
	description: string;
	isManager: boolean;
}

const LEVEL_DEFINITIONS: LevelDefinition[] = [
	{ name: "Entry", rank: 1, description: "Entry-level position", isManager: false },
	{ name: "Junior", rank: 2, description: "Junior level", isManager: false },
	{ name: "Mid", rank: 3, description: "Mid-level", isManager: true },
	{ name: "Senior", rank: 4, description: "Senior level", isManager: true },
	{ name: "Lead", rank: 5, description: "Lead position", isManager: true },
	{ name: "Manager", rank: 6, description: "Manager level", isManager: true },
];

async function ensureLevels(orgId: string): Promise<Map<string, string>> {
	console.log("\n=== Ensuring Levels ===");
	const levelMap = new Map<string, string>();

	for (const levelDef of LEVEL_DEFINITIONS) {
		const level = await prisma.level.upsert({
			where: { organizationId_name: { organizationId: orgId, name: levelDef.name } },
			update: {
				rank: levelDef.rank,
				description: levelDef.description,
				isManager: levelDef.isManager,
			},
			create: {
				organizationId: orgId,
				name: levelDef.name,
				rank: levelDef.rank,
				description: levelDef.description,
				isManager: levelDef.isManager,
			},
		});
		levelMap.set(levelDef.name, level.id);
		console.log(`  ✓ Level: ${levelDef.name} (rank: ${levelDef.rank})`);
	}
	return levelMap;
}

// Helper to generate a mock Mongo ObjectId (24 hex chars)
function generateMockObjectId() {
	const timestamp = ((new Date().getTime() / 1000) | 0).toString(16);
	return (
		timestamp +
		"xxxxxxxxxxxxxxxx"
			.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16))
			.toLowerCase()
	);
}

async function main() {
	assertSeedDryRunNotRequested("seed:eligibility");
	console.log("Starting Eligibility Seed...");

	// 1. Get First Available Organization via Department
	const department = await prisma.department.findFirst();

	if (!department || !department.organizationId) {
		throw new Error(
			"No Department found to infer Organization ID. Please ensure basic data exists.",
		);
	}

	const orgId = department.organizationId;
	console.log(`Using Organization ID: ${orgId} (inferred from Department: ${department.name})`);

	// 2. Ensure Levels Exist
	const levels = await ensureLevels(orgId);

	// 3. Fetch valid Position and Department (Scoped to Org)
	const targetDept = department;
	const position = await prisma.position.findFirst({
		where: { organizationId: orgId },
	});

	if (!position) {
		throw new Error(`Could not find any Position for Organization ${orgId}.`);
	}

	console.log(`Using Department: ${targetDept.name} (${targetDept.id})`);
	console.log(`Using Position: ${position.title} (${position.id})`);

	// 4. Define Candidates

	// Candidate 1: Ready for Promotion (Entry -> Junior?)
	await seedCandidate(orgId, targetDept.id, position.id, levels.get("Entry")!, {
		empId: "TEST-PROMO-01",
		firstName: "Promo",
		lastName: "User",
		type: "REGULAR",
		hireMonthsAgo: 14, // > 1 year
		attendanceMode: "PERFECT",
		expectedEligible: true,
		role: "hris-employee",
	});

	// Candidate 2: Ready for Regularization (Probationary @ Entry)
	await seedCandidate(orgId, targetDept.id, position.id, levels.get("Entry")!, {
		empId: "TEST-REG-01",
		firstName: "Reg",
		lastName: "User",
		type: "PROBATIONARY",
		hireMonthsAgo: 5, // Approaching 6 months
		attendanceMode: "GOOD",
		expectedEligible: true,
		role: "hris-employee",
	});

	// Candidate 3: Not Eligible (Termination candidate @ Mid)
	await seedCandidate(orgId, targetDept.id, position.id, levels.get("Mid")!, {
		empId: "TEST-TERM-01",
		firstName: "Term",
		lastName: "User",
		type: "REGULAR",
		hireMonthsAgo: 10,
		attendanceMode: "POOR",
		expectedEligible: false,
		role: "hris-employee",
	});

	console.log("Seeding complete.");
}

async function seedCandidate(
	orgId: string,
	deptId: string,
	posId: string,
	levelId: string,
	data: any,
) {
	const email = `${data.firstName.toLowerCase()}@test.com`;
	console.log(`Seeding candidate: ${data.firstName} ${data.lastName} (${data.empId})...`);

	// DELETE EXISTING
	const existingEmp = await prisma.employee.findUnique({
		where: { organizationId_employeeId: { organizationId: orgId, employeeId: data.empId } },
	});

	if (existingEmp) {
		// Delete related attendance
		await prisma.attendance.deleteMany({
			where: { employeeId: existingEmp.id },
		});
		// Delete employee
		await prisma.employee.delete({
			where: { id: existingEmp.id },
		});
	}

	// Cleanup Person if exists
	const existingPerson = await prisma.person.findFirst({
		where: { contactInfo: { path: ["email"], equals: email } },
	});

	if (existingPerson) {
		try {
			// Check if any other employees are linked to this person before deleting
			const linkedEmployees = await prisma.employee.count({
				where: { personId: existingPerson.id },
			});
			if (linkedEmployees === 0) {
				await prisma.person.delete({ where: { id: existingPerson.id } });
			}
		} catch (e) {
			// Ignore
		}
	}

	// CREATE NEW PERSON
	const person = await prisma.person.create({
		data: {
			organizationId: orgId,
			personalInfo: {
				firstName: data.firstName,
				lastName: data.lastName,
			},
			contactInfo: {
				email: email,
				phones: [],
				address: [],
			},
		},
	});

	// Calculate dates
	const hireDate = new Date();
	hireDate.setMonth(hireDate.getMonth() - data.hireMonthsAgo);

	const workSnapshot = { name: "Regular 9-6", code: "REG-9-6", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] };
	const restSnapshot = { name: "Rest Day", code: "REST", isOvernight: false, isOff: true, timeSlots: [] };
	const embeddedSchedule = {
		templateId: null,
		templateCode: "REG-9-6",
		templateName: "Regular 9 to 6",
		cycleDays: 7,
		graceLateMinutes: 15,
		graceEarlyOutMinutes: 0,
		pattern: [
			{ day: 1, shiftTypeId: null, shiftSnapshot: workSnapshot },
			{ day: 2, shiftTypeId: null, shiftSnapshot: workSnapshot },
			{ day: 3, shiftTypeId: null, shiftSnapshot: workSnapshot },
			{ day: 4, shiftTypeId: null, shiftSnapshot: workSnapshot },
			{ day: 5, shiftTypeId: null, shiftSnapshot: workSnapshot },
			{ day: 6, shiftTypeId: null, shiftSnapshot: restSnapshot },
			{ day: 7, shiftTypeId: null, shiftSnapshot: restSnapshot },
		],
		effectiveStartDate: anchorToMondayUtc(hireDate),
		assignedAt: new Date(),
		assignedByEmployeeId: null,
		reason: "seed_eligibility",
		version: 1,
	};

	// Mock User ID to simulate account
	const mockUserId = generateMockObjectId();

	// Create Employee
	const employee = await prisma.employee.create({
		data: {
			organizationId: orgId,
			employeeId: data.empId,
			personId: person.id,
			userId: mockUserId, // <--- MOCKED USER ID
			employmentStatus: "ACTIVE",
			employmentType: data.type,
			employmentHireDate: hireDate,
			// For Probationary, set end date to 6 months from hire
			probationEndDate:
				data.type === "PROBATIONARY"
					? new Date(new Date(hireDate).setMonth(hireDate.getMonth() + 6))
					: null,
			basicSalary: 30000,
			departmentId: deptId,
			positionId: posId,
			levelId: levelId, // <--- Assigned Level
			role: data.role || "hris-employee",
			embeddedSchedule: embeddedSchedule as any,
			employmentHistory: [],
			leaveBalances: [],
			metadata: {},
		},
	});

	// Generate Attendance
	await generateAttendance(prisma, employee, data.attendanceMode);
}

async function generateAttendance(prisma: any, employee: any, mode: string) {
	const today = new Date();
	const startDate = new Date();
	startDate.setMonth(startDate.getMonth() - 6); // Generate last 6 months

	const loopDate = new Date(startDate);
	// console.log(`  Generating attendance [${mode}]...`);

	while (loopDate <= today) {
		const day = loopDate.getDay();
		// Skip weekends (Sat=6, Sun=0)
		if (day === 0 || day === 6) {
			loopDate.setDate(loopDate.getDate() + 1);
			continue;
		}

		let status = "PRESENT";
		let timeInHour = 9;
		let timeInMin = 0;
		let createRecord = true;

		// Logic for modes
		if (mode === "PERFECT") {
			status = "PRESENT";
		} else if (mode === "GOOD") {
			const rand = Math.random();
			if (rand < 0.02) {
				// 2% chance of Late
				timeInHour = 9;
				timeInMin = Math.floor(Math.random() * 30) + 1; // 1-30 mins late
			} else if (rand < 0.05) {
				// 3% chance of Leave (approved)
				status = "LEAVE";
			}
		} else if (mode === "POOR") {
			const rand = Math.random();
			if (rand < 0.15) {
				// 15% chance of Absence (no record)
				status = "ABSENT";
				createRecord = false;
			} else if (rand < 0.3) {
				// 15% chance of Late
				timeInHour = 10; // 1 hour late
				timeInMin = 0;
			}
		}

		if (createRecord) {
			const timeIn = new Date(loopDate);
			timeIn.setHours(timeInHour, timeInMin, 0);

			const timeOut = new Date(loopDate);
			timeOut.setHours(18, 0, 0); // Out at 6 PM

			await prisma.attendance.create({
				data: {
					organizationId: employee.organizationId,
					employeeId: employee.id,
					date: new Date(loopDate),
					status: status,
					timeIn: status === "ABSENT" ? null : timeIn,
					timeOut: status === "ABSENT" ? null : timeOut,
				},
			});
		}

		loopDate.setDate(loopDate.getDate() + 1);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
