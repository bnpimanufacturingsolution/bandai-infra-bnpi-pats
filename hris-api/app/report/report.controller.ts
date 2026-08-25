import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { buildErrorResponse } from "../../helper/error-handler";
import { AuthRequest } from "../../middleware/verifyToken";
import { generateBir2316PdfForEmployee } from "../../helper/bir-2316-report.helper";
import { getManpowerDistributionWorkbookReference } from "../../helper/manpower-distribution-reference.helper";
import { generatePhilhealthRf1Workbook } from "../../helper/philhealth-rf1.generator";

const isInvalidYear = (year: number) => Number.isNaN(year) || year < 1900 || year > 3000;

export const controller = (prisma: PrismaClient) => {
	const downloadBir2316 = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			const employeeId = String(req.query.employeeId || "").trim();
			const yearRaw = String(req.query.year || "").trim();
			const year = Number(yearRaw);

			if (!employeeId || !yearRaw || isInvalidYear(year)) {
				res
					.status(400)
					.json(buildErrorResponse("employeeId and year are required query parameters", 400));
				return;
			}

			if (!authReq.organizationId) {
				res.status(401).json(buildErrorResponse("Unauthorized access", 401));
				return;
			}

			const { buffer, filename } = await generateBir2316PdfForEmployee(prisma, {
				employeeId,
				year,
				organizationId: authReq.organizationId,
			});

			res.setHeader("Content-Type", "application/pdf");
			res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
			res.status(200).send(buffer);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal Server Error";

			if (message.toLowerCase().includes("employee not found")) {
				res.status(404).json(buildErrorResponse(message, 404));
				return;
			}

			if (
				message.toLowerCase().includes("template") ||
				message.toLowerCase().includes("mapping") ||
				message.toLowerCase().includes("pdf field")
			) {
				res
					.status(500)
					.json(
						buildErrorResponse(
							"BIR 2316 template or field mapping is not configured on server.",
							500,
						),
					);
				return;
			}

			res.status(500).json(buildErrorResponse(message, 500));
		}
	};

	const getManpowerDistributionReference = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const authReq = req as AuthRequest;
		try {
			if (!authReq.organizationId) {
				res.status(401).json(buildErrorResponse("Unauthorized access", 401));
				return;
			}

			const month = String(req.query.month || "2026-04").trim();
			const reference = getManpowerDistributionWorkbookReference({ month });

			res.status(200).json({
				success: true,
				message: "Manpower distribution workbook reference loaded successfully.",
				data: reference,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal Server Error";
			res.status(500).json(buildErrorResponse(message, 500));
		}
	};

	const downloadPhilhealthRf1 = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			const periodId = String(req.query.periodId || "").trim();
			if (!periodId) {
				res.status(400).json(buildErrorResponse("periodId is a required query parameter", 400));
				return;
			}

			if (!authReq.organizationId) {
				res.status(401).json(buildErrorResponse("Unauthorized access", 401));
				return;
			}

			const { buffer, filename } = await generatePhilhealthRf1Workbook(prisma, {
				organizationId: authReq.organizationId,
				periodId,
			});

			res.setHeader(
				"Content-Type",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			);
			res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
			res.status(200).send(buffer);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal Server Error";

			if (message.toLowerCase().includes("not found")) {
				res.status(404).json(buildErrorResponse(message, 404));
				return;
			}

			res.status(500).json(buildErrorResponse(message, 500));
		}
	};

	return {
		downloadBir2316,
		getManpowerDistributionReference,
		downloadPhilhealthRf1,
	};
};
