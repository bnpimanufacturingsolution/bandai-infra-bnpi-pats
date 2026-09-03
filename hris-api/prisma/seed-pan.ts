import {
	PrismaClient,
	GenderType,
	EmploymentType,
	PhoneType,
	LeaveType,
	RequestType,
} from "../generated/prisma";
import { assertSeedDryRunNotRequested } from "./seeds/seedDryRunGuard";
import {
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
} from "../helper/request-runtime.helper";

const prisma = new PrismaClient();

import { anchorToMondayUtc } from "../helper/employee-schedule.helper";

const defaultEmbeddedSchedule = {
	templateId: null,
	templateCode: "SEED-REG",
	templateName: "Regular Shift (Seed)",
	cycleDays: 7,
	graceLateMinutes: 15,
	graceEarlyOutMinutes: 0,
	pattern: [
		{ day: 1, shiftTypeId: null, shiftSnapshot: { name: "Work Day", code: "WORK", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] } },
		{ day: 2, shiftTypeId: null, shiftSnapshot: { name: "Work Day", code: "WORK", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] } },
		{ day: 3, shiftTypeId: null, shiftSnapshot: { name: "Work Day", code: "WORK", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] } },
		{ day: 4, shiftTypeId: null, shiftSnapshot: { name: "Work Day", code: "WORK", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] } },
		{ day: 5, shiftTypeId: null, shiftSnapshot: { name: "Work Day", code: "WORK", isOvernight: false, isOff: false, timeSlots: [{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" }, { type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" }, { type: "work", label: "Afternoon", startTime: "13:00", endTime: "18:00" }] } },
		{ day: 6, shiftTypeId: null, shiftSnapshot: { name: "Rest Day", code: "REST", isOvernight: false, isOff: true, timeSlots: [] } },
		{ day: 7, shiftTypeId: null, shiftSnapshot: { name: "Rest Day", code: "REST", isOvernight: false, isOff: true, timeSlots: [] } },
	],
	effectiveStartDate: anchorToMondayUtc(new Date()),
	assignedAt: new Date(),
	assignedByEmployeeId: null,
	reason: "seed_pan",
	version: 1,
};

const ORG_ID = "69884da971e2dc9d6ac67b59";

const AUTH_BASE_URL = "https://adam-auth-431713067666.asia-southeast1.run.app";
const AUTH_TOKEN =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTc4NDVlNjQ3OWVhYTZkMmY3OTZiODkiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTc4NDVlNDQ3OWVhYTZkMmY3OTZiODAiLCJvcmdhbml6YXRpb25JZCI6IjY5Nzg0NWUzNDc5ZWFhNmQyZjc5NmI3YyIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3Njk2NTE5NjgsImV4cCI6MTc2OTczODM2OH0.Y9CaD9VB93GE6fmUXs4-X0ScpN8jd0NkDUK2ddA8ma8";

type PanCandidateType =
	| "PROMOTION"
	| "REGULARIZATION"
	| "TERMINATION"
	| "TRANSFER"
	| "SALARY_CHANGE";

type SeededCandidate = {
	id: string;
	employeeId: string;
	firstName: string;
	lastName: string;
	email: string;
	type: PanCandidateType;
	reportToId: string | null;
};

type PanRequestContext = {
	baseDepartmentId: string;
	baseDepartmentName: string;
	basePositionId: string;
	basePositionTitle: string;
	transferDepartmentId: string;
	transferDepartmentName: string;
	promotionPositionId: string;
	promotionPositionTitle: string;
};

const PAN_REQUEST_TYPE_MAP: Record<PanCandidateType, RequestType> = {
	PROMOTION: RequestType.PROMOTION,
	SALARY_CHANGE: RequestType.SALARY_CHANGE,
	REGULARIZATION: RequestType.REGULARIZATION,
	TERMINATION: RequestType.TERMINATION,
	TRANSFER: RequestType.TRANSFER,
};

// --- Dummy Data Generators (from generalEmployeeSeeder) ---
function generateCurrentEmployer(): any {
	return {
		name: "Uzaro Solutions Technologies Inc.",
		tin: "000-123-456-789",
		rdoCode: "042",
		branchCode: "BR-001",
		address: "2F Fairway Residences #9, Capitol Hills, Matandang Balara, Quezon City, 1119",
		isVerified: true,
		metadata: {
			registrationDate: "2020-01-15",
			businessType: "Corporation",
		},
	};
}

