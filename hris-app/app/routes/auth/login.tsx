import React from "react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useToastContext } from "~/lib/contexts/toast-context";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { getRedirectPathByRole, getSettingsPathByRole } from "~/lib/utils/role-redirect";
import { AuthTemplate } from "~/components/templates/AuthTemplate";
import { LoginHero } from "~/components/organisms/LoginHero";
import LoginForm from "~/components/organisms/LoginForm";
import { useSystemProvisioningStatus } from "~/lib/hooks/useSystemProvisioning";
import { Navigate } from "react-router";
import {
	getEffectiveProvisioningMode,
	isSetupAutoRedirectEnabled,
} from "~/lib/provisioning-access";
import { shouldRouteToEmployeeOnboarding } from "~/lib/employee-action-block";

export default function LoginPage() {
	const { isLoading, isAuthenticated, user, clearError } = useAuth();
	const { toast } = useToastContext();
	const { data: provisioningStatus, isLoading: isProvisioningLoading } =
		useSystemProvisioningStatus(!isLoading && !isAuthenticated);
	const effectiveProvisioningMode = getEffectiveProvisioningMode({
		user,
		provisioningStatus,
	});

	// Handle redirection with useEffect to ensure state is settled
	React.useEffect(() => {
		if (isAuthenticated && user) {
			const allowed = [
				"hris-hr-manager",
				"hris-hr-user",
				"hris-employee",
				"hris-employee-manager",
				"hris-timekeeper",
				"hris-admin",
				"admin",
				"super_admin",
			];

			console.log("Login page auth check:", {
				role: user.role,
				roleType: typeof user.role,
				isAllowed: user.role ? allowed.includes(user.role) : false,
				userId: user.id,
			});

			if (!user.role) {
				// Role is missing — likely /auth/me didn't return it yet.
				// Do NOT redirect to /403. Wait for state to settle.
				console.warn("User role is missing, waiting for auth state to settle...");
				return;
			}

			if (!allowed.includes(user.role)) {
				window.location.href = "/403";
				return;
			}

			// Check if password change is required
			const requirePasswordChange = user.metadata?.requirePasswordChange === true;
			const isFirstLogin = user.metadata?.isFirstLogin === true;
			const shouldRouteToOnboarding = shouldRouteToEmployeeOnboarding(user.metadata);

			console.log("Login Redirection Check:", {
				role: user.role,
				isFirstLogin,
				requirePasswordChange,
				employmentStatus: user.metadata?.employee?.employmentStatus,
				metadata: user.metadata,
			});

			if (shouldRouteToOnboarding) {
				// Navigate to onboarding
				console.log("Redirecting to onboarding...");
				// Use window.location as valid fallback since we are inside useEffect without navigate hook access easily
				window.location.href = "/onboarding";
			} else if (requirePasswordChange) {
				const settingsPath = getSettingsPathByRole(user.role as any);
				console.log("Redirecting to settings...");
				window.location.href = `${settingsPath}?action=changePassword`;
			} else {
				// Regular redirect
				const redirectPath = getRedirectPathByRole(user.role as any);
				if (window.location.pathname === "/auth/login") {
					window.location.href = redirectPath;
				}
			}
		}
	}, [isAuthenticated, user]);

	// Clear error when component mounts
	React.useEffect(() => {
		clearError();
	}, [clearError]);

	React.useEffect(() => {
		const blockedMessage = localStorage.getItem("authBlockedMessage");
		if (blockedMessage) {
			toast.error(blockedMessage, "Access Denied");
			localStorage.removeItem("authBlockedMessage");
		}
	}, [toast]);

	// If authenticated, show loading while the effect handles redirection
	if (isAuthenticated && user) {
		return <LoadingScreen message="Redirecting" subtitle="Finalizing access" />;
	}

	// Show branded loading while checking authentication
	if (isLoading) {
		return <LoadingScreen message="Signing in" subtitle="Checking session" />;
	}

	if (isProvisioningLoading) {
		return <LoadingScreen message="Setting up" subtitle="Checking system setup" />;
	}

	if (
		!isAuthenticated &&
		effectiveProvisioningMode === "PROVISIONING" &&
		isSetupAutoRedirectEnabled()
	) {
		return <Navigate to="/setup" replace />;
	}

	return <AuthTemplate hero={<LoginHero />} form={<LoginForm />} />;
}
