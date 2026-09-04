import { Request } from "express";
import { PrismaClient } from "../generated/prisma";
import { findShiftForDay } from "./schedule.helper";
import { resolveEmployeeActiveSchedule } from "./employee-schedule.helper";
import { config as appConfig } from "../config/config";

/**
 * Interface for Metrics Breakdown
 */
/**
 * Interface for Metrics Breakdown
 */
export interface AttendanceRecordSimple {
	date: string;
	status: string;
	type: "ACTUAL" | "VIRTUAL";
}

export interface EligibilityMetrics {
	attendanceRate: number;
	presentDays: number;
	absentDays: number;
	leaveDays: number;
	totalWorkingDays: number;
	lates: number; // Placeholder for now
	records: AttendanceRecordSimple[];
}

/**
 * Interface for Eligibility Candidate
 */
export interface EligibilityCandidate {
	employeeId: string;
	employeeName: string;
	avatar?: string;
	department: string;
	position: string;
	currentEmploymentStatus: string;
	hireDate: Date;
	tenureMonths: number;
	eligibleFor: "PROMOTION" | "REGULARIZATION" | "TERMINATION" | "TRANSFER";
	eligibilityReason: string;
	matchScore: number;
	id: string; // Added for deep linking
	metrics: EligibilityMetrics; // Added proof
}

/**
 * Calculate months difference between two dates
 */
function getMonthDifference(startDate: Date, endDate: Date): number {
	return (
		(endDate.getFullYear() - startDate.getFullYear()) * 12 +
		(endDate.getMonth() - startDate.getMonth())
	);
}

/**
 * Calculate attendance statistics for a specific employee
 */
async function calculateEmployeeAttendanceStats(
	prisma: PrismaClient,
	employee: any,
	startDate: Date,
	endDate: Date,
): Promise<{
	stats: { PRESENT: number; LEAVE: number; ABSENT: number };
	records: AttendanceRecordSimple[];
}> {
	let present = 0;
	let leave = 0;
	let absent = 0;
	const records: AttendanceRecordSimple[] = [];
	const activeSchedule = resolveEmployeeActiveSchedule(employee);

	if (!activeSchedule) {
		return { stats: { PRESENT: 0, LEAVE: 0, ABSENT: 0 }, records: [] };
	}

	const attendances = await prisma.attendance.findMany({
		where: {
			employeeId: employee.id,
			isDeleted: false,
			date: {
				gte: startDate,
				lte: endDate,
			},
		},
		select: {
			date: true,
			status: true,
		},
	});

	// Build O(1) date index map
	const attendanceMap = new Map<string, any>();
	for (const a of attendances) {
		if (a.date) {
			const dStr = new Date(a.date).toISOString().split("T")[0];
			attendanceMap.set(dStr, a);
		}
	}

	const cursorDate = new Date(startDate);
	cursorDate.setHours(0, 0, 0, 0);
	const endDateTime = new Date(endDate);
	endDateTime.setHours(23, 59, 59, 999);

	while (cursorDate <= endDateTime) {
		const dayOfWeek = cursorDate.getDay();

		// Check if this is a work day
		const shift = findShiftForDay(activeSchedule, dayOfWeek);

		if (!shift || shift.isRestDay) {
			cursorDate.setDate(cursorDate.getDate() + 1);
			continue;
		}

		const dateStr = cursorDate.toISOString().split("T")[0];
		const attendance = attendanceMap.get(dateStr);

		if (attendance) {
			if (attendance.status === "LEAVE") {
				leave++;
				records.push({ date: dateStr, status: "LEAVE", type: "ACTUAL" });
			} else {
				present++;
				records.push({ date: dateStr, status: attendance.status, type: "ACTUAL" });
			}
		} else {
			absent++;
			records.push({ date: dateStr, status: "ABSENT", type: "VIRTUAL" });
		}

		cursorDate.setDate(cursorDate.getDate() + 1);
	}

	return { stats: { PRESENT: present, LEAVE: leave, ABSENT: absent }, records };
}

function getEmployeeAvatar(employee: any): string | undefined {
	const photo =
		employee?.person?.personalInfo?.photo ||
		employee?.person?.photo ||
		employee?.avatar ||
		undefined;
	return typeof photo === "string" && photo.trim().length > 0 ? photo.trim() : undefined;
}

/**
 * Check if employee is eligible for Promotion
 */