function generatePhoneNumber(): string {
	const prefix = ["0917", "0918", "0919", "0920", "0921", "0922", "0923", "0925", "0926", "0927"];
	const selectedPrefix = prefix[Math.floor(Math.random() * prefix.length)];
	const suffix = Math.floor(1000000 + Math.random() * 9000000).toString(); // 7 digits
	return `${selectedPrefix}${suffix}`;
}

function generateAddress(): any {
	const streets = ["123 Sample Street", "456 Business Avenue", "789 Corporate Drive"];
	const barangays = ["Barangay San Miguel", "Barangay Poblacion", "Barangay Central"];
	const cities = ["Makati City", "Manila", "Quezon City"];
	const zipCodes = ["1200", "1210", "1000"];

	const street = streets[Math.floor(Math.random() * streets.length)];
	const barangay = barangays[Math.floor(Math.random() * barangays.length)];
	const city = cities[Math.floor(Math.random() * cities.length)];
	const zipCode = zipCodes[Math.floor(Math.random() * zipCodes.length)];

	return {
		street: `${street}, ${barangay}`,
		address2: "",
		city: city,
		state: "Metro Manila",
		country: "Philippines",
		postalCode: zipCode,
		zipCode: zipCode,
		houseNumber: Math.floor(Math.random() * 999).toString(),
	};
}

