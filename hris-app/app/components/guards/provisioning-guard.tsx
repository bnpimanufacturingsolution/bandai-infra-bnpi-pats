import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	getEffectiveProvisioningMode,
	hasSetupDeeplinkAccess,
	isSetupAutoRedirectEnabled,
} from "~/lib/provisioning-access";
import { useSystemProvisioningStatus } from "~/lib/hooks/useSystemProvisioning";
import { getRedirectPathByRole } from "~/lib/utils/role-redirect";
import { shouldRouteToEmployeeOnboarding } from "~/lib/employee-action-block";

const isSetupPath = (pathname: string) => pathname === "/setup" || pathname.startsWith("/setup/");
const isEmployeeOnboardingPath = (pathname: string) => pathname.startsWith("/onboarding");
const isCallbackPath = (pathname: string) => pathname === "/callback";

export function ProvisioningGuard() {
	const { user, isLoading, isAuthenticated } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const requirePasswordChange = user?.metadata?.requirePasswordChange === true;
	const isOnboardingEmployee = shouldRouteToEmployeeOnboarding(user?.metadata);
	const setupDeeplinkAccess = hasSetupDeeplinkAccess(location.search);
	const setupAutoRedirectEnabled = isSetupAutoRedirectEnabled();

	const { data: provisioningStatus, isLoading: isProvisioningLoading } =
		useSystemProvisioningStatus(
			!isLoading && !isAuthenticated && !isCallbackPath(location.pathname),
		);
	const effectiveProvisioningMode = getEffectiveProvisioningMode({
		user,
		provisioningStatus,
	});

	useEffect(() => {
		if (isLoading || isCallbackPath(location.pathname)) return;
		if (isOnboardingEmployee && isEmployeeOnboardingPath(location.pathname)) return;
		if (!isAuthenticated && (isProvisioningLoading || !effectiveProvisioningMode)) return;

		if (effectiveProvisioningMode === "READY") {
			if (isSetupPath(location.pathname) && !setupDeeplinkAccess) {
				if (isAuthenticated && user && !requirePasswordChange) {
					const redirectPath = user.role
						? getRedirectPathByRole(user.role as any)
						: "/dashboard";
					navigate(redirectPath, { replace: true });
				} else {
					navigate("/auth/login", { replace: true });
				}
			}
			return;
		}

		if (requirePasswordChange) return;
		if (!setupAutoRedirectEnabled) return;

		if (!isSetupPath(location.pathname)) {
			navigate("/setup", { replace: true });
		}
	}, [
		isAuthenticated,
		isOnboardingEmployee,
		isLoading,
		isProvisioningLoading,
		location.pathname,
		location.search,
		navigate,
		effectiveProvisioningMode,
		requirePasswordChange,
		setupAutoRedirectEnabled,
		setupDeeplinkAccess,
		user,
	]);

	return null;
}
