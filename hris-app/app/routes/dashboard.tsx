import { HrManagerDashboard } from "~/components/dashboards/hr-manager-dashboard";
import { HrUserDashboard } from "~/components/dashboards/hr-user-dashboard";
import { ManagerDashboard } from "~/components/dashboards/manager-dashboard";
import { EmployeeDashboard } from "~/components/dashboards/employee-dashboard";
import { DashboardSkeleton } from "~/components/dashboards/dashboard-skeleton";
import { useAuth } from "~/lib/hooks/use-auth";
import { Navigate } from "react-router";
import { shouldRouteToEmployeeOnboarding } from "~/lib/employee-action-block";

export default function Dashboard() {
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return <DashboardSkeleton />;
	}

	if (!user) {
		return null;
	}

	if (shouldRouteToEmployeeOnboarding(user.metadata)) {
		return <Navigate to="/onboarding" />;
	}

	switch (user.role) {
		case "hris-hr-manager":
			return <HrManagerDashboard />;
		case "hris-hr-user":
			// HR roles see HR dashboard
			return <HrUserDashboard />;
		case "hris-employee-manager":
			// Managers see employee dashboard with manager features
			return <ManagerDashboard />;
		case "hris-employee":
			// Regular employees see employee dashboard
			return <EmployeeDashboard />;
		case "hris-admin":
		case "admin":
		case "super_admin":
			// Admins see admin dashboard (redirect to admin layout)
			window.location.href = "/admin/dashboard";
			return null;
		default:
			// Default to employee dashboard
			window.location.href = "/";
			return null;
	}
}
