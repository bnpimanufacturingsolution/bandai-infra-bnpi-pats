import { Navigate, useLocation } from "react-router";
import EmployeeList from "~/components/shared/EmployeeList";

export default function EmployeesPage() {
	const location = useLocation();
	const searchParams = new URLSearchParams(location.search);

	if (searchParams.get("action") === "create") {
		searchParams.delete("action");
		const nextSearch = searchParams.toString();

		return (
			<Navigate
				to={`/admin/configuration/employees/new${nextSearch ? `?${nextSearch}` : ""}`}
				replace
			/>
		);
	}

	return (
		// h-full + overflow-hidden: fill the admin main pane; only the table body scrolls.
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<EmployeeList
				role="hr-user"
				showEmail={false}
				showPhone={false}
				showViewProfileAction
				showAttendanceAction={false}
				showPayrollAction={false}
				showTerminateAction={false}
			/>
		</div>
	);
}
