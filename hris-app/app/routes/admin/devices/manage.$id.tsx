import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { useDevice } from "~/lib/hooks/useDevices";
import { useHikvisionUserSearch, useAcsEvents } from "~/lib/hooks/use-hikvision";
import { Monitor, Users, Activity, ArrowLeft, Calendar } from "lucide-react";
import { formatDateTime } from "~/lib/utils/text-utils";
import type { UserInfoTableData, AcsEventTableData } from "~/types/hikvision";
import { format, subDays } from "date-fns";

type TabType = "users" | "events";

export default function DeviceDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [activeTab, setActiveTab] = useState<TabType>("users");

	// Users tab pagination state from URL
	const userPageParam = Number(searchParams.get("userPage")) || 1;
	const userLimitParam = Number(searchParams.get("userLimit")) || 10;
	const userSearchQuery = searchParams.get("userSearch") || "";

	// Calculate searchResultPosition for Hikvision API
	const userSearchResultPosition = (userPageParam - 1) * userLimitParam;

	// Events tab state
	const today = new Date();
	const defaultStartTime = subDays(today, 1); // Last 24 hours
	const defaultEndTime = today;
	const [startDate, setStartDate] = useState(format(defaultStartTime, "yyyy-MM-dd"));
	const [endDate, setEndDate] = useState(format(defaultEndTime, "yyyy-MM-dd"));
	const eventPageParam = Number(searchParams.get("eventPage")) || 1;
	const eventLimitParam = Number(searchParams.get("eventLimit")) || 10;
	const eventSearchQuery = searchParams.get("eventSearch") || "";
	const eventSearchResultPosition = (eventPageParam - 1) * eventLimitParam;

	// Helper to update search params
	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	// Fetch device details
	const { data: device, isLoading: isLoadingDevice } = useDevice(id || "");

	// Fetch users with server-side pagination
	const {
		data: usersData,
		isLoading: isLoadingUsers,
		error: usersError,
	} = useHikvisionUserSearch({
		deviceId: id,
		searchID: userPageParam === 1 ? "0" : "1",
		searchResultPosition: userSearchResultPosition,
		maxResults: userLimitParam,
		enabled: activeTab === "users",
	});

	// Fetch events with server-side pagination
	const startTime = `${startDate}T00:00:00+08:00`;
	const endTime = `${endDate}T23:59:59+08:00`;
	const {
		data: eventsData,
		isLoading: isLoadingEvents,
		error: eventsError,
		refetch: refetchEvents,
	} = useAcsEvents({
		deviceId: id,
		acsEventCond: {
			searchID: eventPageParam === 1 ? "0" : "1",
			searchResultPosition: eventSearchResultPosition,
			maxResults: eventLimitParam,
			startTime,
			endTime,
			major: 0,
			minor: 0,
			timeReverseOrder: true,
		},
		enabled: activeTab === "events",
	});

	// Map Hikvision users data to table format
	const usersTableData: UserInfoTableData[] = useMemo(() => {
		if (!usersData?.data?.UserInfoSearch?.UserInfo) return [];

		return usersData.data.UserInfoSearch.UserInfo.map((user) => ({
			...user,
			id: user.employeeNo,
			isActive: user.Valid.enable,
			syncedAt: new Date().toISOString(),
		}));
	}, [usersData]);

	// Map Hikvision events data to table format
	const eventsTableData: AcsEventTableData[] = useMemo(() => {
		if (!eventsData?.data?.AcsEvent?.InfoList) return [];

		return eventsData.data.AcsEvent.InfoList.map((event, index) => ({
			...event,
			id: `${event.serialNo}-${index}`,
		}));
	}, [eventsData]);

	// Filter users based on search (client-side on paginated results)
	const filteredUsers = useMemo(() => {
		if (!userSearchQuery) return usersTableData;

		const query = userSearchQuery.toLowerCase();
		return usersTableData.filter(
			(user) =>
				user.name.toLowerCase().includes(query) ||
				user.employeeNo.toLowerCase().includes(query) ||
				user.gender.toLowerCase().includes(query),
		);
	}, [usersTableData, userSearchQuery]);

	// Filter events based on search (client-side on paginated results)
	const filteredEvents = useMemo(() => {
		if (!eventSearchQuery) return eventsTableData;

		const query = eventSearchQuery.toLowerCase();
		return eventsTableData.filter(
			(event) =>
				event.name.toLowerCase().includes(query) ||
				event.employeeNoString.toLowerCase().includes(query) ||
				event.doorNo.toString().includes(query),
		);
	}, [eventsTableData, eventSearchQuery]);

	// Pagination handlers for users
	const handleUserSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("userSearch", query);
			} else {
				next.delete("userSearch");
			}
			next.set("userPage", "1");
		});
	};

	const handleUserPageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("userPage", page.toString());
		});
	};

	// Pagination handlers for events
	const handleEventSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("eventSearch", query);
			} else {
				next.delete("eventSearch");
			}
			next.set("eventPage", "1");
		});
	};

	const handleEventPageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("eventPage", page.toString());
		});
	};

	// Event date filter handler
	const handleApplyDateFilter = () => {
		updateSearchParams((next) => {
			next.set("eventPage", "1");
		});
		refetchEvents();
	};

	// User columns
	const userColumns: Column<UserInfoTableData>[] = useMemo(
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

	// Event columns
	const eventColumns: Column<AcsEventTableData>[] = useMemo(
		() => [
			{
				key: "time",
				label: "Time",
				sortable: true,
				render: (value) => (
					<div className="text-sm font-medium text-gray-900">
						{new Date(value).toLocaleString()}
					</div>
				),
			},
			{
				key: "name",
				label: "Name",
				sortable: true,
				searchable: true,
				render: (value, item) => (
					<div className="flex items-center gap-3">
						{item.pictureURL && (
							<img
								src={item.pictureURL}
								alt={item.name}
								className="w-8 h-8 rounded-full object-cover"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						)}
						<span className="font-medium text-gray-900">{value}</span>
					</div>
				),
			},
			{
				key: "employeeNoString",
				label: "Employee No",
				sortable: true,
				render: (value) => <span className="text-sm text-gray-600">#{value}</span>,
			},
			{
				key: "doorNo",
				label: "Door",
				sortable: true,
				render: (value) => <span className="text-sm text-gray-600">Door {value}</span>,
			},
			{
				key: "currentVerifyMode",
				label: "Verify Mode",
				sortable: true,
				render: (value) => (
					<span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
						{String(value)
							.replace(/([A-Z])/g, " $1")
							.trim()}
					</span>
				),
			},
			{
				key: "mask",
				label: "Mask",
				sortable: true,
				render: (value) => {
					let color = "bg-gray-100 text-gray-800";
					let text = String(value || "unknown");

					if (value === "yes" || value === "true") {
						color = "bg-yellow-100 text-yellow-800";
						text = "Yes";
					} else if (value === "no" || value === "false") {
						color = "bg-green-100 text-green-800";
						text = "No";
					}

					return (
						<span className={`text-xs px-2 py-1 rounded-full ${color}`}>{text}</span>
					);
				},
			},
			{
				key: "cardType",
				label: "Card Type",
				sortable: true,
				render: (value) => <span className="text-sm text-gray-600">Type {value}</span>,
			},
			{
				key: "cardReaderNo",
				label: "Reader",
				render: (value) => <span className="text-sm text-gray-600">Reader {value}</span>,
			},
			{
				key: "userType",
				label: "User Type",
				sortable: true,
				render: (value) => (
					<span className="text-xs capitalize bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
						{String(value)}
					</span>
				),
			},
		],
		[],
	);

	// User filters
	const userFilters: FilterOption[] = useMemo(
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
				options: Array.from(new Set(usersTableData.map((u) => u.gender)))
					.filter((g) => g && g !== "unknown")
					.map((g) => ({
						value: g,
						label: g.charAt(0).toUpperCase() + g.slice(1),
					})),
			},
			{
				key: "userType",
				label: "User Type",
				options: Array.from(new Set(usersTableData.map((u) => u.userType))).map((type) => ({
					value: type,
					label: type.charAt(0).toUpperCase() + type.slice(1),
				})),
			},
		],
		[usersTableData],
	);

	// Event filters
	const eventFilters: FilterOption[] = useMemo(
		() => [
			{
				key: "currentVerifyMode",
				label: "Verify Mode",
				options: Array.from(new Set(eventsTableData.map((e) => e.currentVerifyMode)))
					.filter((m) => m)
					.map((m) => ({
						value: m,
						label: m.replace(/([A-Z])/g, " $1").trim(),
					})),
			},
			{
				key: "mask",
				label: "Mask Status",
				options: [
					{ value: "yes", label: "Yes" },
					{ value: "no", label: "No" },
					{ value: "unknown", label: "Unknown" },
				],
			},
			{
				key: "doorNo",
				label: "Door",
				options: Array.from(new Set(eventsTableData.map((e) => e.doorNo)))
					.sort()
					.map((d) => ({
						value: String(d),
						label: `Door ${d}`,
					})),
			},
			{
				key: "userType",
				label: "User Type",
				options: Array.from(new Set(eventsTableData.map((e) => e.userType)))
					.filter((t) => t)
					.map((t) => ({
						value: t,
						label: t.charAt(0).toUpperCase() + t.slice(1),
					})),
			},
		],
		[eventsTableData],
	);

	const tabs = [
		{
			id: "users" as TabType,
			label: "Users",
			icon: Users,
			count: filteredUsers.length,
		},
		{
			id: "events" as TabType,
			label: "Events",
			icon: Activity,
			count: filteredEvents.length,
		},
	];

	if (isLoadingDevice) {
		return (
			<div className="flex items-center justify-center h-96">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading device details...</p>
				</div>
			</div>
		);
	}

	if (!device) {
		return (
			<div className="flex items-center justify-center h-96">
				<div className="text-center">
					<Monitor className="h-16 w-16 text-gray-300 mx-auto mb-4" />
					<p className="text-lg text-gray-600">Device not found</p>
					<Button onClick={() => navigate("/admin/devices/manage")} className="mt-4">
						Back to Devices
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Back Button */}
			<button
				onClick={() => navigate("/admin/devices/manage")}
				className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
				<ArrowLeft className="h-4 w-4" />
				<span className="text-sm font-medium">Back to Devices</span>
			</button>

			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Monitor className="w-6 h-6 text-blue-600" />
					<h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
					<Badge variant={device.isActive ? "success" : "secondary"}>
						{device.isActive ? "Active" : "Inactive"}
					</Badge>
				</div>
			</div>

			{/* Device Info */}
			<div className="flex items-center gap-8 text-sm">
				<div>
					<span className="text-gray-500">Address: </span>
					<span className="font-medium text-gray-900">
						{device.address}:{device.port}
					</span>
				</div>
				<div>
					<span className="text-gray-500">Protocol: </span>
					<span className="font-medium text-gray-900">
						{device.protocol.toUpperCase()}
					</span>
				</div>
				{device.createdAt && (
					<div>
						<span className="text-gray-500">Created: </span>
						<span className="font-medium text-gray-900">
							{formatDateTime(device.createdAt)}
						</span>
					</div>
				)}
			</div>

			{/* Tab Navigation */}
			<div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
								activeTab === tab.id
									? "bg-white text-blue-600 shadow-sm"
									: "text-gray-600 hover:text-gray-900"
							}`}>
							<div className="flex items-center justify-center gap-2">
								<Icon className="w-4 h-4" />
								{tab.label}
								<Badge
									variant={activeTab === tab.id ? "info" : "secondary"}
									className="ml-1">
									{tab.count}
								</Badge>
							</div>
						</button>
					);
				})}
			</div>

			{/* Tab Content */}
			<div>
				{activeTab === "users" && (
					<div className="space-y-4">
						{usersError && (
							<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
								<p className="text-red-800 font-medium">Error loading users</p>
								<p className="text-red-600 text-sm">{usersError?.message}</p>
							</div>
						)}

						<DataTable<UserInfoTableData>
							title="Device Users"
							description={`Showing ${filteredUsers.length} of ${usersData?.data?.UserInfoSearch?.totalMatches || 0} total users`}
							data={filteredUsers}
							columns={userColumns}
							filters={userFilters}
							isLoading={isLoadingUsers}
							emptyMessage="No users found"
							emptyDescription="No biometric device users are currently registered."
							showSearch={true}
							showFilters={true}
							showPagination={true}
							searchPlaceholder="Search by name, employee number, or gender..."
							searchValue={userSearchQuery}
							onSearch={handleUserSearch}
							itemsPerPage={userLimitParam}
							currentPage={userPageParam}
							totalItems={usersData?.data?.UserInfoSearch?.totalMatches || 0}
							onPageChange={handleUserPageChange}
						/>
					</div>
				)}

				{activeTab === "events" && (
					<div className="space-y-4">
						{/* Date Range Filter */}
						<div className="bg-white rounded-lg border border-gray-200 p-4">
							<div className="flex items-center gap-4 flex-wrap">
								<div className="flex items-center gap-2">
									<Calendar className="w-5 h-5 text-gray-500" />
									<label className="text-sm font-medium text-gray-700">
										From Date:
									</label>
									<input
										type="date"
										value={startDate}
										onChange={(e) => setStartDate(e.target.value)}
										className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
									/>
								</div>

								<div className="flex items-center gap-2">
									<Calendar className="w-5 h-5 text-gray-500" />
									<label className="text-sm font-medium text-gray-700">
										To Date:
									</label>
									<input
										type="date"
										value={endDate}
										onChange={(e) => setEndDate(e.target.value)}
										className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
									/>
								</div>

								<Button onClick={handleApplyDateFilter} variant="default" size="sm">
									Apply Filter
								</Button>
							</div>
						</div>

						{eventsError && (
							<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
								<p className="text-red-800 font-medium">Error loading events</p>
								<p className="text-red-600 text-sm">{eventsError?.message}</p>
							</div>
						)}

						<DataTable<AcsEventTableData>
							title="Events"
							description={`Showing ${filteredEvents.length} of ${eventsData?.data?.AcsEvent?.totalMatches || 0} total events`}
							data={filteredEvents}
							columns={eventColumns}
							filters={eventFilters}
							isLoading={isLoadingEvents}
							emptyMessage="No events found"
							emptyDescription="No access control events found for the selected date range."
							showSearch={true}
							showFilters={true}
							showPagination={true}
							searchPlaceholder="Search by name, employee number, or door..."
							searchValue={eventSearchQuery}
							onSearch={handleEventSearch}
							itemsPerPage={eventLimitParam}
							currentPage={eventPageParam}
							totalItems={eventsData?.data?.AcsEvent?.totalMatches || 0}
							onPageChange={handleEventPageChange}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
