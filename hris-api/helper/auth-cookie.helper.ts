import { AuthRequest } from "../middleware/verifyToken";

const LOCAL_COOKIE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const resolveForwardedProto = (req: AuthRequest): string => {
	const forwardedProto = req.headers["x-forwarded-proto"];
	if (Array.isArray(forwardedProto)) {
		return String(forwardedProto[0] || "").trim().toLowerCase();
	}
	return String(forwardedProto || "").trim().toLowerCase();
};

const resolveRequestHostname = (req: AuthRequest): string => {
	const originHeader = String(req.headers.origin || "").trim();
	if (originHeader) {
		try {
			return new URL(originHeader).hostname.trim().toLowerCase();
		} catch {
			// Fall through to Express-derived host values.
		}
	}

	const hostname = String(req.hostname || "").trim().toLowerCase();
	if (hostname) {
		return hostname;
	}

	const hostHeader = String(req.headers.host || "").trim().toLowerCase();
	return hostHeader.replace(/:\d+$/, "");
};

export const buildAuthCookieOptions = (req: AuthRequest) => {
	const hostname = resolveRequestHostname(req);
	const isLocalHost = LOCAL_COOKIE_HOSTS.has(hostname);
	const isSecureRequest =
		req.secure ||
		resolveForwardedProto(req) === "https" ||
		String(req.headers.origin || "").startsWith("https://");

	return {
		httpOnly: true,
		sameSite: isLocalHost || !isSecureRequest ? ("lax" as const) : ("none" as const),
		secure: !isLocalHost && isSecureRequest,
		maxAge: 24 * 60 * 60 * 1000,
	};
};
