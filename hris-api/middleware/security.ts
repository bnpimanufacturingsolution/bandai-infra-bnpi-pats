import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { config } from "../config/config";
import { getLogger } from "../helper/logger.helper";
import { rateLimiter, slowDownMiddleware } from "./rateLimiter";

const logger = getLogger();
const parseRequestSizeLimit = (value = "75mb") => {
	const match = String(value).trim().match(/^(\d+)(kb|mb|gb)?$/i);
	if (!match) return 75 * 1024 * 1024;
	const amount = Number(match[1]);
	const unit = (match[2] || "b").toLowerCase();
	if (unit === "gb") return amount * 1024 * 1024 * 1024;
	if (unit === "mb") return amount * 1024 * 1024;
	if (unit === "kb") return amount * 1024;
	return amount;
};
const formatRequestSizeLimit = (bytes: number) => {
	if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)}MB`;
	if (bytes % 1024 === 0) return `${bytes / 1024}KB`;
	return `${bytes}B`;
};

// Security headers configuration
const securityHeaders = helmet({
	// Prevent clickjacking
	frameguard: { action: "deny" },

	// Force HTTPS (2 years, preload list, all subdomains)
	hsts: {
		maxAge: 63072000,
		includeSubDomains: true,
		preload: true,
	},

	// Prevent browsers from guessing MIME types
	noSniff: true,

	// Prevent IE from executing downloads in site's context
	ieNoOpen: true,

	// Control resource sharing
	crossOriginResourcePolicy: { policy: "same-origin" },

	// Isolate tabs/windows from cross-origin interactions
	crossOriginOpenerPolicy: { policy: "same-origin" },

	// Protect embedding resources like WebAssembly
	crossOriginEmbedderPolicy: { policy: "require-corp" },

	// Avoid leaking DNS info
	dnsPrefetchControl: { allow: false },

	// Reduce referrer information
	referrerPolicy: { policy: "no-referrer" },

	// Hide Express fingerprint
	hidePoweredBy: true,

	// Content Security Policy
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https:"],
			connectSrc: ["'self'"],
			fontSrc: ["'self'"],
			objectSrc: ["'none'"],
			mediaSrc: ["'self'"],
			frameSrc: ["'none'"],
		},
	},
});

// Request size limiter
const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
	const contentLength = parseInt(req.headers["content-length"] || "0");
	const maxSize = parseRequestSizeLimit(process.env.HRIS_API_BODY_LIMIT || "75mb");

	if (contentLength > maxSize) {
		logger.warn("Request too large", {
			ip: req.ip,
			contentLength,
			maxSize,
			path: req.path,
		});

		return res.status(413).json({
			error: "Request too large",
			message: "Request size exceeds maximum allowed size",
			maxSize: formatRequestSizeLimit(maxSize),
		});
	}

	next();
};

// IP whitelist/blacklist middleware
const ipFilter = (req: Request, res: Response, next: NextFunction) => {
	const clientIP = req.ip || req.connection.remoteAddress || "unknown";
	const blacklistedIPs = process.env.BLACKLISTED_IPS?.split(",") || [];
	const whitelistedIPs = process.env.WHITELISTED_IPS?.split(",") || [];
	const enableWhitelist = process.env.ENABLE_IP_WHITELIST === "true";

	// Check blacklist
	if (clientIP !== "unknown" && blacklistedIPs.includes(clientIP)) {
		logger.warn("Blacklisted IP attempt", { ip: clientIP, path: req.path });
		return res.status(403).json({
			error: "Access denied",
			message: "Your IP address is not allowed to access this resource",
		});
	}

	// Check whitelist (only if explicitly enabled)
	if (
		enableWhitelist &&
		whitelistedIPs.length > 0 &&
		clientIP !== "unknown" &&
		!whitelistedIPs.includes(clientIP)
	) {
		logger.warn("Non-whitelisted IP attempt", { ip: clientIP, path: req.path });
		return res.status(403).json({
			error: "Access denied",
			message: "Your IP address is not authorized to access this resource",
		});
	}

	next();
};

// Request logging middleware
const securityLogger = (req: Request, res: Response, next: NextFunction) => {
	const startTime = Date.now();

	// Log suspicious requests
	const suspiciousPatterns = [
		/\.\.\//, // Directory traversal
		/\/etc\/passwd/, // System file access
		/\/proc\//, // Process information
		/union.*select/i, // SQL injection
		/eval\(/i, // Code injection
		/exec\(/i, // Command injection
	];

	const isSuspicious = suspiciousPatterns.some(
		(pattern) =>
			pattern.test(req.path) ||
			pattern.test(req.url) ||
			pattern.test(JSON.stringify(req.body)),
	);

	if (isSuspicious) {
		logger.warn("Suspicious request detected", {
			ip: req.ip,
			userAgent: req.get("User-Agent"),
			path: req.path,
			url: req.url,
			method: req.method,
			body: req.body,
		});
	}

	// Log response time
	res.on("finish", () => {
		const duration = Date.now() - startTime;
		if (duration > config.slowRequestWarnMs) {
			// Log slow requests
			logger.warn("Slow request", {
				ip: req.ip,
				path: req.path,
				method: req.method,
				duration: `${duration}ms`,
				threshold: `${config.slowRequestWarnMs}ms`,
				statusCode: res.statusCode,
			});
		}
	});

	next();
};

// Centralized rate limiting - all endpoints use the same rate limiter
const adaptiveRateLimit = (req: Request, res: Response, next: NextFunction) => {
	// Apply centralized rate limiting for all endpoints
	rateLimiter(req, res, next);
};

// Security middleware stack
export const securityMiddleware = [
	// 1. Basic security headers
	securityHeaders,

	// 2. Request size limiting
	requestSizeLimiter,

	// 3. IP filtering
	ipFilter,

	// 4. Slow down middleware
	slowDownMiddleware,

	// 5. Centralized rate limiting
	adaptiveRateLimit,

	// 6. Security logging
	securityLogger,
];

// Development security middleware (relaxed)
export const devSecurityMiddleware = [
	// 1. Relaxed security headers
	helmet({
		frameguard: false,
		hsts: false,
		crossOriginResourcePolicy: false,
		contentSecurityPolicy: false,
	}),

	// 2. Request size limiting
	requestSizeLimiter,

	// 3. Centralized rate limiting
	rateLimiter,

	// 4. Security logging
	securityLogger,
];

// Authentication-specific security
export const authSecurityMiddleware = [rateLimiter];

// File upload security
export const uploadSecurityMiddleware = [rateLimiter];

// API endpoint security
export const apiSecurityMiddleware = [rateLimiter, slowDownMiddleware, securityLogger];

export default {
	securityMiddleware,
	devSecurityMiddleware,
	authSecurityMiddleware,
	uploadSecurityMiddleware,
	apiSecurityMiddleware,
	securityHeaders,
	requestSizeLimiter,
	ipFilter,
	securityLogger,
	adaptiveRateLimit,
};
