import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";

import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	CreateEmployeePayrollSchema,
	EmployeePayrollComputationViewSchema,
	UpdateEmployeePayrollSchema,
} from "../../zod/employeepayroll.zod";
import * as XLSX from "xlsx";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	buildLegacyPayslipDocumentNumber,
	buildPayslipDocumentNumber,
	buildPayslipFilename,
	extractPayrollCorrectionEarningsRows,
	generatePayslipPdfBuffer,
} from "../../helper/payslip-pdf.helper";
import { resolveEmployeeActiveSchedule } from "../../helper/employee-schedule.helper";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import {
	publishPaymentIssueNotification,
	publishPayrollPublishedNotification,
	publishPayslipAvailableNotification,
} from "../../helper/notification-dispatch.helper";
import {
	asPayrollSourceDetails,
	formatPayrollSourcePrimaryLabel,
	getCoveredRegisterFieldsFromSourceDetails,
	groupPayrollSourceDetailsByRole,
} from "../../helper/payroll-source-display.helper";

const logger = getLogger();
const employeePayrollLogger = logger.child({ module: "employeePayroll" });
const PAYROLL_RESET_ROLES = new Set(["hris-hr-manager", "hris-hr-user", "hris-admin", "admin", "super_admin"]);
const PAYROLL_ADMIN_ROLES = new Set([
	"hris-hr-manager",
	"hris-hr-user",
	"hris-admin",
	"hris-timekeeper",
	"admin",
	"super_admin",
]);
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const toNumber = (value: unknown, fallback = 0): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const employeePayrollControllerDefaultDependencies = {
	fetchImpl: fetch,
	uploadToCloudinaryImpl: uploadToCloudinary,
	generatePayslipPdfBufferImpl: generatePayslipPdfBuffer,
	publishPayrollPublishedNotificationImpl: publishPayrollPublishedNotification,
	publishPayslipAvailableNotificationImpl: publishPayslipAvailableNotification,
	publishPaymentIssueNotificationImpl: publishPaymentIssueNotification,
};

let employeePayrollControllerDependencies = {
	...employeePayrollControllerDefaultDependencies,
};

export const __setEmployeePayrollControllerDependenciesForTests = (
	overrides: Partial<typeof employeePayrollControllerDefaultDependencies>,
) => {
	employeePayrollControllerDependencies = {
		...employeePayrollControllerDependencies,
		...overrides,
	};
};

export const __resetEmployeePayrollControllerDependenciesForTests = () => {
	employeePayrollControllerDependencies = {
		...employeePayrollControllerDefaultDependencies,
	};
};

const getActorEmployeeId = (req: Request): string | null => {
	const metadata = asRecord((req as any).metadata);
	const employee = asRecord(metadata.employee);
	return typeof employee.id === "string" && employee.id.trim() ? employee.id.trim() : null;
};

const canAccessAllPayrollRecords = (req: Request): boolean =>
	PAYROLL_ADMIN_ROLES.has(String((req as any).role || "").trim());

const ensureEmployeePayrollAccess = (
	req: Request,
	employeePayroll: { employeeId?: string | null } | null | undefined,
): string | null => {
	if (canAccessAllPayrollRecords(req)) return null;
	const actorEmployeeId = getActorEmployeeId(req);
	const ownerEmployeeId = String(employeePayroll?.employeeId || "").trim();
	if (!actorEmployeeId || !ownerEmployeeId || actorEmployeeId !== ownerEmployeeId) {
		return "You are not allowed to access this payroll record.";
	}
	return null;
};

const ensurePeriodIsReleaseReady = (payrollPeriod: { status?: string | null } | null | undefined) => {
	const status = String(payrollPeriod?.status || "").toUpperCase();
	return status === "COMPLETED" || status === "CLOSED";
};
const roundMoney = (value: unknown): number => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};
const appendEmployeePayrollComputationViewFields = (fields?: string): string | undefined => {
	if (!fields) return fields;
	const requiredFields = [
		"organizationId",
		"employeeId",
		"payrollPeriodId",
		
		"monthlySalary",
		"dailySalary",
		"numberOfDays",
		"regularOtHours",
		"basicPay",
		"absentDeduction",
		"lateDeduction",
		"earlyOutDeduction",
		"lateUndertimeAmount",
		"overtimePay",
		"nightDiffPay",
		"holidayPay",
		"leavePay",
		"obAllowance",
		"deMinimisAllowance",
		"adjustmentOtNd",
		"allowances",
		"bonuses",
		"grossPay",
		"taxAmount",
		"sssContribution",
		"philHealthContribution",
		"pagibigContribution",
		"loanDeductions",
		"sssSalaryLoan",
		"modifiedHdmf2",
		"otherDeductions",
		"totalDeductions",
		"netPay",
		"perfectAttendance",
		"mealAllowance",
		"lineLeaderAllowance",
		"totalReceivable",
		"metadata",
		"dailyBreakdown",
		"rateBreakdown",
	];
	const existing = new Set(fields.split(",").map((field) => field.trim()).filter(Boolean));
	for (const field of requiredFields) {
		existing.add(field);
	}
	return Array.from(existing).join(",");
};

