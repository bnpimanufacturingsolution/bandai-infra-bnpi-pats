import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import LoadingScreen from "~/components/atoms/LoadingScreen";

interface AuthGuardProps {
	children: React.ReactNode;
	requiredRole?: string | string[];
	requiredScope?: "SYSTEM" | "ORGANIZATION" | "APP";
	fallbackPath?: string;
}

export function AuthGuard({
	children,
	requiredRole,
	requiredScope,
	fallbackPath = "/auth/login",
}: AuthGuardProps) {
	const { isAuthenticated, isLoading, user, hasRole, hasScope } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (!isLoading) {
			if (!isAuthenticated || !user) {
				navigate(fallbackPath);
				return;
			}

			const currentPath = window.location.pathname;
			// const isPasswordChangeRequired = (user.metadata as any)?.requirePasswordChange === true;

			// if (
			// 	isPasswordChangeRequired &&
			// 	currentPath !== "/settings" &&
			// 	currentPath !== "/onboarding"
			// ) {
			// 	navigate("/settings?action=changePassword", { replace: true });
			// 	return;
			// }

			// Allow access to settings page for password change even if role check fails
			// if (isPasswordChangeRequired && currentPath === "/settings") {
			// 	// Allow access to settings for password change
			// 	return;
			// }

			// Only check role and scope if user is authenticated
			// Check role requirement - support both single role and array of roles
			// if (requiredRole) {
			// 	const rolesArray = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
			// 	const hasRequiredRole = rolesArray.some((role) => hasRole(role));
			// 	if (!hasRequiredRole) {
			// 		// Redirect to appropriate dashboard based on user's actual role
			// 		const redirectPath = user?.role
			// 			? getRedirectPathByRole(user.role as any)
			// 			: "/dashboard";
			// 		navigate(redirectPath);
			// 		return;
			// 	}
			// }

			// // Check scope requirement
			// if (requiredScope && !hasScope(requiredScope)) {
			// 	// Redirect to appropriate dashboard based on user's actual role
			// 	const redirectPath = user?.role
			// 		? getRedirectPathByRole(user.role as any)
			// 		: "/dashboard";
			// 	navigate(redirectPath);
			// 	return;
			// }
		}
	}, [
		isAuthenticated,
		isLoading,
		user,
		requiredRole,
		requiredScope,
		fallbackPath,
		navigate,
		hasRole,
		hasScope,
	]);

	// Show loading while checking auth
	if (isLoading) {
		return <LoadingScreen message="Loading" subtitle="Checking permissions" />;
	}

	// Show nothing while redirecting
	if (
		!isAuthenticated ||
		!user ||
		(requiredRole &&
			(() => {
				const rolesArray = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
				return !rolesArray.some((role) => hasRole(role));
			})()) ||
		(requiredScope && !hasScope(requiredScope))
	) {
		return null;
	}

	return <>{children}</>;
}

export function HMSGuard({ children }: { children: React.ReactNode }) {
	return <AuthGuard>{children}</AuthGuard>;
}
