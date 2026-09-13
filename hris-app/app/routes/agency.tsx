import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { AgencyWorkspace } from "~/components/pages/agency-workspace/AgencyWorkspace";

// Canonical agency roles per .wwg/wiki/project-truth.md and sidebar role-guard logic.
const AGENCY_ROLES = ["hris-agency", "hris-admin", "admin", "super_admin"];

// Workspace tab order matches the contract requested for the agency portal.
const TABS = ["Dashboard", "Roster", "Attendance", "Timesheets", "Biometrics"] as const;

export default function AgencyPage() {
	const { isAuthenticated, isLoading, user } = useAuth();

	if (isLoading) {
		return <LoadingScreen message="Loading" subtitle="Preparing agency workspace" />;
	}

	if (!isAuthenticated) {
		return <Navigate to="/auth/login" replace />;
	}

	if (!user) {
		return <LoadingScreen message="Loading" subtitle="Preparing agency workspace" />;
	}

	if (!user.role || !AGENCY_ROLES.includes(user.role)) {
		return <Navigate to="/403" replace />;
	}

	// Agency identity comes from user metadata (agent-built backend contract).
	// The workspace treats unknown/missing agency metadata as a real state,
	// not as a fake default.
	const metadata = (user.metadata || {}) as Record<string, unknown>;
	const agencyCode = String(metadata.agencyCode || "") || "—";
	const agencyId = String(metadata.agencyId || "") || "—";

	return (
		<AgencyWorkspace
			agencyCode={agencyCode}
			agencyId={agencyId}
			userEmail={user.email}
			userRole={user.role}
		/>
	);
}
