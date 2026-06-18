import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/config";

// Centralized rate limiting configuration
const RATE_LIMIT_CONFIG = {
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 1200,
	delayAfter: 600,
	delayMs: 75,
	maxDelayMs: 3000,
};

const getRateLimitKey = (req: Request) => {
	const authHeader = req.headers.authorization || "";
	const tokenFragment = authHeader.startsWith("Bearer ")
		? authHeader.slice(7, 31)
		: "anonymous";
	return `${req.ip || "unknown"}:${tokenFragment}`;
};

const baseRateLimiter = rateLimit({
	windowMs: RATE_LIMIT_CONFIG.windowMs,
	max: RATE_LIMIT_CONFIG.max,
	message: {
		error: "Too many requests",
		message: "Rate limit exceeded. Please try again later.",
		retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000),
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => getRateLimitKey(req),
	skip: (req: Request) =>
		req.path === "/" || req.path === "/health" || req.path === "/health/redis",
	handler: (req: Request, res: Response) => {
		res.status(429).json({
			error: "Too many requests",
			message: "Rate limit exceeded. Please try again later.",
			retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000),
			timestamp: new Date().toISOString(),
		});
	},
});

const baseSlowDownMiddleware = slowDown({
	windowMs: RATE_LIMIT_CONFIG.windowMs,
	delayAfter: RATE_LIMIT_CONFIG.delayAfter,
	delayMs: () => RATE_LIMIT_CONFIG.delayMs,
	maxDelayMs: RATE_LIMIT_CONFIG.maxDelayMs,
	keyGenerator: (req: Request) => getRateLimitKey(req),
	validate: { delayMs: false },
});

// Create centralized rate limiter
export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
	if (!config.enableRateLimit) return next();
	return baseRateLimiter(req, res, next);
};

// Create centralized slow down middleware
export const slowDownMiddleware = (req: Request, res: Response, next: NextFunction) => {
	if (!config.enableRateLimit) return next();
	return baseSlowDownMiddleware(req, res, next);
};

// Export the centralized configuration
export const rateLimitConfig = RATE_LIMIT_CONFIG;

// Default export with the main rate limiter
export default rateLimiter;
