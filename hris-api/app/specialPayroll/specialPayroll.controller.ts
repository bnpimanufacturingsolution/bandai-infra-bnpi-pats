import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	SpecialPayrollCancelBodySchema,
	SpecialPayrollCreateBodySchema,
	SpecialPayrollPreviewBodySchema,
} from "../../zod/specialpayroll.zod";
import {
	buildSpecialPayrollPreview,
	cancelSpecialPayrollRun,
	createSpecialPayrollRun,
	getSpecialPayrollPayslip,
	getSpecialPayrollRun,
	listReleasedSpecialPayslipsForEmployee,
	listSpecialPayrollPayslipsForRun,
	listSpecialPayrollRuns,
	parseWorkbookRowsFromBuffer,
	releaseSpecialPayrollRun,
} from "./special-payroll.service";
import { generateSpecialPayslipPdfBuffer } from "../../helper/special-payslip-pdf.helper";
import {
	SPECIAL_PAYROLL_TEMPLATE_HEADERS,
} from "../../helper/special-payroll.helper";

const logger = getLogger().child({ module: "specialPayroll" });

/** Roles allowed to manage Special Payroll (HR run-payroll surfaces). */
const HR_ROLES = new Set([
	"hris-hr-manager",
	"hris-hr-user",
	"hris-admin",
	// Align with payroll-period policy managers / global access roles.
	"admin",
	"super_admin",
	"superadmin",
]);

/**
 * Resolve auth from verifyToken middleware fields (req.role, req.userId,
 * req.organizationId, req.metadata.employee) with optional req.user fallback.
 *
 * Bug root cause (CONFIRMED): prior implementation only read req.user.*,
 * but verifyToken attaches JWT claims on req itself — so role was always null
 * and every HR endpoint returned 403 "HR access required".
 */
export function getAuthContext(req: Request) {
	const r = req as Request & {
		role?: string | null;
		userId?: string | null;
		organizationId?: string | null;
		metadata?: { employee?: { id?: string | null } | null } | null;
		user?: {
			id?: string | null;
			userId?: string | null;
			role?: string | null;
			appRole?: string | null;
			organizationId?: string | null;
			employeeId?: string | null;
			employee?: { id?: string | null } | null;
		} | null;
	};
	const user = r.user || {};
	const organizationId = r.organizationId || user.organizationId || null;
	const userId = r.userId || user.id || user.userId || null;
	const role = r.role || user.role || user.appRole || null;
	const employeeId =
		r.metadata?.employee?.id || user.employeeId || user.employee?.id || null;
	const roleStr = role ? String(role) : null;
	return {
		organizationId: organizationId ? String(organizationId) : null,
		userId: userId ? String(userId) : null,
		role: roleStr,
		employeeId: employeeId ? String(employeeId) : null,
		isHr: roleStr ? HR_ROLES.has(roleStr) : false,
	};
}

function statusFromError(error: any): number {
	const code = Number(error?.statusCode);
	if (Number.isFinite(code) && code >= 400 && code < 600) return code;
	return 500;
}

