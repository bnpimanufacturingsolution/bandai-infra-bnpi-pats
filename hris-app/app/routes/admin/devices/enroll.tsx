import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select } from "~/components/atoms/Select";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { formatDateTime } from "~/lib/utils/text-utils";
import type { Column } from "~/components/atoms/DataTable";
import {
	Eye,
	UserPlus,
	MoreVertical,
	ArrowLeft,
	RefreshCw,
	Link2,
	Unlink,
	FileJson,
	Loader2,
	Activity,
	Clock3,
	XCircle,
	Power,
	Wifi,
	WifiOff,
	AlertTriangle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import {
	useDevices,
	useDeviceSyncPreview,
	useDeviceSyncRuns,
	useDeviceUsers,
	useImportDeviceEnrollment,
	useHikvisionListenerStatus,
	useControlHikvisionListener,
	useLinkDeviceUser,
	useStartDeviceUserSyncJob,
	useDeviceUserSyncJob,
	useCancelDeviceUserSyncJob,
	useSyncDeviceUsers,
	useUnlinkDeviceUser,
} from "~/lib/hooks/useDevices";
import { useHikvisionDeviceUsers } from "~/lib/hooks/use-hikvision";
import { useQueryClient } from "@tanstack/react-query";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { HikvisionUserInfo } from "~/types/hikvision";
import deviceService, {
	type DeviceSyncPreviewRow,
	type DeviceUser,
	type DeviceUserCredentialSummary,
	type DeviceUserSyncMode,
} from "~/services/devices.service";
import type { Employee } from "~/services/employees.service";

interface EnrollFormData {
	deviceId: string;
	deviceUserId: string;
}

interface DeviceEnrollmentPanelProps {
	embedded?: boolean;
	mode?: "sync-review" | "device-users";
}

type SyncCenterDeviceItem = {
	device: any;
	preview?: DeviceSyncPreviewRow;
	vendor: string;
	status: string;
};

type VisibleDeviceUserRow = {
	key: string;
	vendorUserId: string;
	displayName?: string | null;
	userType?: string | null;
	status: DeviceUser["status"] | "SOURCE_ONLY" | "CHECKING_LINK" | "LINK_CHECK_FAILED";
	employeeId?: string | null;
	employee?: DeviceUser["employee"];
	lastSyncedAt?: string | null;
	rawPayload?: any;
	hrisDeviceUser?: DeviceUser;
	sourceUser?: HikvisionUserInfo;
};

type DeviceUserSyncSummary = {
	totalSourceRecords?: number;
	importableRecords?: number;
	created?: number;
	updated?: number;
	linked?: number;
	unmatched?: number;
	conflict?: number;
	disabled?: number;
	skipped?: number;
	failed?: number;
};

type BulkDeviceUserSyncState = {
	open: boolean;
	status: "idle" | "review" | "starting" | "error";
	message: string;
};

type ActiveDeviceUserSyncJob = {
	jobId: string;
};

const DEVICE_USER_SYNC_JOB_STORAGE_KEY = "hris.device-user-sync-job";
const DEFAULT_BULK_DEVICE_USER_SYNC_MODE: DeviceUserSyncMode = "full_refresh";

export function DeviceEnrollmentPanel({ embedded = false, mode = "sync-review" }: DeviceEnrollmentPanelProps) {
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
	const requestedDeviceId = String(searchParams.get("deviceId") || "").trim();
	const shouldAutoSelectFirstDevice = action === "enroll" || action === "import";
	const selectedDeviceId =
		requestedDeviceId || (shouldAutoSelectFirstDevice ? devices[0]?.id || "" : "");
	const selectedDevice = devices.find((device: any) => device.id === selectedDeviceId);
	const activePanelParam = searchParams.get("syncPanel") || (mode === "device-users" ? "users" : "overview");
	const activePanel = ["overview", "users", "logs", "runs"].includes(activePanelParam)
		? activePanelParam
		: "overview";
	const deviceUserStatus = searchParams.get("deviceUserStatus") || "all";
	const deviceUserSearch = searchParams.get("deviceUserSearch") || "";
	const deviceUserView = searchParams.get("deviceUserView") || "shown";
	const deviceUserPage = Math.max(Number(searchParams.get("deviceUserPage") || 1), 1);
	const deviceUserLimit = Math.min(Math.max(Number(searchParams.get("deviceUserLimit") || 8), 1), 25);
	const {
		data: syncPreview,
		isLoading: isLoadingSyncPreview,
		refetch: refetchSyncPreview,
	} = useDeviceSyncPreview(
		{ deviceId: activePanel === "overview" ? "all" : selectedDeviceId || "all" },
		activePanel === "overview" || activePanel === "users" || Boolean(selectedDeviceId),
	);
	const {
		data: syncRunsData,
		isLoading: isLoadingSyncRuns,
		refetch: refetchSyncRuns,
	} = useDeviceSyncRuns(
		selectedDeviceId,
		{ limit: 12 },
		Boolean(selectedDeviceId),
	);
	const {
		data: hikvisionListenerStatus,
		isLoading: isLoadingHikvisionListenerStatus,
		error: hikvisionListenerStatusError,
		refetch: refetchHikvisionListenerStatus,
	} = useHikvisionListenerStatus(activePanel === "overview" || activePanel === "users" || activePanel === "runs");
	const hikvisionListenerControl = useControlHikvisionListener();
	const syncDeviceUsersMutation = useSyncDeviceUsers();
	const startDeviceUserSyncJobMutation = useStartDeviceUserSyncJob();
	const cancelDeviceUserSyncJobMutation = useCancelDeviceUserSyncJob();
	const linkDeviceUserMutation = useLinkDeviceUser();
	const unlinkDeviceUserMutation = useUnlinkDeviceUser();
	const [deviceUserSyncState, setDeviceUserSyncState] = useState<{
		open: boolean;
		status: "idle" | "review" | "syncing" | "complete" | "error";
		message: string;
		summary?: DeviceUserSyncSummary;
	}>({
		open: false,
		status: "idle",
		message: "",
	});
	const [bulkDeviceUserSyncState, setBulkDeviceUserSyncState] = useState<BulkDeviceUserSyncState>({
		open: false,
		status: "idle",
		message: "",
	});
	const [bulkDeviceUserSyncMode, setBulkDeviceUserSyncMode] = useState<DeviceUserSyncMode>(
		DEFAULT_BULK_DEVICE_USER_SYNC_MODE,
	);
	const [activeDeviceUserSyncJob, setActiveDeviceUserSyncJob] = useState<ActiveDeviceUserSyncJob | null>(() => {
		try {
			if (typeof window === "undefined") return null;
			const raw = window.localStorage.getItem(DEVICE_USER_SYNC_JOB_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as ActiveDeviceUserSyncJob) : null;
		} catch {
			return null;
		}
	});
	const {
		data: deviceUserSyncJobProgress,
		isError: isDeviceUserSyncJobError,
	} = useDeviceUserSyncJob(
		activeDeviceUserSyncJob?.jobId,
		Boolean(activeDeviceUserSyncJob?.jobId),
	);
	const deviceUserSyncJobStatus = deviceUserSyncJobProgress?.status;
	const [detailsDeviceUser, setDetailsDeviceUser] = useState<VisibleDeviceUserRow | null>(null);
	const [detailsPhotoUrl, setDetailsPhotoUrl] = useState<string | null>(null);
	const [detailsPhotoState, setDetailsPhotoState] = useState<"idle" | "loading" | "ready" | "error">("idle");
	const [detailsPhotoError, setDetailsPhotoError] = useState("");
	const [linkTarget, setLinkTarget] = useState<VisibleDeviceUserRow | null>(null);
	const [unlinkTarget, setUnlinkTarget] = useState<VisibleDeviceUserRow | null>(null);
	const [selectedEmployeeForLink, setSelectedEmployeeForLink] = useState("");

	const {
		data: allEmployeesData,
		isLoading: isLoadingEmployeeLinkOptions,
		error: employeeLinkOptionsError,
	} = useEmployees({
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
	const employeeLinkOptions =
		allEmployeesPayload?.employees?.map((employee: Employee) => ({
			value: employee.id,
			label: `${getEmployeeDisplayName(employee)} - ${employee.employeeId || "No employee ID"}`,
			description: [
				employee.deviceEmpId ? `Legacy device ID ${employee.deviceEmpId}` : null,
				employee.department?.name,
				employee.position?.title,
			]
				.filter(Boolean)
				.join(" - ") || undefined,
			badge: employee.employeeId || undefined,
		})) || [];

	const importEnrollmentMutation = useImportDeviceEnrollment();

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (activeDeviceUserSyncJob) {
			window.localStorage.setItem(
				DEVICE_USER_SYNC_JOB_STORAGE_KEY,
				JSON.stringify(activeDeviceUserSyncJob),
			);
			return;
		}
		window.localStorage.removeItem(DEVICE_USER_SYNC_JOB_STORAGE_KEY);
	}, [activeDeviceUserSyncJob]);

	useEffect(() => {
		if (!activeDeviceUserSyncJob || !isDeviceUserSyncJobError) return;
		setActiveDeviceUserSyncJob(null);
		setBulkDeviceUserSyncState({
			open: true,
			status: "error",
			message:
				"Previous device-user sync status expired after an API restart or cleanup. You can rerun the refresh safely; per-device sync is retryable and durable Sync Runs remain available below.",
		});
		toast.warning("Previous device-user sync status expired", {
			id: "device-user-sync-progress",
			description: "Open Sync device users again to run the latest device-user refresh.",
		});
	}, [activeDeviceUserSyncJob, isDeviceUserSyncJobError]);

	const fallbackDeviceUserId = String(
		activeEmployee?.deviceEmpId || activeEmployee?.employeeId || "",
	).trim();

	// Enroll form
	const { handleSubmit, reset, setValue, watch } = useForm<EnrollFormData>({
		defaultValues: {
			deviceId: "",
			deviceUserId: "",
		},
	});

	const watchedDeviceId = watch("deviceId");
	const watchedDeviceUserId = watch("deviceUserId");
	const sourceDeviceId =
		activePanel === "users" && selectedDeviceId
			? selectedDeviceId
			: watchedDeviceId || selectedDeviceId;
	const shouldFetchDeviceUsers =
		(watchedDeviceId && action === "enroll") ||
		action === "import" ||
		(activePanel === "users" && Boolean(selectedDeviceId));
	const {
		data: deviceUsersData = [],
		isLoading: isLoadingDeviceUsers,
		isFetching: isFetchingDeviceUsers,
		error: sourceDeviceUsersError,
		refetch: refetchSourceDeviceUsers,
	} = useHikvisionDeviceUsers(sourceDeviceId, Boolean(shouldFetchDeviceUsers));
	const deviceUsers = useMemo(
		() => (shouldFetchDeviceUsers ? deviceUsersData : []),
		[deviceUsersData, shouldFetchDeviceUsers],
	);
	const isReadingDeviceUsers = isLoadingDeviceUsers || isFetchingDeviceUsers;
	const sourceVendorUserIds = useMemo(
		() =>
			Array.from(
				new Set(
					deviceUsers
						.map((user) => String(user.employeeNo || "").trim())
						.filter(Boolean),
				),
			),
		[deviceUsers],
	);
	const sourceVendorUserIdKey = sourceVendorUserIds.join("|");
	const sourceVendorUserIdsForQuery = useMemo(
		() => (sourceVendorUserIdKey ? sourceVendorUserIdKey.split("|") : []),
		[sourceVendorUserIdKey],
	);
	const hasSourceVendorUsers =
		activePanel === "users" && Boolean(selectedDeviceId) && sourceVendorUserIdsForQuery.length > 0;
	const {
		data: sourceMatchedDeviceUsersData,
		isLoading: isLoadingSourceMatchedDeviceUsers,
		isFetching: isFetchingSourceMatchedDeviceUsers,
		isError: isSourceMatchedDeviceUsersError,
		refetch: refetchSourceMatchedDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: Math.min(Math.max(sourceVendorUserIdsForQuery.length, 1), 100),
			vendorUserIds: sourceVendorUserIdsForQuery,
		},
		hasSourceVendorUsers,
	);
	const hasSourceMatchedDeviceUsersData = Boolean(sourceMatchedDeviceUsersData);
	const isCheckingSourceDeviceUserLinks =
		hasSourceVendorUsers &&
		!hasSourceMatchedDeviceUsersData &&
		(isLoadingSourceMatchedDeviceUsers || isFetchingSourceMatchedDeviceUsers);
	const shouldUseSourceScopedDeviceUsers =
		Boolean(selectedDeviceId) &&
		activePanel === "users" &&
		!sourceDeviceUsersError &&
		!isSourceMatchedDeviceUsersError &&
		deviceUserStatus === "all" &&
		!deviceUserSearch &&
		deviceUserView !== "hris";
	const {
		data: dbDeviceUsers,
		isLoading: isLoadingDbDeviceUsers,
		refetch: refetchDbDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 50,
			status: deviceUserStatus,
			query: deviceUserSearch,
		},
		Boolean(selectedDeviceId) && (!shouldUseSourceScopedDeviceUsers || activePanel !== "users"),
	);
	const {
		data: deviceUserSummaryData,
		refetch: refetchDeviceUserSummary,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 1,
		},
		Boolean(selectedDeviceId) && activePanel === "users",
	);
	const {
		data: openDbDeviceUsers,
		isLoading: isLoadingOpenDbDeviceUsers,
		refetch: refetchOpenDbDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 50,
			status: "UNMATCHED",
			query: deviceUserSearch,
		},
		Boolean(selectedDeviceId) &&
			activePanel === "users" &&
			deviceUserStatus === "all" &&
			!shouldUseSourceScopedDeviceUsers,
	);
	const sourceMatchedDeviceUsers = useMemo(() => {
		const nextMatches: Record<string, DeviceUser> = {};
		for (const deviceUser of sourceMatchedDeviceUsersData?.deviceUsers || []) {
			const vendorUserId = String(deviceUser.vendorUserId || "").trim();
			if (vendorUserId) nextMatches[vendorUserId] = deviceUser;
		}
		return nextMatches;
	}, [sourceMatchedDeviceUsersData?.deviceUsers]);
	useEffect(() => {
		if (!deviceUserSyncJobStatus || deviceUserSyncJobStatus === "processing") return;
		void Promise.allSettled([
			refetchSyncPreview(),
			refetchSyncRuns(),
			selectedDeviceId ? refetchSourceDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchOpenDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDeviceUserSummary() : Promise.resolve(),
			selectedDeviceId ? refetchSourceMatchedDeviceUsers() : Promise.resolve(),
		]);
		if (deviceUserSyncJobStatus === "completed") {
			toast.success("Device users synced", {
				id: "device-user-sync-progress",
				description: deviceUserSyncJobProgress?.message || "Configured devices were refreshed successfully.",
			});
		} else if (deviceUserSyncJobStatus === "cancelled") {
			toast.warning("Device-user sync cancelled", {
				id: "device-user-sync-progress",
				description: "The current refresh stopped. Retry will reread the latest device-user truth again.",
			});
		} else {
			toast.error("Device-user sync needs attention", {
				id: "device-user-sync-progress",
				description: deviceUserSyncJobProgress?.message || "One or more devices failed during the device-user refresh.",
			});
		}
	}, [
		deviceUserSyncJobProgress?.message,
		deviceUserSyncJobStatus,
		refetchDbDeviceUsers,
		refetchDeviceUserSummary,
		refetchOpenDbDeviceUsers,
		refetchSourceDeviceUsers,
		refetchSourceMatchedDeviceUsers,
		refetchSyncPreview,
		refetchSyncRuns,
		selectedDeviceId,
	]);
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

	useEffect(() => {
		if (action !== "enroll" || !fallbackDeviceUserId) return;
		if (!String(watchedDeviceUserId || "").trim()) {
			setValue("deviceUserId", fallbackDeviceUserId);
		}
	}, [action, fallbackDeviceUserId, setValue, watchedDeviceUserId]);

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

	const setSelectedDeviceId = (deviceId: string) => {
		updateSearchParams((next) => {
			if (deviceId) next.set("deviceId", deviceId);
			else next.delete("deviceId");
			next.set("deviceUserPage", "1");
		});
	};

	const setActivePanel = (panel: string) => {
		updateSearchParams((next) => {
			next.set("syncPanel", panel);
			if (panel === "users") next.set("action", "device-users");
			if (panel !== "users" && next.get("action") === "device-users") {
				next.set("action", "sync-review");
			}
		});
	};

	const setDeviceUserStatus = (status: string) => {
		updateSearchParams((next) => {
			if (status && status !== "all") next.set("deviceUserStatus", status);
			else next.delete("deviceUserStatus");
			next.set("deviceUserPage", "1");
		});
	};

	const setDeviceUserView = (view: string) => {
		updateSearchParams((next) => {
			if (view && view !== "shown") next.set("deviceUserView", view);
			else next.delete("deviceUserView");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
			next.set("syncPanel", "users");
			next.set("action", "device-users");
		});
	};

	const setDeviceUserPage = (page: number) => {
		updateSearchParams((next) => {
			next.set("deviceUserPage", String(Math.max(page, 1)));
		});
	};

	const refreshSourceDeviceUsers = () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before reading source users");
			return;
		}
		updateSearchParams((next) => {
			next.set("action", "device-users");
			next.set("syncPanel", "users");
			next.set("deviceUserPage", "1");
		});
		void Promise.allSettled([
			refetchSourceDeviceUsers(),
			refetchSyncPreview(),
			refetchDeviceUserSummary(),
			refetchSyncRuns(),
		]);
	};
	const goBackToDeviceUserSummary = () => {
		updateSearchParams((next) => {
			next.delete("deviceId");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.delete("deviceUserView");
			next.delete("deviceUserPage");
			next.set("syncPanel", "users");
			next.set("action", "device-users");
		});
		void refetchSyncPreview();
	};
	const refreshDeviceUserSummary = async () => {
		await Promise.allSettled([refetchSyncPreview(), refetchSyncRuns()]);
	};
	const openBulkDeviceUserSyncReview = () => {
		if (activeDeviceUserSyncJob) {
			setBulkDeviceUserSyncState((current) => ({
				...current,
				open: true,
			}));
			return;
		}
		if (syncCenterDevices.length === 0) {
			toast.error("No configured devices are available to sync");
			return;
		}
		setBulkDeviceUserSyncState({
			open: true,
			status: "review",
			message: "Choose how wide the manual refresh should go, then run it against live device-user truth.",
		});
	};
	const getBulkDeviceUserSyncStartFailureMessage = (error: unknown) => {
		const message =
			typeof error === "object" && error !== null && "message" in error
				? String((error as { message?: unknown }).message || "").trim()
				: "";
		if (
			message.includes("Cannot POST") &&
			message.includes("/api/device/users/sync-jobs")
		) {
			return "This API runtime does not expose the manual device-user sync start route yet. Refresh against the latest API server, then retry.";
		}
		return message || "Device-user sync could not be started.";
	};
	const runBulkDeviceUserSync = async () => {
		if (syncCenterDevices.length === 0) {
			toast.error("No configured devices are available to sync");
			return;
		}
		const request =
			bulkDeviceUserSyncMode === "needs_attention_only"
				? {
						mode: "needs_attention_only" as const,
						deviceIds: needsAttentionDeviceIds,
					}
				: {
						mode: "full_refresh" as const,
					};
		if (
			bulkDeviceUserSyncMode === "needs_attention_only" &&
			needsAttentionDeviceIds.length === 0
		) {
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message: "Every configured device already looks in sync. Switch to Full source refresh if you still want to reread every device user and biometric summary.",
			});
			return;
		}
		setBulkDeviceUserSyncState({
			open: true,
			status: "starting",
			message:
				bulkDeviceUserSyncMode === "needs_attention_only"
					? "Starting the needs-attention refresh and waiting for the first progress heartbeat."
					: "Starting the full source refresh and waiting for the first progress heartbeat.",
		});
		try {
			const data = await startDeviceUserSyncJobMutation.mutateAsync(request);
			if (data?.jobId) {
				setActiveDeviceUserSyncJob({ jobId: data.jobId });
				setBulkDeviceUserSyncState({
					open: true,
					status: "idle",
					message: data.progress?.message || "",
				});
				return;
			}
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message: "Device-user sync did not return a job ID, so progress cannot be tracked yet.",
			});
		} catch (error: unknown) {
			setActiveDeviceUserSyncJob(null);
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message: getBulkDeviceUserSyncStartFailureMessage(error),
			});
		}
	};
	const requestCancelDeviceUserSyncJob = () => {
		if (!activeDeviceUserSyncJob?.jobId) return;
		cancelDeviceUserSyncJobMutation.mutate(activeDeviceUserSyncJob.jobId);
	};

	const openDeviceUserSyncReview = (deviceIdOverride?: string) => {
		const targetDeviceId = deviceIdOverride || selectedDeviceId;
		if (!targetDeviceId) {
			toast.error("Select a device before syncing users");
			return;
		}
		if (deviceIdOverride) setSelectedDeviceId(deviceIdOverride);
		setDeviceUserSyncState({
			open: true,
			status: "review",
			message: "Sync physical device users into HRIS identity records.",
		});
	};

	const handleDeviceUserSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("deviceUserSearch", query);
			else next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
		});
	};

	const runDeviceUserSync = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before syncing users");
			return;
		}
		setDeviceUserSyncState({
			open: true,
			status: "syncing",
			message: "Reading identity records from the physical device.",
		});
		try {
			const result = await syncDeviceUsersMutation.mutateAsync(selectedDeviceId);
			const summary = (result.summary || {}) as DeviceUserSyncSummary;
			await Promise.allSettled([
				refetchSourceDeviceUsers(),
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
				refetchSyncRuns(),
				refetchSyncPreview(),
			]);
			setDeviceUserSyncState({
				open: true,
				status: "complete",
				message: "Device users synced from the physical device.",
				summary,
			});
		} catch (error: any) {
			setDeviceUserSyncState({
				open: true,
				status: "error",
				message: error?.message || "Device user sync failed.",
			});
		}
	};

	const openLinkDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		setLinkTarget(deviceUser);
		setSelectedEmployeeForLink(deviceUser.employeeId || "");
	};

	const submitLinkDeviceUser = async () => {
		if (!linkTarget || !selectedEmployeeForLink) {
			toast.error("Select an employee to link");
			return;
		}
		if (!selectedDeviceId) {
			toast.error("Select a device before linking");
			return;
		}

		try {
			let targetDeviceUser = linkTarget.hrisDeviceUser || null;

			if (!targetDeviceUser) {
				await syncDeviceUsersMutation.mutateAsync(selectedDeviceId);
				const refreshed = await deviceService.getDeviceUsers(selectedDeviceId, {
					limit: 100,
					vendorUserId: linkTarget.vendorUserId,
				});
				targetDeviceUser =
					refreshed.deviceUsers.find(
						(deviceUser) =>
							String(deviceUser.vendorUserId || "").trim() === linkTarget.vendorUserId,
					) || null;
			}

			if (!targetDeviceUser) {
				throw new Error(
					"Device user was read from the source, but was not saved in HRIS after sync. Review sync and try again.",
				);
			}

			await linkDeviceUserMutation.mutateAsync({
				deviceUserId: targetDeviceUser.id,
				employeeId: selectedEmployeeForLink,
			});
			setLinkTarget(null);
			setSelectedEmployeeForLink("");
			await Promise.allSettled([
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
				refetchSyncPreview(),
			]);
		} catch (error: any) {
			toast.error(error?.message || "Failed to link device user");
		}
	};

	const openUnlinkDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		if (!deviceUser.hrisDeviceUser || !deviceUser.employeeId) return;
		setUnlinkTarget(deviceUser);
	};

	const confirmUnlinkDeviceUser = async () => {
		if (!unlinkTarget?.hrisDeviceUser) return;
		try {
			await unlinkDeviceUserMutation.mutateAsync(unlinkTarget.hrisDeviceUser.id);
			toast.success("Device user unlinked");
			setUnlinkTarget(null);
			void Promise.allSettled([
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
			]);
		} catch (error: any) {
			toast.error(error?.message || "Failed to unlink device user");
		}
	};

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
						{hasLinkedUser ? "Link device ID" : "No linked user"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	const dbDeviceUserRows = useMemo(() => {
		const rows = [
			...(dbDeviceUsers?.deviceUsers || []),
			...(openDbDeviceUsers?.deviceUsers || []),
		];
		const byId = new Map<string, DeviceUser>();
		for (const row of rows) {
			if (row?.id) byId.set(row.id, row);
		}
		return Array.from(byId.values());
	}, [dbDeviceUsers?.deviceUsers, openDbDeviceUsers?.deviceUsers]);
	const syncRuns = syncRunsData?.syncRuns || [];
	const latestUserSync = syncRuns.find((run) => run.runType === "DEVICE_USERS");
	const latestLogSync = syncRuns.find((run) => run.runType === "DEVICE_LOGS");
	const selectedLogPreview = (syncPreview?.devices || []).find(
		(row: DeviceSyncPreviewRow) => row.deviceId === selectedDeviceId,
	) || syncPreview?.devices?.[0];
	const metricValue = (value: unknown) =>
		typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "-";
	const getDeviceVendor = (device: any) => {
		const rawVendor =
			device?.config?.vendor || device?.config?.type || device?.config?.source || "Unclassified";
		const vendor = String(rawVendor || "Unclassified").trim();
		if (!vendor) return "Unclassified";
		if (vendor.toLowerCase().includes("zkteco")) return "ZKTeco";
		if (vendor.toLowerCase().includes("hikvision")) return "Hikvision";
		return vendor;
	};
	const previewByDeviceId = new Map(
		(syncPreview?.devices || []).map((row: DeviceSyncPreviewRow) => [row.deviceId, row]),
	);
	const syncCenterDevices: SyncCenterDeviceItem[] = devices.map((device: any) => {
		const preview = previewByDeviceId.get(device.id);
		const vendor = preview?.vendor || getDeviceVendor(device);
		const missingCount = preview?.missingEventCount ?? preview?.needsSyncEvents;
		const failedCount = preview?.failedEventCount;
		const hasError = Boolean(preview?.error);
		const hasMissing = typeof missingCount === "number" && missingCount > 0;
		const hasFailed = typeof failedCount === "number" && failedCount > 0;
		const status =
			!preview
				? "not_checked"
				: hasError || hasFailed
					? "needs_attention"
					: hasMissing
						? "needs_sync"
						: preview.status || "synced";
		return { device, preview, vendor, status };
	});
	const deviceNeedsUserRefresh = (item: SyncCenterDeviceItem) => {
		const sourceCount = item.preview?.vendorUserCount;
		const hrisCount = item.preview?.hrisUserCount;
		const openCount = item.preview?.openUserCount;
		const conflictCount = item.preview?.conflictUserCount;
		const hasCountMismatch =
			typeof sourceCount === "number" &&
			typeof hrisCount === "number" &&
			sourceCount !== hrisCount;
		return (
			hasCountMismatch ||
			Number(openCount || 0) > 0 ||
			Number(conflictCount || 0) > 0 ||
			item.status === "needs_attention"
		);
	};
	const needsAttentionSyncCenterDevices = syncCenterDevices.filter(deviceNeedsUserRefresh);
	const needsAttentionDeviceIds = needsAttentionSyncCenterDevices.map((item) => item.device.id);
	const selectedSyncCenterItem = syncCenterDevices.find((item) => item.device.id === selectedDeviceId);
	const syncCenterHasHikvisionDevices = syncCenterDevices.some((item) => item.vendor === "Hikvision");
	const hikvisionListenerRunning = Boolean(hikvisionListenerStatus?.running);
	const hikvisionSdkState = String(hikvisionListenerStatus?.sdk?.state || "unknown").trim();
	const hikvisionSdkReceiving = Boolean(hikvisionListenerStatus?.sdk?.receivingCallbacks);
	const hikvisionSdkPosting = Boolean(hikvisionListenerStatus?.sdk?.postingToHris);
	const hikvisionSdkArmed = Boolean(hikvisionListenerStatus?.sdk?.armed);
	const hikvisionListenerToneClass =
		hikvisionSdkReceiving || hikvisionSdkArmed
			? "border-emerald-200 bg-emerald-50 text-emerald-950"
			: hikvisionListenerStatusError
				? "border-red-200 bg-red-50 text-red-950"
				: "border-amber-200 bg-amber-50 text-amber-950";
	const hikvisionListenerTitle = isLoadingHikvisionListenerStatus
		? "Checking Hikvision listener"
		: hikvisionSdkReceiving
			? "SDK listener receiving callbacks"
			: hikvisionSdkState === "posting_failed"
				? "SDK listener cannot post back to HRIS"
				: hikvisionSdkState === "login_failed"
					? "SDK listener login failed"
					: hikvisionSdkArmed
						? "SDK listener armed"
						: hikvisionListenerRunning
							? "VM listener running without fresh callback proof"
							: "VM listener stopped";
	const hikvisionListenerSummary = hikvisionListenerStatusError
		? "Listener status is unavailable right now."
		: hikvisionSdkReceiving
			? "Callbacks are reaching the VM and the listener is actively receiving device events."
			: hikvisionSdkPosting
				? "The listener is posting to HRIS, but a fresh callback has not been observed in this window."
				: hikvisionListenerRunning
					? "The VM service is up, but there is no fresh callback proof yet."
					: "Start or restart the VM listener before testing device-to-device biometric sync.";
	const formatSyncCenterTime = (value?: string | null) => (value ? formatDateTime(value) : "-");
	const runSyncCenterListenerAction = (action: "start" | "restart") => {
		hikvisionListenerControl.mutate(action, {
			onSuccess: () => {
				void refetchHikvisionListenerStatus();
			},
		});
	};
	const getDeviceUserSource = (deviceUser?: { rawPayload?: any } | null) => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		const source = raw?.hrisSync?.source || raw?.source || raw?.syncSource || "";
		if (String(source).toLowerCase() === "legacy-backfill") return "historical";
		return "physical";
	};
	const getDeviceUserSourceLabel = (deviceUser?: { rawPayload?: any } | null) =>
		getDeviceUserSource(deviceUser) === "historical" ? "Historical HRIS backfill" : "Physical device";
	const getDeviceUserCredentialSummary = (deviceUser?: { rawPayload?: any } | null): DeviceUserCredentialSummary => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		const metaSummary = raw?._hrisDeviceMetadata?.credentialSummary || {};
		const fingerprintCount = Number(metaSummary.fingerprintCount ?? raw?.numOfFP ?? raw?.UserInfo?.numOfFP ?? 0) || 0;
		const cardCount = Number(metaSummary.cardCount ?? raw?.numOfCard ?? raw?.UserInfo?.numOfCard ?? 0) || 0;
		const faceCount = Number(metaSummary.faceCount ?? raw?.numOfFace ?? raw?.UserInfo?.numOfFace ?? 0) || 0;
		return {
			fingerprintCount,
			cardCount,
			faceCount,
			hasFingerprint: Boolean(metaSummary.hasFingerprint ?? fingerprintCount > 0),
			hasCard: Boolean(metaSummary.hasCard ?? cardCount > 0),
			hasFace: Boolean(metaSummary.hasFace ?? faceCount > 0),
		};
	};
	const getDeviceUserFaceUrl = (deviceUser?: { rawPayload?: any } | null) => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		return String(raw?.faceURL || raw?.UserInfo?.faceURL || "").trim();
	};
	const getDeviceUserDisplayName = (deviceUser?: VisibleDeviceUserRow | null) =>
		deviceUser?.displayName || String((deviceUser?.rawPayload as any)?.name || "").trim() || `User ${deviceUser?.vendorUserId || "-"}`;
	const physicalDeviceUserRows = dbDeviceUserRows.filter((deviceUser) => getDeviceUserSource(deviceUser) === "physical");
	const hrisDeviceUsersByVendorId = new Map<string, DeviceUser>();
	for (const deviceUser of [...physicalDeviceUserRows, ...Object.values(sourceMatchedDeviceUsers)]) {
		const vendorUserId = String(deviceUser.vendorUserId || "").trim();
		if (vendorUserId) hrisDeviceUsersByVendorId.set(vendorUserId, deviceUser);
	}
	const sourceDeviceUserRows = deviceUsers
		.filter((user) => String(user.employeeNo || "").trim())
		.map<VisibleDeviceUserRow>((user) => {
			const vendorUserId = String(user.employeeNo || "").trim();
			const hrisDeviceUser = hrisDeviceUsersByVendorId.get(vendorUserId);
			const isLinkCheckFailed = hasSourceVendorUsers && isSourceMatchedDeviceUsersError;
			const isLinkCheckPending =
				!hrisDeviceUser &&
				isCheckingSourceDeviceUserLinks &&
				!isLinkCheckFailed;
			return {
				key: hrisDeviceUser?.id || `source:${vendorUserId}`,
				vendorUserId,
				displayName: hrisDeviceUser?.displayName || user.name || `User ${vendorUserId}`,
				userType: hrisDeviceUser?.userType || user.userType,
				status: hrisDeviceUser?.status || (isLinkCheckFailed ? "LINK_CHECK_FAILED" : isLinkCheckPending ? "CHECKING_LINK" : "SOURCE_ONLY"),
				employeeId: hrisDeviceUser?.employeeId || null,
				employee: hrisDeviceUser?.employee || null,
				lastSyncedAt: hrisDeviceUser?.lastSyncedAt || null,
				rawPayload: hrisDeviceUser?.rawPayload || { UserInfo: user },
				hrisDeviceUser,
				sourceUser: user,
			};
		});
	const sourceVendorIds = new Set(sourceDeviceUserRows.map((row) => row.vendorUserId));
	const hrisOnlyDeviceUserRows = physicalDeviceUserRows
		.filter((deviceUser) => !sourceVendorIds.has(String(deviceUser.vendorUserId || "").trim()))
		.map<VisibleDeviceUserRow>((deviceUser) => ({
			key: deviceUser.id,
			vendorUserId: deviceUser.vendorUserId,
			displayName: deviceUser.displayName,
			userType: deviceUser.userType,
			status: deviceUser.status,
			employeeId: deviceUser.employeeId,
			employee: deviceUser.employee,
			lastSyncedAt: deviceUser.lastSyncedAt,
			rawPayload: deviceUser.rawPayload,
			hrisDeviceUser: deviceUser,
		}));
	const mergedDeviceUserRows = sourceDeviceUserRows.length
		? [...sourceDeviceUserRows, ...hrisOnlyDeviceUserRows]
		: hrisOnlyDeviceUserRows;
	const viewDeviceUserRows = mergedDeviceUserRows.filter((row) => {
		if (deviceUserView === "source") return Boolean(row.sourceUser);
		if (deviceUserView === "hris") return Boolean(row.hrisDeviceUser);
		if (deviceUserView === "linked") return row.status === "ACTIVE" && Boolean(row.employeeId);
		if (deviceUserView === "open") {
			return row.status === "SOURCE_ONLY" || row.status === "UNMATCHED";
		}
		return true;
	});
	const normalizedDeviceUserSearch = deviceUserSearch.trim().toLowerCase();
	const visibleDeviceUserRows = viewDeviceUserRows.filter((row) => {
		const statusMatch =
			deviceUserStatus === "all" ||
			row.status === deviceUserStatus ||
			(deviceUserStatus === "UNMATCHED" && row.status === "SOURCE_ONLY");
		if (!statusMatch) return false;
		if (!normalizedDeviceUserSearch) return true;
		return [
			row.vendorUserId,
			row.displayName,
			row.userType,
			row.employee?.employeeId,
			row.employee?.fullName,
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(normalizedDeviceUserSearch));
	});
	const deviceUserTotalPages = Math.max(Math.ceil(visibleDeviceUserRows.length / deviceUserLimit), 1);
	const safeDeviceUserPage = Math.min(deviceUserPage, deviceUserTotalPages);
	const pagedDeviceUserRows = visibleDeviceUserRows.slice(
		(safeDeviceUserPage - 1) * deviceUserLimit,
		safeDeviceUserPage * deviceUserLimit,
	);
	const deviceUserSummary = deviceUserSummaryData?.summary;
	const physicalSourceCount =
		selectedSyncCenterItem?.preview?.vendorUserCount ?? sourceDeviceUserRows.length;
	const physicalHrisUserCount = deviceUserSummary?.total ?? physicalDeviceUserRows.length;
	const shownDeviceUserCount = visibleDeviceUserRows.length;
	const linkedPhysicalUserCount =
		deviceUserSummary?.matched ??
		mergedDeviceUserRows.filter(
			(deviceUser) => deviceUser.status === "ACTIVE" && Boolean(deviceUser.employeeId),
		).length;
	const openPhysicalUserCount =
		deviceUserSummary?.unmatched ??
		mergedDeviceUserRows.filter(
			(deviceUser) =>
				deviceUser.status === "SOURCE_ONLY" ||
				deviceUser.status === "UNMATCHED",
		).length;
	const usersToSaveCount = Math.max(Number(physicalSourceCount || 0) - physicalHrisUserCount, 0);
	const completedDeviceUserSyncItems = [
		["Read from device", deviceUserSyncState.summary?.totalSourceRecords],
		["Imported to HRIS", deviceUserSyncState.summary?.importableRecords],
		["Created", deviceUserSyncState.summary?.created],
		["Updated", deviceUserSyncState.summary?.updated],
		["Auto-linked", deviceUserSyncState.summary?.linked],
		["Needs link", deviceUserSyncState.summary?.unmatched],
		["Needs review", deviceUserSyncState.summary?.conflict],
		["Skipped/off", (deviceUserSyncState.summary?.skipped || 0) + (deviceUserSyncState.summary?.disabled || 0)],
	] as const;
	const deviceUserSyncJobProcessed = Number(deviceUserSyncJobProgress?.processedDevices || 0);
	const deviceUserSyncJobTotal = Math.max(Number(deviceUserSyncJobProgress?.totalDevices || syncCenterDevices.length || 1), 1);
	const deviceUserSyncJobMode = deviceUserSyncJobProgress?.syncMode || DEFAULT_BULK_DEVICE_USER_SYNC_MODE;
	const deviceUserSyncJobPercent = deviceUserSyncJobProgress
		? Math.min(100, Math.round((deviceUserSyncJobProcessed / deviceUserSyncJobTotal) * 100))
		: 0;
	const deviceUserSyncJobIsProcessing = deviceUserSyncJobStatus === "processing";
	const deviceUserSyncJobCancelRequested = Boolean(deviceUserSyncJobProgress?.cancelRequested);
	const deviceUserSyncJobToneClass =
		deviceUserSyncJobStatus === "failed"
			? "border-red-200 bg-red-50 text-red-950"
			: deviceUserSyncJobStatus === "cancelled"
				? "border-amber-200 bg-amber-50 text-amber-950"
				: deviceUserSyncJobStatus === "completed"
					? "border-emerald-200 bg-emerald-50 text-emerald-950"
					: "border-orange-200 bg-orange-50 text-orange-950";
	const deviceUserSyncJobFillClass =
		deviceUserSyncJobStatus === "failed"
			? "bg-red-600"
			: deviceUserSyncJobStatus === "cancelled"
				? "bg-amber-600"
				: deviceUserSyncJobStatus === "completed"
					? "bg-emerald-600"
					: "bg-orange-600";
	const deviceUserSyncJobTitle =
		deviceUserSyncJobStatus === "cancelled"
			? "Sync cancelled"
			: deviceUserSyncJobStatus === "failed"
				? "Sync needs attention"
				: deviceUserSyncJobStatus === "completed"
					? "Sync finished"
					: deviceUserSyncJobIsProcessing
						? deviceUserSyncJobCancelRequested
							? "Cancelling device-user refresh"
							: deviceUserSyncJobMode === "needs_attention_only"
								? "Refreshing devices that need attention"
								: "Refreshing all device users"
						: "Device-user sync status";
	const bulkDeviceUserSyncSummaryItems = [
		["Configured devices", deviceUserSyncJobProgress?.totalDevices ?? syncCenterDevices.length],
		["Completed", deviceUserSyncJobProgress?.processedDevices ?? 0],
		["Synced", deviceUserSyncJobProgress?.successfulDevices ?? 0],
		["Needs attention", deviceUserSyncJobProgress?.failedDevices ?? 0],
	] as const;
	const bulkDeviceUserSyncResults = deviceUserSyncJobProgress?.results || [];
	const deviceUserSyncJobSummary =
		deviceUserSyncJobProgress
			? `${
					deviceUserSyncJobMode === "needs_attention_only"
						? "Needs-attention scope"
						: "Full source refresh"
				}: ${metricValue(deviceUserSyncJobProgress.successfulDevices)} devices synced, ${metricValue(deviceUserSyncJobProgress.failedDevices)} need attention.`
			: "";
	const bulkDeviceUserSyncToneClass =
		bulkDeviceUserSyncState.status === "error"
			? "border-red-200 bg-red-50 text-red-950"
			: bulkDeviceUserSyncState.status === "starting"
				? "border-orange-200 bg-orange-50 text-orange-950"
				: "border-orange-200 bg-orange-50 text-orange-950";
	const bulkDeviceUserSyncTitle =
		bulkDeviceUserSyncState.status === "error"
			? "Sync could not start"
			: bulkDeviceUserSyncState.status === "starting"
				? "Starting device-user sync"
				: bulkDeviceUserSyncState.message || "Run a manual device-user refresh across configured devices.";
	const bulkDeviceUserSyncModeDescription =
		bulkDeviceUserSyncMode === "needs_attention_only"
			? "Refresh only devices with a count mismatch, unresolved links, conflicts, or an existing attention flag."
			: "Default and recommended. Reread every source user for each configured device and refresh saved biometric summaries even when the visible gap is zero.";
	const bulkDeviceUserSyncScopeItems = [
		["Full refresh scope", syncCenterDevices.length],
		["Needs-attention scope", needsAttentionSyncCenterDevices.length],
	] as const;
	const devicesByVendor = syncCenterDevices.reduce<Record<string, SyncCenterDeviceItem[]>>(
		(groups, item) => {
			const vendor = item.vendor || "Unclassified";
			groups[vendor] = groups[vendor] || [];
			groups[vendor].push(item);
			return groups;
		},
		{},
	);
	const vendorGroups = Object.entries(devicesByVendor).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const getSyncStatusLabel = (status: string) => {
		if (status === "synced") return "Synced";
		if (status === "needs_sync") return "Needs sync";
		if (status === "needs_attention") return "Needs attention";
		if (status === "source_total_unavailable") return "Source unavailable";
		return "Not checked";
	};
	const getSyncStatusBadge = (status: string) => {
		if (status === "synced") return "success";
		if (status === "needs_attention") return "destructive";
		if (status === "needs_sync" || status === "source_total_unavailable") return "warning";
		return "secondary";
	};
	const getSourceReadLabel = (vendor?: string) => {
		const normalized = String(vendor || "").toLowerCase();
		if (normalized.includes("hikvision")) return "ISAPI source";
		if (normalized.includes("zkteco")) return "SDK source";
		return "Device API";
	};
	const openDevicePanel = (deviceId: string, panel: "users" | "logs" | "runs") => {
		updateSearchParams((next) => {
			next.set("deviceId", deviceId);
			next.set("syncPanel", panel);
			next.set("action", panel === "users" ? "device-users" : "sync-review");
		});
	};
	const openPhysicalDeviceUsers = (deviceId: string) => {
		updateSearchParams((next) => {
			next.set("deviceId", deviceId);
			next.set("syncPanel", "users");
			next.set("action", "device-users");
			next.set("deviceUserView", "source");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
		});
	};
	const openDeviceEvents = (view = "saved") => {
		if (!selectedDeviceId) return;
		navigate(`/admin/configuration/devices/events?deviceId=${encodeURIComponent(selectedDeviceId)}&view=${view}`);
	};
	const openLogSyncReview = () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before reviewing logs");
			return;
		}
		navigate(`/admin/configuration/devices/events?deviceId=${encodeURIComponent(selectedDeviceId)}&view=saved&action=sync-logs`);
	};
	const getDeviceUserBadgeVariant = (status?: string) => {
		if (status === "ACTIVE") return "success";
		if (status === "CONFLICT") return "warning";
		if (status === "DISABLED") return "secondary";
		if (status === "CHECKING_LINK") return "secondary";
		if (status === "LINK_CHECK_FAILED") return "destructive";
		return "warning-soft";
	};
	const getDeviceUserStatusLabel = (status?: string) => {
		if (status === "SOURCE_ONLY") return "Open";
		if (status === "ACTIVE") return "Linked";
		if (status === "UNMATCHED") return "Open";
		if (status === "CONFLICT") return "Review";
		if (status === "DISABLED") return "Off";
		if (status === "CHECKING_LINK") return "Checking link";
		if (status === "LINK_CHECK_FAILED") return "Check failed";
		return status || "-";
	};

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;

		if (!detailsDeviceUser?.hrisDeviceUser?.id || !getDeviceUserFaceUrl(detailsDeviceUser)) {
			setDetailsPhotoState("idle");
			setDetailsPhotoError("");
			setDetailsPhotoUrl((current) => {
				if (current) URL.revokeObjectURL(current);
				return null;
			});
			return;
		}

		setDetailsPhotoState("loading");
		setDetailsPhotoError("");

		void deviceService
			.getDeviceUserPhoto(detailsDeviceUser.hrisDeviceUser.id)
			.then((blob) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setDetailsPhotoUrl((current) => {
					if (current) URL.revokeObjectURL(current);
					return objectUrl;
				});
				setDetailsPhotoState("ready");
			})
			.catch((error: any) => {
				if (cancelled) return;
				setDetailsPhotoState("error");
				setDetailsPhotoError(error?.message || "Failed to load device user photo");
				setDetailsPhotoUrl((current) => {
					if (current) URL.revokeObjectURL(current);
					return null;
				});
			});

		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [detailsDeviceUser]);

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
						<h1 className="text-xl font-semibold text-slate-950">Sync Center</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">{devices.length} devices</Badge>
						<Badge variant="secondary">
							{pagination?.total ?? items.length} employees
						</Badge>
					</div>
				</div>
			)}

			<Tabs value={activePanel} onValueChange={setActivePanel} className="space-y-4">
				<TabsList className="grid h-auto w-full grid-cols-4 rounded-md bg-slate-100 p-1">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="users">Device Users</TabsTrigger>
					<TabsTrigger value="logs">Device Logs</TabsTrigger>
					<TabsTrigger value="runs">Sync Runs</TabsTrigger>
				</TabsList>

				{syncCenterHasHikvisionDevices ? (
					<section className={`rounded-xl border p-4 ${hikvisionListenerToneClass}`}>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="flex min-w-0 gap-3">
								<div
									className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
										hikvisionSdkReceiving || hikvisionSdkArmed
											? "bg-emerald-100 text-emerald-700"
											: hikvisionListenerStatusError
												? "bg-red-100 text-red-700"
												: "bg-amber-100 text-amber-700"
									}`}>
									{isLoadingHikvisionListenerStatus ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : hikvisionSdkReceiving ? (
										<Wifi className="h-4 w-4" />
									) : hikvisionListenerStatusError ? (
										<AlertTriangle className="h-4 w-4" />
									) : (
										<WifiOff className="h-4 w-4" />
									)}
								</div>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm font-semibold">{hikvisionListenerTitle}</p>
										<Badge
											variant={
												hikvisionSdkReceiving || hikvisionSdkArmed
													? "success"
													: hikvisionListenerStatusError
														? "destructive"
														: "warning"
											}>
											{hikvisionSdkState.replace(/_/g, " ")}
										</Badge>
									</div>
									<p className="mt-1 text-sm opacity-90">{hikvisionListenerSummary}</p>
									<p className="mt-2 text-xs opacity-80">
										Job tracking survives page refresh, but an API restart expires the in-memory active job id. You can safely rerun the refresh, and durable per-device results remain visible in Sync Runs.
									</p>
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									className="h-9 px-3"
									disabled={hikvisionListenerControl.isPending || isLoadingHikvisionListenerStatus}
									onClick={() => void refetchHikvisionListenerStatus()}>
									<RefreshCw className="h-4 w-4" />
									Check listener
								</Button>
								<Button
									type="button"
									variant="outline"
									className="h-9 px-3"
									disabled={hikvisionListenerControl.isPending}
									onClick={() =>
										runSyncCenterListenerAction(hikvisionListenerRunning ? "restart" : "start")
									}>
									{hikvisionListenerControl.isPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : hikvisionListenerRunning ? (
										<RefreshCw className="h-4 w-4" />
									) : (
										<Power className="h-4 w-4" />
									)}
									{hikvisionListenerRunning ? "Restart listener" : "Start listener"}
								</Button>
							</div>
						</div>

						<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
							{[
								["VM service", hikvisionListenerRunning ? "Running" : "Stopped"],
								["Last callback", formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastAlarmAt)],
								["Last HRIS post", formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastPostAt)],
								["Last login", formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastLoginAt)],
								["Checked", formatSyncCenterTime(hikvisionListenerStatus?.checkedAt)],
							].map(([label, value]) => (
								<div key={label} className="rounded-lg border border-current/10 bg-white/70 px-3 py-2">
									<p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
									<p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
								</div>
							))}
						</div>

						{hikvisionListenerStatus?.sdk?.lastError ? (
							<p className="mt-3 rounded-lg border border-current/15 bg-white/70 px-3 py-2 text-sm text-slate-900">
								{hikvisionListenerStatus.sdk.lastError}
							</p>
						) : null}
					</section>
				) : null}

				<TabsContent value="overview" className="m-0 space-y-3">
					{isLoadingDevices || isLoadingSyncPreview ? (
						<div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
							<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
							Loading device sync...
						</div>
					) : vendorGroups.length === 0 ? (
						<div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
							No configured physical devices found.
						</div>
					) : (
						<Accordion
							type="multiple"
							defaultValue={vendorGroups.map(([vendor]) => vendor)}
							className="space-y-2">
							{vendorGroups.map(([vendor, group]) => {
								const attentionCount = group.filter((item) => item.status !== "synced").length;
								const groupUserTotal = group.reduce((total, item) => {
									const count = item.preview?.vendorUserCount;
									return total + (typeof count === "number" && Number.isFinite(count) ? count : 0);
								}, 0);
								const groupHrisUserTotal = group.reduce((total, item) => {
									const count = item.preview?.hrisUserCount;
									return total + (typeof count === "number" && Number.isFinite(count) ? count : 0);
								}, 0);
								return (
									<AccordionItem
										key={vendor}
										value={vendor}
										className="rounded-md border border-slate-200 bg-white px-3">
										<AccordionTrigger className="py-2 hover:no-underline">
											<div className="flex w-full items-center justify-between gap-3 pr-3 text-left">
												<div className="min-w-0">
													<p className="text-sm font-semibold text-slate-950">{vendor}</p>
													<p className="mt-0.5 text-xs text-slate-500">
														Source users: {metricValue(groupUserTotal)}. Saved in HRIS: {metricValue(groupHrisUserTotal)}.
													</p>
												</div>
												<Badge variant={attentionCount ? "warning" : "success"}>
													{attentionCount ? `${attentionCount}/${group.length} review` : `${group.length}/${group.length} synced`}
												</Badge>
											</div>
										</AccordionTrigger>
										<AccordionContent className="pb-3">
											<div className="overflow-hidden rounded-md border border-slate-200">
												<div className="hidden grid-cols-[minmax(180px,1.35fr)_132px_118px_132px_132px_108px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 xl:grid">
													<span>Device</span>
													<span>Address</span>
													<span>Status</span>
													<span>Source / gap</span>
													<span>HRIS users</span>
													<span>Last sync</span>
													<span className="text-right">Actions</span>
												</div>
												{group.map(({ device, preview, status }) => {
													const isSelected = device.id === selectedDeviceId;
													const sourceUserTotal = preview?.vendorUserCount;
													const hrisUserTotal = preview?.hrisUserCount;
													const openUserTotal = preview?.openUserCount;
													const userGap =
														typeof sourceUserTotal === "number" && typeof hrisUserTotal === "number"
															? Math.max(sourceUserTotal - hrisUserTotal, 0)
															: null;
													const lastSyncAt =
														device.id === selectedDeviceId
															? latestUserSync?.completedAt ||
																latestLogSync?.completedAt ||
																latestUserSync?.startedAt ||
																latestLogSync?.startedAt
															: preview?.lastSourceEventAt;
													return (
														<div
															key={device.id}
															className={`grid gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 xl:grid-cols-[minmax(180px,1.35fr)_132px_118px_132px_132px_108px_96px] xl:items-center ${isSelected ? "bg-orange-50/40" : "bg-white"}`}>
															<div className="min-w-0">
																<p className="truncate font-medium text-slate-950">
																	{device.name || "Unnamed device"}
																</p>
																{preview?.error ? (
																	<p className="line-clamp-2 text-xs text-red-600">{preview.error}</p>
																) : null}
															</div>
															<div className="min-w-0 font-mono text-xs text-slate-700">
																<span className="mr-1 font-sans text-slate-500 xl:hidden">Address</span>
																{device.address || "-"}:{device.port || "-"}
															</div>
															<div>
																<span className="mr-1 text-slate-500 xl:hidden">Status</span>
																<Badge
																	variant={getSyncStatusBadge(status) as any}
																	className="inline-flex min-h-6 max-w-full items-center whitespace-normal break-words border border-current/20 px-2 py-0.5 text-left leading-4">
																	{getSyncStatusLabel(status)}
																</Badge>
															</div>
															<div className="min-w-0 space-y-1">
																<div className="flex items-center justify-between gap-2 xl:block">
																	<span className="text-xs text-slate-500">From device</span>
																	<Button
																		type="button"
																		variant="ghost"
																		className="h-auto min-h-7 px-1 text-sm font-semibold text-slate-950 hover:bg-slate-100"
																		disabled={typeof sourceUserTotal !== "number"}
																		onClick={() => openPhysicalDeviceUsers(device.id)}
																		title="Open physical device users">
																		{metricValue(sourceUserTotal)}
																	</Button>
																</div>
																<div className="flex items-center justify-between gap-2 xl:block">
																	<span className="text-xs text-slate-500">Gap</span>
																	<span className="font-semibold text-slate-950">{metricValue(userGap)}</span>
																</div>
															</div>
															<div className="min-w-0 space-y-1">
																<div className="flex items-center justify-between gap-2 xl:block">
																	<span className="text-xs text-slate-500">Saved in HRIS</span>
																	<span className="font-semibold text-slate-950">{metricValue(hrisUserTotal)}</span>
																</div>
																<div className="flex items-center justify-between gap-2 xl:block">
																	<span className="text-xs text-slate-500">Needs link</span>
																	<span className="font-semibold text-slate-950">{metricValue(openUserTotal)}</span>
																</div>
															</div>
															<div className="text-xs text-slate-600">
																<span className="mr-1 text-slate-500 xl:hidden">Last sync</span>
																{lastSyncAt ? formatDateTime(lastSyncAt) : "-"}
															</div>
															<div className="flex justify-end">
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			type="button"
																			variant="outline"
																			size="sm"
																			className="h-8 w-8 bg-white p-0"
																			aria-label={`More actions for ${device.name || "device"}`}>
																			<MoreVertical className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end" className="w-48">
																		<DropdownMenuItem onClick={() => openDevicePanel(device.id, "users")}>
																			<UserPlus className="mr-2 h-4 w-4" />
																			Device users
																		</DropdownMenuItem>
																		<DropdownMenuItem onClick={() => openDeviceUserSyncReview(device.id)}>
																			<RefreshCw className="mr-2 h-4 w-4" />
																			Review user sync
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			onClick={() => {
																				setSelectedDeviceId(device.id);
																				navigate(`/admin/configuration/devices/events?deviceId=${encodeURIComponent(device.id)}&view=saved`);
																			}}>
																			<Activity className="mr-2 h-4 w-4" />
																			Device logs
																		</DropdownMenuItem>
																		<DropdownMenuItem onClick={() => openDevicePanel(device.id, "runs")}>
																			<Clock3 className="mr-2 h-4 w-4" />
																			Sync runs
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</div>
													);
												})}
											</div>
										</AccordionContent>
									</AccordionItem>
								);
							})}
						</Accordion>
					)}
				</TabsContent>

				<TabsContent value="users" className="m-0">
					{!selectedDeviceId ? (
						<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div className="space-y-1">
									<h2 className="text-sm font-semibold text-slate-950">Choose a device first</h2>
									<p className="text-sm text-slate-600">
										Start from the per-device summary so you can compare source truth, saved HRIS rows, and unresolved links before opening the detailed user table.
									</p>
								</div>
							<div className="flex gap-2">
								<Button type="button" variant="outline" className="h-8 px-3" onClick={() => void refreshDeviceUserSummary()}>
									<RefreshCw className="h-4 w-4" />
									Refresh summary
								</Button>
								<Button
									type="button"
									className="h-8 px-3"
									disabled={startDeviceUserSyncJobMutation.isPending || (!activeDeviceUserSyncJob && syncCenterDevices.length === 0)}
									onClick={openBulkDeviceUserSyncReview}>
									<RefreshCw className="h-4 w-4" />
									{activeDeviceUserSyncJob ? "Sync status" : "Sync device users"}
								</Button>
							</div>
						</div>
						<div className="overflow-hidden rounded-md border border-slate-200">
								<div className="hidden grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 lg:grid">
									<span>Device</span>
									<span>From device</span>
									<span>Saved in HRIS</span>
									<span>Gap</span>
									<span>Needs link</span>
									<span className="text-right">Open</span>
								</div>
								{syncCenterDevices.map(({ device, preview }) => {
									const sourceCount = preview?.vendorUserCount;
									const hrisCount = preview?.hrisUserCount;
									const openCount = preview?.openUserCount;
									const gapCount =
										typeof sourceCount === "number" && typeof hrisCount === "number"
											? Math.max(sourceCount - hrisCount, 0)
											: null;
									return (
										<div
											key={device.id}
											role="button"
											tabIndex={0}
											onClick={() => openPhysicalDeviceUsers(device.id)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													openPhysicalDeviceUsers(device.id);
												}
											}}
											className="grid cursor-pointer gap-3 border-b border-slate-100 px-3 py-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-300 last:border-b-0 lg:grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px_96px] lg:items-center">
											<div className="min-w-0">
												<p className="truncate font-medium text-slate-950">
													{device.name || "Unnamed device"}
												</p>
												<p className="truncate text-xs text-slate-500">
													{device.address || "-"}:{device.port || "-"}
												</p>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">From device</span>
												<span className="font-semibold text-slate-950">{metricValue(sourceCount)}</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">Saved in HRIS</span>
												<span className="font-semibold text-slate-950">{metricValue(hrisCount)}</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">Gap</span>
												<span className="font-semibold text-slate-950">{metricValue(gapCount)}</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">Needs link</span>
												<span className="font-semibold text-slate-950">{metricValue(openCount)}</span>
											</div>
											<div className="flex justify-end">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={(event) => {
														event.stopPropagation();
														openPhysicalDeviceUsers(device.id);
													}}
													onKeyDown={(event) => event.stopPropagation()}>
													Open
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					) : (
					<section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0 space-y-2">
						<Button
							type="button"
							variant="ghost"
							className="h-8 px-0 text-sm text-slate-600 hover:bg-transparent hover:text-slate-900"
							onClick={goBackToDeviceUserSummary}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to device summary
						</Button>
						<h2 className="truncate text-sm font-semibold text-slate-950">
							{selectedDevice?.name || "Device Users"}
						</h2>
						<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
							<span>{selectedSyncCenterItem?.vendor || (selectedDevice ? getDeviceVendor(selectedDevice) : "-")}</span>
							<span>{getSourceReadLabel(selectedSyncCenterItem?.vendor || (selectedDevice ? getDeviceVendor(selectedDevice) : ""))}</span>
							<span className="font-semibold text-slate-950">
								{metricValue(selectedSyncCenterItem?.preview?.vendorUserCount)} read from device
							</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							className="h-8 px-3"
							disabled={!selectedDeviceId || isReadingDeviceUsers}
							onClick={refreshSourceDeviceUsers}>
							{isReadingDeviceUsers ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							Refresh source users
						</Button>
						<Button
							type="button"
							variant="outline"
							className="h-8 px-3"
							disabled={!selectedDeviceId || syncDeviceUsersMutation.isPending}
							onClick={() => openDeviceUserSyncReview()}>
							{syncDeviceUsersMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							Review sync
						</Button>
					</div>
				</div>

				<div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_minmax(220px,1fr)]">
					<Select
						options={devices.map((device: any) => {
							const preview = syncCenterDevices.find((item) => item.device.id === device.id)?.preview;
							const labelBase = device.name || `${device.address}:${device.port}`;
							const sourceCount = preview?.vendorUserCount;
							return {
								value: device.id,
								label:
									typeof sourceCount === "number" && Number.isFinite(sourceCount)
										? `${labelBase} (${sourceCount} source)`
										: labelBase,
							};
						})}
						value={selectedDeviceId}
						onChange={setSelectedDeviceId}
						placeholder={isLoadingDevices ? "Loading devices..." : "Select device"}
						disabled={isLoadingDevices}
					/>
					<Select
						options={[
							{ value: "all", label: "All statuses" },
							{ value: "ACTIVE", label: "Linked" },
							{ value: "UNMATCHED", label: "Open" },
							{ value: "CONFLICT", label: "Review" },
							{ value: "DISABLED", label: "Off" },
						]}
						value={deviceUserStatus}
						onChange={setDeviceUserStatus}
						placeholder="Status"
					/>
					<div className="flex min-h-[42px] items-center rounded-md border border-slate-200 px-3">
						<input
							value={deviceUserSearch}
							onChange={(event) => handleDeviceUserSearch(event.target.value)}
							placeholder="Search user, name, employee..."
							className="w-full bg-transparent text-sm outline-none"
						/>
					</div>
				</div>

				<div className="grid gap-2 sm:grid-cols-5">
					{[
						["source", "Read from device", physicalSourceCount],
						["shown", "Current view", shownDeviceUserCount],
						["hris", "HRIS records", physicalHrisUserCount],
						["linked", "Linked employees", linkedPhysicalUserCount],
						["open", "Needs link", openPhysicalUserCount],
					].map(([view, label, value]) => (
						<button
							key={String(label)}
							type="button"
							aria-label={`${label}: ${metricValue(value)}`}
							className={`rounded-md border px-3 py-2 text-left transition-colors ${
								deviceUserView === view || (view === "shown" && deviceUserView === "shown")
									? "border-orange-300 bg-orange-50"
									: "border-slate-200 bg-white hover:bg-slate-50"
							}`}
							onClick={() => setDeviceUserView(String(view))}>
							<span className="block text-xs font-medium text-slate-500">{label}</span>
							<span className="block text-lg font-semibold text-slate-950">{metricValue(value)}</span>
						</button>
					))}
				</div>

				<p className="text-xs text-slate-500">
					Read from device comes from the fastest available source count for the selected device. HRIS records, linked employees, and needs link come from saved device-user summary truth for that device.
				</p>

				{deviceUserView === "source" ? (
					<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
						Showing the users read directly through {getSourceReadLabel(selectedSyncCenterItem?.vendor || (selectedDevice ? getDeviceVendor(selectedDevice) : ""))}.
					</div>
				) : null}

				<div className="overflow-hidden rounded-lg border border-slate-200">
					<table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
						<colgroup>
							<col className="w-[26%]" />
							<col className="w-[26%]" />
							<col className="w-[14%]" />
							<col className="w-[22%]" />
							<col className="w-[88px]" />
						</colgroup>
						<thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
							<tr>
								<th className="px-3 py-2">Device user</th>
								<th className="px-3 py-2">Employee</th>
								<th className="px-3 py-2">Status</th>
								<th className="px-3 py-2">Last synced</th>
								<th className="px-3 py-2 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{isLoadingDbDeviceUsers || isLoadingOpenDbDeviceUsers ? (
								<tr>
									<td colSpan={5} className="px-3 py-8 text-center text-slate-500">
										<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
										Loading device users...
									</td>
								</tr>
							) : isReadingDeviceUsers && mergedDeviceUserRows.length === 0 ? (
								<tr>
									<td colSpan={5} className="px-3 py-8 text-center text-slate-500">
										<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
										Reading source users from the physical device...
									</td>
								</tr>
							) : visibleDeviceUserRows.length === 0 ? (
								<tr>
									<td colSpan={5} className="px-3 py-8 text-center text-slate-500">
										No device users found for this view.
									</td>
								</tr>
							) : (
								pagedDeviceUserRows.map((deviceUser) => (
									<tr key={deviceUser.key} className="align-middle">
										<td className="px-3 py-2">
											<p className="font-medium leading-5 text-slate-950">
												{deviceUser.displayName || "Unnamed device user"}
											</p>
											<p className="text-xs text-slate-500">
												{deviceUser.vendorUserId}
												{deviceUser.userType ? ` - ${deviceUser.userType}` : ""}
												{deviceUser.sourceUser && !deviceUser.hrisDeviceUser ? " - Read from device" : ""}
											</p>
										</td>
										<td className="px-3 py-2">
											{deviceUser.employee ? (
												<div className="min-w-0">
													<p className="truncate font-medium leading-5 text-slate-900">
														{deviceUser.employee.fullName || deviceUser.employee.employeeId}
													</p>
													<p className="text-xs text-slate-500">
														{deviceUser.employee.employeeId}
													</p>
												</div>
											) : deviceUser.status === "CHECKING_LINK" ? (
												<span className="inline-flex items-center gap-1.5 text-slate-500">
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
													Checking HRIS link
												</span>
											) : deviceUser.status === "LINK_CHECK_FAILED" ? (
												<span className="text-red-700">Could not verify link</span>
											) : (
												<span className="text-slate-500">Not linked</span>
											)}
										</td>
										<td className="px-3 py-2">
											<div className="flex flex-wrap items-center gap-1.5">
												<Badge variant={getDeviceUserBadgeVariant(deviceUser.status) as any} className="h-6 items-center">
													{getDeviceUserStatusLabel(deviceUser.status)}
												</Badge>
											</div>
										</td>
										<td className="px-3 py-2 text-slate-600">
											{deviceUser.lastSyncedAt ? formatDateTime(deviceUser.lastSyncedAt) : "-"}
										</td>
										<td className="px-3 py-2">
											<div className="flex justify-end">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="h-8 w-8 bg-white p-0"
															aria-label={`More actions for device user ${deviceUser.displayName || deviceUser.vendorUserId}`}>
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-48">
														<DropdownMenuItem onClick={() => setDetailsDeviceUser(deviceUser)}>
															<FileJson className="mr-2 h-4 w-4" />
															Details
														</DropdownMenuItem>
														<DropdownMenuItem
															disabled={deviceUser.status === "CHECKING_LINK" || deviceUser.status === "LINK_CHECK_FAILED"}
															onClick={() => openLinkDeviceUser(deviceUser)}>
															<Link2 className="mr-2 h-4 w-4" />
															{deviceUser.status === "CHECKING_LINK"
																? "Checking HRIS link"
																: deviceUser.status === "LINK_CHECK_FAILED"
																	? "Refresh before linking"
																	: deviceUser.employeeId ? "Change employee link" : "Link employee"}
														</DropdownMenuItem>
														{!deviceUser.hrisDeviceUser ? (
															<DropdownMenuItem onClick={() => openDeviceUserSyncReview()}>
																<RefreshCw className="mr-2 h-4 w-4" />
																Review sync
															</DropdownMenuItem>
														) : null}
														{deviceUser.employeeId && deviceUser.hrisDeviceUser ? (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	disabled={unlinkDeviceUserMutation.isPending}
																	className="text-red-700 focus:text-red-700"
																	onClick={() => openUnlinkDeviceUser(deviceUser)}>
																	<Unlink className="mr-2 h-4 w-4" />
																	Unlink employee
																</DropdownMenuItem>
															</>
														) : null}
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
					<span>
						Showing {visibleDeviceUserRows.length === 0 ? 0 : (safeDeviceUserPage - 1) * deviceUserLimit + 1}
						{" - "}
						{Math.min(safeDeviceUserPage * deviceUserLimit, visibleDeviceUserRows.length)}
						{" of "}
						{visibleDeviceUserRows.length}
					</span>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							className="h-8 px-3"
							disabled={safeDeviceUserPage <= 1}
							onClick={() => setDeviceUserPage(safeDeviceUserPage - 1)}>
							Previous
						</Button>
						<span className="min-w-12 text-center">
							{safeDeviceUserPage} / {deviceUserTotalPages}
						</span>
						<Button
							type="button"
							variant="outline"
							className="h-8 px-3"
							disabled={safeDeviceUserPage >= deviceUserTotalPages}
							onClick={() => setDeviceUserPage(safeDeviceUserPage + 1)}>
							Next
						</Button>
					</div>
				</div>
			</section>
					)}
				</TabsContent>

				<TabsContent value="logs" className="m-0">
					<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="text-sm font-semibold text-slate-950">Device Logs</h2>
								<p className="text-xs text-slate-500">Summary only. Open the events page for rows.</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button type="button" variant="outline" className="h-8 px-3" onClick={openLogSyncReview}>
									<RefreshCw className="h-4 w-4" />
									Review log sync
								</Button>
								<Button type="button" variant="outline" className="h-8 px-3" onClick={() => openDeviceEvents("saved")}>
									<Activity className="h-4 w-4" />
									Open device events
								</Button>
							</div>
						</div>
						<div className="grid gap-2 sm:grid-cols-5">
							{[
								["Physical log entries", selectedLogPreview?.vendorEventCount ?? selectedLogPreview?.totalEvents],
								["Saved events", selectedLogPreview?.hrisSavedCount ?? selectedLogPreview?.syncedEvents],
								["Known skipped", selectedLogPreview?.knownSkippedEventCount],
								["Failed", selectedLogPreview?.failedEventCount],
								["Still missing", selectedLogPreview?.missingEventCount ?? selectedLogPreview?.needsSyncEvents],
							].map(([label, value]) => (
								<div key={String(label)} className="rounded-md border border-slate-200 px-3 py-2">
									<p className="text-xs font-medium text-slate-500">{label}</p>
									<p className="text-lg font-semibold text-slate-950">{metricValue(value)}</p>
								</div>
							))}
						</div>
					</section>
				</TabsContent>

				<TabsContent value="runs" className="m-0">
					<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
						<div className="flex items-center gap-2">
							<Clock3 className="h-4 w-4 text-slate-500" />
							<h2 className="text-sm font-semibold text-slate-950">Sync Runs</h2>
						</div>
						<div className="overflow-hidden rounded-md border border-slate-200">
							<table className="min-w-full divide-y divide-slate-200 text-sm">
								<thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
									<tr>
										<th className="px-3 py-2">Type</th>
										<th className="px-3 py-2">Status</th>
										<th className="px-3 py-2">Source</th>
										<th className="px-3 py-2">Saved</th>
										<th className="px-3 py-2">Skipped</th>
										<th className="px-3 py-2">Failed</th>
										<th className="px-3 py-2">Started</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 bg-white">
									{isLoadingSyncRuns ? (
										<tr>
											<td colSpan={7} className="px-3 py-8 text-center text-slate-500">
												<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
												Loading sync runs...
											</td>
										</tr>
									) : syncRuns.length === 0 ? (
										<tr>
											<td colSpan={7} className="px-3 py-8 text-center text-slate-500">
												No sync runs found for this device.
											</td>
										</tr>
									) : (
										syncRuns.map((run) => (
											<tr key={run.id}>
												<td className="px-3 py-2">
													{run.runType === "DEVICE_USERS" ? "Device Users" : "Device Logs"}
												</td>
												<td className="px-3 py-2">
													<Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "destructive" : "secondary"}>
														{run.status}
													</Badge>
												</td>
												<td className="px-3 py-2 text-slate-600">{run.source || "-"}</td>
												<td className="px-3 py-2">{metricValue(run.savedRecords)}</td>
												<td className="px-3 py-2">{metricValue(run.skippedRecords)}</td>
												<td className="px-3 py-2">{metricValue(run.failedRecords)}</td>
												<td className="px-3 py-2 text-slate-600">{formatDateTime(run.startedAt)}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</section>
				</TabsContent>
			</Tabs>

			<Modal
				open={deviceUserSyncState.open}
				onOpenChange={(open) => setDeviceUserSyncState((current) => ({ ...current, open }))}
				title="Sync device users"
				className="max-w-lg"
				showCloseButton={deviceUserSyncState.status !== "syncing"}
				closeOnBackdropClick={deviceUserSyncState.status !== "syncing"}>
				<div className="space-y-3">
					<div
						className={
							deviceUserSyncState.status === "error"
								? "rounded-md border border-red-200 bg-red-50 p-3 text-red-950"
								: deviceUserSyncState.status === "complete"
									? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"
									: deviceUserSyncState.status === "review"
										? "rounded-md border border-slate-200 bg-white p-3 text-slate-950"
										: "rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-950"
						}>
						<div className="flex items-center gap-2 text-sm font-medium">
							{deviceUserSyncState.status === "syncing" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							{deviceUserSyncState.message || "Preparing device user sync."}
						</div>
						{deviceUserSyncState.status === "review" ? (
							<div className="mt-3 space-y-3 text-xs">
								<div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
									<div>
										<span className="block text-slate-500">Device</span>
										<span className="font-semibold text-slate-950">
											{selectedDevice?.name || selectedSyncCenterItem?.device?.name || "-"}
										</span>
									</div>
									<div>
										<span className="block text-slate-500">Vendor</span>
										<span className="font-semibold text-slate-950">
											{selectedSyncCenterItem?.vendor || (selectedDevice ? getDeviceVendor(selectedDevice) : "-")}
										</span>
									</div>
								</div>
								<div className="grid gap-2 sm:grid-cols-4">
									{[
										["Read from device", physicalSourceCount],
										["HRIS records", physicalHrisUserCount],
										["New records", usersToSaveCount],
										["Needs link", openPhysicalUserCount],
									].map(([label, value]) => (
										<div key={String(label)} className="rounded-md border border-slate-200 px-2 py-1.5">
											<span className="block text-slate-500">{label}</span>
											<span className="font-semibold text-slate-950">{metricValue(value)}</span>
										</div>
									))}
								</div>
								<p className="text-slate-600">
									This device refresh rereads every source user for the selected device. Existing manual links stay intact, while saved biometric summaries and device-only users are refreshed in HRIS.
								</p>
							</div>
						) : null}
						{deviceUserSyncState.status === "complete" ? (
							<div className="mt-3 space-y-3 text-xs">
								<div className="grid gap-2 sm:grid-cols-4">
									{completedDeviceUserSyncItems.map(([label, value]) => (
										<div key={label} className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1.5">
											<span className="block text-emerald-700">{label}</span>
											<span className="font-semibold text-slate-950">{metricValue(value)}</span>
										</div>
									))}
								</div>
								<p className="text-emerald-900">
									Rows marked Needs link were saved in HRIS, but no safe employee match was found. Use Link to attach the employee manually.
								</p>
							</div>
						) : null}
					</div>
					<div className="flex justify-end gap-2 border-t pt-2">
						<Button
							type="button"
							variant="outline"
							disabled={deviceUserSyncState.status === "syncing"}
							onClick={() =>
								setDeviceUserSyncState((current) => ({ ...current, open: false }))
							}>
							{deviceUserSyncState.status === "complete" ? "Close" : "Cancel"}
						</Button>
						{deviceUserSyncState.status === "review" || deviceUserSyncState.status === "error" ? (
							<Button
								type="button"
								disabled={syncDeviceUsersMutation.isPending || !selectedDeviceId}
								onClick={runDeviceUserSync}>
								{syncDeviceUsersMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								Sync device users
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={bulkDeviceUserSyncState.open}
				onOpenChange={(open) => {
					if (deviceUserSyncJobIsProcessing && !open) return;
					setBulkDeviceUserSyncState((current) => ({ ...current, open }));
				}}
				title="Sync device users"
				description={
					activeDeviceUserSyncJob
						? "You can close this window and reopen status from Sync device users."
						: "Choose the manual refresh scope, then reread live device-user truth."
				}
				className="max-w-4xl"
				showCloseButton={!deviceUserSyncJobIsProcessing}
				closeOnBackdropClick={!deviceUserSyncJobIsProcessing}>
				<div className="space-y-4">
					<div
						className={`rounded-lg border p-4 ${activeDeviceUserSyncJob ? deviceUserSyncJobToneClass : bulkDeviceUserSyncToneClass}`}>
						<div className="flex items-center gap-2 text-sm font-medium text-slate-950">
							{deviceUserSyncJobIsProcessing || bulkDeviceUserSyncState.status === "starting" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							{activeDeviceUserSyncJob
								? deviceUserSyncJobTitle
								: bulkDeviceUserSyncTitle}
						</div>
						{activeDeviceUserSyncJob ? (
							<>
								<div className="mt-2 flex items-center justify-between gap-3 text-sm">
									<span className="min-w-0">{deviceUserSyncJobProgress?.message || "Loading device-user sync status..."}</span>
									<span className="shrink-0 font-semibold">{deviceUserSyncJobPercent}%</span>
								</div>
								<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
									<div
										className={`h-full rounded-full transition-all ${deviceUserSyncJobFillClass}`}
										style={{ width: `${deviceUserSyncJobPercent}%` }}
									/>
								</div>
								<p className="mt-3 text-xs opacity-90">
									{deviceUserSyncJobSummary || "HRIS is comparing configured devices against current source-user truth."}
								</p>
							</>
						) : bulkDeviceUserSyncState.status === "error" ? (
							<p className="mt-2 text-xs text-red-900/80">
								{bulkDeviceUserSyncState.message}
							</p>
						) : bulkDeviceUserSyncState.status === "starting" ? (
							<p className="mt-2 text-xs text-orange-900/80">
								{bulkDeviceUserSyncState.message}
							</p>
						) : (
							<p className="mt-2 text-xs text-orange-900/80">
								Use this when a device user, face count, card count, fingerprint count, or employee link may have changed and you want HRIS to reread the source truth.
							</p>
						)}
						<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
							{bulkDeviceUserSyncSummaryItems.map(([label, value]) => (
								<div key={String(label)} className="rounded-md border border-white/80 bg-white/80 px-3 py-2">
									<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
									<p className="mt-1 text-base font-semibold text-slate-950">{metricValue(value)}</p>
								</div>
							))}
						</div>
						{!activeDeviceUserSyncJob ? (
							<div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-3">
								<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
									<div className="space-y-1">
										<p className="text-sm font-semibold text-slate-950">Refresh scope</p>
										<p className="text-xs text-slate-600">
											Full refresh is the default because a zero visible gap can still hide stale biometric summaries or unresolved device-user truth.
										</p>
									</div>
									<div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
										<button
											type="button"
											onClick={() => setBulkDeviceUserSyncMode("full_refresh")}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "full_refresh"
													? "border-orange-300 bg-orange-50 text-orange-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">Full source refresh</span>
												<Badge variant="success">Default</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Reread every saved source user on every configured device and refresh HRIS metadata for cards, faces, and fingerprint counts.
											</p>
										</button>
										<button
											type="button"
											onClick={() => setBulkDeviceUserSyncMode("needs_attention_only")}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "needs_attention_only"
													? "border-amber-300 bg-amber-50 text-amber-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">Needs attention only</span>
												<Badge variant="secondary">{metricValue(needsAttentionSyncCenterDevices.length)} devices</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Only refresh devices whose current summary shows a mismatch, open links, conflicts, or an attention flag.
											</p>
										</button>
									</div>
								</div>
								<div className="mt-3 flex flex-col gap-3 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-xs text-slate-600">{bulkDeviceUserSyncModeDescription}</p>
									<div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
										{bulkDeviceUserSyncScopeItems.map(([label, value]) => (
											<div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
												<p className="mt-1 text-sm font-semibold text-slate-950">{metricValue(value)}</p>
											</div>
										))}
									</div>
								</div>
							</div>
						) : null}
					</div>

					<div className="overflow-hidden rounded-md border border-slate-200">
						<div className="grid grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
							<span>Device</span>
							<span>From device</span>
							<span>Saved in HRIS</span>
							<span>Gap</span>
							<span>Needs link</span>
						</div>
						{syncCenterDevices.map(({ device, preview }) => {
							const sourceCount = preview?.vendorUserCount;
							const hrisCount = preview?.hrisUserCount;
							const openCount = preview?.openUserCount;
							const gapCount =
								typeof sourceCount === "number" && typeof hrisCount === "number"
									? Math.max(sourceCount - hrisCount, 0)
									: null;
							const result = bulkDeviceUserSyncResults.find((item) => item.deviceId === device.id);
							return (
								<div
									key={device.id}
									className="grid gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px] lg:items-center">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">{device.name || "Unnamed device"}</p>
										<p className="truncate text-xs text-slate-500">{device.address || "-"}:{device.port || "-"}</p>
										{result ? (
											<Badge
												variant={result.status === "success" ? "success" : result.status === "cancelled" ? "secondary" : "warning"}
												className="mt-2">
												{result.status === "success"
													? "Synced in this run"
													: result.status === "cancelled"
														? "Cancelled in this run"
														: "Needs attention in this run"}
											</Badge>
										) : null}
									</div>
									<div className="font-semibold text-slate-950">{metricValue(sourceCount)}</div>
									<div className="font-semibold text-slate-950">{metricValue(hrisCount)}</div>
									<div className="font-semibold text-slate-950">{metricValue(gapCount)}</div>
									<div className="font-semibold text-slate-950">{metricValue(openCount)}</div>
								</div>
							);
						})}
					</div>

					{bulkDeviceUserSyncResults.length > 0 ? (
						<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
							<div className="grid grid-cols-[minmax(160px,1.4fr)_110px_minmax(0,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
								<span>Device</span>
								<span>Result</span>
								<span>Sync note</span>
							</div>
							{bulkDeviceUserSyncResults.map((result) => (
								<div
									key={result.deviceId}
									className="grid gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[minmax(160px,1.4fr)_110px_minmax(0,1fr)] lg:items-center">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">{result.deviceName}</p>
										<p className="truncate text-xs text-slate-500">{result.deviceId}</p>
									</div>
									<div>
										<Badge variant={result.status === "success" ? "success" : result.status === "cancelled" ? "secondary" : "warning"}>
											{result.status === "success" ? "Synced" : result.status === "cancelled" ? "Cancelled" : "Needs attention"}
										</Badge>
									</div>
									<p className="text-sm text-slate-600">
										{result.status === "success"
											? `${metricValue(result.summary?.created)} created, ${metricValue(result.summary?.updated)} updated, ${metricValue(result.summary?.unmatched)} need link.`
											: result.status === "cancelled"
												? "Sync was cancelled before this device was completed."
											: result.error || "Sync failed."}
									</p>
								</div>
							))}
						</div>
					) : null}

					<div className="flex justify-end gap-2 border-t pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setBulkDeviceUserSyncState((current) => ({ ...current, open: false }))}>
							Close
						</Button>
						{deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
								disabled={cancelDeviceUserSyncJobMutation.isPending || deviceUserSyncJobCancelRequested}
								onClick={requestCancelDeviceUserSyncJob}>
								{cancelDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<XCircle className="h-4 w-4" />
								)}
								{cancelDeviceUserSyncJobMutation.isPending
									? "Cancelling..."
									: deviceUserSyncJobCancelRequested
										? "Cancel requested"
										: "Cancel sync"}
							</Button>
						) : null}
						{activeDeviceUserSyncJob && !deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={startDeviceUserSyncJobMutation.isPending}
								onClick={() => void runBulkDeviceUserSync()}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending ? "Starting..." : "Run another refresh"}
							</Button>
						) : null}
						{activeDeviceUserSyncJob && !deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setActiveDeviceUserSyncJob(null);
									setBulkDeviceUserSyncState((current) => ({ ...current, open: false }));
								}}>
								Dismiss status
							</Button>
						) : null}
						{!activeDeviceUserSyncJob ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={
									startDeviceUserSyncJobMutation.isPending ||
									syncCenterDevices.length === 0 ||
									(bulkDeviceUserSyncMode === "needs_attention_only" && needsAttentionSyncCenterDevices.length === 0)
								}
								onClick={() => void runBulkDeviceUserSync()}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending
									? "Starting..."
									: bulkDeviceUserSyncMode === "needs_attention_only"
										? "Refresh needs-attention devices"
										: "Refresh all device users"}
							</Button>
						) : null}
						{!activeDeviceUserSyncJob && bulkDeviceUserSyncState.status === "error" ? (
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									setBulkDeviceUserSyncState({
										open: false,
										status: "idle",
										message: "",
									})
								}>
								Dismiss error
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={Boolean(detailsDeviceUser)}
				onOpenChange={(open) => {
					if (!open) setDetailsDeviceUser(null);
				}}
				title="Device user details"
				className="max-w-4xl">
				{detailsDeviceUser ? (
					<div className="space-y-4">
						<div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
							<div className="space-y-3">
								<div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
									<div className="aspect-[4/5] bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]">
										{detailsPhotoState === "ready" && detailsPhotoUrl ? (
											<img
												src={detailsPhotoUrl}
												alt={`${getDeviceUserDisplayName(detailsDeviceUser)} face photo`}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
												{detailsPhotoState === "loading" ? (
													<>
														<Loader2 className="h-6 w-6 animate-spin" />
														<p className="text-sm font-medium text-slate-700">Loading enrolled face photo</p>
													</>
												) : detailsPhotoState === "error" ? (
													<>
														<Eye className="h-6 w-6" />
														<p className="text-sm font-medium text-slate-700">Face photo unavailable</p>
														<p className="text-xs text-slate-500">{detailsPhotoError}</p>
													</>
												) : (
													<>
														<Eye className="h-6 w-6" />
														<p className="text-sm font-medium text-slate-700">No face photo enrolled</p>
														<p className="text-xs text-slate-500">This device user does not currently expose a saved face image.</p>
													</>
												)}
											</div>
										)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-white p-3">
									<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fingerprint truth</p>
									<div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
										<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fingerprints</p>
										<p className="mt-2 text-3xl font-semibold text-slate-950">
											{String(getDeviceUserCredentialSummary(detailsDeviceUser).fingerprintCount)}
										</p>
										<p className="mt-2 text-xs text-slate-500">
											Primary biometric truth for device-user matching and copy verification.
										</p>
									</div>
									<div className="mt-3 grid grid-cols-2 gap-2">
										{[
											["Cards", getDeviceUserCredentialSummary(detailsDeviceUser).cardCount],
											["Faces", getDeviceUserCredentialSummary(detailsDeviceUser).faceCount],
										].map(([label, value]) => (
											<div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
												<p className="mt-1 text-lg font-semibold text-slate-950">{String(value)}</p>
											</div>
										))}
									</div>
									<p className="mt-3 text-xs leading-5 text-slate-500">
										HRIS stores source counts and face-photo access here. Raw fingerprint template blobs are not shown in this normal record.
									</p>
								</div>
							</div>
							<div className="space-y-3">
								<div className="rounded-2xl border border-slate-200 bg-white p-4">
									<p className="text-lg font-semibold text-slate-950">{getDeviceUserDisplayName(detailsDeviceUser)}</p>
									<p className="mt-1 text-sm text-slate-500">
										Vendor user ID {detailsDeviceUser.vendorUserId}
									</p>
								</div>
								<div className="grid gap-x-4 gap-y-2 text-sm md:grid-cols-2">
							{[
								["Vendor user ID", detailsDeviceUser.vendorUserId],
								["Device", selectedDevice?.name || detailsDeviceUser.hrisDeviceUser?.device?.name || "-"],
								["Source", getDeviceUserSourceLabel(detailsDeviceUser)],
								["Status", detailsDeviceUser.status],
								["Employee link", detailsDeviceUser.employee?.employeeId || "Not linked"],
								["Last synced", detailsDeviceUser.lastSyncedAt ? formatDateTime(detailsDeviceUser.lastSyncedAt) : "-"],
							].map(([label, value]) => (
								<div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
									<span className="text-xs font-medium text-slate-500">{label}</span>
									<span className="min-w-0 truncate font-semibold text-slate-950">{value}</span>
								</div>
							))}
								</div>
								{getDeviceUserFaceUrl(detailsDeviceUser) ? (
									<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
										<p className="font-medium text-slate-800">Photo source</p>
										<p className="mt-1 break-all">{getDeviceUserFaceUrl(detailsDeviceUser)}</p>
									</div>
								) : null}
							</div>
						</div>
						<details className="rounded-md border border-slate-200">
							<summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
								Raw
							</summary>
							<pre className="max-h-[260px] overflow-auto border-t border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
								{JSON.stringify(detailsDeviceUser.rawPayload || {}, null, 2)}
							</pre>
						</details>
					</div>
				) : null}
			</Modal>

			<Modal
				open={Boolean(linkTarget)}
				onOpenChange={(open) => {
					if (!open) {
						setLinkTarget(null);
						setSelectedEmployeeForLink("");
					}
				}}
				title="Link device user"
				description="Manual links override automatic matching for this device user.">
				<div className="space-y-4">
					{linkTarget ? (
						<div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
							<div className="min-w-0">
								<p className="truncate font-medium text-slate-950">
									{linkTarget.displayName || "Unnamed device user"}
								</p>
								<p className="truncate text-slate-600">Vendor user ID {linkTarget.vendorUserId}</p>
							</div>
							{!linkTarget.hrisDeviceUser ? (
								<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
									This user was read from the device. Submitting will save current device users first, then link the employee.
								</div>
							) : null}
						</div>
					) : null}
					<div>
						<div className="text-sm font-medium text-slate-700">Employee</div>
						<SearchableSelect
							options={employeeLinkOptions}
							value={selectedEmployeeForLink}
							onValueChange={setSelectedEmployeeForLink}
							placeholder={
								isLoadingEmployeeLinkOptions ? "Loading employees..." : "Select employee"
							}
							searchPlaceholder="Search employee name, ID, device ID..."
							emptyText={
								employeeLinkOptionsError
									? "Employees could not be loaded."
									: "No employees found."
							}
							disabled={isLoadingEmployeeLinkOptions || Boolean(employeeLinkOptionsError)}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setLinkTarget(null);
								setSelectedEmployeeForLink("");
							}}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={
								!selectedEmployeeForLink ||
								linkDeviceUserMutation.isPending ||
								syncDeviceUsersMutation.isPending
							}
							onClick={submitLinkDeviceUser}>
							{linkDeviceUserMutation.isPending || syncDeviceUsersMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Link2 className="h-4 w-4" />
							)}
							{linkTarget?.hrisDeviceUser ? "Link device user" : "Save and link"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={Boolean(unlinkTarget)}
				onOpenChange={(open) => {
					if (!open && !unlinkDeviceUserMutation.isPending) {
						setUnlinkTarget(null);
					}
				}}
				title="Unlink employee"
				description="This keeps the device user record, but removes its employee match."
				className="max-w-lg"
				showCloseButton={!unlinkDeviceUserMutation.isPending}
				closeOnBackdropClick={!unlinkDeviceUserMutation.isPending}>
				<div className="space-y-4">
					{unlinkTarget ? (
						<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
							<p className="font-semibold">Confirm this device user should be unlinked.</p>
							<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
								<div>
									<span className="block text-red-700">Device user</span>
									<span className="font-semibold">
										{unlinkTarget.displayName || unlinkTarget.vendorUserId}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Employee</span>
									<span className="font-semibold">
										{unlinkTarget.employee?.fullName || unlinkTarget.employee?.employeeId || "Linked employee"}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Vendor user ID</span>
									<span className="font-semibold">{unlinkTarget.vendorUserId}</span>
								</div>
								<div>
									<span className="block text-red-700">Device</span>
									<span className="font-semibold">
										{selectedDevice?.name || unlinkTarget.hrisDeviceUser?.device?.name || "-"}
									</span>
								</div>
							</div>
						</div>
					) : null}
					<p className="text-xs text-slate-600">
						Future punches from this device user will need matching again until a new employee link is chosen.
					</p>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={unlinkDeviceUserMutation.isPending}
							onClick={() => setUnlinkTarget(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-red-700 text-white hover:bg-red-800"
							disabled={unlinkDeviceUserMutation.isPending}
							onClick={confirmUnlinkDeviceUser}>
							{unlinkDeviceUserMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Unlink className="h-4 w-4" />
							)}
							Unlink employee
						</Button>
					</div>
				</div>
			</Modal>

		</div>
	);
}

export default function EnrollPage() {
	return <DeviceEnrollmentPanel />;
}
