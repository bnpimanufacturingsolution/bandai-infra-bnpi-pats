import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router";
import AuthContext from "./auth-context";
import type { User, AuthContextType, LoginCredentials } from "~/types/auth";
import authService from "~/services/auth-service";
import { clearHrisAuthToken, setHrisAuthToken } from "~/lib/api-client";
import {
	ACCOUNT_DEACTIVATED_MESSAGE,
	getEmployeeActionBlock,
} from "~/lib/employee-action-block";

const AUTH_TOKEN_STORAGE_ENABLED =
	String(import.meta.env.VITE_AUTH_TOKEN_STORAGE_ENABLED || "true")
		.trim()
		.toLowerCase() !== "disabled";
const E2E_AUTH_USER_STORAGE_KEY = "e2eAuthUser";

const getE2eAuthUser = (): User | null => {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(E2E_AUTH_USER_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as User) : null;
	} catch {
		return null;
	}
};

interface AuthProviderProps {
	children: ReactNode;
	disableBootstrap?: boolean;
}

const AuthProvider = ({ children, disableBootstrap = false }: AuthProviderProps) => {
	const e2eInitialUser = getE2eAuthUser();
	const [user, setUser] = useState<User | null>(e2eInitialUser);
	const [isLoading, setIsLoading] = useState(!e2eInitialUser);
	const [error, setError] = useState<string | null>(null);
	const navigate = useNavigate();

	const isAuthenticated = !!user;

	const clearLocalAuthState = useCallback(() => {
		setUser(null);
		localStorage.removeItem("userRole");
		localStorage.removeItem("userSubRole");
		clearHrisAuthToken();
	}, []);

	const forceDeactivatedLogout = useCallback(
		(message = ACCOUNT_DEACTIVATED_MESSAGE) => {
			clearLocalAuthState();
			localStorage.setItem("authBlockedMessage", message);
			navigate("/auth/login", { replace: true });
		},
		[clearLocalAuthState, navigate],
	);

	const getEmployeeStatusFromUser = (
		currentUser: User | null | undefined,
	): string | undefined => {
		return currentUser?.metadata?.employee?.employmentStatus;
	};

	const ensureEmployeeIsActive = useCallback((currentUser: User | null | undefined) => {
		const actionBlock = getEmployeeActionBlock({
			employmentStatus: getEmployeeStatusFromUser(currentUser),
		});
		if (actionBlock.blocked) {
			throw new Error(actionBlock.message || ACCOUNT_DEACTIVATED_MESSAGE);
		}
	}, []);

	// Clear error function
	const clearError = () => setError(null);

	// Permission checking methods
	const hasPermission = useCallback(
		(permission: string): boolean => {
			if (!user) return false;
			// TODO: Implement permission checking logic based on user's role and permissions
			// This would typically check against user.role.permissions or similar
			return true; // Placeholder implementation
		},
		[user],
	);

	const hasRole = useCallback(
		(role: string): boolean => {
			if (!user || !user.role) return false;

			// Super admin has access to everything
			if (user.role === "super_admin") {
				return true;
			}

			// Check if user has the role directly or as subRole
			if (user.role === role || user.subRole === role) {
				return true;
			}

			// Role hierarchy mappings for additional access
			// const roleHierarchy: Record<string, string[]> = {
			// 	admin: ["admin", "hris-admin"],
			// 	"hris-admin": ["hris-admin"],
			// 	"hris-hr-manager": ["hris-hr-manager"],
			// 	"hris-hr-user": ["hris-hr-user"],
			// 	"hris-employee": ["hris-employee"],
			// };

			const roleHierarchy: Record<string, string[]> = {
				admin: ["admin", "hris-admin"],
				"hris-admin": ["hris-admin"],
				"hris-hr-manager": ["hris-hr-manager"],
				"hris-hr-user": ["hris-hr-user"],
				"hris-employee-manager": ["hris-employee-manager"],
				"hris-line-leader": ["hris-line-leader"],
				"hris-employee": ["hris-employee"],
				"hris-timekeeper": ["hris-timekeeper"],
				"hris-agency": ["hris-agency"],
			};

			const allowedRoles = roleHierarchy[role] || [role];
			return allowedRoles.includes(user.role);
		},
		[user],
	);

	const hasScope = useCallback(
		(scope: "SYSTEM" | "ORGANIZATION" | "APP"): boolean => {
			if (!user) return false;
			// Map roles to their corresponding scopes
			switch (user.role) {
				case "super_admin":
					return scope === "SYSTEM";
				case "admin":
					return scope === "ORGANIZATION";
				case "hris-admin":
					return scope === "ORGANIZATION";
				case "hris-hr-manager":
					return scope === "APP";
				case "hris-hr-user":
					return scope === "APP";
				case "hris-employee-manager":
					return scope === "APP";
				case "hris-line-leader":
					return scope === "APP";
				case "hris-employee":
					return scope === "APP";
				case "hris-agency":
					return scope === "APP";
				default:
					return false;
			}
		},
		[user],
	);

	// Get current user from API
	const getCurrentUser = async () => {
		try {
			setIsLoading(true);
			setError(null);
			const freshUser = await authService.getCurrentUser();
			// The /auth/me endpoint may NOT return role, so preserve it from:
			// 1. The fresh response itself (if it has role)
			// 2. The existing user state (from a previous login call)
			// 3. localStorage fallback
			setUser((prev) => {
				const savedRole = localStorage.getItem("userRole");
				const savedSubRole = localStorage.getItem("userSubRole");
				return {
					...freshUser,
					role: freshUser.role || prev?.role || savedRole || undefined,
					subRole: freshUser.subRole || prev?.subRole || savedSubRole || undefined,
					roleId: freshUser.roleId || prev?.roleId || undefined,
				};
			});
		} catch (error: any) {
			console.error("Error fetching current user:", error);
			setUser(null);
			// Only set error if it's not a 401/403 (unauthorized) which is expected when not logged in
			if (error.status && error.status !== 401 && error.status !== 403) {
				setError("Failed to fetch user data. Please try again.");
			}
		} finally {
			setIsLoading(false);
		}
	};

	// Login function
	const login = async (identifier: string, password: string, appCode?: string) => {
		try {
			setIsLoading(true);
			setError(null);

			const loginResponse = await authService.login({ identifier, password, appCode });
			setUser(loginResponse);

			if (AUTH_TOKEN_STORAGE_ENABLED && loginResponse.token) {
				setHrisAuthToken(loginResponse.token);
			}

			// Persist role info so it survives /auth/me refresh and page reloads
			if (loginResponse.role) {
				localStorage.setItem("userRole", loginResponse.role);
			}
			if (loginResponse.subRole) {
				localStorage.setItem("userSubRole", loginResponse.subRole);
			}

			// Immediately refresh user details from /auth/me so metadata (like employee.id) is available
			let currentUser: User | null = null;
			try {
				const freshUser = await authService.getCurrentUser();
				// CRITICAL: /auth/me may NOT return role. Merge role from login response
				// so it doesn't get lost when we overwrite state.
				currentUser = {
					...freshUser,
					role: freshUser.role || loginResponse.role,
					subRole: freshUser.subRole || loginResponse.subRole,
					roleId: freshUser.roleId || loginResponse.roleId,
					token: AUTH_TOKEN_STORAGE_ENABLED
						? freshUser.token || loginResponse.token
						: undefined,
				};
				if (AUTH_TOKEN_STORAGE_ENABLED && currentUser.token) {
					setHrisAuthToken(currentUser.token);
				}
				setUser(currentUser);
			} catch (refreshError) {
				console.error("Login succeeded but refreshing current user failed:", refreshError);
				// Keep the login response in state so caller can still proceed;
				// the auth guard will retry getCurrentUser via useEffect later.
			}

			// Return the most up-to-date user data so components can handle navigation
			const resolvedUser = currentUser ?? loginResponse;
			try {
				await ensureEmployeeIsActive(resolvedUser);
			} catch (statusError: any) {
				const message = statusError?.message || ACCOUNT_DEACTIVATED_MESSAGE;
				forceDeactivatedLogout(message);
				throw new Error(message);
			}

			return resolvedUser;
		} catch (error: any) {
			console.error("Login error:", error);
			setError(error.message || "Login failed. Please try again.");
			throw error; // Re-throw so the login form can handle it
		} finally {
			setIsLoading(false);
		}
	};

	// Validate handoff token function
	const validateHandoffToken = async (
		token: string,
	): Promise<{ user: User; token?: string; redirect_uri?: string; state?: string }> => {
		try {
			setIsLoading(true);
			setError(null);

			const result = await authService.validateHandoffToken(token);
			if (AUTH_TOKEN_STORAGE_ENABLED && result.token) {
				setHrisAuthToken(result.token);
			}
			setUser(result.user);

			// Refresh user profile so metadata (like employee.id) is available before redirecting
			let currentUser: User | null = null;
			try {
				currentUser = await authService.getCurrentUser();
				if (AUTH_TOKEN_STORAGE_ENABLED && (currentUser?.token || result.token)) {
					setHrisAuthToken(currentUser?.token || result.token);
				}
				setUser(currentUser);
			} catch (refreshError) {
				console.error(
					"Handoff token validated but refreshing current user failed:",
					refreshError,
				);
				// Keep the validated user in state; auth guard can retry later.
			}

			// Return the full result including redirect info and the freshest user we have
			return {
				...result,
				user: currentUser ?? result.user,
			};
		} catch (error: any) {
			console.error("Handoff token validation error:", error);
			setError(error.message || "Token validation failed. Please try again.");
			throw error; // Re-throw so components can handle it
		} finally {
			setIsLoading(false);
		}
	};

	const ssoLogin = async (
		credentials: LoginCredentials & { redirect_uri: string; state: string },
	) => {
		try {
			setIsLoading(true);
			setError(null);
			const response = await authService.ssoLogin(credentials);
			return response;
		} catch (error: any) {
			console.error("SSO Login error:", error);
			setError(error.message || "SSO Login failed");
			throw error;
		} finally {
			setIsLoading(false);
		}
	};

	// Logout function
	const logout = async () => {
		try {
			setIsLoading(true);
			setError(null);

			// Call the logout API
			await authService.logout();

			clearLocalAuthState();
			console.log("Auth data cleared from localStorage");

			// Redirect to login page using React Router
			navigate("/auth/login", { replace: true });
		} catch (error: any) {
			console.error("Logout error:", error);
			setError(error.message || "Logout failed");
			// Still clear user state and redirect even if API call fails
			clearLocalAuthState();
			navigate("/auth/login", { replace: true });
		} finally {
			setIsLoading(false);
		}
	};

	// Check for existing authentication on mount
	useEffect(() => {
		if (disableBootstrap) {
			setIsLoading(false);
			return;
		}
		if (e2eInitialUser) return;
		getCurrentUser();
	}, [disableBootstrap, e2eInitialUser]);

	// Listen for centralized deactivation events (from API client or socket handlers)
	useEffect(() => {
		const handleDeactivation = (event: Event) => {
			const customEvent = event as CustomEvent<{ message?: string }>;
			forceDeactivatedLogout(customEvent.detail?.message || ACCOUNT_DEACTIVATED_MESSAGE);
		};

		window.addEventListener("auth:deactivated", handleDeactivation as EventListener);
		return () => {
			window.removeEventListener("auth:deactivated", handleDeactivation as EventListener);
		};
	}, [forceDeactivatedLogout]);

	// One-time safeguard after user hydration/login.
	// Realtime deactivation is handled by the socket event listener above.
	useEffect(() => {
		if (!user) return;

		try {
			ensureEmployeeIsActive(user);
		} catch (err: any) {
			if (err?.message) {
				forceDeactivatedLogout(err.message);
			} else if (err?.status === 401) {
				// Handle unauthorized without showing the scary deactivated message
				clearLocalAuthState();
				navigate("/auth/login", { replace: true });
			}
			// Ignore other errors (e.g. timeout, network) so the user isn't logged out
		}
	}, [user, ensureEmployeeIsActive, forceDeactivatedLogout, clearLocalAuthState, navigate]);

	// Effect to apply branding colors
	useEffect(() => {
		const applyBranding = (colors: any) => {
			const root = document.documentElement;
			if (root && colors) {
				for (const [key, value] of Object.entries(colors)) {
					if (value && typeof value === "string") {
						root.style.setProperty(`--${key}`, value);
					}
				}
			}
		};

		const clearBranding = () => {
			const root = document.documentElement;
			if (root) {
				// Reset to default values
				root.style.removeProperty("--primary");
				root.style.removeProperty("--secondary");
				root.style.removeProperty("--accent");
				root.style.removeProperty("--success");
				root.style.removeProperty("--warning");
				root.style.removeProperty("--danger");
				root.style.removeProperty("--info");
				root.style.removeProperty("--light");
				root.style.removeProperty("--dark");
				root.style.removeProperty("--neutral");
			}
		};

		if (
			user &&
			user.organization &&
			user.organization.branding &&
			user.organization.branding.colors
		) {
			applyBranding(user.organization.branding.colors);
		} else {
			// Clear branding when user is logged out or has no organization
			clearBranding();
		}
	}, [user]);

	const contextValue: AuthContextType = {
		user,
		isLoading,
		isAuthenticated,
		error,
		login,
		logout,
		getCurrentUser,
		clearError,
		hasPermission,
		hasRole,
		hasScope,
		validateHandoffToken,
		ssoLogin,
	};

	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