export const controller = (prisma: PrismaClient) => {
	const previewManual = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const parsed = SpecialPayrollPreviewBodySchema.safeParse(req.body);
			if (!parsed.success) {
				res
					.status(400)
					.json(
						buildErrorResponse(
							"Invalid request",
							400,
							formatZodErrors(parsed.error.format()),
						),
					);
				return;
			}

			const result = await buildSpecialPayrollPreview(prisma, {
				organizationId: auth.organizationId,
				createdByUserId: auth.userId,
				label: parsed.data.label,
				contextPayrollPeriodId: parsed.data.contextPayrollPeriodId,
				contextPeriodCode: parsed.data.contextPeriodCode,
				rows: parsed.data.rows.map((row) => ({
					employeeNumber: row.employeeNumber,
					compensationCode: row.compensationCode,
					amount: row.amount,
					employeeName: row.employeeName,
					sourcePayDate: row.sourcePayDate,
					sourceRowNumber: row.sourceRowNumber,
				})),
			});

			res.status(200).json(buildSuccessResponse("OK", result));
		} catch (error: any) {
			logger.error(`previewManual failed: ${error?.message || error}`);
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Preview failed", status));
		}
	};

	const previewImport = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}
			if (!req.file) {
				res.status(400).json(buildErrorResponse("No .xlsx file uploaded", 400));
				return;
			}
			const original = String(req.file.originalname || "").toLowerCase();
			if (!original.endsWith(".xlsx")) {
				res
					.status(400)
					.json(buildErrorResponse("Only .xlsx workbooks are accepted", 400));
				return;
			}

			const label = String((req.body as any)?.label || "").trim();
			if (!label) {
				res.status(400).json(buildErrorResponse("Run label is required", 400));
				return;
			}

			const { rows, sourceHash } = parseWorkbookRowsFromBuffer(req.file.buffer);
			const result = await buildSpecialPayrollPreview(prisma, {
				organizationId: auth.organizationId,
				createdByUserId: auth.userId,
				label,
				contextPayrollPeriodId: (req.body as any)?.contextPayrollPeriodId || null,
				contextPeriodCode: (req.body as any)?.contextPeriodCode || null,
				rows,
				sourceFilename: req.file.originalname,
				sourceHash,
			});

			res.status(200).json(buildSuccessResponse("OK", result));
		} catch (error: any) {
			logger.error(`previewImport failed: ${error?.message || error}`);
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Import preview failed", status));
		}
	};

	const createRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const parsed = SpecialPayrollCreateBodySchema.safeParse(req.body);
			if (!parsed.success) {
				res
					.status(400)
					.json(
						buildErrorResponse(
							"Invalid request",
							400,
							formatZodErrors(parsed.error.format()),
						),
					);
				return;
			}

			const { run, reused } = await createSpecialPayrollRun(prisma, {
				organizationId: auth.organizationId,
				createdByUserId: auth.userId,
				previewId: parsed.data.previewId,
				idempotencyKey: parsed.data.idempotencyKey,
				label: parsed.data.label,
				rows: parsed.data.rows?.map((row) => ({
					employeeNumber: row.employeeNumber,
					compensationCode: row.compensationCode,
					amount: row.amount,
					employeeName: row.employeeName,
					sourcePayDate: row.sourcePayDate,
					sourceRowNumber: row.sourceRowNumber,
				})),
				contextPayrollPeriodId: parsed.data.contextPayrollPeriodId,
				contextPeriodCode: parsed.data.contextPeriodCode,
				sourceFilename: parsed.data.sourceFilename,
				sourceHash: parsed.data.sourceHash,
				sourceFingerprint: parsed.data.sourceFingerprint,
			});

			res.status(reused ? 200 : 201).json(
				buildSuccessResponse("OK", {
					run,
					reused,
					message: reused
						? "Existing Special Payroll run returned for idempotency key"
						: "Special Payroll run created",
				}),
			);
		} catch (error: any) {
			logger.error(`createRun failed: ${error?.message || error}`);
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Create failed", status));
		}
	};

	const listRuns = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const result = await listSpecialPayrollRuns(prisma, {
				organizationId: auth.organizationId,
				status: (req.query.status as string) || null,
				contextPayrollPeriodId: (req.query.contextPayrollPeriodId as string) || null,
				page: Number(req.query.page) || 1,
				limit: Number(req.query.limit) || 20,
			});

			res.status(200).json(buildSuccessResponse("OK", result));
		} catch (error: any) {
			logger.error(`listRuns failed: ${error?.message || error}`);
			const status = statusFromError(error);
			res.status(status).json(buildErrorResponse(error?.message || "List failed", status));
		}
	};

	const getRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const run = await getSpecialPayrollRun(prisma, {
				organizationId: auth.organizationId,
				runId: String(req.params.id),
			});
			res.status(200).json(buildSuccessResponse("OK", { run }));
		} catch (error: any) {
			const status = statusFromError(error);
			res.status(status).json(buildErrorResponse(error?.message || "Get failed", status));
		}
	};

	const releaseRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const io = (req.app as any)?.get?.("io") || null;
			const result = await releaseSpecialPayrollRun(prisma, {
				organizationId: auth.organizationId,
				runId: String(req.params.id),
				releasedByUserId: auth.userId,
				io,
				sourceEmployeeId: auth.employeeId,
			});

			res.status(200).json(
				buildSuccessResponse("OK", {
					run: result.run,
					alreadyReleased: result.alreadyReleased,
				}),
			);
		} catch (error: any) {
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Release failed", status));
		}
	};

	const cancelRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const parsed = SpecialPayrollCancelBodySchema.safeParse(req.body || {});
			if (!parsed.success) {
				res
					.status(400)
					.json(
						buildErrorResponse(
							"Invalid request",
							400,
							formatZodErrors(parsed.error.format()),
						),
					);
				return;
			}

			const result = await cancelSpecialPayrollRun(prisma, {
				organizationId: auth.organizationId,
				runId: String(req.params.id),
				cancelledByUserId: auth.userId,
				reason: parsed.data.reason,
			});

			res.status(200).json(
				buildSuccessResponse("OK", {
					run: result.run,
					alreadyCancelled: result.alreadyCancelled,
				}),
			);
		} catch (error: any) {
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Cancel failed", status));
		}
	};

	const listRunPayslips = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId || !auth.isHr) {
				res.status(403).json(buildErrorResponse("HR access required", 403));
				return;
			}

			const payslips = await listSpecialPayrollPayslipsForRun(prisma, {
				organizationId: auth.organizationId,
				runId: String(req.params.id),
			});
			res.status(200).json(buildSuccessResponse("OK", { payslips }));
		} catch (error: any) {
			const status = statusFromError(error);
			res.status(status).json(buildErrorResponse(error?.message || "List payslips failed", status));
		}
	};

	const getPayslip = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}

			const wantsPdf =
				String(req.query.format || "").toLowerCase() === "pdf" ||
				String(req.headers.accept || "").includes("application/pdf");

			const payslip = await getSpecialPayrollPayslip(prisma, {
				organizationId: auth.organizationId,
				payslipId: String(req.params.id),
				employeeId: auth.isHr ? null : auth.employeeId,
				allowUnreleased: auth.isHr,
			});

			if (wantsPdf) {
				const lines = Array.isArray(payslip.lineSnapshot)
					? (payslip.lineSnapshot as any[])
					: [];
				const buffer = await generateSpecialPayslipPdfBuffer({
					runLabel: payslip.run.label,
					runCode: payslip.run.runCode,
					payslipNumber: payslip.payslipNumber,
					employeeNumber: payslip.employeeNumber,
					employeeName: payslip.employeeName,
					contextPeriodName: payslip.run.contextPeriodName,
					contextStartDate: payslip.run.contextStartDate,
					contextEndDate: payslip.run.contextEndDate,
					contextPayDate: payslip.run.contextPayDate,
					grossPay: payslip.grossPay,
					netPay: payslip.netPay,
					lines: lines.map((l) => ({
						compensationCode: String(l.compensationCode || ""),
						compensationName: String(l.compensationName || ""),
						amount: Number(l.amount) || 0,
						isTaxable: Boolean(l.isTaxable),
					})),
				});
				res.setHeader("Content-Type", "application/pdf");
				res.setHeader(
					"Content-Disposition",
					`inline; filename="${payslip.payslipNumber}.pdf"`,
				);
				res.status(200).send(buffer);
				return;
			}

			res.status(200).json(buildSuccessResponse("OK", { payslip }));
		} catch (error: any) {
			const status = statusFromError(error);
			res
				.status(status)
				.json(buildErrorResponse(error?.message || "Get payslip failed", status));
		}
	};

	const listMyReleasedPayslips = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const auth = getAuthContext(req);
			if (!auth.organizationId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}
			const employeeId = (req.query.employeeId as string) || auth.employeeId;
			if (!employeeId) {
				res.status(400).json(buildErrorResponse("employeeId is required", 400));
				return;
			}
			if (!auth.isHr && auth.employeeId !== employeeId) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}

			const payslips = await listReleasedSpecialPayslipsForEmployee(prisma, {
				organizationId: auth.organizationId,
				employeeId,
			});
			res.status(200).json(buildSuccessResponse("OK", { payslips }));
		} catch (error: any) {
			const status = statusFromError(error);
			res.status(status).json(buildErrorResponse(error?.message || "List failed", status));
		}
	};

	const downloadTemplate = async (_req: Request, res: Response, _next: NextFunction) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const xlsx = require("xlsx") as typeof import("xlsx");
			const wb = xlsx.utils.book_new();
			const ws = xlsx.utils.aoa_to_sheet([
				[...SPECIAL_PAYROLL_TEMPLATE_HEADERS],
				["LLA", 250, "01466", "Sample, Employee A.", "26/07/2026"],
			]);
			xlsx.utils.book_append_sheet(wb, ws, "SpecialPayroll");
			const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
			res.setHeader(
				"Content-Type",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			);
			res.setHeader(
				"Content-Disposition",
				'attachment; filename="special-payroll-template.xlsx"',
			);
			res.status(200).send(buffer);
		} catch (error: any) {
			res.status(500).json(buildErrorResponse(error?.message || "Template failed", 500));
		}
	};

	return {
		previewManual,
		previewImport,
		createRun,
		listRuns,
		getRun,
		releaseRun,
		cancelRun,
		listRunPayslips,
		getPayslip,
		listMyReleasedPayslips,
		downloadTemplate,
	};
};