export const buildEmployeePayrollComputationView = (employeePayroll: Record<string, any>) => {
	const metadata = asRecord(employeePayroll.metadata);
	const dailyBreakdown = asArray(employeePayroll.dailyBreakdown);
	const bucketDays = dailyBreakdown
		.map((day) => asRecord(day?.metadata?.bandaiApprovedBucketDayPay))
		.filter((bucket) => Object.keys(bucket).length > 0);
	const firstBucket = bucketDays[0] || {};
	const premiumHourlyRate = roundMoney(firstBucket.premiumHourlyRate);
	const premiumDailyRate = roundMoney(premiumHourlyRate * 8);
	const regularDailyRate = roundMoney(firstBucket.regularDailyRate || metadata.dailyRate);
	const bucketTotals = bucketDays.reduce(
		(current, bucket) => {
			const hours = asRecord(bucket.hours);
			for (const key of Object.keys(current.hours)) {
				current.hours[key] = roundMoney(current.hours[key] + toNumber(hours[key]));
			}
			current.overtimePay = roundMoney(current.overtimePay + toNumber(bucket.overtimePay));
			current.nightDiffPay = roundMoney(current.nightDiffPay + toNumber(bucket.nightDiffPay));
			current.holidayPay = roundMoney(current.holidayPay + toNumber(bucket.holidayPay));
			current.regularPay = roundMoney(current.regularPay + toNumber(bucket.regularPay));
			return current;
		},
		{
			hours: {
				regularDays: 0,
				regOtHrs: 0,
				rdHrs: 0,
				rdOtHrs: 0,
				spclHrs: 0,
				spclOtHrs: 0,
				rholHrs: 0,
				rholOtHrs: 0,
				regNdHrs: 0,
			} as Record<string, number>,
			regularPay: 0,
			overtimePay: 0,
			nightDiffPay: 0,
			holidayPay: 0,
		},
	);
	const row = (
		label: string,
		field: string,
		operation: "ADD" | "SUBTRACT",
		amount: unknown,
		payrollRole:
			| "INCLUDED_IN_GROSSPAY"
			| "DEDUCTED_INSIDE_GROSSPAY"
			| "DEDUCTED_AFTER_GROSSPAY"
			| "ADDED_AFTER_NETPAY",
		explanation: string,
	) => ({
		label,
		field,
		operation,
		amount: roundMoney(amount),
		payrollRole,
		explanation,
	});
	const nonZero = (item: { amount: number }) => Math.abs(item.amount) >= 0.005;
	const sourceDetails = asPayrollSourceDetails(metadata.payrollSourceDetails);
	const sourceByRole = groupPayrollSourceDetailsByRole(sourceDetails);
	const coveredRegisterFields = getCoveredRegisterFieldsFromSourceDetails(sourceDetails);
	const registerRow = (
		label: string,
		field: string,
		operation: "ADD" | "SUBTRACT",
		amount: unknown,
		payrollRole:
			| "INCLUDED_IN_GROSSPAY"
			| "DEDUCTED_INSIDE_GROSSPAY"
			| "DEDUCTED_AFTER_GROSSPAY"
			| "ADDED_AFTER_NETPAY",
		explanation: string,
	) => {
		if (coveredRegisterFields.has(field)) return null;
		return row(label, field, operation, amount, payrollRole, explanation);
	};
	const sourceRowsForRole = (
		details: typeof sourceByRole.gross,
		payrollRole:
			| "INCLUDED_IN_GROSSPAY"
			| "DEDUCTED_AFTER_GROSSPAY"
			| "ADDED_AFTER_NETPAY",
		operation: "ADD" | "SUBTRACT",
	) =>
		details.map((detail) => {
			const primary = formatPayrollSourcePrimaryLabel(detail);
			const typeName = String(detail.benefitTypeName || "").trim();
			const categoryNote =
				typeName && typeName.toLowerCase() !== primary.toLowerCase()
					? ` Category: ${typeName}.`
					: "";
			return row(
				primary,
				`source:${detail.source || "employeeBenefit"}:${detail.id || primary}`,
				operation,
				detail.amount,
				payrollRole,
				`Payroll adjustment from source details.${categoryNote}`,
			);
		});

	// Explicit next-period PayrollCorrection retro lines (metadata.payrollCorrections)
	const payrollCorrectionMetaLines = Array.isArray(metadata.payrollCorrections)
		? (metadata.payrollCorrections as Array<Record<string, unknown>>)
		: [];
	const payrollCorrectionGrossRows = payrollCorrectionMetaLines
		.map((line, index) => {
			const amount = toNumber(line?.amount);
			if (Math.abs(amount) < 0.005) return null;
			const correctionId =
				String(line?.correctionId || "").trim() || `idx-${index}`;
			const label =
				String(line?.label || "Prior-period correction").trim() ||
				"Prior-period correction";
			const sourcePeriod = String(line?.sourcePayrollPeriodName || "").trim();
			const requestId = line?.requestId != null ? String(line.requestId) : "";
			const explanation = [
				"Next-period applied PayrollCorrection retro line included in GrossPay.",
				sourcePeriod ? `Source period: ${sourcePeriod}.` : "",
				requestId ? `Request: ${requestId}.` : "",
			]
				.filter(Boolean)
				.join(" ");
			return row(
				label,
				`payrollCorrection:${correctionId}`,
				amount < 0 ? "SUBTRACT" : "ADD",
				Math.abs(amount),
				"INCLUDED_IN_GROSSPAY",
				explanation,
			);
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item));
	// Residual otherCompensation not already explained by labeled correction lines (PDF parity)
	const correctionEarningsTotal = roundMoney(
		extractPayrollCorrectionEarningsRows(metadata as any).reduce(
			(sum, item) => sum + item.amount,
			0,
		),
	);
	const otherCompensationAmount = roundMoney(employeePayroll.otherCompensation);
	const otherCompensationResidual = roundMoney(
		otherCompensationAmount - correctionEarningsTotal,
	);
	const otherCompensationRows =
		Math.abs(otherCompensationResidual) < 0.005
			? []
			: payrollCorrectionGrossRows.length === 0
				? [
						row(
							"Other Compensation",
							"otherCompensation",
							otherCompensationAmount < 0 ? "SUBTRACT" : "ADD",
							Math.abs(otherCompensationAmount),
							"INCLUDED_IN_GROSSPAY",
							"Saved other compensation register field.",
						),
					]
				: [
						row(
							"Other Compensation",
							"otherCompensation",
							otherCompensationResidual < 0 ? "SUBTRACT" : "ADD",
							Math.abs(otherCompensationResidual),
							"INCLUDED_IN_GROSSPAY",
							"Other compensation beyond labeled PayrollCorrection retro lines.",
						),
					];

	const grossPayRows = [
		row("Basic Pay", "basicPay", "ADD", employeePayroll.basicPay, "INCLUDED_IN_GROSSPAY", "Saved basic allocation for the payroll period."),
		row("Absent Deduction", "absentDeduction", "SUBTRACT", employeePayroll.absentDeduction, "DEDUCTED_INSIDE_GROSSPAY", "Saved absent amount deducted before GrossPay."),
		row("Late / early-out deduction", "lateUndertimeAmount", "SUBTRACT", employeePayroll.lateUndertimeAmount || toNumber(employeePayroll.lateDeduction) + toNumber(employeePayroll.earlyOutDeduction), "DEDUCTED_INSIDE_GROSSPAY", "Saved late, undertime, and early-out amount deducted before GrossPay."),
		row("Overtime Pay", "overtimePay", "ADD", employeePayroll.overtimePay, "INCLUDED_IN_GROSSPAY", "Approved overtime pay saved on EmployeePayroll."),
		row("Night Differential Pay", "nightDiffPay", "ADD", employeePayroll.nightDiffPay, "INCLUDED_IN_GROSSPAY", "Approved night differential pay saved on EmployeePayroll."),
		row("Holiday / rest day pay", "holidayPay", "ADD", employeePayroll.holidayPay, "INCLUDED_IN_GROSSPAY", "Approved holiday/rest-day pay saved on EmployeePayroll."),
		registerRow("OB Allowance", "obAllowance", "ADD", employeePayroll.obAllowance, "INCLUDED_IN_GROSSPAY", "Strict register field included in GrossPay."),
		registerRow("De Minimis Allowance", "deMinimisAllowance", "ADD", employeePayroll.deMinimisAllowance, "INCLUDED_IN_GROSSPAY", "Strict register field included in GrossPay."),
		registerRow("Adjustment OT/ND", "adjustmentOtNd", "ADD", employeePayroll.adjustmentOtNd, "INCLUDED_IN_GROSSPAY", "Strict register adjustment included in GrossPay."),
		...sourceRowsForRole(sourceByRole.gross, "INCLUDED_IN_GROSSPAY", "ADD"),
		...payrollCorrectionGrossRows,
		...otherCompensationRows,
	]
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
		.filter((item) => nonZero(item) || ["basicPay", "absentDeduction"].includes(item.field));
	const grossRowsTotal = roundMoney(
		grossPayRows.reduce(
			(sum, item) => sum + (item.operation === "SUBTRACT" ? -item.amount : item.amount),
			0,
		),
	);
	const hasLoanSourceDetails = sourceByRole.deduction.some(
		(detail) => String(detail.direction || "").toUpperCase() === "LOAN",
	);
	const deductionRows = [
		row("W/Tax", "taxAmount", "SUBTRACT", employeePayroll.taxAmount, "DEDUCTED_AFTER_GROSSPAY", "Source withholding tax saved on EmployeePayroll."),
		row("SSS Contribution", "sssContribution", "SUBTRACT", employeePayroll.sssContribution, "DEDUCTED_AFTER_GROSSPAY", "Saved SSS contribution."),
		row("PhilHealth Contribution", "philHealthContribution", "SUBTRACT", employeePayroll.philHealthContribution, "DEDUCTED_AFTER_GROSSPAY", "Saved PhilHealth contribution."),
		row("Pag-IBIG Contribution", "pagibigContribution", "SUBTRACT", employeePayroll.pagibigContribution, "DEDUCTED_AFTER_GROSSPAY", "Saved Pag-IBIG contribution."),
		...(hasLoanSourceDetails
			? []
			: [
					row(
						"SSS Salary Loan",
						"sssSalaryLoan",
						"SUBTRACT",
						employeePayroll.sssSalaryLoan || employeePayroll.loanDeductions,
						"DEDUCTED_AFTER_GROSSPAY",
						"Saved employee loan deduction.",
					),
				]),
		registerRow("Modified HDMF 2", "modifiedHdmf2", "SUBTRACT", employeePayroll.modifiedHdmf2 || employeePayroll.otherDeductions, "DEDUCTED_AFTER_GROSSPAY", "Saved deduction field."),
		...sourceRowsForRole(sourceByRole.deduction, "DEDUCTED_AFTER_GROSSPAY", "SUBTRACT"),
	]
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
		.filter((item) => nonZero(item) || ["sssContribution", "philHealthContribution", "pagibigContribution"].includes(item.field));
	const deductionRowsTotal = roundMoney(deductionRows.reduce((sum, item) => sum + item.amount, 0));
	const postNetRows = [
		registerRow("Perfect Attendance", "perfectAttendance", "ADD", employeePayroll.perfectAttendance, "ADDED_AFTER_NETPAY", "Saved post-net receivable field."),
		registerRow("Meal Allowance", "mealAllowance", "ADD", employeePayroll.mealAllowance, "ADDED_AFTER_NETPAY", "Saved post-net receivable field."),
		registerRow("Line Leader Allowance", "lineLeaderAllowance", "ADD", employeePayroll.lineLeaderAllowance, "ADDED_AFTER_NETPAY", "Saved post-net receivable field."),
		...sourceRowsForRole(sourceByRole.postNet, "ADDED_AFTER_NETPAY", "ADD"),
	]
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
		.filter(nonZero);
	const postNetTotal = roundMoney(postNetRows.reduce((sum, item) => sum + item.amount, 0));
	const targetGrossPay = roundMoney(employeePayroll.grossPay);
	const targetTotalDeductions = roundMoney(employeePayroll.totalDeductions);
	const targetNetPay = roundMoney(employeePayroll.netPay);
	const targetTotalReceivable = roundMoney(employeePayroll.totalReceivable ?? targetNetPay + postNetTotal);
	return {
		rateSummary: {
			method: bucketDays.length ? "BNPI_DIRECT_313_APPROVED_BUCKETS" : "TIMESHEET_PERIOD_WORK_DAYS",
			monthlySalary: roundMoney(employeePayroll.monthlySalary || metadata.monthlyRate),
			dailySalary: roundMoney(employeePayroll.dailySalary || metadata.dailyRate),
			numberOfDays: roundMoney(employeePayroll.numberOfDays || metadata.workingDays),
			regularOtHours: roundMoney(employeePayroll.regularOtHours || bucketTotals.hours.regOtHrs),
			bnpiDailyRate: premiumDailyRate,
			bnpiHourlyRate: premiumHourlyRate,
			rateNote: bucketDays.length
				? "BNPI 313 rate is rate proof for OT/absence/leave factors. GrossPay base uses saved Basic Pay."
				: "Rate summary follows saved EmployeePayroll rateBreakdown.",
		},
		grossPayRows,
		grossPayFormula: {
			rowsTotal: grossRowsTotal,
			targetGrossPay,
			gap: roundMoney(grossRowsTotal - targetGrossPay),
		},
		deductionRows,
		deductionFormula: {
			rowsTotal: deductionRowsTotal,
			targetTotalDeductions,
			gap: roundMoney(deductionRowsTotal - targetTotalDeductions),
		},
		netPayFormula: {
			grossPay: targetGrossPay,
			totalDeductions: targetTotalDeductions,
			netPay: targetNetPay,
			gap: roundMoney(targetGrossPay - targetTotalDeductions - targetNetPay),
		},
		postNetRows,
		totalReceivableFormula: {
			netPay: targetNetPay,
			postNetTotal,
			totalReceivable: targetTotalReceivable,
			gap: roundMoney(targetNetPay + postNetTotal - targetTotalReceivable),
		},
		supportingFields: {
			leavePay: roundMoney(employeePayroll.leavePay),
			allowances: roundMoney(employeePayroll.allowances),
			loanDeductions: roundMoney(employeePayroll.loanDeductions),
			otherDeductions: roundMoney(employeePayroll.otherDeductions),
		},
	};
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			employeePayrollLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			employeePayrollLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateEmployeePayrollSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			employeePayrollLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const employeePayroll = await prisma.employeePayroll.create({ data: validation.data });
			employeePayrollLogger.info(
				`EmployeePayroll created successfully: ${employeePayroll.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.CREATE_EMPLOYEEPAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_CREATED}: ${employeePayroll.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: employeePayroll.id,
				changesBefore: null,
				changesAfter: {
					id: employeePayroll.id,
					createdAt: employeePayroll.createdAt,
					updatedAt: employeePayroll.updatedAt,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_CREATED}: ${employeePayroll.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:employeePayroll:list:*");
				employeePayrollLogger.info("EmployeePayroll list cache invalidated after creation");
			} catch (cacheError) {
				employeePayrollLogger.warn(
					"Failed to invalidate cache after employeePayroll creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEPAYROLL.CREATED,
				employeePayroll,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, employeePayrollLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		employeePayrollLogger.info(
			`Getting employeePayrolls, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.EmployeePayrollWhereInput = {
				isDeleted: false,
			};
			if (!canAccessAllPayrollRecords(req)) {
				const actorEmployeeId = getActorEmployeeId(req);
				if (!actorEmployeeId) {
					res.status(403).json(
						buildErrorResponse("You are not allowed to access payroll records.", 403),
					);
					return;
				}
				whereClause.employeeId = actorEmployeeId;
			}

			const searchFields = [
				"employee.employeeId",
				"employee.person.personalInfo.firstName",
				"employee.person.personalInfo.lastName",
				"payrollPeriod.name",
			];
			if (query) {
				const searchConditions = buildSearchConditions(
					"EmployeePayroll",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("EmployeePayroll", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [employeePayrolls, total] = await Promise.all([
				document ? prisma.employeePayroll.findMany(findManyQuery) : [],
				count ? prisma.employeePayroll.count({ where: whereClause }) : 0,
			]);

			employeePayrollLogger.info(`Retrieved ${employeePayrolls.length} employeePayrolls`);
			const processedData =
				groupBy && document
					? groupDataByField(employeePayrolls, groupBy as string)
					: employeePayrolls;

			const responseData: Record<string, any> = {
				...(document && { employeePayrolls: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.GET_ALL_EMPLOYEEPAYROLL,
				description: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLLS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.EMPLOYEEPAYROLL.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;
		const selectedFields = typeof fields === "string" ? fields : undefined;

		try {
			if (!id) {
				employeePayrollLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				employeePayrollLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(`${config.SUCCESS.EMPLOYEEPAYROLL.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:employeePayroll:byId:${id}:${fields || "full"}`;
			let employeePayroll = null;

			try {
				if (redisClient.isClientConnected()) {
					employeePayroll = await redisClient.getJSON(cacheKey);
					if (employeePayroll) {
						employeePayrollLogger.info(
							`EmployeePayroll ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				employeePayrollLogger.warn(
					`Redis cache retrieval failed for employeePayroll ${id}:`,
					cacheError,
				);
			}

			if (!employeePayroll) {
				const query: Prisma.EmployeePayrollFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(
					appendEmployeePayrollComputationViewFields(selectedFields),
					{},
					"EmployeePayroll",
				);

				employeePayroll = await prisma.employeePayroll.findFirst(query);

				if (employeePayroll && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, employeePayroll, 3600);
						employeePayrollLogger.info(
							`EmployeePayroll ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						employeePayrollLogger.warn(
							`Failed to store employeePayroll ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!employeePayroll) {
				employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const accessError = ensureEmployeePayrollAccess(req, employeePayroll);
			if (accessError) {
				res.status(403).json(buildErrorResponse(accessError, 403));
				return;
			}

			employeePayrollLogger.info(
				`${config.SUCCESS.EMPLOYEEPAYROLL.RETRIEVED}: ${(employeePayroll as any).id}`,
			);
			if (employeePayroll && typeof employeePayroll === "object") {
				(employeePayroll as Record<string, any>).employeePayrollComputationView =
					EmployeePayrollComputationViewSchema.parse(
						buildEmployeePayrollComputationView(employeePayroll as Record<string, any>),
					);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.GET_EMPLOYEEPAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_RETRIEVED}: ${(employeePayroll as any).id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_DETAILS,
				},
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEPAYROLL.RETRIEVED,
				employeePayroll,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				employeePayrollLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateEmployeePayrollSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				employeePayrollLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				employeePayrollLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			employeePayrollLogger.info(`Updating employeePayroll: ${id}`);

			const existingEmployeePayroll = await prisma.employeePayroll.findFirst({
				where: { id },
			});

			if (!existingEmployeePayroll) {
				employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };
			const requestedFields = Object.keys(prismaData);
			const paidSnapshotMutableFields = new Set([
				"notes",
				"paymentMethod",
				"referenceNumber",
			]);

			if (existingEmployeePayroll.isPaid) {
				const forbiddenFields = requestedFields.filter(
					(field) =>
						field === "isPaid" ||
						field === "paidAt" ||
						field === "snapshotLockedAt" ||
						field === "snapshotLockedBy" ||
						field === "snapshotLockReason" ||
						field === "generationRunId" ||
						field === "generationKey" ||
						!paidSnapshotMutableFields.has(field),
				);
				if (forbiddenFields.length > 0) {
					res.status(409).json(
						buildErrorResponse(
							"Paid payroll snapshots are locked. Create an adjustment instead of editing payroll truth.",
							409,
							forbiddenFields.map((field) => ({
								field,
								message: "PAYROLL_SNAPSHOT_LOCKED",
							})),
						),
					);
					return;
				}
			}

			if (!existingEmployeePayroll.isPaid && prismaData.isPaid === true) {
				const now = new Date();
				prismaData.paidAt = prismaData.paidAt || now;
				prismaData.snapshotLockedAt = prismaData.snapshotLockedAt || now;
				prismaData.snapshotLockedBy =
					prismaData.snapshotLockedBy || (req as any).userId || null;
				prismaData.snapshotLockReason =
					prismaData.snapshotLockReason || "PAYROLL_MARKED_PAID";
			}

			const updatedEmployeePayroll = await prisma.employeePayroll.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:employeePayroll:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeePayroll:list:*");
				employeePayrollLogger.info(`Cache invalidated after employeePayroll ${id} update`);
			} catch (cacheError) {
				employeePayrollLogger.warn(
					"Failed to invalidate cache after employeePayroll update:",
					cacheError,
				);
			}

			employeePayrollLogger.info(
				`${config.SUCCESS.EMPLOYEEPAYROLL.UPDATED}: ${updatedEmployeePayroll.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.UPDATE_EMPLOYEEPAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_UPDATED}: ${updatedEmployeePayroll.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: updatedEmployeePayroll.id,
				changesBefore: {
					id: existingEmployeePayroll.id,
					isPaid: existingEmployeePayroll.isPaid,
					netPay: existingEmployeePayroll.netPay,
					updatedAt: existingEmployeePayroll.updatedAt,
				},
				changesAfter: {
					id: updatedEmployeePayroll.id,
					isPaid: updatedEmployeePayroll.isPaid,
					netPay: updatedEmployeePayroll.netPay,
					updatedAt: updatedEmployeePayroll.updatedAt,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_UPDATED}: ${updatedEmployeePayroll.id}`,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEPAYROLL.UPDATED,
				{ employeePayroll: updatedEmployeePayroll },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				employeePayrollLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(`${config.SUCCESS.EMPLOYEEPAYROLL.DELETED}: ${id}`);

			const existingEmployeePayroll = await prisma.employeePayroll.findFirst({
				where: { id },
			});

			if (!existingEmployeePayroll) {
				employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.employeePayroll.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:employeePayroll:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeePayroll:list:*");
				employeePayrollLogger.info(
					`Cache invalidated after employeePayroll ${id} deletion`,
				);
			} catch (cacheError) {
				employeePayrollLogger.warn(
					"Failed to invalidate cache after employeePayroll deletion:",
					cacheError,
				);
			}

			employeePayrollLogger.info(`${config.SUCCESS.EMPLOYEEPAYROLL.DELETED}: ${id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.DELETE_EMPLOYEEPAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_DELETED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: id,
				changesBefore: {
					id: existingEmployeePayroll.id,
					employeeId: existingEmployeePayroll.employeeId,
					payrollPeriodId: existingEmployeePayroll.payrollPeriodId,
				},
				changesAfter: null,
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_DELETED}: ${id}`,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEPAYROLL.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const resetGeneratedPayrolls = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const organizationId = req.organizationId;
			const role = req.role;
			const confirm = String(req.body?.confirm || "").trim();

			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID is required", 401));
				return;
			}

			if (!PAYROLL_RESET_ROLES.has(String(role || ""))) {
				res.status(403).json(
					buildErrorResponse("You are not authorized to reset generated payroll data", 403),
				);
				return;
			}

			if (confirm !== "DELETE_EMPLOYEE_PAYROLLS") {
				res.status(400).json(
					buildErrorResponse(
						"Confirmation token DELETE_EMPLOYEE_PAYROLLS is required",
						400,
					),
				);
				return;
			}

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const payrollWhere: Prisma.EmployeePayrollWhereInput = {
				organizationId,
			};
			const periodResetWhere: Prisma.PayrollPeriodWhereInput = {
				organizationId,
				isDeleted: false,
				status: { in: ["PROCESSING", "COMPLETED", "CLOSED"] },
				startDate: { lte: today },
			};

			const [employeePayrollsBefore, payrollPeriodsBefore] = await Promise.all([
				prisma.employeePayroll.count({ where: payrollWhere }),
				prisma.payrollPeriod.findMany({
					where: periodResetWhere,
					select: {
						id: true,
						name: true,
						code: true,
						status: true,
						startDate: true,
						endDate: true,
					},
					orderBy: { startDate: "desc" },
					take: 20,
				}),
			]);

			const result = await prisma.$transaction(async (tx) => {
				const payrollIds = await tx.employeePayroll.findMany({
					where: payrollWhere,
					select: { id: true },
				});
				const payrollIdList = payrollIds.map((payroll) => payroll.id);
				const soaLineItems =
					payrollIdList.length > 0
						? await tx.sOALineItem.updateMany({
								where: { employeePayrollId: { in: payrollIdList } },
								data: { employeePayrollId: null },
							})
						: { count: 0 };
				const deletedEmployeePayrolls = await tx.employeePayroll.deleteMany({
					where: payrollWhere,
				});
				const resetPayrollPeriods = await tx.payrollPeriod.updateMany({
					where: periodResetWhere,
					data: {
						status: "OPEN",
						processedAt: null,
						processedBy: null,
					},
				});

				return {
					deletedEmployeePayrolls: deletedEmployeePayrolls.count,
					resetPayrollPeriods: resetPayrollPeriods.count,
					unlinkedSoaLineItems: soaLineItems.count,
				};
			});

			try {
				await invalidateCache.byPattern("cache:employeePayroll:*");
				await invalidateCache.byPattern("cache:payrollPeriod:*");
				employeePayrollLogger.info("Payroll reset invalidated payroll caches");
			} catch (cacheError) {
				employeePayrollLogger.warn("Failed to invalidate payroll reset caches:", cacheError);
			}

			logActivity(req, {
				userId: req.userId || (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.DELETE_EMPLOYEEPAYROLL,
				description: `Reset generated employee payroll data for organization ${organizationId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_LIST,
				},
			});

			logAudit(req, {
				userId: req.userId || (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: organizationId,
				changesBefore: {
					employeePayrolls: employeePayrollsBefore,
					payrollPeriods: payrollPeriodsBefore,
				},
				changesAfter: result,
				description:
					"Debug reset deleted employee payroll rows and reopened generated payroll periods",
			});

			res.status(200).json(
				buildSuccessResponse(
					"Employee payroll data reset successfully",
					{
						...result,
						preservedFutureDraftPeriods: true,
						resetPeriodStatuses: ["PROCESSING", "COMPLETED", "CLOSED"],
					},
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`Failed to reset employee payroll data: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getBreakdown = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				employeePayrollLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(`Getting payroll breakdown for: ${id}`);

			// Get employee payroll with all necessary relations
			const employeePayroll = await prisma.employeePayroll.findFirst({
				where: { id },
				include: {
					employee: {
						include: {
							person: {
								select: {
									personalInfo: true,
								},
							},
							department: true,
							position: true,
							level: true,
						},
					},
					payrollPeriod: true,
				},
			});

			if (!employeePayroll) {
				employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const accessError = ensureEmployeePayrollAccess(req, employeePayroll);
			if (accessError) {
				res.status(403).json(buildErrorResponse(accessError, 403));
				return;
			}

			const employee = employeePayroll.employee;
			const activeSchedule = resolveEmployeeActiveSchedule(employee);
			const payrollPeriod = employeePayroll.payrollPeriod;

			// Calculate working days in payroll period
			interface AttendanceRecord {
				date: Date;
				dayOfWeek: string;
				status: "present" | "leave" | "absent" | "rest";
				timeIn?: string | null;
				timeOut?: string | null;
				hoursWorked?: number;
				isLate?: boolean;
				remarks?: string;
			}

			interface AttendanceSummary {
				totalScheduledDays: number;
				totalWorkDays: number;
				totalRestDays: number;
				daysPresent: number;
				daysAbsent: number;
				daysLate: number;
				attendanceRecords: AttendanceRecord[];
			}

			const summary: AttendanceSummary = {
				totalScheduledDays: 0,
				totalWorkDays: 0,
				totalRestDays: 0,
				daysPresent: 0,
				daysAbsent: 0,
				daysLate: 0,
				attendanceRecords: [],
			};

			const dayNames = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];

			// First pass: Count work days and rest days
			let currentDate = new Date(payrollPeriod.startDate);
			const endDate = new Date(payrollPeriod.endDate);

			while (currentDate <= endDate) {
				const dayOfWeek = currentDate.getDay();
				const dayName = dayNames[dayOfWeek];

				summary.totalScheduledDays++;

				// Find shift for this day
				const shift = activeSchedule?.shifts?.find((s: any) => {
					const label = s.label.toLowerCase();
					return (
						label.includes(dayName.toLowerCase()) ||
						label.includes(dayName.substring(0, 3).toLowerCase())
					);
				});

				if (shift) {
					if (shift.isRestDay) {
						summary.totalRestDays++;
					} else {
						summary.totalWorkDays++;
					}
				}

				currentDate.setDate(currentDate.getDate() + 1);
			}

			// Calculate daily/hourly rate
			let dailyRate = 0;
			let hourlyRate = 0;
			if (employee.payFrequency === "DAILY") {
				dailyRate = employee.basicSalary;
				hourlyRate = dailyRate / 8;
			} else {
				// For MONTHLY, SEMI_MONTHLY, etc. basicSalary IS the period salary
				dailyRate = employee.basicSalary / summary.totalWorkDays;
				hourlyRate = dailyRate / 8;
			}

			// Get attendance records for payroll period
			// Extend endDate to include the entire day (23:59:59.999)
			const endDateInclusive = new Date(payrollPeriod.endDate);
			endDateInclusive.setHours(23, 59, 59, 999);

			const attendances = await prisma.attendance.findMany({
				where: {
					employeeId: employee.id,
					isDeleted: false,
					date: {
						gte: payrollPeriod.startDate,
						lte: endDateInclusive,
					},
				},
				orderBy: {
					date: "asc",
				},
			});

			// Create attendance map for quick lookup
			const attendanceMap = new Map<string, any>();
			attendances.forEach((att) => {
				if (att.date) {
					const dateKey = att.date.toISOString().split("T")[0];
					attendanceMap.set(dateKey, att);
				}
			});

			// Build detailed attendance breakdown
			const iterDate = new Date(payrollPeriod.startDate);

			while (iterDate <= endDate) {
				const dateKey = iterDate.toISOString().split("T")[0];
				const dayOfWeek = iterDate.getDay();
				const dayName = dayNames[dayOfWeek];

				// Find shift for this day
				const shift = activeSchedule?.shifts?.find((s: any) => {
					const label = s.label.toLowerCase();
					return (
						label.includes(dayName.toLowerCase()) ||
						label.includes(dayName.substring(0, 3).toLowerCase())
					);
				});

				if (shift) {
					if (shift.isRestDay) {
						// Rest day
						summary.attendanceRecords.push({
							date: new Date(iterDate),
							dayOfWeek: dayName,
							status: "rest",
							remarks: "Scheduled rest day",
						});
					} else {
						// Work day
						const attendance = attendanceMap.get(dateKey);

						if (attendance) {
							if (attendance.status === "PRESENT") {
								// Present
								summary.daysPresent++;

								const timeIn = attendance.timeIn
									? new Date(attendance.timeIn).toLocaleTimeString("en-US", {
											hour: "2-digit",
											minute: "2-digit",
											hour12: false,
										})
									: null;
								const timeOut = attendance.timeOut
									? new Date(attendance.timeOut).toLocaleTimeString("en-US", {
											hour: "2-digit",
											minute: "2-digit",
											hour12: false,
										})
									: null;

								let hoursWorked = 0;
								if (attendance.timeIn && attendance.timeOut) {
									const diff =
										new Date(attendance.timeOut).getTime() -
										new Date(attendance.timeIn).getTime();
									hoursWorked = diff / (1000 * 60 * 60);
								}

								const isLate = attendance.isLate || false;
								if (isLate) summary.daysLate++;

								summary.attendanceRecords.push({
									date: new Date(iterDate),
									dayOfWeek: dayName,
									status: "present",
									timeIn,
									timeOut,
									hoursWorked: Math.round(hoursWorked * 100) / 100,
									isLate,
									remarks: attendance.remarks || "Present",
								});
							} else if (attendance.status === "LEAVE") {
								// On leave - don't count as absent, but not present either
								summary.attendanceRecords.push({
									date: new Date(iterDate),
									dayOfWeek: dayName,
									status: "leave",
									remarks: attendance.remarks || "On Leave",
								});
							}
						} else {
							// No attendance record - Absent
							summary.daysAbsent++;
							summary.attendanceRecords.push({
								date: new Date(iterDate),
								dayOfWeek: dayName,
								status: "absent",
								remarks: "No attendance record (Absent)",
							});
						}
					}
				}

				iterDate.setDate(iterDate.getDate() + 1);
			}

			// Calculate deductions and basic pay
			const absentDeduction = summary.daysAbsent * dailyRate;
			const estimatedBasicPay = (summary.totalWorkDays - summary.daysAbsent) * dailyRate;

			// Build response
			const breakdown = {
				employeeInfo: {
					id: employee.id,
					employeeId: employee.employeeId,
					name: `${getJsonString((employee as any).person?.personalInfo, "firstName")} ${getJsonString((employee as any).person?.personalInfo, "lastName")}`.trim(),
					department: employee.department?.name || "",
					position: employee.position?.title || "",
					level: employee.level?.name || "",
					basicSalary: employee.basicSalary,
					payFrequency: employee.payFrequency,
				},
				payrollPeriod: {
					id: payrollPeriod.id,
					name: payrollPeriod.name,
					startDate: payrollPeriod.startDate,
					endDate: payrollPeriod.endDate,
					payDate: payrollPeriod.payDate,
					status: payrollPeriod.status,
					cutoffDay: payrollPeriod.cutoffDay,
				},
				schedule: activeSchedule
					? {
							scheduleName: activeSchedule.scheduleName,
							scheduleCode: activeSchedule.scheduleCode,
							startDate: activeSchedule.startDate,
							endDate: activeSchedule.endDate,
							shifts: activeSchedule.shifts,
							gracePeriodMinutes: activeSchedule.gracePeriodMinutes || 0,
						}
					: null,
				workingDays: {
					totalScheduledDays: summary.totalScheduledDays,
					totalWorkDays: summary.totalWorkDays,
					totalRestDays: summary.totalRestDays,
				},
				rates: {
					basicSalary: employee.basicSalary,
					dailyRate: Math.round(dailyRate * 100) / 100,
					hourlyRate: Math.round(hourlyRate * 100) / 100,
				},
				attendanceSummary: {
					daysPresent: summary.daysPresent,
					daysAbsent: summary.daysAbsent,
					daysLate: summary.daysLate,
				},
				attendanceBreakdown: summary.attendanceRecords,
				calculations: {
					absentDeduction: Math.round(absentDeduction * 100) / 100,
					estimatedBasicPay: Math.round(estimatedBasicPay * 100) / 100,
				},
				payroll: {
					id: employeePayroll.id,
					basicPay: employeePayroll.basicPay,
					overtimePay: employeePayroll.overtimePay,
					nightDiffPay: employeePayroll.nightDiffPay,
					holidayPay: employeePayroll.holidayPay,
					allowances: employeePayroll.allowances,
					bonuses: employeePayroll.bonuses,
					grossPay: employeePayroll.grossPay,
					contributions: {
						sss: employeePayroll.sssContribution,
						philHealth: employeePayroll.philHealthContribution,
						pagIbig: employeePayroll.pagibigContribution,
						total:
							employeePayroll.sssContribution +
							employeePayroll.philHealthContribution +
							employeePayroll.pagibigContribution,
					},
					taxableIncome:
						employeePayroll.grossPay -
						(employeePayroll.sssContribution +
							employeePayroll.philHealthContribution +
							employeePayroll.pagibigContribution),
					withholdingTax: employeePayroll.taxAmount,
					deductions: {
						tax: employeePayroll.taxAmount,
						sss: employeePayroll.sssContribution,
						philHealth: employeePayroll.philHealthContribution,
						pagIbig: employeePayroll.pagibigContribution,
						loans: employeePayroll.loanDeductions,
						other: employeePayroll.otherDeductions,
						total: employeePayroll.totalDeductions,
					},
					netPay: employeePayroll.netPay,
					isPaid: employeePayroll.isPaid,
					paidAt: employeePayroll.paidAt,
					paymentMethod: employeePayroll.paymentMethod,
					referenceNumber: employeePayroll.referenceNumber,
					notes: employeePayroll.notes,
				},
			};

			employeePayrollLogger.info(`Payroll breakdown retrieved for: ${id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.GET_PAYROLL_BREAKDOWN,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYROLL_BREAKDOWN_RETRIEVED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.PAYROLL_BREAKDOWN,
				},
			});

			const successResponse = buildSuccessResponse(
				"Payroll breakdown retrieved successfully",
				breakdown,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`Error getting payroll breakdown for ${id}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importFromXLSX = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const file = req.file;
			if (!file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const organizationId = req.organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse(
					"Organization ID not found in authentication token",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(
				`Starting employee payroll import for organization ${organizationId}, file: ${file.originalname}`,
			);

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(`Parsed ${rawData.length} rows from Excel file`);

			const results = {
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [] as string[],
			};

			for (const row of rawData) {
				try {
					const rowData = row as any;

					// Parse columns (support both uppercase and mixed case)
					const employeeIdStr = String(
						rowData.EMPLOYEE_ID || rowData["Employee ID"] || rowData.employee_id || "",
					).trim();
					const payrollPeriodName = String(
						rowData.PAYROLL_PERIOD_NAME ||
							rowData["Payroll Period Name"] ||
							rowData.payroll_period_name ||
							rowData.PAYROLL_PERIOD ||
							"",
					).trim();

					// Required fields
					const basicPay = Number(rowData.BASIC_PAY || rowData["Basic Pay"] || 0);

					// Optional pay components
					const overtimePay = Number(
						rowData.OVERTIME_PAY || rowData["Overtime Pay"] || 0,
					);
					const nightDiffPay = Number(
						rowData.NIGHT_DIFF_PAY || rowData["Night Diff Pay"] || 0,
					);
					const holidayPay = Number(rowData.HOLIDAY_PAY || rowData["Holiday Pay"] || 0);
					const allowances = Number(rowData.ALLOWANCES || rowData.Allowances || 0);
					const bonuses = Number(rowData.BONUSES || rowData.Bonuses || 0);

					// Deductions
					const taxAmount = Number(rowData.TAX_AMOUNT || rowData["Tax Amount"] || 0);
					const sssContribution = Number(
						rowData.SSS_CONTRIBUTION || rowData["SSS Contribution"] || 0,
					);
					const philHealthContribution = Number(
						rowData.PHILHEALTH_CONTRIBUTION || rowData["PhilHealth Contribution"] || 0,
					);
					const pagibigContribution = Number(
						rowData.PAGIBIG_CONTRIBUTION || rowData["Pag-IBIG Contribution"] || 0,
					);
					const loanDeductions = Number(
						rowData.LOAN_DEDUCTIONS || rowData["Loan Deductions"] || 0,
					);
					const otherDeductions = Number(
						rowData.OTHER_DEDUCTIONS || rowData["Other Deductions"] || 0,
					);

					// Hours
					const regularHours = Number(
						rowData.REGULAR_HOURS || rowData["Regular Hours"] || 0,
					);
					const overtimeHours = Number(
						rowData.OVERTIME_HOURS || rowData["Overtime Hours"] || 0,
					);

					// Payment details
					const paymentMethod = String(
						rowData.PAYMENT_METHOD || rowData["Payment Method"] || "BANK_TRANSFER",
					).trim();
					const referenceNumber = String(
						rowData.REFERENCE_NUMBER || rowData["Reference Number"] || "",
					).trim();
					const notes = String(rowData.NOTES || rowData.Notes || "").trim();

					// Validate required fields
					if (!employeeIdStr || !payrollPeriodName) {
						results.skipped++;
						results.errors.push(
							`Row missing EMPLOYEE_ID or PAYROLL_PERIOD_NAME: ${JSON.stringify(rowData)}`,
						);
						continue;
					}

					if (basicPay <= 0) {
						results.skipped++;
						results.errors.push(
							`Invalid BASIC_PAY for employee ${employeeIdStr}: ${basicPay}`,
						);
						continue;
					}

					// Find employee by employeeId
					const employee = await prisma.employee.findFirst({
						where: {
							organizationId,
							employeeId: employeeIdStr,
							isDeleted: false,
						},
						select: {
							id: true,
						},
					});

					if (!employee) {
						results.skipped++;
						results.errors.push(`Employee not found: ${employeeIdStr}`);
						continue;
					}

					// Find or create payroll period by name
					let payrollPeriod = await prisma.payrollPeriod.findFirst({
						where: {
							name: payrollPeriodName,
							organizationId,
							isDeleted: false,
						},
					});

					// If period doesn't exist, create it
					if (!payrollPeriod) {
						const now = new Date();
						const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
						const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
						const payDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);

						payrollPeriod = await prisma.payrollPeriod.create({
							data: {
								organizationId,
								name: payrollPeriodName,
								startDate,
								endDate,
								payDate,
								status: "OPEN",
								notes: `Auto-created during payroll import`,
							},
						});

						employeePayrollLogger.info(
							`Created new payroll period: ${payrollPeriodName}`,
						);
					}

					// Calculate gross pay, deductions, and net pay
					const grossPay =
						basicPay + overtimePay + nightDiffPay + holidayPay + allowances + bonuses;
					const totalDeductions =
						taxAmount +
						sssContribution +
						philHealthContribution +
						pagibigContribution +
						loanDeductions +
						otherDeductions;
					const netPay = grossPay - totalDeductions;

					// Check if payroll already exists
					const existingPayroll = await prisma.employeePayroll.findFirst({
						where: {
							organizationId,
							employeeId: employee.id,
							payrollPeriodId: payrollPeriod.id,
							isDeleted: false,
						},
					});

					const payrollData = {
						basicPay,
						overtimePay,
						nightDiffPay,
						holidayPay,
						allowances,
						bonuses,
						taxAmount,
						sssContribution,
						philHealthContribution,
						pagibigContribution,
						loanDeductions,
						otherDeductions,
						grossPay,
						totalDeductions,
						netPay,
						regularHours,
						overtimeHours,
						paymentMethod: paymentMethod || null,
						referenceNumber: referenceNumber || null,
						notes: notes || null,
					};

					if (existingPayroll) {
						if (existingPayroll.isPaid) {
							results.skipped++;
							results.errors.push(
								`Payroll for employee ${employeeIdStr} in ${payrollPeriodName} is already paid and locked`,
							);
							continue;
						}
						// Update existing
						await prisma.employeePayroll.update({
							where: { id: existingPayroll.id },
							data: payrollData,
						});
						results.updated++;
						employeePayrollLogger.info(
							`Updated payroll for employee ${employeeIdStr} for period ${payrollPeriodName}`,
						);
					} else {
						// Create new
						await prisma.employeePayroll.create({
							data: {
								organizationId,
								employeeId: employee.id,
								payrollPeriodId: payrollPeriod.id,
								...payrollData,
								isPaid: false,
							},
						});
						results.created++;
						employeePayrollLogger.info(
							`Created payroll for employee ${employeeIdStr} for period ${payrollPeriodName}`,
						);
					}
				} catch (error) {
					results.skipped++;
					const errorMsg = `Error processing row: ${error}`;
					results.errors.push(errorMsg);
					employeePayrollLogger.error(errorMsg);
				}
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:employeePayroll:*");
				employeePayrollLogger.info("Employee payroll cache invalidated after import");
			} catch (cacheError) {
				employeePayrollLogger.warn("Failed to invalidate cache after import:", cacheError);
			}

			employeePayrollLogger.info(
				`Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
			);

			const responseData = {
				summary: {
					totalRows: rawData.length,
					processedRows: results.created + results.updated,
					created: results.created,
					updated: results.updated,
					skipped: results.skipped,
					errors: results.errors.slice(0, 10), // Limit errors to first 10
				},
			};

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.IMPORT_EMPLOYEEPAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_IMPORTED}: created ${results.created}, updated ${results.updated}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_LIST,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: organizationId,
				changesBefore: null,
				changesAfter: responseData.summary,
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.EMPLOYEEPAYROLL_IMPORTED}: ${organizationId}`,
			});

			const successResponse = buildSuccessResponse(
				"Employee payroll import completed",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeePayrollLogger.error(`Error importing employee payroll from XLSX: ${error}`);
			const errorResponse = buildErrorResponse(
				`Failed to import employee payroll: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const uploadPayslipReleaseAttachment = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		const { payrollPeriodId } = req.params;
		const organizationId = req.organizationId;
		const file = req.file;

		try {
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found in authentication token", 401));
				return;
			}

			if (!payrollPeriodId) {
				res.status(400).json(buildErrorResponse("Missing payrollPeriodId", 400));
				return;
			}

			if (!file) {
				res.status(400).json(buildErrorResponse("Attachment file is required.", 400));
				return;
			}

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					id: payrollPeriodId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
				},
			});

			if (!payrollPeriod) {
				res.status(404).json(buildErrorResponse("Payroll period not found.", 404));
				return;
			}

			const uploadResult = await employeePayrollControllerDependencies.uploadToCloudinaryImpl(
				file.buffer,
				{
					folder: `hris/payroll-periods/${payrollPeriodId}/payslip-release`,
					resourceType: "raw",
					publicId: `release-attachment-${payrollPeriodId}`,
				},
			);

			if (!uploadResult.success || !uploadResult.secureUrl) {
				res.status(500).json(
					buildErrorResponse(
						uploadResult.error || "Failed to upload payslip release attachment.",
						500,
					),
				);
				return;
			}

			await prisma.payrollPeriod.update({
				where: { id: payrollPeriodId },
				data: {
					payslipReleaseAttachmentUrl: uploadResult.secureUrl,
				},
			});

			const periodPayrolls = await prisma.employeePayroll.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					isDeleted: false,
				},
				select: { id: true },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.UPLOAD_PAYSLIP_RELEASE_ATTACHMENT,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIP_RELEASE_ATTACHMENT_UPLOADED}: ${payrollPeriodId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.PAYSLIP_RELEASE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: payrollPeriodId,
				changesBefore: null,
				changesAfter: {
					payrollPeriodId,
					updatedEmployeePayrolls: periodPayrolls.length,
					attachmentUploaded: true,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIP_RELEASE_ATTACHMENT_UPLOADED}: ${payrollPeriodId}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payslip release attachment uploaded successfully",
					{
						upload: {
							url: uploadResult.secureUrl,
							format: uploadResult.format,
							bytes: uploadResult.bytes,
						},
						payrollPeriodId,
						updatedEmployeePayrolls: periodPayrolls.length,
					},
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(
				`Failed to upload payslip release attachment for payroll period ${payrollPeriodId}: ${error}`,
			);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const publishPayrollPeriod = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		const { payrollPeriodId } = req.params;
		const organizationId = req.organizationId;
		const sourceEmployeeId = getActorEmployeeId(req);
		const publishedAt = new Date();

		try {
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found in authentication token", 401));
				return;
			}

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					id: payrollPeriodId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					status: true,
				},
			});

			if (!payrollPeriod) {
				res.status(404).json(buildErrorResponse("Payroll period not found.", 404));
				return;
			}

			if (!ensurePeriodIsReleaseReady(payrollPeriod)) {
				res.status(409).json(
					buildErrorResponse(
						"Payroll can only be published after the payroll period is completed.",
						409,
					),
				);
				return;
			}

			const employeePayrolls = await prisma.employeePayroll.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					isDeleted: false,
				},
				select: {
					id: true,
					isPublished: true,
				},
			});

			if (employeePayrolls.length === 0) {
				res.status(404).json(buildErrorResponse("No employee payroll records found for this period.", 404));
				return;
			}

			let published = 0;
			for (const employeePayroll of employeePayrolls) {
				if (employeePayroll.isPublished) continue;

				await prisma.employeePayroll.update({
					where: { id: employeePayroll.id },
					data: {
						isPublished: true,
						publishedAt,
						publishedBy: sourceEmployeeId,
					},
				});
				published++;

				try {
					await employeePayrollControllerDependencies.publishPayrollPublishedNotificationImpl(
						prisma as any,
						(req as any).io || null,
						{
							employeePayrollId: employeePayroll.id,
							sourceEmployeeId,
						},
					);
				} catch (notificationError) {
					employeePayrollLogger.warn(
						`Failed to publish payroll notification for employee payroll ${employeePayroll.id}: ${notificationError}`,
					);
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.PUBLISH_PAYROLL,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYROLL_PUBLISHED}: ${payrollPeriodId} (${published} records)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.PAYROLL_PUBLISH,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.CRITICAL,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: payrollPeriodId,
				changesBefore: {
					payrollPeriodId,
					status: payrollPeriod.status,
				},
				changesAfter: {
					payrollPeriodId,
					totalEmployeePayrolls: employeePayrolls.length,
					published,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYROLL_PUBLISHED}: ${payrollPeriodId}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payroll period published successfully",
					{
						payrollPeriodId,
						totalEmployeePayrolls: employeePayrolls.length,
						published,
					},
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`Failed to publish payroll period ${payrollPeriodId}: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const generatePayslipsForPeriod = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		const { payrollPeriodId } = req.params;
		const organizationId = req.organizationId;
		const forceRegenerate =
			String((req.query as any)?.force || (req.body as any)?.force || "")
				.trim()
				.toLowerCase() === "true" ||
			(req.query as any)?.force === true ||
			(req.body as any)?.force === true;

		try {
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found in authentication token", 401));
				return;
			}

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					id: payrollPeriodId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					name: true,
					payDate: true,
					startDate: true,
					endDate: true,
					status: true,
					payslipReleaseAttachmentUrl: true,
				},
			});

			if (!payrollPeriod) {
				res.status(404).json(buildErrorResponse("Payroll period not found.", 404));
				return;
			}

			if (!ensurePeriodIsReleaseReady(payrollPeriod)) {
				res.status(409).json(
					buildErrorResponse(
						"Payslips can only be generated after the payroll period is completed.",
						409,
					),
				);
				return;
			}

			if (!String(payrollPeriod.payslipReleaseAttachmentUrl || "").trim()) {
				res.status(409).json(
					buildErrorResponse(
						"Upload the payslip release attachment before generating payslips.",
						409,
					),
				);
				return;
			}

			const employeePayrolls = await prisma.employeePayroll.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					isDeleted: false,
				},
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
							department: {
								select: {
									name: true,
								},
							},
							position: {
								select: {
									title: true,
								},
							},
						},
					},
				},
			});

			let generated = 0;
			let skippedAlreadyGenerated = 0;
			let failed = 0;

			for (const employeePayroll of employeePayrolls as any[]) {
				const existingPayslipMetadata = asRecord(asRecord(employeePayroll.metadata).payslip);
				if (
					!forceRegenerate &&
					employeePayroll.payslipGeneratedAt &&
					String(existingPayslipMetadata.fileUrl || "").trim()
				) {
					skippedAlreadyGenerated++;
					continue;
				}

				try {
					const payslipReferenceNumber = buildPayslipDocumentNumber(
						payrollPeriod.id,
						employeePayroll.employee.id,
						{
							payrollPeriodName: payrollPeriod.name,
							employeeCode: employeePayroll.employee.employeeId,
						},
					);
					// Prefer frozen payrollSourceDetails so enrollment names (Rice Subsidy, etc.)
					// expand instead of only register totals (De Minimis Allowance).
					const payrollForPdf = {
						...employeePayroll,
						metadata: {
							...asRecord(employeePayroll.metadata),
							payrollSourceDetails: asArray(
								asRecord(employeePayroll.metadata).payrollSourceDetails,
							),
						},
					};
					const payslipBuffer =
						await employeePayrollControllerDependencies.generatePayslipPdfBufferImpl({
							employee: employeePayroll.employee,
							payrollPeriod: {
								id: payrollPeriod.id,
								name: payrollPeriod.name,
								startDate: payrollPeriod.startDate,
								endDate: payrollPeriod.endDate,
								payDate: payrollPeriod.payDate,
							},
							employeePayroll: payrollForPdf,
							payslipReferenceNumber,
							organizationName: "Bandai",
						});
					const uploadResult =
						await employeePayrollControllerDependencies.uploadToCloudinaryImpl(
							payslipBuffer,
							{
								folder: `hris/employees/${employeePayroll.employee.employeeId || employeePayroll.employee.id}/documents`,
								resourceType: "raw",
								publicId: `payslip_${employeePayroll.employee.employeeId || employeePayroll.employee.id}_${payrollPeriod.id}`,
							},
						);

					if (!uploadResult.success || !uploadResult.secureUrl) {
						throw new Error(uploadResult.error || "Failed to upload generated payslip.");
					}

					const existingDocument = await prisma.document.findFirst({
						where: {
							employeeId: employeePayroll.employee.id,
							type: "PAYSLIP",
							number: payslipReferenceNumber,
							isDeleted: false,
						},
						select: {
							id: true,
						},
					});

					const documentPayload = {
						name: `Payslip - ${payrollPeriod.name || payrollPeriod.id}`,
						type: "PAYSLIP",
						number: payslipReferenceNumber,
						issueDate: payrollPeriod.payDate || new Date(),
						expiryDate: null,
						fileUrl: uploadResult.secureUrl,
						ext: uploadResult.format || "pdf",
					};

					const documentRecord = existingDocument?.id
						? await prisma.document.update({
								where: { id: existingDocument.id },
								data: documentPayload,
								select: {
									id: true,
									number: true,
									fileUrl: true,
								},
							})
						: await prisma.document.create({
								data: {
									employeeId: employeePayroll.employee.id,
									...documentPayload,
								},
								select: {
									id: true,
									number: true,
									fileUrl: true,
								},
							});

					await prisma.employeePayroll.update({
						where: { id: employeePayroll.id },
						data: {
							payslipGeneratedAt: new Date(),
							metadata: {
								...asRecord(employeePayroll.metadata),
								payslip: {
									...existingPayslipMetadata,
									documentId: documentRecord.id,
									documentNumber: documentRecord.number,
									fileUrl: documentRecord.fileUrl,
									generatedAt: new Date().toISOString(),
								},
							} as Prisma.InputJsonValue,
						},
					});

					generated++;
				} catch (error) {
					failed++;
					employeePayrollLogger.error(
						`Failed to generate payslip for employee payroll ${employeePayroll.id}: ${error}`,
					);
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.GENERATE_PAYSLIPS,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIPS_GENERATED}: ${payrollPeriodId} (${generated} generated)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.PAYSLIP_GENERATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: payrollPeriodId,
				changesBefore: null,
				changesAfter: {
					payrollPeriodId,
					totalEmployeePayrolls: employeePayrolls.length,
					generated,
					skippedAlreadyGenerated,
					failed,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIPS_GENERATED}: ${payrollPeriodId}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payslip generation completed",
					{
						payrollPeriodId,
						totalEmployeePayrolls: employeePayrolls.length,
						generated,
						skippedMissingAttachment: 0,
						skippedAlreadyGenerated,
						failed,
					},
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`Failed to generate payslips for period ${payrollPeriodId}: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const releasePayslipsForPeriod = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		const { payrollPeriodId } = req.params;
		const organizationId = req.organizationId;
		const sourceEmployeeId = getActorEmployeeId(req);
		const releasedAt = new Date();

		try {
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found in authentication token", 401));
				return;
			}

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					id: payrollPeriodId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					status: true,
					payslipReleaseAttachmentUrl: true,
				},
			});

			if (!payrollPeriod) {
				res.status(404).json(buildErrorResponse("Payroll period not found.", 404));
				return;
			}

			if (!ensurePeriodIsReleaseReady(payrollPeriod)) {
				res.status(409).json(
					buildErrorResponse(
						"Payslips can only be released after the payroll period is completed.",
						409,
					),
				);
				return;
			}

			if (!String(payrollPeriod.payslipReleaseAttachmentUrl || "").trim()) {
				res.status(409).json(
					buildErrorResponse(
						"Payslip release attachment is required before releasing payslips.",
						409,
					),
				);
				return;
			}

			const employeePayrolls = await prisma.employeePayroll.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					isDeleted: false,
				},
			});

			for (const employeePayroll of employeePayrolls as any[]) {
				if (!employeePayroll.payslipGeneratedAt) {
					res.status(409).json(
						buildErrorResponse(
							"Cannot release payslips before payslip generation is completed.",
							409,
						),
					);
					return;
				}

				const payslipMetadata = asRecord(asRecord(employeePayroll.metadata).payslip);
				const hasDocumentMetadata = Boolean(
					String(payslipMetadata.documentId || "").trim() ||
						String(payslipMetadata.fileUrl || "").trim() ||
						String(payslipMetadata.documentNumber || "").trim(),
				);

				if (!hasDocumentMetadata) {
					res.status(409).json(
						buildErrorResponse(
							"Cannot release payslips when generated payslip document metadata is missing.",
							409,
						),
					);
					return;
				}
			}

			let released = 0;
			for (const employeePayroll of employeePayrolls as any[]) {
				if (employeePayroll.payslipReleasedAt) continue;

				await prisma.employeePayroll.update({
					where: { id: employeePayroll.id },
					data: {
						payslipReleasedAt: releasedAt,
						payslipReleasedBy: sourceEmployeeId,
					},
				});
				released++;

				try {
					await employeePayrollControllerDependencies.publishPayslipAvailableNotificationImpl(
						prisma as any,
						(req as any).io || null,
						{
							employeePayrollId: employeePayroll.id,
							sourceEmployeeId,
						},
					);
				} catch (notificationError) {
					employeePayrollLogger.warn(
						`Failed to publish payslip notification for employee payroll ${employeePayroll.id}: ${notificationError}`,
					);
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.RELEASE_PAYSLIPS,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIPS_RELEASED}: ${payrollPeriodId} (${released} records)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.PAYSLIP_RELEASE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.CRITICAL,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: payrollPeriodId,
				changesBefore: null,
				changesAfter: {
					payrollPeriodId,
					totalEmployeePayrolls: employeePayrolls.length,
					released,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIPS_RELEASED}: ${payrollPeriodId}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payslips released successfully",
					{
						payrollPeriodId,
						totalEmployeePayrolls: employeePayrolls.length,
						released,
						skippedMissingPayslip: 0,
					},
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`Failed to release payslips for period ${payrollPeriodId}: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const flagPayrollPaymentIssue = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		const { id } = req.params;
		const organizationId = req.organizationId;
		const sourceEmployeeId = getActorEmployeeId(req);
		const note =
			typeof req.body?.note === "string"
				? req.body.note.trim()
				: typeof req.body?.reason === "string"
					? req.body.reason.trim()
					: "";

		try {
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found in authentication token", 401));
				return;
			}

			const employeePayroll = await prisma.employeePayroll.findFirst({
				where: {
					id,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					hasPaymentIssue: true,
				},
			});

			if (!employeePayroll) {
				res.status(404).json(buildErrorResponse(config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND, 404));
				return;
			}

			const updatedEmployeePayroll = await prisma.employeePayroll.update({
				where: { id },
				data: {
					hasPaymentIssue: true,
					paymentIssueAt: new Date(),
					paymentIssueBy: sourceEmployeeId,
					paymentIssueNote: note || null,
				},
			});

			if (!employeePayroll.hasPaymentIssue) {
				try {
					await employeePayrollControllerDependencies.publishPaymentIssueNotificationImpl(
						prisma as any,
						(req as any).io || null,
						{
							employeePayrollId: id,
							sourceEmployeeId,
							note: note || null,
						},
					);
				} catch (notificationError) {
					employeePayrollLogger.warn(
						`Failed to publish payment issue notification for employee payroll ${id}: ${notificationError}`,
					);
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.FLAG_PAYMENT_ISSUE,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYMENT_ISSUE_FLAGGED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_DETAILS,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEPAYROLL,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEPAYROLL,
				entityId: id,
				changesBefore: {
					id: employeePayroll.id,
					hasPaymentIssue: employeePayroll.hasPaymentIssue,
				},
				changesAfter: {
					id: updatedEmployeePayroll.id,
					hasPaymentIssue: updatedEmployeePayroll.hasPaymentIssue,
					paymentIssueNote: note || null,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYMENT_ISSUE_FLAGGED}: ${id}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payroll payment issue flagged successfully",
					updatedEmployeePayroll,
					200,
				),
			);
		} catch (error) {
			employeePayrollLogger.error(`Failed to flag payment issue for employee payroll ${id}: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const generatePayslipPdf = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				employeePayrollLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeePayrollLogger.info(`Generating payslip PDF view for: ${id}`);

			// Full payroll row so PDF can expand payrollSourceDetails into enrollment lines
			// (e.g. Rice Subsidy / Travel Allowance) instead of a single register total.
			const employeePayroll = await prisma.employeePayroll.findFirst({
				where: { id, isDeleted: false },
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
							department: {
								select: {
									name: true,
								},
							},
							position: {
								select: {
									title: true,
								},
							},
						},
					},
					payrollPeriod: {
						select: {
							id: true,
							name: true,
							startDate: true,
							endDate: true,
							payDate: true,
						},
					},
				},
			});

			if (!employeePayroll) {
				employeePayrollLogger.error(`${config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEPAYROLL.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const accessError = ensureEmployeePayrollAccess(req, employeePayroll);
			if (accessError) {
				res.status(403).json(buildErrorResponse(accessError, 403));
				return;
			}

			const metadata = asRecord(employeePayroll.metadata);
			let payrollSourceDetails = asArray(metadata.payrollSourceDetails);

			// If frozen metadata has no source lines (older payrolls / partial PDF payloads),
			// rebuild display lines from enrollments active in this payroll period.
			if (payrollSourceDetails.length === 0) {
				const period = employeePayroll.payrollPeriod;
				const benefits = await (prisma as any).employeeBenefit.findMany({
					where: {
						employeeId: employeePayroll.employee.id,
						organizationId: (employeePayroll as any).organizationId,
						isDeleted: false,
						isActive: true,
						status: { in: ["ACTIVE", "APPROVED"] },
						OR: [
							{ payrollPeriodId: period.id },
							{
								payrollPeriodId: null,
								startDate: { lte: period.endDate },
								OR: [{ endDate: null }, { endDate: { gte: period.startDate } }],
							},
						],
						benefitType: {
							isDeleted: false,
							payrollDirection: { in: ["COMPENSATION", "DEDUCTION"] },
						},
					},
					select: {
						id: true,
						name: true,
						amount: true,
						totalAmount: true,
						installmentAmount: true,
						startDate: true,
						endDate: true,
						payrollPeriodId: true,
						status: true,
						isActive: true,
						isDeleted: true,
						benefitType: {
							select: {
								code: true,
								name: true,
								payrollDirection: true,
								reconciliationAction: true,
								isTaxable: true,
								isDeleted: true,
							},
						},
						installments: {
							where: {
								OR: [
									{ payrollCutOffId: period.id },
									{
										status: "SCHEDULED",
										scheduledDate: {
											gte: period.startDate,
											lte: period.endDate,
										},
									},
								],
							},
							select: {
								id: true,
								amount: true,
								scheduledDate: true,
								status: true,
								payrollCutOffId: true,
							},
						},
					},
				});

				payrollSourceDetails = (benefits as any[])
					.map((benefit) => {
						const installments = Array.isArray(benefit.installments)
							? benefit.installments
							: [];
						const installmentAmount = installments.reduce(
							(sum: number, row: any) => sum + Number(row.amount || 0),
							0,
						);
						const amount =
							installmentAmount > 0
								? installmentAmount
								: Number(
										benefit.amount ??
											benefit.installmentAmount ??
											benefit.totalAmount ??
											0,
									);
						if (!Number.isFinite(amount) || amount <= 0) return null;
						const typeName = String(benefit.benefitType?.name || "").trim();
						const enrollmentName = String(benefit.name || "").trim();
						return {
							id: benefit.id,
							source: "employeeBenefit",
							code: benefit.benefitType?.code || null,
							name: enrollmentName || typeName || "Employee benefit",
							benefitTypeName: typeName || null,
							direction: benefit.benefitType?.payrollDirection || "COMPENSATION",
							reconciliationAction:
								benefit.benefitType?.reconciliationAction || null,
							amount: Math.round((amount + Number.EPSILON) * 100) / 100,
							startDate: benefit.startDate || null,
							endDate: benefit.endDate || null,
							payrollPeriodId: benefit.payrollPeriodId || period.id,
							payrollPeriodCode: null,
						};
					})
					.filter(Boolean);
			} else {
				// Enrich enrollment labels from live EmployeeBenefit rows when details exist,
				// so payslip view shows adjustment name + type category even if frozen metadata
				// still stores only the benefit type name.
				const benefitDetailIds = payrollSourceDetails
					.filter(
						(detail) =>
							String(detail?.source || "") === "employeeBenefit" && detail?.id,
					)
					.map((detail) => String(detail.id));
				if (benefitDetailIds.length > 0) {
					const benefits = await (prisma as any).employeeBenefit.findMany({
						where: {
							id: { in: benefitDetailIds },
							isDeleted: false,
						},
						select: {
							id: true,
							name: true,
							benefitType: {
								select: {
									code: true,
									name: true,
								},
							},
						},
					});
					const benefitById = new Map<string, any>(
						(benefits as any[]).map((row) => [String(row.id), row]),
					);
					payrollSourceDetails = payrollSourceDetails.map((detail) => {
						if (String(detail?.source || "") !== "employeeBenefit") return detail;
						const benefit = benefitById.get(String(detail.id));
						if (!benefit) return detail;
						const typeName = String(benefit.benefitType?.name || "").trim();
						const enrollmentName = String(benefit.name || "").trim();
						const displayName =
							enrollmentName || typeName || String(detail.name || "").trim();
						return {
							...detail,
							name: displayName || detail.name,
							benefitTypeName: typeName || detail.benefitTypeName || null,
							code: benefit.benefitType?.code || detail.code || null,
						};
					});
				}
			}

			const payslipReferenceNumber = buildPayslipDocumentNumber(
				employeePayroll.payrollPeriod.id,
				employeePayroll.employee.id,
				{
					payrollPeriodName: employeePayroll.payrollPeriod.name,
					employeeCode: employeePayroll.employee.employeeId,
				},
			);

			const payslipBuffer =
				await employeePayrollControllerDependencies.generatePayslipPdfBufferImpl({
					employee: employeePayroll.employee as any,
					payrollPeriod: {
						id: employeePayroll.payrollPeriod.id,
						name: employeePayroll.payrollPeriod.name,
						startDate: employeePayroll.payrollPeriod.startDate,
						endDate: employeePayroll.payrollPeriod.endDate,
						payDate: employeePayroll.payrollPeriod.payDate,
					},
					employeePayroll: {
						...(employeePayroll as any),
						metadata: {
							...metadata,
							payrollSourceDetails,
						},
					},
					payslipReferenceNumber:
						String(asRecord(metadata.payslip).documentNumber || "").trim() ||
						payslipReferenceNumber,
					organizationName: "Bandai",
				});

			const downloadFileName = buildPayslipFilename(
				employeePayroll.employee.employeeId || employeePayroll.employee.id,
				employeePayroll.payrollPeriod.name || employeePayroll.payrollPeriod.id,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.ACTIONS.DOWNLOAD_PAYSLIP_PDF,
				description: `${config.ACTIVITY_LOG.EMPLOYEEPAYROLL.DESCRIPTIONS.PAYSLIP_PDF_DOWNLOADED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEPAYROLL.PAGES.EMPLOYEEPAYROLL_DETAILS,
				},
			});

			res.setHeader("Content-Type", "application/pdf");
			// inline so browser/new-tab view shows the PDF instead of forcing download
			res.setHeader("Content-Disposition", `inline; filename="${downloadFileName}"`);
			res.status(200).send(payslipBuffer);
		} catch (error) {
			employeePayrollLogger.error(`Error generating payslip PDF for ${id}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
		resetGeneratedPayrolls,
		getBreakdown,
		importFromXLSX,
		uploadPayslipReleaseAttachment,
		publishPayrollPeriod,
		generatePayslipsForPeriod,
		releasePayslipsForPeriod,
		flagPayrollPaymentIssue,
		generatePayslipPdf,
	};
};