function createDefaultLeaveBalances(_hireDate: Date) {
	const currentYear = new Date().getFullYear();
	const periodStart = new Date(currentYear, 0, 1);
	const periodEnd = new Date(currentYear, 11, 31);

	return [
		{
			leaveType: LeaveType.VACATION,
			totalEntitled: 15,
			used: 0,
			pending: 0,
			available: 15,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
		{
			leaveType: LeaveType.SICK,
			totalEntitled: 10,
			used: 0,
			pending: 0,
			available: 10,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
	];
}

async function deleteRequestsForEmployee(employeeDbId: string): Promise<void> {
	const existingRequests = await prisma.request.findMany({
		where: {
			OR: [{ requesterId: employeeDbId }, { targetEmployeeId: employeeDbId }],
		},
		select: { id: true },
	});

	if (existingRequests.length === 0) return;

	const requestIds = existingRequests.map((request) => request.id);

	await prisma.request.updateMany({
		where: { id: { in: requestIds } },
		data: {
			currentStepExecutionId: null,
			lastCompletedStepExecutionId: null,
		},
	});

	await prisma.workflowStepExecution.deleteMany({
		where: { requestId: { in: requestIds } },
	});

	await prisma.request.deleteMany({
		where: { id: { in: requestIds } },
	});
}

async function generateRequestCode(organizationId: string): Promise<string> {
	const requestsWithCodes = await prisma.request.findMany({
		where: {
			organizationId,
			code: {
				not: null,
			},
		},
		select: {
			code: true,
		},
	});

	let maxNumber = 0;
	for (const request of requestsWithCodes) {
		if (!request.code) continue;
		const match = request.code.match(/REQ-(\d+)/);
		if (!match) continue;
		const parsed = Number.parseInt(match[1], 10);
		if (!Number.isNaN(parsed) && parsed > maxNumber) {
			maxNumber = parsed;
		}
	}

	let nextNumber = maxNumber + 1;
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = `REQ-${nextNumber.toString().padStart(5, "0")}`;
		const exists = await prisma.request.findUnique({
			where: { code },
			select: { id: true },
		});
		if (!exists) return code;
		nextNumber++;
	}

	return `REQ-${Date.now().toString().slice(-8)}`;
}

function getEffectiveDate(type: PanCandidateType): Date {
	const date = new Date();
	if (type === "REGULARIZATION") {
		date.setDate(date.getDate() + 14);
	} else if (type === "PROMOTION") {
		date.setDate(date.getDate() + 10);
	} else if (type === "TRANSFER") {
		date.setDate(date.getDate() + 7);
	} else if (type === "SALARY_CHANGE") {
		date.setDate(date.getDate() + 3);
	} else if (type === "TERMINATION") {
		date.setDate(date.getDate() + 5);
	}
	return date;
}

function buildPanMetadata(
	candidate: SeededCandidate,
	context: PanRequestContext,
	effectiveDate: Date,
): Record<string, unknown> {
	const effectiveDateIso = effectiveDate.toISOString();
	const employeeSnapshot = {
		id: candidate.id,
		employeeId: candidate.employeeId,
		firstName: candidate.firstName,
		lastName: candidate.lastName,
		department: context.baseDepartmentName,
		position: context.basePositionTitle,
	};

	if (candidate.type === "REGULARIZATION") {
		return {
			employee_snapshot: employeeSnapshot,
			performanceAssessment:
				"Employee has consistently met probationary deliverables and team standards.",
			attendanceConfirmation: "CONFIRMED",
			recommendation: "Recommended for regular employment status.",
			effectiveDate: effectiveDateIso,
			request_details: {
				action: "REGULARIZATION",
				effectiveDate: effectiveDateIso,
				notes: "Attendance and performance validated for regularization.",
			},
		};
	}

	if (candidate.type === "PROMOTION") {
		return {
			employee_snapshot: employeeSnapshot,
			newPosition: context.promotionPositionTitle,
			newPositionId: context.promotionPositionId,
			justification: "Strong delivery performance and expanded leadership responsibilities.",
			effectiveDate: effectiveDateIso,
			newSalary: "65000",
			request_details: {
				action: "PROMOTION",
				newPosition: context.promotionPositionTitle,
				newPositionId: context.promotionPositionId,
				newSalary: 65000,
				effectiveDate: effectiveDateIso,
			},
		};
	}

	if (candidate.type === "SALARY_CHANGE") {
		return {
			employee_snapshot: employeeSnapshot,
			currentSalary: 50000,
			newSalary: "57500",
			justification: "Compensation adjustment based on role scope and recent performance.",
			effectiveDate: effectiveDateIso,
			request_details: {
				action: "SALARY_CHANGE",
				currentSalary: 50000,
				newSalary: 57500,
				effectiveDate: effectiveDateIso,
			},
		};
	}

	if (candidate.type === "TRANSFER") {
		return {
			employee_snapshot: employeeSnapshot,
			newDepartment: context.transferDepartmentName,
			newDepartmentId: context.transferDepartmentId,
			newLocation: "HYBRID",
			reason: "Business realignment and cross-team support requirement.",
			effectiveDate: effectiveDateIso,
			request_details: {
				action: "TRANSFER",
				newDepartment: context.transferDepartmentName,
				newDepartmentId: context.transferDepartmentId,
				newLocation: "HYBRID",
				effectiveDate: effectiveDateIso,
			},
		};
	}

	const lastWorkingDay = new Date(effectiveDate);
	lastWorkingDay.setDate(lastWorkingDay.getDate() + 14);

	return {
		employee_snapshot: employeeSnapshot,
		type: "TERMINATION",
		terminationType: "PERFORMANCE",
		explanation: "Documented attendance and behavior concerns despite coaching interventions.",
		effectiveDate: effectiveDateIso,
		lastWorkingDay: lastWorkingDay.toISOString(),
		exitClearanceRequired: true,
		request_details: {
			action: "TERMINATION",
			terminationType: "PERFORMANCE",
			effectiveDate: effectiveDateIso,
			lastWorkingDay: lastWorkingDay.toISOString(),
			exitClearanceRequired: true,
		},
	};
}

async function createPanRequestForCandidate(
	candidate: SeededCandidate,
	organizationId: string,
	context: PanRequestContext,
	requesterId: string,
): Promise<void> {
	const requestType = PAN_REQUEST_TYPE_MAP[candidate.type];
	const workflow = await getDefaultRequestWorkflow(prisma, organizationId, requestType);

	if (!workflow) {
		console.warn(
			`Skipping PAN request for ${candidate.employeeId}. Workflow template missing for ${candidate.type}.`,
		);
		return;
	}

	const effectiveDate = getEffectiveDate(candidate.type);
	const requestCode = await generateRequestCode(organizationId);
	const metadata = buildPanMetadata(candidate, context, effectiveDate);

	const request = await prisma.$transaction(async (tx) => {
		const created = await tx.request.create({
			data: {
				organizationId,
				code: requestCode,
				type: requestType,
				startDate: effectiveDate,
				endDate: effectiveDate,
				description: `PAN ${candidate.type.toLowerCase()} request for ${candidate.employeeId}`,
				attachments: [],
				requesterId,
				targetEmployeeId: candidate.id,
				metadata: metadata as any,
			},
		});

		await createRequestStepExecutions(tx, {
			organizationId,
			requestId: created.id,
			steps: workflow.steps,
			workflowStates: workflow.states,
			workflowCode: workflow.code,
			workflowName: workflow.name,
			workflowDescription: workflow.description,
			requestType,
			requesterId,
			targetEmployeeId: candidate.id,
			reportToId: candidate.reportToId,
		});

		return created;
	});

	console.log(
		`Created PAN ${candidate.type} request: ${request.code} (${request.id}) for ${candidate.employeeId}`,
	);
}

async function ensurePanRequestContext(
	organizationId: string,
	baseDepartmentId: string,
	baseDepartmentName: string,
	basePositionId: string,
	basePositionTitle: string,
): Promise<PanRequestContext> {
	const transferDepartment = await prisma.department.upsert({
		where: {
			organizationId_code: {
				organizationId,
				code: "PAN-XFER",
			},
		},
		update: {
			name: "PAN Transfer Department",
			description: "Department used by PAN transfer seed requests.",
			isActive: true,
			isDeleted: false,
		},
		create: {
			organizationId,
			name: "PAN Transfer Department",
			code: "PAN-XFER",
			description: "Department used by PAN transfer seed requests.",
		},
	});

	const promotionPosition = await prisma.position.upsert({
		where: {
			organizationId_code: {
				organizationId,
				code: "PAN-PROMO",
			},
		},
		update: {
			title: "Senior Specialist",
			description: "Position used by PAN promotion seed requests.",
			departmentId: transferDepartment.id,
			isActive: true,
			isDeleted: false,
		},
		create: {
			organizationId,
			title: "Senior Specialist",
			code: "PAN-PROMO",
			description: "Position used by PAN promotion seed requests.",
			departmentId: transferDepartment.id,
		},
	});

	return {
		baseDepartmentId,
		baseDepartmentName,
		basePositionId,
		basePositionTitle,
		transferDepartmentId: transferDepartment.id,
		transferDepartmentName: transferDepartment.name,
		promotionPositionId: promotionPosition.id,
		promotionPositionTitle: promotionPosition.title,
	};
}

async function ensurePanManager(
	organizationId: string,
	departmentId: string,
	positionId: string,
): Promise<string> {
	const department = await prisma.department.findUnique({
		where: { id: departmentId },
		select: { managerId: true },
	});
	if (department?.managerId) {
		return department.managerId;
	}

	const email = "pan.manager@example.com";
	const existingPerson = await prisma.person.findFirst({
		where: {
			organizationId,
			contactInfo: { path: ["email"], equals: email },
		},
	});
	const person =
		existingPerson ||
		(await prisma.person.create({
			data: {
				organizationId,
				personalInfo: {
					firstName: "PAN",
					lastName: "Manager",
					dateOfBirth: new Date("1988-01-01"),
					gender: GenderType.male,
				},
				contactInfo: {
					email,
					phones: [],
					address: [],
				},
			},
		}));

	const existingEmployee = await prisma.employee.findUnique({
		where: { personId: person.id },
		select: { id: true },
	});
	const manager =
		existingEmployee ||
		(await prisma.employee.create({
			data: {
				organizationId,
				personId: person.id,
				employeeId: "PAN-MGR-001",
				role: "hris-employee-manager",
				departmentId,
				positionId,
				employmentType: EmploymentType.REGULAR,
				employmentStatus: "ACTIVE",
				employmentHireDate: new Date("2020-01-01"),
				employer: generateCurrentEmployer(),
				embeddedSchedule: defaultEmbeddedSchedule as any,
				employmentHistory: [],
				leaveBalances: createDefaultLeaveBalances(new Date("2020-01-01")),
				basicSalary: 90000,
				isManager: true,
			},
			select: { id: true },
		}));

	await prisma.department.update({
		where: { id: departmentId },
		data: { managerId: manager.id },
	});

	return manager.id;
}
// ------------------------------------------------------------

async function createUserAccount(
	firstName: string,
	lastName: string,
	email: string,
	employeeId: string,
	personId: string,
	organizationId: string,
) {
	// Generate username: firstName + employeeId
	const userName = `${firstName}${employeeId}`;

	// Password is the employeeId
	const password = employeeId;

	const defaultAvatar = "https://api.multiavatar.com/" + encodeURIComponent(userName) + ".png"; // Use dynamic avatar

	const userPayload = {
		email,
		userName,
		password,
		avatar: defaultAvatar,
		status: "active",
		loginMethod: "email",
		roleId: "69884dac71e2dc9d6ac67b65", // standard "hris-employee" role ID for standard employees used in other seeder
		organizationId,
		personId,
		metadata: {
			requirePasswordChange: true,
		},
	};

	console.log(`Creating user account for ${email}...`);

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (AUTH_TOKEN) {
			headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
		}

		const response = await fetch(`${AUTH_BASE_URL}/api/auth/register`, {
			method: "POST",
			headers: headers,
			body: JSON.stringify(userPayload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`Failed to create user account (Status: ${response.status}). Continuing with seed anyway. Error: ${errorText.substring(0, 200)}...`,
			);
			return null;
		}

		const data = await response.json();
		const userId = data.data?.id || data.userId || data?.id;
		console.log(`User account created successfully! UserID: ${userId}`);
		return userId;
	} catch (error) {
		console.error("Error creating user account, checking if we can proceed:", error);
		return null;
	}
}

async function createEmployeeWithAttendance(
	type: PanCandidateType,
	organizationId: string,
	departmentId: string,
	positionId: string,
	reportToId: string | null,
	index: number = 0,
): Promise<SeededCandidate> {
	const firstName = `Test-${type}`;
	const lastName = `Candidate-${index}`;
	const email = `test.${type.toLowerCase()}${index}@example.com`;

	// Delete existing if any
	const existingPerson = await prisma.person.findFirst({
		where: {
			contactInfo: { path: ["email"], equals: email },
		},
	});

	if (existingPerson) {
		const existingEmp = await prisma.employee.findUnique({
			where: { personId: existingPerson.id },
		});
		if (existingEmp) {
			await prisma.attendance.deleteMany({
				where: { employeeId: existingEmp.id },
			});
			await prisma.boardingProcess.deleteMany({
				where: { employeeId: existingEmp.id },
			});
			await deleteRequestsForEmployee(existingEmp.id);
			await prisma.employee.delete({ where: { id: existingEmp.id } });
		}
		await prisma.person.delete({ where: { id: existingPerson.id } });
		console.log(`Deleted existing candidate: ${email}`);
	}

	// Create Person
	const person = await prisma.person.create({
		data: {
			organizationId,
			personalInfo: {
				firstName,
				lastName,
				dateOfBirth: new Date("1995-05-15"),
				gender: GenderType.male,
			},
			contactInfo: {
				email,
				phones: [
					{
						number: generatePhoneNumber(),
						type: PhoneType.mobile,
						isPrimary: true,
					},
				],
				address: [generateAddress()],
			},
		},
	});

	// Determine Employee Params
	let hireDate = new Date();
	let employmentType: EmploymentType = EmploymentType.REGULAR;
	let probationEndDate: Date | null = null;
	const attendancesToCreate: any[] = [];

	const today = new Date();

	if (type === "PROMOTION") {
		hireDate = new Date();
		hireDate.setMonth(hireDate.getMonth() - 18); // 1.5 years ago
		employmentType = EmploymentType.REGULAR;

		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 6);
		createAttendances(attendancesToCreate, startDate, today, 0.98);
	} else if (type === "REGULARIZATION") {
		hireDate = new Date();
		hireDate.setMonth(hireDate.getMonth() - 5);
		hireDate.setDate(hireDate.getDate() - 15); // 5.5 months ago
		employmentType = EmploymentType.PROBATIONARY;

		probationEndDate = new Date(hireDate);
		probationEndDate.setMonth(probationEndDate.getMonth() + 6); // Ends in 0.5 months

		const startDate = new Date(hireDate);
		createAttendances(attendancesToCreate, startDate, today, 0.95);
	} else if (type === "TERMINATION") {
		hireDate = new Date();
		hireDate.setMonth(hireDate.getMonth() - 6);
		employmentType = EmploymentType.REGULAR;

		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 3);
		createAttendances(attendancesToCreate, startDate, today, 0.6);
	} else if (type === "TRANSFER") {
		hireDate = new Date();
		hireDate.setMonth(hireDate.getMonth() - 12);
		employmentType = EmploymentType.REGULAR;

		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 6);
		createAttendances(attendancesToCreate, startDate, today, 0.95);
	} else if (type === "SALARY_CHANGE") {
		hireDate = new Date();
		hireDate.setMonth(hireDate.getMonth() - 14);
		employmentType = EmploymentType.REGULAR;

		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 6);
		createAttendances(attendancesToCreate, startDate, today, 0.96);
	}

	const employeeId = `EMP-${type.substring(0, 3)}-${Math.floor(Math.random() * 9000) + 1000}`;

	const employee = await prisma.employee.create({
		data: {
			organizationId,
			personId: person.id,
			employeeId: employeeId,
			role: "hris-employee",
			departmentId,
			positionId,
			employmentType,
			employmentStatus: "ACTIVE",
			employmentHireDate: hireDate,
			probationEndDate,
			employer: generateCurrentEmployer(),
			reportToId,
			embeddedSchedule: defaultEmbeddedSchedule as any,
			employmentHistory: [],
			leaveBalances: createDefaultLeaveBalances(hireDate),
			basicSalary: 50000,
		},
	});

	// Create User Account
	const userId = await createUserAccount(
		firstName,
		lastName,
		email,
		employeeId,
		person.id,
		organizationId,
	);

	if (userId) {
		await prisma.employee.update({
			where: { id: employee.id },
			data: { userId: userId },
		});

		// Optional: We can also patch the user metadata here like the general seeder does,
		// but since it's just dummy data, having the record linked is the core requirement.
		console.log(`Linked User Account ${userId} to Employee ${employeeId}`);
	}

	// Bulk create attendances
	if (attendancesToCreate.length > 0) {
		const attendanceData = attendancesToCreate.map((a) => ({
			...a,
			employeeId: employee.id,
			organizationId,
		}));
		await prisma.attendance.createMany({
			data: attendanceData,
		});
	}

	console.log(
		`Created ${type} candidate: ${firstName} ${lastName} (${email}) - Employee ID: ${employeeId}`,
	);

	return {
		id: employee.id,
		employeeId: employee.employeeId,
		firstName,
		lastName,
		email,
		type,
		reportToId: employee.reportToId ?? null,
	};
}

