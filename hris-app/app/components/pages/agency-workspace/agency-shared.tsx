import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import LoadingScreen from "~/components/atoms/LoadingScreen";

// Canonical agency roles (matches routes/agency.tsx + Sidebar agency section).
export const AGENCY_ROLES = ["hris-agency", "hris-admin", "admin", "super_admin"];

// Active roster statuses (matches the roster filter on every /agency/* page).
// Anything else (resigned, terminated, AWOL-closed, …) counts as an inactive operator,
// mirroring the agency pack's "Daily Inactive Agency Operators" sheet.
export const ACTIVE_AGENCY_STATUSES = ["ACTIVE", "ONBOARDING", "ON_LEAVE"];

export function isActiveAgencyMember(m: any): boolean {
	return ACTIVE_AGENCY_STATUSES.includes(String(m?.employmentStatus || ""));
}

export interface AgencyIdentity {
	agencyId: string;
	agencyCode: string;
	userEmail: string;
	userRole?: string;
	hasRealAgencyId: boolean;
}

/** Agency identity comes from user metadata (no User.agencyId column — schema constraint). */
export function useAgencyIdentity(): AgencyIdentity {
	const { user } = useAuth();
	const metadata = (user?.metadata || {}) as Record<string, unknown>;
	const agencyId = String(metadata.agencyId || "");
	const agencyCode = String(metadata.agencyCode || "");
	return {
		agencyId,
		agencyCode,
		userEmail: user?.email || "",
		userRole: user?.role,
		hasRealAgencyId: !!agencyId,
	};
}

/** Route guard shared by every /agency/* page. */
export function AgencyGuard({ children }: { children: React.ReactNode }) {
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
	return <>{children}</>;
}

/** Shared container for every /agency/* page (pages render content only). */
export function AgencyPageShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4" data-testid="agency-workspace">
			{children}
		</div>
	);
}