async function checkPromotionEligibility(
	prisma: PrismaClient,
	employee: any,
	referenceDate: Date = new Date(),
	req?: Request,
): Promise<EligibilityCandidate | null> {
	const name = `${employee.person?.personalInfo?.firstName}`;

	// 1. Basic Status Check
	if (employee.employmentType !== "REGULAR" || employee.employmentStatus !== "ACTIVE") {
		return null;
	}

	// 2. Tenure Check
	const hireDate = new Date(employee.employmentHireDate);
	const tenureMonths = getMonthDifference(hireDate, referenceDate);

	if (tenureMonths < 12) {
		// console.log(`[Promo Fail] ${name}: Tenure ${tenureMonths} < 12`);
		return null;
	}

	// 3. Attendance Check (Last 6 months)
	const sixMonthsAgo = new Date(referenceDate);
	sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

	const { stats, records } = await calculateEmployeeAttendanceStats(
		prisma,
		employee,
		sixMonthsAgo,
		referenceDate,
	);
	const totalDays = stats.PRESENT + stats.LEAVE + stats.ABSENT;

	if (totalDays === 0) {
		return null;
	}

	const attendanceRate = ((stats.PRESENT + stats.LEAVE) / totalDays) * 100;

	// Strict criteria for promotion
	if (attendanceRate < 95) {
		return null;
	}

	console.log(
		`[Promo Candidate!] ${name}: Tenure ${tenureMonths}m, Attend ${attendanceRate.toFixed(1)}%`,
	);

	return {
		employeeId: employee.employeeId,
		id: employee.id,
		employeeName: `${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
		avatar: getEmployeeAvatar(employee),
		department: employee.department?.name || "N/A",
		position: employee.position?.title || "N/A",
		currentEmploymentStatus: employee.employmentStatus,
		hireDate: employee.employmentHireDate,
		tenureMonths,
		eligibleFor: "PROMOTION",
		eligibilityReason: `Tenure: ${tenureMonths} months, Attendance: ${attendanceRate.toFixed(1)}%`,
		matchScore: 80 + (attendanceRate > 98 ? 10 : 0) + (tenureMonths > 24 ? 10 : 0),
		metrics: {
			attendanceRate: parseFloat(attendanceRate.toFixed(1)),
			presentDays: stats.PRESENT,
			absentDays: stats.ABSENT,
			leaveDays: stats.LEAVE,
			totalWorkingDays: totalDays,
			lates: 0,
			records: records.sort((a, b) => b.date.localeCompare(a.date)), // Sort by date desc
		},
	};
}

/**
 * Check if employee is eligible for Regularization
 */
async function checkRegularizationEligibility(
	prisma: PrismaClient,
	employee: any,
	referenceDate: Date = new Date(),
	req?: Request,
): Promise<EligibilityCandidate | null> {
	const name = `${employee.person?.personalInfo?.firstName}`;

	// 1. Basic Status Check
	if (employee.employmentType !== "PROBATIONARY") {
		return null;
	}

	// 2. Timing Check
	const hireDate = new Date(employee.employmentHireDate);
	const tenureMonths = getMonthDifference(hireDate, referenceDate);

	let isApproachingProbationEnd = false;

	if (employee.probationEndDate) {
		const probEndDate = new Date(employee.probationEndDate);
		const daysDiff = (probEndDate.getTime() - referenceDate.getTime()) / (1000 * 3600 * 24);
		if (daysDiff <= 30 && daysDiff >= -30) {
			isApproachingProbationEnd = true;
		}
	} else if (tenureMonths >= 5) {
		isApproachingProbationEnd = true;
	}

	if (!isApproachingProbationEnd) {
		return null;
	}

	// 3. Attendance Check
	const { stats, records } = await calculateEmployeeAttendanceStats(
		prisma,
		employee,
		hireDate,
		referenceDate,
	);
	const totalDays = stats.PRESENT + stats.LEAVE + stats.ABSENT;

	if (totalDays < 20) {
		// Require some history
		return null;
	}

	const attendanceRate = ((stats.PRESENT + stats.LEAVE) / totalDays) * 100;

	if (attendanceRate < 90) {
		return null;
	}

	console.log(
		`[Reg Candidate!] ${name}: Tenure ${tenureMonths}m, Attend ${attendanceRate.toFixed(1)}%`,
	);

	return {
		employeeId: employee.employeeId,
		id: employee.id,
		employeeName: `${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
		avatar: getEmployeeAvatar(employee),
		department: employee.department?.name || "N/A",
		position: employee.position?.title || "N/A",
		currentEmploymentStatus: employee.employmentStatus,
		hireDate: employee.employmentHireDate,
		tenureMonths,
		eligibleFor: "REGULARIZATION",
		eligibilityReason: `Approaching probation end (${tenureMonths}m tenure), Attendance: ${attendanceRate.toFixed(1)}%`,
		matchScore: 90,
		metrics: {
			attendanceRate: parseFloat(attendanceRate.toFixed(1)),
			presentDays: stats.PRESENT,
			absentDays: stats.ABSENT,
			leaveDays: stats.LEAVE,
			totalWorkingDays: totalDays,
			lates: 0,
			records: records.sort((a, b) => b.date.localeCompare(a.date)),
		},
	};
}

/**
 * Check if employee is candidate for Termination
 */
async function checkTerminationEligibility(
	prisma: PrismaClient,
	employee: any,
	referenceDate: Date = new Date(),
	req?: Request,
): Promise<EligibilityCandidate | null> {
	const name = `${employee.person?.personalInfo?.firstName}`;

	if (employee.employmentStatus !== "ACTIVE") {
		return null;
	}

	// 1. Recent Attendance Check (Last 3 months)
	const threeMonthsAgo = new Date(referenceDate);
	threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

	const { stats, records } = await calculateEmployeeAttendanceStats(
		prisma,
		employee,
		threeMonthsAgo,
		referenceDate,
	);
	const totalDays = stats.PRESENT + stats.LEAVE + stats.ABSENT;

	if (totalDays < 10) return null;

	const absenceRate = (stats.ABSENT / totalDays) * 100;

	// Criteria: More than 20% absence rate OR more than 5 absences in 3 months
	if (stats.ABSENT >= 5 || absenceRate > 20) {
		console.log(
			`[Term Candidate!] ${name}: Absences ${stats.ABSENT}, Rate ${absenceRate.toFixed(1)}%`,
		);

		const tenureMonths = getMonthDifference(
			new Date(employee.employmentHireDate),
			referenceDate,
		);

		return {
			employeeId: employee.employeeId,
			id: employee.id,
			employeeName: `${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
			avatar: getEmployeeAvatar(employee),
			department: employee.department?.name || "N/A",
			position: employee.position?.title || "N/A",
			currentEmploymentStatus: employee.employmentStatus,
			hireDate: employee.employmentHireDate,
			tenureMonths,
			eligibleFor: "TERMINATION",
			eligibilityReason: `High Absence Rate: ${absenceRate.toFixed(1)}% (${stats.ABSENT} days absent in 3 months)`,
			matchScore: 70 + (absenceRate > 30 ? 20 : 0),
			metrics: {
				attendanceRate: parseFloat((100 - absenceRate).toFixed(1)),
				presentDays: stats.PRESENT,
				absentDays: stats.ABSENT,
				leaveDays: stats.LEAVE,
				totalWorkingDays: totalDays,
				lates: 0,
				records: records.sort((a, b) => b.date.localeCompare(a.date)),
			},
		};
	}

	return null;
}

/**
 * Main function to get all candidates
 */
export async function getEligibilityCandidates(
	prisma: PrismaClient,
	organizationId: string,
	req?: Request,
): Promise<EligibilityCandidate[]> {
	const referenceDate = new Date();

	// 1. Fetch Transfer requests in a single batch query
	// Only include PENDING transfers (not COMPLETED - those are already done)
	const transferRequests = await prisma.request.findMany({
		where: {
			organizationId,
			type: "TRANSFER",
			isDeleted: false,
			currentWorkflowStateKey: {
				in: ["OPEN", "SUBMITTED", "FOR_APPROVAL", "APPROVED"],
			},
		},
		include: {
			targetEmployee: {
				include: {
					person: { select: { personalInfo: true } },
					department: true,
					position: true,
				},
			},
		},
		orderBy: { createdAt: "desc" },
	});

	const transferCandidates: EligibilityCandidate[] = [];
	const seenTransferEmployeeIds = new Set<string>();

	for (const tr of transferRequests) {
		const emp = tr.targetEmployee;
		if (!emp || seenTransferEmployeeIds.has(emp.id)) continue;
		seenTransferEmployeeIds.add(emp.id);

		const metadata = (tr.metadata as any) || {};
		const newDept = metadata.newDepartment || "New Department";
		const state = String(tr.currentWorkflowStateKey || "PENDING");
		const hireDate = emp.employmentHireDate || emp.createdAt;
		const name =
			`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim() ||
			emp.employeeId ||
			"Employee";

		transferCandidates.push({
			id: emp.id,
			employeeId: emp.employeeId || "",
			employeeName: name,
			avatar: emp.person?.personalInfo?.photo || undefined,
			department: emp.department?.name || "N/A",
			position: emp.position?.title || "N/A",
			currentEmploymentStatus: emp.employmentStatus,
			hireDate: new Date(hireDate),
			tenureMonths: getMonthDifference(new Date(hireDate), referenceDate),
			eligibleFor: "TRANSFER",
			eligibilityReason: `Transfer (${state}): ${tr.description || `Reassignment to ${newDept}`}`,
			matchScore: 85,
			metrics: {
				attendanceRate: 100,
				presentDays: 0,
				absentDays: 0,
				leaveDays: 0,
				totalWorkingDays: 0,
				lates: 0,
				records: [],
			},
		});
	}

	// 2. Fetch all active employees (excluding those already in transfer)
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			employmentStatus: "ACTIVE",
			NOT: { id: { in: Array.from(seenTransferEmployeeIds) } },
		},
		include: {
			person: {
				select: {
					personalInfo: true,
				},
			},
			department: true,
			position: true,
		},
	});

	// 3. Evaluate employees in parallel
	const evaluationResults = await Promise.all(
		employees.map(async (emp) => {
			const termCandidate = await checkTerminationEligibility(prisma, emp, referenceDate, req);
			if (termCandidate) return termCandidate;

			const regCandidate = await checkRegularizationEligibility(prisma, emp, referenceDate, req);
			if (regCandidate) return regCandidate;

			const promoCandidate = await checkPromotionEligibility(prisma, emp, referenceDate, req);
			if (promoCandidate) return promoCandidate;

			return null;
		}),
	);

	const otherCandidates = evaluationResults.filter((c): c is EligibilityCandidate => c !== null);
	return [...transferCandidates, ...otherCandidates];
}
