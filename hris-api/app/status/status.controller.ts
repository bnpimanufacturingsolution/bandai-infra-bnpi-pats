import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import {
	buildStatusPayload,
	getKnownModuleSlugs,
	getStatusTimelineBatch,
	getStatusIncidentByKey,
	getStatusIncidentHistory,
	getStatusTimeline,
} from "./status.service";

export const controller = (prisma: PrismaClient) => {
	const MAX_BATCH_MODULE_SLUGS = 200;

	const getStatus = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = await buildStatusPayload(prisma, { recordSample: false });
			res.status(payload.httpStatus).json(payload.body);
		} catch (error) {
			next(error);
		}
	};

	const getStatusIncidents = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsedLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
			const limit = Number.isFinite(parsedLimit)
				? Math.min(Math.max(parsedLimit, 1), 200)
				: 50;
			const moduleSlug =
				typeof req.query.moduleSlug === "string" && req.query.moduleSlug.trim().length > 0
					? req.query.moduleSlug.trim()
					: undefined;

			const isResolvedRaw = String(req.query.isResolved ?? "")
				.trim()
				.toLowerCase();
			const isResolved =
				isResolvedRaw === "true" ? true : isResolvedRaw === "false" ? false : undefined;

			const from =
				typeof req.query.from === "string" && req.query.from.trim().length > 0
					? req.query.from.trim()
					: undefined;
			const to =
				typeof req.query.to === "string" && req.query.to.trim().length > 0
					? req.query.to.trim()
					: undefined;

			const incidentHistory = await getStatusIncidentHistory(prisma, limit, {
				moduleSlug,
				isResolved,
				from,
				to,
			});

			res.status(200).json({
				status: "success",
				message: "Status incident history retrieved successfully",
				data: incidentHistory,
				meta: {
					limit,
					count: incidentHistory.length,
					filters: {
						moduleSlug: moduleSlug ?? null,
						isResolved: typeof isResolved === "boolean" ? isResolved : null,
						from: from ?? null,
						to: to ?? null,
					},
				},
			});
		} catch (error) {
			next(error);
		}
	};

	const getStatusIncidentDetail = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const incidentKey = String(req.params.incidentKey || "").trim();
			if (!incidentKey) {
				res.status(400).json({
					status: "error",
					message: "incidentKey is required",
				});
				return;
			}

			const incident = await getStatusIncidentByKey(prisma, incidentKey);
			if (!incident) {
				res.status(404).json({
					status: "error",
					message: "Status incident not found",
				});
				return;
			}

			res.status(200).json({
				status: "success",
				message: "Status incident retrieved successfully",
				data: incident,
			});
		} catch (error) {
			next(error);
		}
	};

	const getStatusTimelineData = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const moduleSlug =
				typeof req.query.moduleSlug === "string" && req.query.moduleSlug.trim().length > 0
					? req.query.moduleSlug.trim()
					: undefined;

			const intervalRaw =
				typeof req.query.interval === "string"
					? req.query.interval.trim().toLowerCase()
					: "";
			const interval = intervalRaw === "hour" ? "hour" : "day";

			const now = new Date();
			const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			const fromParsed =
				typeof req.query.from === "string" ? new Date(req.query.from) : defaultFrom;
			const toParsed = typeof req.query.to === "string" ? new Date(req.query.to) : now;

			const from = Number.isNaN(fromParsed.getTime()) ? defaultFrom : fromParsed;
			const to = Number.isNaN(toParsed.getTime()) ? now : toParsed;

			if (from > to) {
				res.status(400).json({
					status: "error",
					message: "`from` must be less than or equal to `to`",
				});
				return;
			}

			const timeline = await getStatusTimeline(moduleSlug, from, to, interval);

			res.status(200).json({
				status: "success",
				message: "Status timeline retrieved successfully",
				data: timeline,
				meta: {
					moduleSlug: moduleSlug ?? null,
					interval,
					from: from.toISOString(),
					to: to.toISOString(),
					count: timeline.length,
				},
			});
		} catch (error) {
			next(error);
		}
	};

	const getStatusTimelineBatchData = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const moduleSlugsRaw =
				typeof req.query.moduleSlugs === "string" ? req.query.moduleSlugs.trim() : "";
			const moduleSlugs = Array.from(
				new Set(
					moduleSlugsRaw
				.split(",")
				.map((slug) => slug.trim())
						.filter(Boolean),
				),
			);

			if (moduleSlugs.length === 0) {
				res.status(400).json({
					status: "error",
					message: "`moduleSlugs` is required (comma-separated)",
				});
				return;
			}
			if (moduleSlugs.length > MAX_BATCH_MODULE_SLUGS) {
				res.status(400).json({
					status: "error",
					message: `Too many module slugs. Maximum is ${MAX_BATCH_MODULE_SLUGS}.`,
				});
				return;
			}

			const intervalRaw =
				typeof req.query.interval === "string"
					? req.query.interval.trim().toLowerCase()
					: "";
			const interval = intervalRaw === "hour" ? "hour" : "day";

			const now = new Date();
			const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			const fromParsed =
				typeof req.query.from === "string" ? new Date(req.query.from) : defaultFrom;
			const toParsed = typeof req.query.to === "string" ? new Date(req.query.to) : now;

			const from = Number.isNaN(fromParsed.getTime()) ? defaultFrom : fromParsed;
			const to = Number.isNaN(toParsed.getTime()) ? now : toParsed;

			if (from > to) {
				res.status(400).json({
					status: "error",
					message: "`from` must be less than or equal to `to`",
				});
				return;
			}

			const knownSlugs = new Set(getKnownModuleSlugs());
			const validModuleSlugs = moduleSlugs.filter((slug) => knownSlugs.has(slug));
			if (validModuleSlugs.length === 0) {
				res.status(400).json({
					status: "error",
					message: "No valid module slugs were provided.",
				});
				return;
			}

			const data = await getStatusTimelineBatch(validModuleSlugs, from, to, interval);
			res.status(200).json({
				status: "success",
				message: "Status timeline batch retrieved successfully",
				data,
				meta: {
					moduleSlugs: validModuleSlugs,
					interval,
					from: from.toISOString(),
					to: to.toISOString(),
					count: Object.keys(data).length,
					ignoredModuleSlugs: moduleSlugs.filter((slug) => !knownSlugs.has(slug)),
				},
			});
		} catch (error) {
			next(error);
		}
	};

	return {
		getStatus,
		getStatusIncidents,
		getStatusIncidentDetail,
		getStatusTimelineData,
		getStatusTimelineBatchData,
	};
};
