import { useEffect } from "react";
import { useSearchParams } from "react-router";
import OrganizationChartTab from "./team/OrganizationChartTab";
import TeamOvertimeTab from "./team/TeamOvertimeTab";
import TeamTimesheetsTab from "./team/TeamTimesheetsTab";
import { useAuth } from "~/lib/hooks/use-auth";
import EmployeeList from "~/components/shared/EmployeeList";

const NO_DIRECT_REPORTS_MANAGER_VALUE = "__no_direct_reports__";

export default function TeamManagement() {
	// URL search params for deep-linked tabs
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = searchParams.get("tab") || "overview";

	const { user } = useAuth();
	const authEmployee = user?.metadata?.employee;
	const employeeId = authEmployee?.id;

	// Helper to change tabs
	const setActiveTab = (tab: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("tab", tab);
			return next;
		});
	};

	// Check if user is a manager (used for list role presentation and manager scoping)
	const isManager =
		authEmployee?.isManager === true ||
		authEmployee?.isHrManager === true ||
		user?.role === "hris-employee-manager" ||
		user?.role === "hris-line-leader" ||
		user?.role === "hris-hr-manager" ||
		user?.role === "admin";

	// Only show "my team" when the signed-in actor actually has reports.
	// Regular employees still land on an explicit empty scope instead of the org-wide list.
	const scopedManagerId =
		authEmployee?.hasDirectReports === false || !isManager
			? NO_DIRECT_REPORTS_MANAGER_VALUE
			: employeeId;
	const overviewPage = searchParams.get("page");
	const isOverviewParamsReady = activeTab !== "overview" || !scopedManagerId || !!overviewPage;

	useEffect(() => {
		if (activeTab !== "overview") return;
		if (overviewPage) {
			return;
		}

		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.set("tab", "overview");
				if (!next.get("page")) {
					next.set("page", "1");
				}
				return next;
			},
			{ replace: true },
		);
	}, [activeTab, overviewPage, scopedManagerId, setSearchParams]);

	const tabs = [
		{ id: "overview", label: "Team Overview" },
		{ id: "organization", label: "Organization Chart" },
		...(isManager ? [{ id: "timesheets", label: "Team Timesheets" }] : []),
		...(isManager ? [{ id: "overtime", label: "Assign Overtime" }] : []),
	];

	return (
		<div className="space-y-6">
			{/* Tab Content - controlled by sidebar navigation */}
			{activeTab === "overview" && isOverviewParamsReady && (
				<EmployeeList
					role={isManager ? "hr-manager" : "hr-user"}
					showEmail={false}
					showPhone={false}
					hideAdd
					hideImport
					hideExport
					defaultManagerId={scopedManagerId}
					managerFilterEditable
					actionVariant="team-overview"
				/>
			)}
			{activeTab === "organization" && <OrganizationChartTab employeeId={employeeId} />}
			{activeTab === "timesheets" && isManager && <TeamTimesheetsTab />}
			{activeTab === "overtime" && isManager && <TeamOvertimeTab />}
		</div>
	);
}
