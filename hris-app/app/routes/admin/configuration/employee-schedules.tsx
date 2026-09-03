import { type MetaFunction } from "react-router";
import { EmployeeSchedulesPage } from "~/components/templates/hr/employee-schedules-template";

export const meta: MetaFunction = () => {
	return [
		{ title: "Employee Schedules | Admin" },
		{
			name: "description",
			content: "View and change weekly hours for employees by department or section",
		},
	];
};

export default function AdminEmployeeSchedulesRoute() {
	return <EmployeeSchedulesPage />;
}
