import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import authService from "~/services/auth-service";
import { getAdminPath, getHomePath } from "~/lib/navigation-utils";
import { Loader2, AlertCircle } from "lucide-react";

type TokenValidationState = "idle" | "validating" | "error";

export default function CallbackPage() {
	const { validateHandoffToken } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const [tokenState, setTokenState] = useState<TokenValidationState>("idle");
	const [errorMessage, setErrorMessage] = useState<string>("");

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const token = params.get("handoff_token");
		const state = params.get("state");

		// Prevent multiple calls if already processing
		if (tokenState !== "idle") {
			return;
		}

		if (token) {
			// Don't set any loading state - redirect immediately
			setErrorMessage("");
			setTokenState("validating");

			(async () => {
				try {
					const result = await validateHandoffToken(token);
					let user = result.user;

					// If user role is missing, fetch full user profile
					if (!user.role) {
						try {
							const fullUser = await authService.getCurrentUser();
							user = fullUser;
						} catch (e) {
							console.warn("Failed to fetch full user profile after validation", e);
						}
					}

					// Determine redirect target
					let redirectPath = "/";
					const userRole = user?.role;

					// Superadmins should always land on /superadmin, regardless of originalPath
					if (userRole === "super_admin") {
						redirectPath = "/superadmin/";
					} else {
						// Try to respect originalPath from state for non-superadmin users
						if (state) {
							try {
								const stateData = JSON.parse(atob(state));
								if (stateData.originalPath) {
									redirectPath = stateData.originalPath;
								}
							} catch (e) {
								console.warn("Could not parse state:", e);
							}
						}

						// If no specific path, redirect based on user role
						if (redirectPath === "/") {
							if (userRole) {
								switch (userRole) {
									case "org_admin":
										redirectPath = getAdminPath(user, "apps");
										break;
									case "app_admin":
										redirectPath = getHomePath(user);
										break;
									default:
										redirectPath = getHomePath(user);
										break;
								}
							}
						}
					}

					// Redirect immediately - no need to show success state
					navigate(redirectPath, { replace: true });
				} catch (error: any) {
					console.error("Token validation failed:", error);
					setTokenState("error");
					setErrorMessage(error?.message || "Failed to validate authentication token");

					// Clear the token from URL after error
					const newUrl = new URL(window.location.href);
					newUrl.searchParams.delete("handoff_token");
					newUrl.searchParams.delete("state");
					window.history.replaceState({}, "", newUrl.toString());
				}
			})();
		} else {
			// No token, redirect to login
			navigate("/auth/login", { replace: true });
		}
	}, [location.search, navigate, validateHandoffToken]);

	// Show loading state while validating token
	if (tokenState === "validating") {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
					<h2 className="mt-4 text-xl font-semibold text-gray-900">Authenticating...</h2>
					<p className="mt-2 text-gray-600">Please wait while we verify your access.</p>
				</div>
			</div>
		);
	}

	// Show error state
	if (tokenState === "error") {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center max-w-md">
					<AlertCircle className="mx-auto h-12 w-12 text-red-600" />
					<h2 className="mt-4 text-xl font-semibold text-gray-900">
						Authentication Failed
					</h2>
					<p className="mt-2 text-gray-600">{errorMessage}</p>
					<button
						onClick={() => navigate("/auth/login")}
						className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
						Go to Login
					</button>
				</div>
			</div>
		);
	}

	// Fallback - should not reach here
	return null;
}
