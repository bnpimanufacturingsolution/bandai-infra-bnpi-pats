import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config/config";
import { getLogger } from "../helper/logger.helper";

const logger = getLogger();

export const API_KEY_HEADER = "X-API-Key";
export const INTEGRATION_SEARCH_PATH = "/employee/search";

const parseConfiguredKeys = (): string[] =>
	(config.integrationApiKeys || "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);

const safeEqual = (a: string, b: string): boolean => {
	const bufferA = Buffer.from(a, "utf8");
	const bufferB = Buffer.from(b, "utf8");
	if (bufferA.length !== bufferB.length) {
		// Compare against self to keep constant time, then fail
		timingSafeEqual(bufferA, bufferA);
		return false;
	}
	return timingSafeEqual(bufferA, bufferB);
};

/**
 * Integration API-key middleware for machine-to-machine endpoints.
 * - Fail-closed: when no keys are configured, every request is rejected 503.
 * - Accepts `X-API-Key` header (or `Authorization: Bearer <key>` fallback).
 * - Timing-safe comparison against each configured key.
 * - When the request already carries a verified JWT context (verifyToken ran
 *   first), the API-key gate is skipped so both auth paths can coexist.
 */
export const requireIntegrationApiKey = (
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	const authContext = req as Request & { userId?: string };
	if (authContext.userId) {
		next();
		return;
	}

	const configuredKeys = parseConfiguredKeys();
	if (configuredKeys.length === 0) {
		logger.warn("Integration API key auth attempted but no INTEGRATION_API_KEYS configured");
		res.status(503).json({
			status: "error",
			message: "Integration API key authentication is not configured on this server",
			code: 503,
		});
		return;
	}

	const providedKey =
		req.get(API_KEY_HEADER) ||
		(req.headers.authorization?.startsWith("Bearer ") &&
		!req.headers.authorization.includes(".")
			? req.headers.authorization.substring(7).trim()
			: "");

	if (!providedKey) {
		res.status(401).json({
			status: "error",
			message: `Missing ${API_KEY_HEADER} header`,
			code: 401,
		});
		return;
	}

	const matched = configuredKeys.some((configuredKey) => safeEqual(providedKey, configuredKey));
	if (!matched) {
		res.status(401).json({
			status: "error",
			message: "Invalid API key",
			code: 401,
		});
		return;
	}

	next();
};
