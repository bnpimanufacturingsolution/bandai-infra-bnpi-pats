import { MoreVertical, Eye, Calendar, FileText } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { StatusBadge } from "~/components/atoms/StatusBadge";

type TeamOverviewTabProps = {
	teamEmployees: Array<any>;
};

export default function TeamOverviewTab({ teamEmployees }: TeamOverviewTabProps) {
	const navigate = useNavigate();

	// Map server employees to table rows
	const teamData = useMemo(() => {
		return (teamEmployees || []).map((e) => {
			const firstName = e?.person?.personalInfo?.firstName || "";
			const lastName = e?.person?.personalInfo?.lastName || "";
			const middleName = e?.person?.personalInfo?.middleName || "";
			const name = [firstName, middleName, lastName].filter(Boolean).join(" ");
			const email = e?.person?.contactInfo?.email || "";
			const employmentHireDate = e?.employmentHireDate
				? new Date(e.employmentHireDate).toLocaleDateString("en-US", {
						year: "numeric",
						month: "short",
						day: "numeric",
					})
				: "-";

			return {
				id: e.id,
				name: name || e.employeeId,
				employeeId: e.employeeId,
				email: email,
				level: e?.level?.name || "-",
				jobTitle: e?.position?.title || "-",
				positionCode: e?.position?.code || "-",
				department: e?.department?.name || "-",
				employmentStatus: e?.employmentStatus || "-",
				employmentType: e?.employmentType || "-",
				employmentHireDate: employmentHireDate,
				rawHireDate: e?.employmentHireDate,
			};
		});
	}, [teamEmployees]);

	// Helper to get consistent badge styles (REMOVED: replaced by StatusBadge)
	/*
	const renderStatusBadge = (status: string) => {
		if (!status || status === "-") return <span className="text-gray-400">-</span>;

		const statusKey = status.toLowerCase().replace(/\s+/g, "_");
		const value = capitalizeFirstLetter(status);
		return (
			<span className="status-badge capitalize" data-status={statusKey}>
				{value === "Serving_notice" ? "Serving Notice" : value}
			</span>
		);
	};
	*/

	// Define DataTable columns
	type TeamRow = (typeof teamData)[number];
	const columns: Column<TeamRow>[] = useMemo(
		() => [
			{
				key: "name",
				label: "Name",
				render: (_value, item) => (
					<div
						className="flex flex-col cursor-pointer group"
						onClick={(e) => {
							e.stopPropagation();
							handleViewProfile(item);
						}}>
						<span className="font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline transition-colors">
							{item.name}
						</span>
						{item.email && <span className="text-xs text-gray-500">{item.email}</span>}
					</div>
				),
			},
			{ key: "employeeId", label: "Employee ID" },
			{ key: "level", label: "Level" },
			{ key: "jobTitle", label: "Position" },
			{ key: "department", label: "Department" },
			{
				key: "employmentStatus",
				label: "Status",
				render: (value) => <StatusBadge status={String(value)} className="capitalize" />,
			},
			{ key: "employmentHireDate", label: "Hire Date" },
		],
		[],
	);

	// Build filter options from data
	const unique = (arr: string[]) => Array.from(new Set(arr.filter((v) => v && v !== "-")));
	const filters: FilterOption[] = useMemo(
		() => [
			{
				key: "employmentStatus",
				label: "Status",
				options: unique(teamData.map((t) => t.employmentStatus)).map((v) => ({
					value: v,
					label: String(v).replace(/_/g, " "),
				})),
			},
			{
				key: "employmentType",
				label: "Employment Type",
				options: unique(teamData.map((t) => t.employmentType)).map((v) => ({
					value: v,
					label: String(v).replace(/_/g, " "),
				})),
			},
			{
				key: "jobTitle",
				label: "Position",
				options: unique(teamData.map((t) => t.jobTitle)).map((v) => ({
					value: v,
					label: v,
				})),
			},
		],
		[teamData],
	);

	const handleViewProfile = (item: TeamRow) => {
		navigate(`/employee/${item.id}`);
	};

	const handleViewAttendance = (item: TeamRow) => {
		navigate(`/employee/${item.id}/attendance`);
	};

	const handleCreatePanRequest = (item: TeamRow) => {
		navigate(
			`/employee/requests?action=create&kind=personnel-action&targetEmployeeId=${item.id}`,
		);
	};

	const renderActions = (item: TeamRow) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleViewProfile(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Profile
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleViewAttendance(item)}>
					<Calendar className="h-4 w-4 mr-2" /> View Attendance
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleCreatePanRequest(item)}>
					<FileText className="h-4 w-4 mr-2" /> Create Personnel Action
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<div className="space-y-4">
			<DataTable<TeamRow>
				title="Team Members"
				description=""
				data={teamData}
				columns={columns}
				searchFields={["name", "email", "employeeId", "level", "jobTitle"]}
				filters={filters}
				itemsPerPage={10}
				onView={() => {}}
				renderActions={renderActions}
				emptyMessage="No team members found"
				emptyDescription="Try adjusting your search or filters to find team members."
			/>
		</div>
	);
}
