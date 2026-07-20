import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import LoadingScreen from "@/components/atoms/LoadingScreen";
import { getRedirectPathByRole } from "~/lib/utils/role-redirect";
import type { Route } from "./+types/landing";
import { useSystemProvisioningStatus } from "~/lib/hooks/useSystemProvisioning";
import { getEffectiveProvisioningMode } from "~/lib/provisioning-access";
import { shouldRouteToEmployeeOnboarding } from "~/lib/employee-action-block";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "HR App - Redirecting" },
		{
			name: "description",
			content: "HR Management System - Redirecting to your dashboard",
		},
	];
}

const IndexPage: React.FC = () => {
	const { isAuthenticated, isLoading, user } = useAuth();
	const { data: provisioningStatus, isLoading: isProvisioningLoading } =
		useSystemProvisioningStatus(!isLoading && !isAuthenticated);
	const effectiveProvisioningMode = getEffectiveProvisioningMode({
		user,
		provisioningStatus,
	});

	// Show loading while checking authentication
	if (isLoading) {
		return <LoadingScreen message="Signing in" subtitle="Checking session" />;
	}

	if (!isAuthenticated && isProvisioningLoading) {
		return <LoadingScreen message="Setting up" subtitle="Checking system setup" />;
	}

	// If not authenticated, redirect to login
	if (!isAuthenticated) {
		if (effectiveProvisioningMode === "PROVISIONING") {
			return <Navigate to="/setup" replace />;
		}

		return <Navigate to="/auth/login" replace />;
	}

	// If authenticated but no user data, show loading
	if (!user) {
		return <LoadingScreen message="Loading" subtitle="Preparing workspace" />;
	}

	// If authenticated with user data, redirect based on role
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
	if (!user.role || !allowed.includes(user.role)) {
		return <Navigate to="/403" replace />;
	}

	if (shouldRouteToEmployeeOnboarding(user.metadata)) {
		return <Navigate to="/onboarding" replace />;
	}

	// Redirect based on user role using the role redirect utility
	const destination = getRedirectPathByRole(user.role as any);
	return <Navigate to={destination} replace />;
};

export default IndexPage;
