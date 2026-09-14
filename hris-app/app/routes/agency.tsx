import { Navigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { AGENCY_ROLES } from "~/components/pages/agency-workspace/agency-shared";

/** /agency is the workspace entry — real pages live at /agency/dashboard etc. */
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
	return <Navigate to="/agency/dashboard" replace />;
}
