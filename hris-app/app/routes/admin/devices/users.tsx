import { useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { useHikvisionUserSearch } from "~/lib/hooks/use-hikvision";
import type { UserInfoTableData } from "~/types/hikvision";

export default function BiometricsDeviceUsersPage() {
	const { id } = useParams();
	const { data, isLoading, error } = useHikvisionUserSearch();
	const [searchValue, setSearchValue] = useState("");

	// Map Hikvision data to table format
	const tableData: UserInfoTableData[] = useMemo(() => {
		if (!data?.data?.UserInfoSearch?.UserInfo) return [];

		return data.data.UserInfoSearch.UserInfo.map((user) => ({
			...user,
			id: user.employeeNo,
			isActive: user.Valid.enable,
			syncedAt: new Date().toISOString(),
		}));
	}, [data]);

	// Filter data based on search
	const filteredData = useMemo(() => {
		if (!searchValue) return tableData;

		const query = searchValue.toLowerCase();
		return tableData.filter(
			(user) =>
				user.name.toLowerCase().includes(query) ||
				user.employeeNo.toLowerCase().includes(query) ||
				user.gender.toLowerCase().includes(query),
		);
	}, [tableData, searchValue]);

	// Define columns
	type TableRow = UserInfoTableData;
	const columns: Column<TableRow>[] = useMemo(
		() => [
			{
				key: "name",
				label: "Name",
				sortable: true,
				searchable: true,
				render: (_value, item) => (
					<div className="flex items-center gap-3">
						{item.faceURL && (
							<img
								src={item.faceURL}
								alt={item.name}
								className="w-8 h-8 rounded-full object-cover"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						)}
						<span className="font-medium text-neutral-900">{item.name}</span>
					</div>
				),
			},
			{
				key: "employeeNo",
				label: "Employee No",
				sortable: true,
				render: (value) => <span className="text-sm text-neutral-600">#{value}</span>,
			},
			{
				key: "gender",
				label: "Gender",
				sortable: true,
				render: (value) => (
					<span className="capitalize text-sm">{String(value || "unknown")}</span>
				),
			},
			{
				key: "isActive",
				label: "Status",
				sortable: true,
				render: (value, item) => {
					const isValid = item.Valid?.enable;
					const isExpired = new Date(item.Valid?.endTime) < new Date();

					let statusColor = "bg-green-100 text-green-800";
					let statusText = "Active";

					if (!isValid) {
						statusColor = "bg-red-100 text-red-800";
						statusText = "Disabled";
					} else if (isExpired) {
						statusColor = "bg-orange-100 text-orange-800";
						statusText = "Expired";
					}

					return (
						<span
							className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor}`}>
							{statusText}
						</span>
					);
				},
			},
			{
				key: "userType",
				label: "User Type",
				sortable: true,
				render: (value) => <span className="text-sm capitalize">{String(value)}</span>,
			},
			{
				key: "numOfCard",
				label: "Cards",
				render: (value) => <span className="text-sm text-neutral-600">{value}</span>,
			},
			{
				key: "numOfFP",
				label: "Fingerprints",
				render: (value) => <span className="text-sm text-neutral-600">{value}</span>,
			},
			{
				key: "numOfFace",
				label: "Face Records",
				render: (value) => <span className="text-sm text-neutral-600">{value}</span>,
			},
			{
				key: "localUIRight",
				label: "Local UI Access",
				sortable: true,
				render: (value) => (
					<span
						className={`px-2 py-1 text-xs rounded-full font-medium ${
							value ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
						}`}>
						{value ? "Enabled" : "Disabled"}
					</span>
				),
			},
			{
				key: "Valid",
				label: "Valid Period",
				render: (_value, item) => (
					<div className="text-sm text-neutral-600">
						<div>{new Date(item.Valid.beginTime).toLocaleDateString()}</div>
						<div className="text-xs">to</div>
						<div>{new Date(item.Valid.endTime).toLocaleDateString()}</div>
					</div>
				),
			},
		],
		[],
	);

	// Build filter options
	const filters: FilterOption[] = useMemo(
		() => [
			{
				key: "isActive",
				label: "Status",
				options: [
					{ value: "true", label: "Active" },
					{ value: "false", label: "Disabled" },
				],
			},
			{
				key: "gender",
				label: "Gender",
				options: Array.from(new Set(tableData.map((u) => u.gender)))
					.filter((g) => g && g !== "unknown")
					.map((g) => ({
						value: g,
						label: g.charAt(0).toUpperCase() + g.slice(1),
					})),
			},
			{
				key: "userType",
				label: "User Type",
				options: Array.from(new Set(tableData.map((u) => u.userType))).map((type) => ({
					value: type,
					label: type.charAt(0).toUpperCase() + type.slice(1),
				})),
			},
		],
		[tableData],
	);

	// Handle search
	const handleSearch = (query: string) => {
		setSearchValue(query);
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
			{error && (
				<div className="shrink-0 rounded-lg border border-red-200 bg-red-50 p-4">
					<p className="font-medium text-red-800">Error loading users</p>
					<p className="text-sm text-red-600">{error?.message}</p>
				</div>
			)}

			<DataTable<TableRow>
				title="Device Users"
				description={`Showing ${filteredData.length} of ${data?.data?.UserInfoSearch?.totalMatches || 0} total users`}
				data={filteredData}
				columns={columns}
				filters={filters}
				isLoading={isLoading}
				emptyMessage="No users found"
				emptyDescription="No biometric device users are currently registered."
				showSearch={true}
				showFilters={true}
				showPagination={true}
				searchPlaceholder="Search by name, employee number, or gender..."
				searchValue={searchValue}
				onSearch={handleSearch}
				itemsPerPage={10}
				className="min-h-0 flex-1"
				containedScroll
			/>
		</div>
	);
}
