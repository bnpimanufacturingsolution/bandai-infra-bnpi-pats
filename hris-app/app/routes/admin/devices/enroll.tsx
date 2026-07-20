import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select } from "~/components/atoms/Select";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { formatDateTime } from "~/lib/utils/text-utils";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { UserCog, Eye, UserPlus, MoreVertical, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import { useDevices, useImportDeviceEnrollment } from "~/lib/hooks/useDevices";
import { useHikvisionUserSearchMutation } from "~/lib/hooks/use-hikvision";
import { useQueryClient } from "@tanstack/react-query";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { HikvisionUserInfo } from "~/types/hikvision";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import deviceService from "~/services/devices.service";
import { DeviceEnrollmentPreviewTable } from "~/components/molecules/device/DeviceEnrollmentPreviewTable";
import type { Employee } from "~/services/employees.service";

interface EnrollFormData {
	deviceId: string;
	deviceUserId: string;
}

interface DeviceEnrollmentPanelProps {
	embedded?: boolean;
}

export function DeviceEnrollmentPanel({ embedded = false }: DeviceEnrollmentPanelProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	const isConfigurationEnrollment = location.pathname.startsWith("/admin/configuration/devices");
	const devicesPath = isConfigurationEnrollment
		? "/admin/configuration/devices"
		: "/admin/devices/manage";
	const actionParamName = embedded ? "enrollmentAction" : "action";
	const idParamName = embedded ? "employeeId" : "id";
	const searchParamName = embedded ? "enrollmentSearch" : "search";
	const pageParamName = embedded ? "enrollmentPage" : "page";
	const limitParamName = embedded ? "enrollmentLimit" : "limit";

	// Get search and filter params from URL
	const searchQuery = searchParams.get(searchParamName) || undefined;
	const pageParam = Number(searchParams.get(pageParamName)) || 1;
	const limitParam = Number(searchParams.get(limitParamName)) || 10;

	const { data: employeesData, isLoading } = useEmployees({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		document: true,
		pagination: true,
		count: true,
	});
	const employeesPayload =
		(employeesData as any)?.employees || (employeesData as any)?.pagination
			? (employeesData as any)
			: Array.isArray((employeesData as any)?.data)
				? {
						employees: (employeesData as any).data,
						pagination: (employeesData as any)?.pagination,
					}
				: (employeesData as any)?.data || {};
	const items: Employee[] = employeesPayload?.employees || [];
	const pagination = employeesPayload?.pagination;

	// Deep link URL params
	const action = searchParams.get(actionParamName);
	const id = searchParams.get(idParamName);

	const activeEmployeeId = action === "enroll" || action === "view" ? id : null;

	const { data: activeEmployee, isLoading: isLoadingEmployee } = useEmployee(
		activeEmployeeId || "",
	);

	const queryClient = useQueryClient();

	// Fetch devices for enrollment
	const { data: devicesData, isLoading: isLoadingDevices } = useDevices({
		limit: 100,
		document: "true",
	});
	const devices = (devicesData as any)?.devices || [];

	const { data: allEmployeesData } = useEmployees({
		limit: 1000,
		document: true,
		pagination: true,
	});
	const allEmployeesPayload =
		(allEmployeesData as any)?.employees || (allEmployeesData as any)?.pagination
			? (allEmployeesData as any)
			: Array.isArray((allEmployeesData as any)?.data)
				? {
						employees: (allEmployeesData as any).data,
						pagination: (allEmployeesData as any)?.pagination,
					}
				: (allEmployeesData as any)?.data || {};
	const allUsers =
		allEmployeesPayload?.employees
			?.map((employee: Employee) => ({
				id: employee.userId || employee.user?.id || employee.id,
				email: employee.user?.email || "",
				firstName: employee.person?.personalInfo?.firstName,
				lastName: employee.person?.personalInfo?.lastName,
			}))
			.filter((user: { id: string; email: string }) => user.id && user.email) || [];

	const getEmployeeDisplayName = (employee?: Employee | null) => {
		const firstName = employee?.person?.personalInfo?.firstName || "";
		const lastName = employee?.person?.personalInfo?.lastName || "";
		return (
			`${firstName} ${lastName}`.trim() ||
			employee?.user?.userName ||
			employee?.user?.email ||
			employee?.employeeId ||
			"Employee"
		);
	};

	// Hikvision user search mutation
	const hikvisionUserSearchMutation = useHikvisionUserSearchMutation();
	const hikvisionSearchRef = useRef(hikvisionUserSearchMutation.mutateAsync);

	useEffect(() => {
		hikvisionSearchRef.current = hikvisionUserSearchMutation.mutateAsync;
	}, [hikvisionUserSearchMutation.mutateAsync]);

	const importEnrollmentMutation = useImportDeviceEnrollment();
	const [deviceUsers, setDeviceUsers] = useState<HikvisionUserInfo[]>([]);
	const [isLoadingDeviceUsers, setIsLoadingDeviceUsers] = useState(false);
	const deviceUsersCacheRef = useRef<Record<string, HikvisionUserInfo[]>>({});
	const lastFetchKeyRef = useRef<string>("");

	const fallbackDeviceUserId = String(
		activeEmployee?.deviceEmpId || activeEmployee?.employeeId || "",
	).trim();

	const deviceUserOptions = useMemo(() => {
		const options = deviceUsers
			.filter((user) => String(user.employeeNo || "").trim())
			.map((user) => ({
				value: String(user.employeeNo).trim(),
				label: `${user.employeeNo} - ${user.name || "Device user"}`,
			}));

		if (
			fallbackDeviceUserId &&
			!options.some((option) => option.value === fallbackDeviceUserId)
		) {
			options.unshift({
				value: fallbackDeviceUserId,
				label: `${fallbackDeviceUserId} - ${activeEmployee?.deviceEmpId ? "Biometric ID" : "Employee ID"}`,
			});
		}

		return options;
	}, [activeEmployee?.deviceEmpId, deviceUsers, fallbackDeviceUserId]);

	// Enroll form
	const { handleSubmit, reset, setValue, watch } = useForm<EnrollFormData>({
		defaultValues: {
			deviceId: "",
			deviceUserId: "",
		},
	});

	const watchedDeviceId = watch("deviceId");
	const watchedDeviceUserId = watch("deviceUserId");

	useEffect(() => {
		if (action !== "enroll" || !fallbackDeviceUserId) return;
		if (!String(watchedDeviceUserId || "").trim()) {
			setValue("deviceUserId", fallbackDeviceUserId);
		}
	}, [action, fallbackDeviceUserId, setValue, watchedDeviceUserId]);

	// Fetch device users when device is selected or import modal is open
	useEffect(() => {
		const shouldFetch = (watchedDeviceId && action === "enroll") || action === "import";
		if (!shouldFetch) {
			if (deviceUsers.length > 0) {
				setDeviceUsers([]);
			}
			lastFetchKeyRef.current = "";
			return;
		}

		const scopeKey = action === "import" ? "import" : `enroll:${watchedDeviceId}`;

		if (deviceUsersCacheRef.current[scopeKey]) {
			setDeviceUsers(deviceUsersCacheRef.current[scopeKey]);
			return;
		}

		if (lastFetchKeyRef.current === scopeKey) {
			return;
		}
		lastFetchKeyRef.current = scopeKey;

		let cancelled = false;
		setIsLoadingDeviceUsers(true);

		const run = async () => {
			const allUsers: HikvisionUserInfo[] = [];
			const pageSize = 200;
			let searchResultPosition = 0;
			let hasMore = true;
			let pageGuard = 0;
			let lastSignature = "";

			while (hasMore && pageGuard < 10) {
				pageGuard += 1;
				const response = await hikvisionSearchRef.current({
					deviceId: watchedDeviceId || undefined,
					searchID: `enroll-${Date.now()}-${searchResultPosition}`,
					searchResultPosition,
					maxResults: pageSize,
				});

				const searchData = response?.data?.UserInfoSearch;
				const users = Array.isArray(searchData?.UserInfo) ? searchData.UserInfo : [];
				const responseStatus = String(searchData?.responseStatusStrg || "").toUpperCase();
				const numOfMatches = Number(searchData?.numOfMatches || users.length || 0);
				const signature = `${users[0]?.employeeNo || "none"}:${users.length}:${responseStatus}`;

				if (signature === lastSignature) {
					hasMore = false;
					break;
				}
				lastSignature = signature;
				allUsers.push(...users);

				if (responseStatus !== "MORE" || numOfMatches <= 0) {
					hasMore = false;
				} else {
					searchResultPosition += numOfMatches;
				}
			}

			const deduped = Array.from(
				new Map(allUsers.map((user) => [String(user.employeeNo), user])).values(),
			);

			if (!cancelled) {
				deviceUsersCacheRef.current[scopeKey] = deduped;
				setDeviceUsers(deduped);
			}
		};

		void run()
			.catch(() => {
				if (!cancelled) {
					setDeviceUsers([]);
					toast.error("Failed to fetch device users");
					lastFetchKeyRef.current = "";
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoadingDeviceUsers(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [watchedDeviceId, action, deviceUsers.length]);

	// Define table columns
	const columns: Column<Employee>[] = [
		{
			key: "employeeName",
			label: "Employee Name",
			width: "200px",
			render: (_value, item) => {
				return (
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-gray-900">
							{getEmployeeDisplayName(item)}
						</p>
						<p className="truncate text-xs text-gray-500">{item.employeeId}</p>
					</div>
				);
			},
		},
		{
			key: "department",
			label: "Department",
			width: "150px",
			render: (_value, item) => {
				const deptName = item.department?.name;
				return <span className="text-sm text-gray-600">{deptName || "N/A"}</span>;
			},
		},
		{
			key: "position",
			label: "Position",
			width: "150px",
			render: (_value, item) => {
				const positionTitle = item.position?.title;
				return <span className="text-sm text-gray-600">{positionTitle || "N/A"}</span>;
			},
		},
		{
			key: "deviceUserId",
			label: "Device User ID",
			width: "150px",
			render: (_value, item) => {
				const deviceUserId =
					item.deviceEmpId || (item.user?.metadata as any)?.device?.access?.empId;
				return <span className="text-sm text-gray-900">{deviceUserId || "-"}</span>;
			},
		},
		{
			key: "accessStatus",
			label: "Access Status",
			width: "150px",
			render: (_value, item) => {
				const accessStatus =
					(item.user?.metadata as any)?.device?.access?.status ||
					(item.deviceEmpId ? "enrolled" : "unenrolled");
				const isEnrolled = accessStatus === "enrolled";
				return (
					<Badge variant={isEnrolled ? "success" : "secondary"}>
						{isEnrolled ? "Enrolled" : "Unenrolled"}
					</Badge>
				);
			},
		},
	];

	const updateSearchParams = useCallback(
		(mutator: (next: URLSearchParams) => void) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				mutator(next);
				return next;
			});
		},
		[setSearchParams],
	);

	const openEnroll = (employee: Employee) => {
		reset({
			deviceId: "",
			deviceUserId: "",
		});
		updateSearchParams((next) => {
			next.set(actionParamName, "enroll");
			next.set(idParamName, employee.id);
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set(actionParamName, "import");
		});
	};

	const handleImportClose = (open: boolean) => {
		if (!open) {
			updateSearchParams((next) => {
				next.delete(actionParamName);
			});
		}
	};

	const onSubmitEnroll = async (data: EnrollFormData) => {
		if (!activeEmployee) {
			toast.error("Employee not found");
			return;
		}

		const targetUserId = activeEmployee.userId || activeEmployee.user?.id;
		if (!targetUserId) {
			toast.error("This employee has no linked login account");
			return;
		}

		if (!data.deviceId || !data.deviceUserId) {
			toast.error("Please select both device and device user");
			return;
		}

		try {
			const normalizedDeviceUserId = String(data.deviceUserId || "").trim();

			await deviceService.enrollDeviceUser({
				userId: targetUserId,
				deviceId: data.deviceId,
				deviceUserId: normalizedDeviceUserId,
			});

			queryClient.invalidateQueries({ queryKey: ["employees"] });
			queryClient.invalidateQueries({ queryKey: ["users"] });

			toast.success("User enrolled successfully");
			reset();
			setDeviceUsers([]);
			updateSearchParams((next) => {
				next.delete(actionParamName);
				next.delete(idParamName);
			});
		} catch (error: any) {
			toast.error(error?.message || "Failed to enroll user");
		}
	};

	const handleView = (item: Employee) => {
		updateSearchParams((next) => {
			next.set(actionParamName, "view");
			next.set(idParamName, item.id);
		});
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading =
		(action === "enroll" || action === "view") && !!activeEmployeeId && isLoadingEmployee;

	// Server-side search handler
	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set(searchParamName, query);
			} else {
				next.delete(searchParamName);
			}
			next.set(pageParamName, "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set(pageParamName, page.toString());
		});
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Employee) => {
		const hasLinkedUser = Boolean(item.userId || item.user?.id);
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center justify-center w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={!hasLinkedUser}
						onClick={() => {
							if (hasLinkedUser) openEnroll(item);
						}}>
						<UserPlus className="h-4 w-4 mr-2" />
						{hasLinkedUser ? "Enroll Employee" : "No linked user"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	return (
		<div className="space-y-6">
			{!embedded && (
				<div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0 space-y-2">
						<Button
							type="button"
							variant="ghost"
							className="h-8 px-0 text-sm text-slate-600 hover:bg-transparent hover:text-slate-900"
							onClick={() => navigate(devicesPath)}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to devices
						</Button>
						<h1 className="text-xl font-semibold text-slate-950">Device Enrollment</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">{devices.length} devices</Badge>
						<Badge variant="secondary">
							{pagination?.total ?? items.length} employees
						</Badge>
					</div>
				</div>
			)}

			<DataTable
				title="Employees"
				data={items}
				columns={columns}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No employees found"
				emptyDescription="No employee records match the current view."
				searchWidth="w-80"
				searchPlaceholder="Search employees..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				onSearch={handleSearch}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportPDF={() => {
					// Export to PDF functionality
					const printWindow = window.open("", "_blank");
					if (printWindow) {
						const tableHTML = `
								<html>
									<head>
										<title>Employees Export - PDF</title>
										<style>
											body { font-family: Arial, sans-serif; margin: 20px; }
											h1 { color: #333; margin-bottom: 20px; }
											table { border-collapse: collapse; width: 100%; }
											th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
											th { background-color: #f2f2f2; font-weight: bold; }
											.status-active { color: green; }
											.status-inactive { color: red; }
										</style>
									</head>
									<body>
										<h1>Employees - PDF Export</h1>
										<p>Generated on: ${formatDateTime(new Date())}</p>
										<table>
											<thead>
												<tr>
													<th>Email</th>
													<th>Employee Name</th>
													<th>Department</th>
													<th>Position</th>
													<th>Status</th>
												</tr>
											</thead>
											<tbody>
												${items
													.map((item: Employee) => {
														const fullName =
															getEmployeeDisplayName(item);
														const deptName =
															item.department?.name || "N/A";
														const positionTitle =
															item.position?.title || "N/A";
														return `
												<tr>
													<td>${item.user?.email || "N/A"}</td>
													<td>${fullName}</td>
													<td>${deptName}</td>
													<td>${positionTitle}</td>
													<td>${item.employmentStatus || "N/A"}</td>
												</tr>
											`;
													})
													.join("")}
											</tbody>
										</table>
									</body>
								</html>
							`;
						printWindow.document.write(tableHTML);
						printWindow.document.close();
						printWindow.print();
					}
				}}
				onExportExcel={() => {
					// Export to Excel functionality
					const csvContent = [
						// Headers
						[
							"Email",
							"Employee Name",
							"Department",
							"Position",
							"Employee ID",
							"Status",
						],
						// Data rows
						...items.map((item: Employee) => {
							return [
								item.user?.email || "",
								getEmployeeDisplayName(item),
								item.department?.name || "",
								item.position?.title || "",
								item.employeeId || "",
								item.employmentStatus || "",
							];
						}),
					]
						.map((row) => row.map((cell: any) => `"${cell}"`).join(","))
						.join("\n");

					const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
					const link = document.createElement("a");
					const url = URL.createObjectURL(blob);
					link.setAttribute("href", url);
					link.setAttribute(
						"download",
						`device_enrollment_employees_${new Date().toISOString().split("T")[0]}.csv`,
					);
					link.style.visibility = "hidden";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}} containedScroll
			/>

			{/* Enroll Employee Modal */}
			<Modal
				open={action === "enroll"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						setDeviceUsers([]);
						updateSearchParams((next) => {
							next.delete(actionParamName);
							next.delete(idParamName);
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "enroll"
						? "Loading Employee..."
						: "Enroll Employee"
				}>
				{isDeepLinkLoading && action === "enroll" ? (
					<div className="py-8 text-center text-gray-500">Loading employee...</div>
				) : (
					<form onSubmit={handleSubmit(onSubmitEnroll)} className="space-y-4">
						{activeEmployee && (
							<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<p className="text-sm font-medium text-slate-900">
									{getEmployeeDisplayName(activeEmployee)}
								</p>
								<p className="text-xs text-slate-500">
									{activeEmployee.employeeId}
									{activeEmployee.user?.email
										? ` - ${activeEmployee.user.email}`
										: ""}
								</p>
							</div>
						)}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Select Device *
							</label>
							<Select
								options={devices.map((device: any) => ({
									value: device.id,
									label: device.name || `${device.address}:${device.port}`,
								}))}
								value={watchedDeviceId}
								onChange={(value) => {
									setValue("deviceId", value);
									setValue("deviceUserId", ""); // Reset device user when device changes
								}}
								placeholder={
									isLoadingDevices ? "Loading devices..." : "Select Device"
								}
								disabled={isLoadingDevices}
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Select Device User *
							</label>
							<SearchableSelect
								options={deviceUserOptions}
								value={watchedDeviceUserId}
								onValueChange={(value) => setValue("deviceUserId", value)}
								placeholder={
									isLoadingDeviceUsers
										? "Loading device users..."
										: !watchedDeviceId
											? "Select a device first"
											: deviceUserOptions.length === 0
												? "No device users found"
												: "Select Device User"
								}
								searchPlaceholder="Search device user by ID or name..."
								emptyText={
									isLoadingDeviceUsers
										? "Loading device users..."
										: "No device users found."
								}
								disabled={isLoadingDeviceUsers || !watchedDeviceId}
							/>
						</div>

						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									reset();
									setDeviceUsers([]);
									updateSearchParams((next) => {
										next.delete(actionParamName);
										next.delete(idParamName);
									});
								}}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									(isLoadingDeviceUsers && !watchedDeviceUserId) ||
									!watchedDeviceId ||
									!watchedDeviceUserId
								}>
								Enroll Employee
							</Button>
						</div>
					</form>
				)}
			</Modal>

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete(actionParamName);
							next.delete(idParamName);
						});
					}
				}}
				title="Employee Details">
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading employee...</div>
				) : activeEmployee && action === "view" ? (
					<div className="space-y-4">
						<div className="flex items-center gap-4">
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
								<UserCog className="h-8 w-8 text-gray-500" />
							</div>
							<div>
								<h3 className="text-lg font-semibold">
									{getEmployeeDisplayName(activeEmployee)}
								</h3>
								<p className="text-gray-600">{activeEmployee.employeeId}</p>
								<Badge
									variant={
										activeEmployee.employmentStatus === "ACTIVE"
											? "success"
											: "secondary"
									}>
									{activeEmployee.employmentStatus}
								</Badge>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Email
								</label>
								<div className="rounded-md border bg-gray-50 p-3">
									{activeEmployee.user?.email || "No linked email"}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Department
								</label>
								<div className="rounded-md border bg-gray-50 p-3">
									{activeEmployee.department?.name || "N/A"}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Position
								</label>
								<div className="rounded-md border bg-gray-50 p-3">
									{activeEmployee.position?.title || "N/A"}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Device User ID
								</label>
								<div className="rounded-md border bg-gray-50 p-3">
									{activeEmployee.deviceEmpId ||
										(activeEmployee.user?.metadata as any)?.device?.access
											?.empId ||
										"-"}
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete(actionParamName);
										next.delete(idParamName);
									});
								}}>
								Close
							</Button>
							<Button
								disabled={!activeEmployee.userId && !activeEmployee.user?.id}
								onClick={() => openEnroll(activeEmployee)}>
								Enroll Employee
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Employee not found</div>
				)}
			</Modal>

			{/* Import Modal */}
			<GenericImportModal
				open={action === "import"}
				onOpenChange={handleImportClose}
				title="Import Device Enrollments"
				description=""
				fields={{
					required: [
						{ key: "EMAIL", label: "Email", required: true, description: "User Email" },
						{
							key: "DEVICE_ID",
							label: "Device ID",
							required: true,
							description: "Device ID (MongoDB ID)",
						},
						{
							key: "DEVICE_USER_ID",
							label: "Device User ID",
							required: true,
							description: "User ID on the device",
						},
					],
					optional: [],
					system: [],
				}}
				customPreviewComponent={DeviceEnrollmentPreviewTable}
				customPreviewProps={{
					users: allUsers,
					devices: devices,
					deviceUsers: deviceUsers,
				}}
				onDownloadTemplate={() => {
					const headers = ["EMAIL", "DEVICE_ID", "DEVICE_USER_ID"];
					const csvContent = headers.join(",") + "\n";
					const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
					const link = document.createElement("a");
					const url = URL.createObjectURL(blob);
					link.setAttribute("href", url);
					link.setAttribute("download", "device_enrollment_template.csv");
					link.style.visibility = "hidden";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}}
				onImport={async (file) => {
					try {
						const result = await importEnrollmentMutation.mutateAsync(file);
						if (result?.summary?.totalRows > 0) {
							toast.success(
								`Import complete: ${result.summary.enrolled} enrolled, ${result.summary.failed} failed`,
							);
							queryClient.invalidateQueries({ queryKey: ["users"] });
							return result;
						}
						return result;
					} catch (error: any) {
						console.error("Import failed:", error);
						toast.error(error.message || "Import failed");
						throw error;
					}
				}}
				isImporting={importEnrollmentMutation.isPending}
			/>
		</div>
	);
}

export default function EnrollPage() {
	return <DeviceEnrollmentPanel />;
}