function createAttendances(list: any[], start: Date, end: Date, presenceRate: number) {
	const cursor = new Date(start);
	while (cursor <= end) {
		const day = cursor.getDay();
		if (day !== 0 && day !== 6) {
			const isPresent = Math.random() < presenceRate;
			if (isPresent) {
				const attendanceDate = new Date(cursor);
				attendanceDate.setHours(0, 0, 0, 0);
				const timeIn = new Date(cursor);
				timeIn.setHours(9, 0, 0, 0);
				const timeOut = new Date(cursor);
				timeOut.setHours(18, 0, 0, 0);

				list.push({
					date: attendanceDate,
					timeIn,
					timeOut,
					status: "PRESENT",
				});
			}
		}
		cursor.setDate(cursor.getDate() + 1);
	}
}

async function main() {
	assertSeedDryRunNotRequested("seed:pan");
	console.log("Seeding PAN Candidates...");

	const args = process.argv.slice(2);
	const seedRegularization = args.includes("--regularization");
	const seedPromotion = args.includes("--promotion");
	const seedTermination = args.includes("--termination");
	const seedTransfer = args.includes("--transfer");
	const seedSalaryChange = args.includes("--salary-change");
	const seedAll =
		args.length === 0 ||
		args.includes("--all") ||
		(!seedRegularization &&
			!seedPromotion &&
			!seedTermination &&
			!seedTransfer &&
			!seedSalaryChange);

	let department = await prisma.department.findFirst({
		where: {
			organizationId: ORG_ID,
			isDeleted: false,
		},
	});

	if (!department) {
		console.log("No department found in target organization. Attempting to create one...");
		const emp = await prisma.employee.findFirst({
			where: { organizationId: ORG_ID, isDeleted: false },
		});
		if (emp?.organizationId) {
			department = await prisma.department.create({
				data: {
					organizationId: emp.organizationId,
					name: "PAN Seed Department",
					code: "PAN-SEED",
					description: "Department created by PAN seed script.",
				},
			});
		} else {
			const fallbackDepartment = await prisma.department.findFirst({
				where: { isDeleted: false },
			});
			if (!fallbackDepartment) {
				console.error("Database seems empty. Please run initial seed first.");
				return;
			}
			department = fallbackDepartment;
			console.warn(
				`Falling back to existing department from another organization: ${department.name} (${department.organizationId})`,
			);
		}
	}

	const organizationId = department.organizationId;

	let position = await prisma.position.findFirst({
		where: { organizationId, isDeleted: false },
	});
	if (!position) {
		position = await prisma.position.create({
			data: {
				organizationId,
				title: "PAN Seed Position",
				code: "PAN-SEED-POS",
				description: "Position created by PAN seed script.",
			},
		});
	}

	const panContext = await ensurePanRequestContext(
		organizationId,
		department.id,
		department.name,
		position.id,
		position.title,
	);
	const panManagerId = await ensurePanManager(organizationId, department.id, position.id);

	if (seedAll || seedRegularization) {
		console.log("--- Seeding REGULARIZATION candidates ---");
		for (let i = 0; i < 4; i++) {
			const candidate = await createEmployeeWithAttendance(
				"REGULARIZATION",
				organizationId,
				department.id,
				position.id,
				panManagerId,
				i + 1,
			);
			await createPanRequestForCandidate(candidate, organizationId, panContext, panManagerId);
		}
	}

	if (seedAll || seedPromotion) {
		console.log("--- Seeding PROMOTION candidates ---");
		for (let i = 0; i < 2; i++) {
			const candidate = await createEmployeeWithAttendance(
				"PROMOTION",
				organizationId,
				department.id,
				position.id,
				panManagerId,
				i + 1,
			);
			await createPanRequestForCandidate(candidate, organizationId, panContext, panManagerId);
		}
	}

	if (seedAll || seedSalaryChange) {
		console.log("--- Seeding SALARY_CHANGE candidates ---");
		for (let i = 0; i < 2; i++) {
			const candidate = await createEmployeeWithAttendance(
				"SALARY_CHANGE",
				organizationId,
				department.id,
				position.id,
				panManagerId,
				i + 1,
			);
			await createPanRequestForCandidate(candidate, organizationId, panContext, panManagerId);
		}
	}

	if (seedAll || seedTermination) {
		console.log("--- Seeding TERMINATION candidates ---");
		for (let i = 0; i < 2; i++) {
			const candidate = await createEmployeeWithAttendance(
				"TERMINATION",
				organizationId,
				department.id,
				position.id,
				panManagerId,
				i + 1,
			);
			await createPanRequestForCandidate(candidate, organizationId, panContext, panManagerId);
		}
	}

	if (seedAll || seedTransfer) {
		console.log("--- Seeding TRANSFER candidates ---");
		for (let i = 0; i < 2; i++) {
			const candidate = await createEmployeeWithAttendance(
				"TRANSFER",
				organizationId,
				department.id,
				position.id,
				panManagerId,
				i + 1,
			);
			await createPanRequestForCandidate(candidate, organizationId, panContext, panManagerId);
		}
	}

	if (seedAll) {
		// Create a test Admin User to view these records only if running full seed
		console.log("Creating Test Admin User (pan.admin@example.com)...");

		const existingAdminPerson = await prisma.person.findFirst({
			where: {
				organizationId,
				contactInfo: { path: ["email"], equals: "pan.admin@example.com" },
			},
		});

		if (!existingAdminPerson) {
			const adminPerson = await prisma.person.create({
				data: {
					organizationId,
					personalInfo: {
						firstName: "The",
						lastName: "Admin",
						dateOfBirth: new Date(),
						gender: GenderType.male,
					},
					contactInfo: { email: "pan.admin@example.com", phones: [], address: [] },
				},
			});
			// Create admin user
			await createUserAccount(
				"The",
				"Admin",
				"pan.admin@example.com",
				"ADMIN-001",
				adminPerson.id,
				organizationId,
			);
		}
	}

	console.log("Seeding complete!");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
