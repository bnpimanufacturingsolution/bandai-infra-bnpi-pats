export const securityConfig = {
	sanitization: {
		maxLength: 1000,
		allowHtml: false,
		skipFields: ["password", "token", "secret", "apiKey"],
		logViolations: true,
	},

	requestLimits: {
		maxSize: 10 * 1024 * 1020,
		maxFields: 1000,
		maxFileSize: 5 * 1024 * 1024,
	},

	headers: {
		hsts: {
			maxAge: 63072000,
			includeSubDomains: true,
			preload: true,
		},
		csp: {
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
	},

	ipFiltering: {
		blacklistedIPs: process.env.BLACKLISTED_IPS?.split(",") || [],
		whitelistedIPs: process.env.WHITELISTED_IPS?.split(",") || [],
		enableWhitelist: process.env.ENABLE_IP_WHITELIST === "true",
	},

	logging: {
		logSuspiciousRequests: true,
		logSlowRequests: true,
		slowRequestThreshold: 5000,
		logRateLimitHits: true,
		logSecurityViolations: true,
	},

	environments: {
		development: {
			sanitization: {
				allowHtml: false,
				logViolations: true,
			},
			headers: {
				relaxed: true,
			},
		},
		production: {
			sanitization: {
				allowHtml: false,
				logViolations: true,
			},
			headers: {
				strict: true,
			},
		},
		test: {
			sanitization: {
				allowHtml: false,
				logViolations: false,
			},
			headers: {
				relaxed: true,
			},
		},
	},
};

export const getSecurityConfig = (environment: string = process.env.NODE_ENV || "development") => {
	const envConfig =
		securityConfig.environments[environment as keyof typeof securityConfig.environments] ||
		securityConfig.environments.development;

	return {
		...securityConfig,
		...envConfig,
		sanitization: {
			...securityConfig.sanitization,
			...envConfig.sanitization,
		},
		headers: {
			...securityConfig.headers,
			...envConfig.headers,
		},
	};
};

export default securityConfig;
