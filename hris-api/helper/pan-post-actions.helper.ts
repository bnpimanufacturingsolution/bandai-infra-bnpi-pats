import type { Prisma, PrismaClient } from "../generated/prisma";
import { isEmployeeSelfServiceBlockedStatus } from "./employee-action-block.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const getStringArray = (value: unknown) => {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((item) => String(item || "").trim())
				.filter((item) => item.length > 0),
		),
	);
};

export async function applyPanCompletionSideEffects(
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requestId: string;
		requestType: string;
		targetEmployeeId: string;
		startDate?: Date | null;
		metadata?: Record<string, any> | null;
		now: Date;
	},
) {
	const metadata = params.metadata ?? {};
	const employeeUpdateData: any = {};
	const effectiveDate = params.startDate || params.now;
	const normalizedType = String(params.requestType || "").trim().toUpperCase();
	const requestedDirectReportTransferIds =
		normalizedType === "PROMOTION" ? getStringArray(metadata.directReportTransferIds) : [];
	const currentEmployee = await prisma.employee.findFirst({
		where: {
			id: params.targetEmployeeId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			metadata: true,
			basicSalary: true,
			departmentId: true,
			positionId: true,
			levelId: true,
			reportToId: true,
			employmentStatus: true,
			employmentType: true,
			probationEndDate: true,
			workLocation: true,
			leaveBalances: true,
		},
	});

	if (!currentEmployee) {
		return;
	}

	if (isEmployeeSelfServiceBlockedStatus(currentEmployee.employmentStatus)) {
		// Do not let later PAN post-actions mutate a record that is already final/former.
		// The terminal separation request itself is the only allowed path to set that state.
		if (normalizedType !== "TERMINATION") {
			return;
		}
	}

	if (metadata.newSalary) {
		const newSalary = parseFloat(metadata.newSalary);
		if (!Number.isNaN(newSalary)) {
			employeeUpdateData.basicSalary = newSalary;
		}
	}

	switch (normalizedType) {
		case "PROMOTION": {
			if (metadata.newPosition) {
				let positionId = metadata.newPositionId;
				if (!positionId && metadata.newPosition) {
					const position = await prisma.position.findFirst({
						where: {
							title: {
								equals: metadata.newPosition,
								mode: "insensitive",
							},
							isDeleted: false,
						},
						select: { id: true },
					});
					if (position) {
						positionId = position.id;
					}
				}
				if (positionId) {
					employeeUpdateData.positionId = positionId;
				}
			}

			if (metadata.promotionLevelId) {
				employeeUpdateData.levelId = metadata.promotionLevelId;
			} else if (metadata.promotionLevel) {
				const level = await prisma.level.findFirst({
					where: {
						name: {
							equals: metadata.promotionLevel,
							mode: "insensitive",
						},
						organizationId: params.organizationId,
						isDeleted: false,
					},
					select: { id: true },
				});
				if (level) {
					employeeUpdateData.levelId = level.id;
				}
			}
			break;
		}
		case "SALARY_CHANGE": {
			const proposedSalary = parseFloat(
				String(metadata.newSalary ?? metadata.proposedSalary ?? ""),
			);
			if (!Number.isNaN(proposedSalary)) {
				employeeUpdateData.basicSalary = proposedSalary;
			}
			break;
		}
		case "TRANSFER": {
			if (metadata.newDepartmentId || metadata.newDepartment) {
				let departmentId = metadata.newDepartmentId;
				if (!departmentId && metadata.newDepartment) {
					const department = await prisma.department.findFirst({
						where: {
							name: {
								equals: metadata.newDepartment,
								mode: "insensitive",
							},
							isDeleted: false,
						},
						select: { id: true },
					});
					if (department) {
						departmentId = department.id;
					}
				}
				if (departmentId) {
					employeeUpdateData.departmentId = departmentId;
				}
			}

			if (metadata.newPositionId || metadata.newPosition) {
				let positionId = metadata.newPositionId;
				if (!positionId && metadata.newPosition) {
					const position = await prisma.position.findFirst({
						where: {
							title: {
								equals: metadata.newPosition,
								mode: "insensitive",
							},
							isDeleted: false,
						},
						select: { id: true },
					});
					if (position) {
						positionId = position.id;
					}
				}
				if (positionId) {
					employeeUpdateData.positionId = positionId;
				}
			}

			if (metadata.newSectionId || metadata.newSection) {
				let sectionId = metadata.newSectionId;
				if (!sectionId && metadata.newSection) {
					const section = await prisma.section.findFirst({
						where: {
							name: {
								equals: metadata.newSection,
								mode: "insensitive",
							},
							isDeleted: false,
						},
						select: { id: true },
					});
					if (section) {
						sectionId = section.id;
					}
				}
				if (sectionId) {
					employeeUpdateData.sectionId = sectionId;
				}
			}

			if (metadata.newLocation) {
				const validLocations = ["ONSITE", "REMOTE", "HYBRID"];
				const normalizedLoc = String(metadata.newLocation).toUpperCase();
				if (validLocations.includes(normalizedLoc)) {
					employeeUpdateData.workLocation = normalizedLoc;
				}
			}

			if (metadata.newSupervisorId) {
				employeeUpdateData.reportToId = String(metadata.newSupervisorId);
			} else if (employeeUpdateData.departmentId) {
				const deptManager = await prisma.employee.findFirst({
					where: {
						departmentId: employeeUpdateData.departmentId,
						isDeleted: false,
						employmentStatus: "ACTIVE",
						OR: [
							{ isManager: true },
							{ isHrManager: true },
							{
								role: {
									in: [
										"hris-employee-manager",
										"hris-hr-manager",
										"hris-line-leader",
									],
								},
							},
						],
						NOT: { id: params.targetEmployeeId },
					},
					select: { id: true },
					orderBy: { createdAt: "asc" },
				});
				if (deptManager) {
					employeeUpdateData.reportToId = deptManager.id;
				}
			}
			break;
		}
		case "REGULARIZATION": {
			employeeUpdateData.employmentType = "REGULAR";
			employeeUpdateData.probationEndDate = null;
			if (effectiveDate <= params.now) {
				employeeUpdateData.employmentStatus = "ACTIVE";
			}
			break;
		}
		case "TERMINATION": {
			const separationType = String(metadata.separationType || metadata.terminationType || "")
				.trim()
				.toUpperCase();
			employeeUpdateData.employmentStatus =
				separationType === "RESIGNATION" ? "RESIGNED" : "TERMINATED";
			employeeUpdateData.employmentTerminationDate = metadata.lastWorkingDay
				? new Date(metadata.lastWorkingDay)
				: new Date(effectiveDate);
			break;
		}
		case "LEAVE_CONVERSION": {
			// Convert leave credits to cash: shrink totalEntitled by the converted
			// days and recompute available. Money handling stays in payroll.
			// Accepts leaveType|conversionLeaveType and days|conversionDays.
			const conversionLeaveType = String(
				metadata.leaveType || metadata.conversionLeaveType || "",
			).trim();
			const conversionDays = Number(metadata.days || metadata.conversionDays || 0);
			if (!conversionLeaveType || !(conversionDays > 0)) {
				break;
			}
			const conversionBalances = Array.isArray(currentEmployee.leaveBalances)
				? [...(currentEmployee.leaveBalances as Record<string, any>[])]
				: [];
			const conversionIndex = conversionBalances.findIndex(
				(balance) => balance?.leaveType === conversionLeaveType,
			);
			if (conversionIndex === -1) {
				break;
			}
			const conversionBalance = conversionBalances[conversionIndex];
			const nextTotal = Math.max(
				0,
				Number(conversionBalance.totalEntitled || 0) - conversionDays,
			);
			conversionBalances[conversionIndex] = {
				...conversionBalance,
				totalEntitled: nextTotal,
				available: Math.max(
					0,
					nextTotal -
						(Number(conversionBalance.used || 0) + Number(conversionBalance.pending || 0)),
				),
			};
			employeeUpdateData.leaveBalances = conversionBalances;
			break;
		}
		default:
			break;
	}

	const transferableDirectReports =
		requestedDirectReportTransferIds.length > 0
			? await prisma.employee.findMany({
					where: {
						id: { in: requestedDirectReportTransferIds },
						organizationId: params.organizationId,
						isDeleted: false,
						NOT: { id: params.targetEmployeeId },
					},
					select: {
						id: true,
						employeeId: true,
						reportToId: true,
					},
				})
			: [];
	const directReportTransferBefore = transferableDirectReports.map((report) => ({
		id: report.id,
		employeeId: report.employeeId,
		reportToId: report.reportToId,
	}));
	const hasDirectReportTransfers = transferableDirectReports.length > 0;

	if (Object.keys(employeeUpdateData).length === 0 && !hasDirectReportTransfers) {
		return;
	}

	const currentEmployeeMetadata =
		currentEmployee.metadata && typeof currentEmployee.metadata === "object"
			? (currentEmployee.metadata as Record<string, unknown>)
			: {};
	const panApplication = {
		requestId: params.requestId,
		requestType: normalizedType,
		appliedAt: params.now.toISOString(),
		effectiveDate: effectiveDate.toISOString(),
		status: "APPLIED_IMMEDIATELY",
		before: {
			basicSalary: currentEmployee.basicSalary,
			departmentId: currentEmployee.departmentId,
			positionId: currentEmployee.positionId,
			levelId: currentEmployee.levelId,
			reportToId: currentEmployee.reportToId,
			employmentStatus: currentEmployee.employmentStatus,
			employmentType: currentEmployee.employmentType,
			probationEndDate: currentEmployee.probationEndDate?.toISOString() ?? null,
			workLocation: currentEmployee.workLocation,
		},
		after: employeeUpdateData,
		directReportTransfers: hasDirectReportTransfers
			? {
					before: directReportTransferBefore,
					after: transferableDirectReports.map((report) => ({
						id: report.id,
						employeeId: report.employeeId,
						reportToId: params.targetEmployeeId,
					})),
				}
			: undefined,
	};

	if (Object.keys(employeeUpdateData).length > 0) {
		await prisma.employee.update({
			where: { id: params.targetEmployeeId },
			data: {
				...(employeeUpdateData as Prisma.EmployeeUpdateInput),
				metadata: {
					...currentEmployeeMetadata,
					lastPanApplication: panApplication,
					lastActionRequest: params.requestId,
					lastActionDate: params.now.toISOString(),
					lastActionType: normalizedType,
				} as Prisma.InputJsonValue,
			},
		});
	} else {
		await prisma.employee.update({
			where: { id: params.targetEmployeeId },
			data: {
				metadata: {
					...currentEmployeeMetadata,
					lastPanApplication: panApplication,
					lastActionRequest: params.requestId,
					lastActionDate: params.now.toISOString(),
					lastActionType: normalizedType,
				} as Prisma.InputJsonValue,
			},
		});
	}

	if (hasDirectReportTransfers) {
		await prisma.employee.updateMany({
			where: {
				id: { in: transferableDirectReports.map((report) => report.id) },
				organizationId: params.organizationId,
				isDeleted: false,
				NOT: { id: params.targetEmployeeId },
			},
			data: {
				reportToId: params.targetEmployeeId,
			},
		});
	}
}

