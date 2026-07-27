import { useSearchParams } from "react-router";
import { LayoutList, Network, Users } from "lucide-react";
import EmployeeList from "~/components/shared/EmployeeList";
import EmployeeDirectoryView from "~/components/shared/EmployeeDirectoryView";
import OrganizationChartTab from "~/routes/employee/team/OrganizationChartTab";

export default function HRUserEmployeesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeView = searchParams.get("view") || "list";

	const setActiveView = (view: string) => {
		setSearchParams({ view }, { replace: true });
	};

	const views = [
		{ id: "list", label: "List View", icon: LayoutList },
		{ id: "directory", label: "Directory", icon: Users },
		{ id: "organization", label: "Organization Chart", icon: Network },
	];

	return (
		<div className="space-y-6">
			<div className="flex w-fit space-x-1 rounded-lg bg-gray-100 p-1 print:hidden">
				{views.map((view) => {
					const Icon = view.icon;
					return (
						<button
							key={view.id}
							onClick={() => setActiveView(view.id)}
							className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
								activeView === view.id
									? "bg-white text-orange-600 shadow-sm"
									: "text-gray-600 hover:text-gray-900"
							}`}>
							<Icon className="h-4 w-4" />
							{view.label}
						</button>
					);
				})}
			</div>

			{activeView === "list" && (
				<EmployeeList role="hr-user" showEmail={false} showPhone={false} />
			)}
			{activeView === "directory" && <EmployeeDirectoryView />}
			{activeView === "organization" && <OrganizationChartTab mode="full" />}
		</div>
	);
}
