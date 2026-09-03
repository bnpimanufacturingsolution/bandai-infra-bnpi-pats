import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import { isEmployeeOnboardingStatus } from "~/lib/employee-action-block";

export function PasswordEnforcementGuard() {
	const { user, isLoading } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		if (isLoading || !user) return;

		// Check if password change is required
		if (user.metadata?.requirePasswordChange) {
			const currentPath = location.pathname;
			const searchParams = new URLSearchParams(location.search);
			const action = searchParams.get("action");
			const isOnboardingEmployee = isEmployeeOnboardingStatus(
				user.metadata?.employee?.employmentStatus,
			);
			const isOnboardingPath = currentPath.startsWith("/onboarding");

			// During true employee onboarding, allow the onboarding flow to continue.
			if (isOnboardingEmployee && isOnboardingPath) return;

			// Allow access to settings page for password change
			// Also allow logout to prevent being trapped
			if (!currentPath.startsWith("/settings") && !currentPath.startsWith("/auth/logout")) {
				// Redirect to settings with changePassword action
				navigate("/settings?action=changePassword", { replace: true });
			} else if (currentPath === "/settings" && action !== "changePassword") {
				// If on settings but not changing password, force the modal
				navigate("/settings?action=changePassword", { replace: true });
			}
		}
	}, [user, isLoading, navigate, location]);

	return null; // This component doesn't render anything
}
