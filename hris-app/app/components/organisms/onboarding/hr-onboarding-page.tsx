import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { SearchableSelect } from "~/components/ui/searchable-select";
import OnboardingChecklistPanel from "./onboarding-checklist-panel";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useOnboardingRoster } from "~/lib/hooks/useOnboarding";
import type { OnboardingRosterEmployee } from "~/zod/onboarding";

/**
 * Onboarding employees list: server-side search/department filters and pagination
 * (10/page) rendered through the shared DataTable — same numbered pager with
 * ellipsis (1 2 3 … 17) and skeleton loading every other admin/HR list uses.
 * Selecting a row opens the signable checklist panel inline; "Open Profile" jumps
 * to the employee profile Onboarding tab.
 */
export default function HrOnboardingPage() {
	const navigate = useNavigate();
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [departmentId, setDepartmentId] = useState("");
	const [page, setPage] = useState(1);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => setSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	// Any filter change resets to the first page.
	useEffect(() => {
		setPage(1);
	}, [search, departmentId]);

	const { data: departmentData } = useDepartments({ limit: 100 });
	const rosterQuery = useOnboardingRoster({
		search,
		departmentId: departmentId || undefined,
		page,
	});
	const employees = rosterQuery.data?.employees ?? [];
	const pagination = rosterQuery.data?.pagination;

	const totalPages = pagination?.totalPages ?? 1;
	const limit = pagination?.limit ?? 10;

	const openProfile = (employeeId: string) => {
		navigate(`/employee/${employeeId}?tab=onboarding&from=hr-onboarding`);
	};

	const columns: Column<OnboardingRosterEmployee>[] = [
		{ key: "employeeNumber", label: "Employee #", sortable: false },
		{
			key: "name",
			label: "Name",
			render: (value) => <span className="font-medium">{String(value ?? "")}</span>,
		},
		{
			key: "department",
			label: "Department",
			render: (value) => <span className="text-gray-600">{(value as string) ?? "—"}</span>,
		},
		{
			key: "employmentStartDate",
			label: "Start Date",
			render: (value) => (
				<span className="text-gray-600">
					{value ? new Date(String(value)).toLocaleDateString() : "—"}
				</span>
			),
		},
		{
			key: "checklist",
			label: "Checklist",
			render: (value) => {
				const checklist = value as OnboardingRosterEmployee["checklist"];
				return checklist ? (
					<span className="text-gray-700">
						{checklist.status} · {checklist.completionPercentage}%
					</span>
				) : (
					<span className="italic text-gray-400">none</span>
				);
			},
		},
	];

	const departmentOptions = [
		{ value: "", label: "All departments" },
		...(departmentData?.departments ?? []).map((dept) => ({
			value: String(dept.id),
			label: dept.name,
		})),
	];

	const hasFilters = Boolean(search || departmentId);

	return (
		<div className="space-y-4">
			<DataTable<OnboardingRosterEmployee>
				title="Onboarding Employees"
				columns={columns}
				data={employees}
				isLoading={rosterQuery.isLoading}
				loadingRows={limit}
				showSearch
				searchPlaceholder="Search name or employee #…"
				searchValue={searchInput}
				onSearch={setSearchInput}
				showFilters={false}
				showExport={false}
				customFilters={
					<SearchableSelect
						options={departmentOptions}
						value={departmentId}
						onValueChange={setDepartmentId}
						placeholder="All departments"
						searchPlaceholder="Search department..."
						emptyText="No departments found."
						triggerAriaLabel="Filter by department"
						className="w-56"
					/>
				}
				emptyMessage={
					rosterQuery.isError
						? "The onboarding service could not be reached."
						: hasFilters
							? "No onboarding employees match your filters."
							: "No employees are currently in onboarding."
				}
				currentPage={pagination?.page ?? page}
				totalPages={totalPages}
				totalItems={pagination?.total ?? employees.length}
				itemsPerPage={limit}
				onPageChange={setPage}
				onRowClick={(employee) =>
					setSelectedEmployeeId((current) =>
						current === employee.employeeId ? null : employee.employeeId,
					)
				}
				rowClassName={(employee) =>
					selectedEmployeeId === employee.employeeId ? "bg-purple-50/60" : ""
				}
				renderActions={(employee) => (
					<Button
						variant="secondary"
						onClick={(event: React.MouseEvent) => {
							event.stopPropagation();
							openProfile(employee.employeeId);
						}}>
						Open Profile
					</Button>
				)}
			/>

			{selectedEmployeeId &&
				(() => {
					const selected = employees.find((e) => e.employeeId === selectedEmployeeId);
					return selected ? (
						<OnboardingChecklistPanel
							employee={{
								id: selected.employeeId,
								employeeNumber: selected.employeeNumber,
								name: selected.name,
							}}
						/>
					) : null;
				})()}
		</div>
	);
}
