import { useEffect, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Checkbox } from "~/components/atoms/Checkbox";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigMutedDash,
	AdminConfigPrimaryCell,
	AdminConfigSourceChip,
} from "~/lib/ui/admin-configuration-table";
import {
	Activity,
	ArrowLeft,
	Clock3,
	Database,
	Edit,
	ExternalLink,
	MoreVertical,
	Network,
	RefreshCw,
	ShieldAlert,
	TerminalSquare,
	Trash2,
	UsersRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import {
	type Device,
	type CreateDeviceRequest,
	type UpdateDeviceRequest,
} from "~/services/devices.service";
import { CreateDeviceSchema, type CreateDevice } from "~/zod/device.zod";
import {
	useDevices,
	useDevice,
	useDeviceHealth,
	useDeviceHealthMap,
	useDeviceSyncPreview,
	useDeviceSyncRuns,
	useDeviceUsers,
	useCreateDevice,
	useUpdateDevice,
	useDeleteDevice,
	useResetDeviceEvents,
	useSyncDeviceUsers,
	useTriggerHikvisionAttendanceImport,
} from "~/lib/hooks/useDevices";
import {
	getDeviceReachabilityBadgeClass,
	getDeviceReachabilityDotClass,
} from "~/lib/device-reachability";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DeviceEnrollmentPanel } from "./enroll";
import {
	buildHikvisionRuntimeConfig,
	buildDeviceConfigPreset,
	getDefaultDeviceConfig,
	getDeviceConfigRecord,
	normalizeDeviceConfigForSubmit,
	type DeviceConfigRecord,
} from "./device-config-presets";

const DeviceFormSchema = CreateDeviceSchema;
type DeviceFormData = CreateDevice;
type LegacyDevicesResponse = { devices?: Device[]; pagination?: { total?: number } };

const protocolOptions: SelectOption[] = [
	{ value: "http", label: "HTTP" },
	{ value: "https", label: "HTTPS" },
	{ value: "tcp", label: "TCP" },
	{ value: "udp", label: "UDP" },
];

const deviceVendorOptions: SelectOption[] = [
	{ value: "Hikvision", label: "Hikvision" },
	{ value: "ZKTeco", label: "ZKTeco" },
];

const normalizeAccessForSubmit = (access: DeviceFormData["access"]) => {
	const username = String(access?.username || "").trim();
	const password = String(access?.password || "").trim();
	return {
		...(username ? { username } : {}),
		...(password ? { password } : {}),
	};
};

const getVendorConnectionDefaults = (vendor: string) => {
	const normalized = vendor.toLowerCase();
	if (normalized.includes("zkteco") || normalized.includes("zk")) {
		return { protocol: "tcp" as const, port: 4370 };
	}
	return { protocol: "http" as const, port: 80 };
};

const getVendorHelperText = (vendor: string) => {
	const normalized = vendor.toLowerCase();
	if (normalized.includes("zkteco") || normalized.includes("zk")) {
		return "ZKTeco terminals normally use TCP port 4370.";
	}
	return "Hikvision terminals normally use HTTP port 80 for HRIS checks.";
};

const runtimeValue = (value: unknown) =>
	value === undefined || value === null || value === "" ? "-" : String(value);

const healthToneClass = (ok: boolean) => (ok ? "text-green-700" : "text-amber-700");

const getDeviceApiDetail = (
	checks?: {
		deviceApi?: {
			provenBy?: "systemTime" | "userRead" | "eventHistory";
			error?: string;
		};
	},
) => {
	const provenBy = checks?.deviceApi?.provenBy;
	if (provenBy === "userRead") return "Proven by Hikvision user read path";
	if (provenBy === "eventHistory") return "Proven by Hikvision event history read path";
	if (checks?.deviceApi?.error) return checks.deviceApi.error;
	return undefined;
};

function HealthCheckRow({
	label,
	ok,
	value,
	detail,
}: {
	label: string;
	ok: boolean;
	value: string;
	detail?: string;
}) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
			<span className="min-w-0">
				<span className="block text-slate-600">{label}</span>
				{detail ? <span className="block truncate text-xs text-slate-500">{detail}</span> : null}
			</span>
			<span className={`shrink-0 font-medium ${healthToneClass(ok)}`}>{value}</span>
		</div>
	);
}

function DeviceHealthPanel({ deviceId }: { deviceId?: string }) {
	const {
		data: health,
		isLoading,
		refetch,
		isFetching,
	} = useDeviceHealth(deviceId, Boolean(deviceId));

	if (!deviceId) return null;

	const checks = health?.checks;
	const summary = health?.summary;
	const isZkteco = health?.device?.vendor === "ZKTeco" || Boolean(checks?.zktecoWebhook);
	const zktecoBridge = checks?.zktecoBridge;
	const latestZktecoEvent = checks?.lastZktecoEvent;

	return (
		<div className="rounded-md border border-slate-200 bg-white p-3">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<p className="text-sm font-medium text-slate-950">Connection health</p>
					<p className="text-xs text-slate-500">
						{summary
							? `Checked ${new Date(summary.checkedAt).toLocaleTimeString()}`
							: "Not checked yet"}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					className="h-8 px-2 text-xs"
					onClick={() => refetch()}
					disabled={isFetching}>
					<RefreshCw className="mr-2 h-3.5 w-3.5" />
					Check
				</Button>
			</div>
			{isLoading ? (
				<div className="text-sm text-slate-500">Checking device connection…</div>
			) : (
				<div className="grid gap-2 sm:grid-cols-2">
					<HealthCheckRow label="HRIS API" ok value="Online" />
					{isZkteco && checks?.zktecoWebhook ? (
						<HealthCheckRow
							label="ZKTeco webhook"
							ok={Boolean(checks.zktecoWebhook.ok)}
							value={checks.zktecoWebhook.status || "-"}
						/>
					) : null}
					<HealthCheckRow
						label="Device port"
						ok={Boolean(checks?.network?.ok)}
						value={checks?.network?.status || "-"}
						detail={
							checks?.network
								? `${checks.network.host}:${checks.network.port}`
								: undefined
						}
					/>
					{isZkteco && checks?.zktecoBridge ? (
						<HealthCheckRow
							label="SDK sidecar"
							ok={Boolean(zktecoBridge?.ok)}
							value={zktecoBridge?.status || "-"}
							detail={
								zktecoBridge
									? `${zktecoBridge.connectedDevices ?? 0}/${zktecoBridge.configuredDevices ?? 0} devices connected`
									: undefined
							}
						/>
					) : null}
					{isZkteco && zktecoBridge?.device ? (
						<HealthCheckRow
							label="Device session"
							ok={Boolean(zktecoBridge.device.connected)}
							value={zktecoBridge.device.connected ? "connected" : "offline"}
							detail={
								zktecoBridge.device.lastEventAt
									? `Last event ${new Date(zktecoBridge.device.lastEventAt).toLocaleTimeString()}`
									: zktecoBridge.device.lastError || `${zktecoBridge.device.ip}:${zktecoBridge.device.port}`
							}
						/>
					) : null}
					{isZkteco && latestZktecoEvent ? (
						<HealthCheckRow
							label="Latest saved event"
							ok={latestZktecoEvent.status !== "FAILED"}
							value={latestZktecoEvent.status || "-"}
							detail={`${latestZktecoEvent.employeeNo || "No employee"} - ${new Date(latestZktecoEvent.eventTime).toLocaleString()}`}
						/>
					) : null}
					{!isZkteco && checks?.hikvisionListener ? (
						<HealthCheckRow
							label="Hikvision listener"
							ok={Boolean(checks.hikvisionListener.ok)}
							value={checks.hikvisionListener.status || "-"}
						/>
					) : null}
					{!isZkteco && checks?.deviceApi ? (
						<HealthCheckRow
							label="Device API"
							ok={Boolean(checks.deviceApi.ok)}
							value={checks.deviceApi.status || "-"}
						/>
					) : null}
				</div>
			)}
			{checks?.network?.error ? (
				<p className="mt-2 text-xs text-red-600">{checks.network.error}</p>
			) : null}
		</div>
	);
}

const getDeviceConfigValue = (device: Device | undefined, key: string) => {
	const config = getDeviceConfigRecord(device?.config);
	const value = config[key];
	if (value === undefined || value === null || value === "") return "-";
	return String(value);
};

const isHikvisionDevice = (device?: Device) => {
	const config = getDeviceConfigRecord(device?.config);
	const vendor = String(config.vendor || config.source || device?.name || "").toLowerCase();
	return vendor.includes("hikvision");
};

function DeviceFact({
	label,
	value,
	mono,
}: {
	label: string;
	value: string | number | null | undefined;
	mono?: boolean;
}) {
	return (
		<div className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
			<p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
			<p className={`mt-1 truncate text-sm font-medium text-slate-950 ${mono ? "font-mono" : ""}`}>
				{value === undefined || value === null || value === "" ? "-" : value}
			</p>
		</div>
	);
}

function CapabilityRow({
	icon,
	title,
	description,
	state,
	children,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	state: "ready" | "guarded" | "blocked";
	children?: ReactNode;
}) {
	const tone =
		state === "ready"
			? "border-emerald-200 bg-emerald-50 text-emerald-800"
			: state === "guarded"
				? "border-amber-200 bg-amber-50 text-amber-800"
				: "border-slate-200 bg-slate-50 text-slate-600";
	const label = state === "ready" ? "Available" : state === "guarded" ? "Guarded" : "Not wired";

	return (
		<div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0 md:flex-row md:items-start md:justify-between">
			<div className="flex min-w-0 gap-3">
				<div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
					{icon}
				</div>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-semibold text-slate-950">{title}</p>
						<span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}>
							{label}
						</span>
					</div>
					<p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{description}</p>
				</div>
			</div>
			{children ? <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">{children}</div> : null}
		</div>
	);
}

function DeviceConsolePage({
	device,
	isLoading,
	onBack,
	onEdit,
	onEvents,
	onReviewSync,
	onDeviceUsers,
}: {
	device?: Device;
	isLoading: boolean;
	onBack: () => void;
	onEdit: (device: Device) => void;
	onEvents: (device: Device) => void;
	onReviewSync: (device?: Device) => void;
	onDeviceUsers: (device?: Device) => void;
}) {
	const deviceId = device?.id;
	const hikvision = isHikvisionDevice(device);
	const { data: health, refetch: refetchHealth, isFetching: isCheckingHealth } =
		useDeviceHealth(deviceId, Boolean(deviceId));
	const { data: syncPreview, refetch: refetchPreview, isFetching: isCheckingPreview } =
		useDeviceSyncPreview(
			{ deviceId: deviceId || undefined, source: hikvision ? "HIKVISION_CALLBACK" : "all" },
			Boolean(deviceId),
		);
	const { data: usersData, isLoading: isLoadingUsers } = useDeviceUsers(
		deviceId,
		{ page: 1, limit: 1 },
		Boolean(deviceId),
	);
	const { data: runsData } = useDeviceSyncRuns(deviceId, { limit: 5 }, Boolean(deviceId));
	const syncLogsMutation = useTriggerHikvisionAttendanceImport();
	const syncUsersMutation = useSyncDeviceUsers();
	const resetEventsMutation = useResetDeviceEvents();
	const previewRow = syncPreview?.devices?.[0];
	const latestRun = runsData?.syncRuns?.[0];
	const checks = health?.checks;
	const baseUrl = health?.device?.baseUrl || `${device?.protocol || "http"}://${device?.address || "-"}:${device?.port || "-"}`;
	const userCount =
		previewRow?.vendorUserCount ??
		usersData?.summary?.total ??
		(isLoadingUsers ? "Loading..." : null);
	const eventCount = previewRow?.vendorEventCount ?? previewRow?.totalEvents ?? null;
	const savedCount = previewRow?.hrisSavedCount ?? previewRow?.syncedEvents ?? null;
	const skippedCount = previewRow?.knownSkippedEventCount ?? null;
	const missingCount = previewRow?.missingEventCount ?? previewRow?.needsSyncEvents ?? null;
	const networkDetail = checks?.network
		? `${checks.network.host}:${checks.network.port}${checks.network.source === "resolved_runtime_endpoint" ? " (resolved read endpoint)" : ""}`
		: undefined;
	const systemTimeReadable =
		checks?.systemTime?.ok ?? Boolean(checks?.deviceApi?.provenBy === "systemTime");
	const userReadable = checks?.userRead?.ok ?? Boolean(userCount);
	const eventHistoryReadable = checks?.eventHistory?.ok ?? Boolean(eventCount);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Button variant="ghost" onClick={onBack} className="h-9 px-2">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back
				</Button>
				<div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
					Loading device console...
				</div>
			</div>
		);
	}

	if (!device) {
		return (
			<div className="space-y-4">
				<Button variant="ghost" onClick={onBack} className="h-9 px-2">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back
				</Button>
				<div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
					Device not found.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="min-w-0">
					<Button variant="ghost" onClick={onBack} className="mb-2 h-9 px-2">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to devices
					</Button>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="truncate text-2xl font-semibold text-slate-950">{device.name}</h1>
						<AdminConfigSourceChip>{device.protocol.toUpperCase()}</AdminConfigSourceChip>
						{hikvision ? <Badge variant="secondary">Hikvision</Badge> : null}
					</div>
					<p className="mt-1 max-w-3xl text-sm text-slate-600">
						Device truth, reachable endpoints, import counts, and operator actions for this terminal.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => onEvents(device)} className="h-9 px-3 text-xs">
						<Activity className="mr-2 h-4 w-4" />
						Events
					</Button>
					<Button variant="outline" onClick={() => onReviewSync(device)} className="h-9 px-3 text-xs">
						<RefreshCw className="mr-2 h-4 w-4" />
						Sync Center
					</Button>
					<Button onClick={() => onEdit(device)} className="h-9 px-3 text-xs">
						<Edit className="mr-2 h-4 w-4" />
						Edit
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<DeviceFact label="HTTP endpoint" value={baseUrl} mono />
				<DeviceFact label="Vendor" value={getDeviceConfigValue(device, "vendor")} />
				<DeviceFact label="Device users" value={userCount} />
				<DeviceFact label="Device logs" value={eventCount ?? "Unavailable"} />
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
				<section className="rounded-xl border border-slate-200 bg-white">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
						<div>
							<h2 className="text-sm font-semibold text-slate-950">Runtime Truth</h2>
							<p className="text-xs text-slate-500">What HRIS can currently read from this device.</p>
						</div>
						<Button
							type="button"
							variant="outline"
							className="h-8 px-2 text-xs"
							onClick={() => {
								refetchHealth();
								refetchPreview();
							}}
							disabled={isCheckingHealth || isCheckingPreview}>
							<RefreshCw className="mr-2 h-3.5 w-3.5" />
							Refresh
						</Button>
					</div>
					<div className="divide-y divide-slate-200">
						<div className="grid gap-3 px-4 py-4 md:grid-cols-3">
							<DeviceFact label="Saved HRIS events" value={savedCount} />
							<DeviceFact label="Known skipped" value={skippedCount} />
							<DeviceFact label="Missing/importable" value={missingCount} />
						</div>
						<div className="grid gap-3 px-4 py-4 md:grid-cols-2">
							<HealthCheckRow
								label="Network port"
								ok={Boolean(checks?.network?.ok)}
								value={checks?.network?.status || "unchecked"}
								detail={networkDetail}
							/>
							<HealthCheckRow
								label="Device API"
								ok={Boolean(checks?.deviceApi?.ok)}
								value={checks?.deviceApi?.status || "unchecked"}
								detail={getDeviceApiDetail(checks)}
							/>
							<HealthCheckRow
								label="Latest sync run"
								ok={latestRun?.status !== "FAILED"}
								value={latestRun?.status || "none"}
								detail={latestRun?.completedAt ? new Date(latestRun.completedAt).toLocaleString() : latestRun?.startedAt ? new Date(latestRun.startedAt).toLocaleString() : undefined}
							/>
							<HealthCheckRow
								label="Device profile"
								ok
								value={getDeviceConfigValue(device, "vendor")}
							/>
						</div>
					</div>
				</section>

				<section className="rounded-xl border border-slate-200 bg-white">
					<div className="border-b border-slate-200 px-4 py-3">
						<h2 className="text-sm font-semibold text-slate-950">Hikvision Capabilities</h2>
						<p className="text-xs text-slate-500">Read paths are proven; device-destructive writes need a backend contract.</p>
					</div>
					<div className="divide-y divide-slate-200 px-4 py-1 text-sm">
						<div className="flex items-center justify-between gap-3 py-3">
							<span className="text-slate-600">System time</span>
							<Badge variant={systemTimeReadable ? "success" : "secondary"}>
								{systemTimeReadable ? "Readable" : "Unchecked"}
							</Badge>
						</div>
						<div className="flex items-center justify-between gap-3 py-3">
							<span className="text-slate-600">Users</span>
							<Badge variant={userReadable ? "success" : "secondary"}>
								{userReadable ? "Readable" : "Unknown"}
							</Badge>
						</div>
						<div className="flex items-center justify-between gap-3 py-3">
							<span className="text-slate-600">ACS event history</span>
							<Badge variant={eventHistoryReadable ? "success" : "secondary"}>
								{eventHistoryReadable ? "Readable" : "Unknown"}
							</Badge>
						</div>
						<div className="flex items-center justify-between gap-3 py-3">
							<span className="text-slate-600">Factory reset</span>
							<Badge variant="secondary">Not wired</Badge>
						</div>
					</div>
				</section>
			</div>

			<section className="rounded-xl border border-slate-200 bg-white">
				<div className="border-b border-slate-200 px-4 py-3">
					<h2 className="text-sm font-semibold text-slate-950">Manual Operations</h2>
					<p className="text-xs text-slate-500">Actions stay narrow: HRIS imports are active; physical wipe/reset actions are blocked until explicitly implemented.</p>
				</div>
				<CapabilityRow
					icon={<Database className="h-4 w-4" />}
					title="Sync attendance logs into HRIS"
					description="Pull ACS event history, classify skipped rows, and save importable attendance events through the existing sync job."
					state={hikvision ? "ready" : "blocked"}>
					<Button
						type="button"
						size="sm"
						disabled={!hikvision || syncLogsMutation.isPending}
						onClick={() => syncLogsMutation.mutate({ deviceId: device.id })}>
						{syncLogsMutation.isPending ? "Starting log sync…" : "Sync logs"}
					</Button>
				</CapabilityRow>
				<CapabilityRow
					icon={<UsersRound className="h-4 w-4" />}
					title="Sync device users"
					description="Read enrolled users from the terminal and refresh HRIS device-user matching without deleting device records."
					state={hikvision ? "ready" : "blocked"}>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!hikvision || syncUsersMutation.isPending}
						onClick={() => syncUsersMutation.mutate(device.id)}>
						{syncUsersMutation.isPending ? "Reading users from device…" : "Sync users"}
					</Button>
					<Button type="button" size="sm" variant="outline" onClick={() => onDeviceUsers(device)}>
						Review users
					</Button>
				</CapabilityRow>
				<CapabilityRow
					icon={<TerminalSquare className="h-4 w-4" />}
					title="Preview HRIS saved-event reset"
					description="Dry-run the local HRIS event reset scope. This does not erase anything from the physical Hikvision device."
					state="guarded">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={resetEventsMutation.isPending}
						onClick={() =>
							resetEventsMutation.mutate({
								deviceId: device.id,
								source: "HIKVISION_CALLBACK",
								execute: false,
							})
						}>
						Preview reset
					</Button>
				</CapabilityRow>
				<CapabilityRow
					icon={<ShieldAlert className="h-4 w-4" />}
					title="Factory reset / erase device logs / erase enrolled users"
					description="Not exposed yet. These are physical-device destructive operations and need a server endpoint, explicit typed confirmation, audit logging, and a verified backup/recovery path."
					state="blocked">
					<Button type="button" size="sm" variant="outline" disabled>
						Requires backend
					</Button>
				</CapabilityRow>
			</section>

			<section className="rounded-xl border border-slate-200 bg-white">
				<div className="border-b border-slate-200 px-4 py-3">
					<h2 className="text-sm font-semibold text-slate-950">Connection</h2>
				</div>
				<div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
					<DeviceFact label="Address" value={device.address} mono />
					<DeviceFact label="Port" value={device.port} />
					<DeviceFact label="Protocol" value={device.protocol.toUpperCase()} />
					<DeviceFact label="Vendor" value={getDeviceConfigValue(device, "vendor")} />
				</div>
				<div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3">
					<Button type="button" variant="outline" size="sm" onClick={() => onEvents(device)}>
						<ExternalLink className="mr-2 h-4 w-4" />
						Open saved events
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => onReviewSync(device)}>
						<Clock3 className="mr-2 h-4 w-4" />
						Open sync history
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => refetchHealth()}>
						<Network className="mr-2 h-4 w-4" />
						Check network
					</Button>
				</div>
			</section>
		</div>
	);
}

export default function DevicesManagePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// React Query hooks with server-side search and filtering
	const { data: devicesData, isLoading } = useDevices({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		count: true,
	});
	const legacyDevicesData = devicesData as unknown as LegacyDevicesResponse | undefined;
	const items = Array.isArray(devicesData?.data)
		? devicesData.data
		: devicesData?.data?.devices || legacyDevicesData?.devices || [];
	const deviceIdsForHealth = items.map((device) => device.id).filter(Boolean);
	const deviceHealthMap = useDeviceHealthMap(deviceIdsForHealth, items.length > 0);

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single device ID for fetching (when action is edit, view, or delete)
	const activeDeviceId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	// Single useDevice hook for all modals (edit, view, delete)
	const { data: activeDevice, isLoading: isLoadingDevice } = useDevice(activeDeviceId || "");

	// Mutation hooks
	const createDeviceMutation = useCreateDevice();
	const updateDeviceMutation = useUpdateDevice();
	const deleteDeviceMutation = useDeleteDevice();

	const { register, handleSubmit, reset, setValue, watch } = useForm<DeviceFormData>({
		resolver: zodResolver(DeviceFormSchema),
		defaultValues: {
			name: "",
			address: "",
			port: 80,
			protocol: "http",
			config: getDefaultDeviceConfig(),
			access: {
				username: "",
				password: "",
			},
		},
	});

	const watchedProtocol = watch("protocol");
	const watchedName = watch("name");
	const watchedAddress = watch("address");
	const watchedConfig = (watch("config") as DeviceConfigRecord | undefined) || getDefaultDeviceConfig();
	const watchedVendor = String(watchedConfig.vendor || "Hikvision");
	const watchedEmployeeKioskLoginEnabled = watchedConfig.employeeKioskLoginEnabled === true;
	const watchedRuntimeConfig =
		watchedVendor === "Hikvision"
			? buildHikvisionRuntimeConfig(watchedConfig, {
					name: watchedName,
					address: watchedAddress,
					protocol: watchedProtocol,
				})
			: {};
	const watchedUsesReverseBridge =
		String(watchedRuntimeConfig.hikvisionSdkRuntimeTransport || "") ===
		"ssh-reverse-forward";

	const applyVendorPreset = (vendor: string) => {
		const defaults = getVendorConnectionDefaults(vendor);
		const preset = {
			...buildDeviceConfigPreset(vendor),
			...getDeviceConfigRecord(watchedConfig),
			vendor: buildDeviceConfigPreset(vendor).vendor,
		};
		setValue("config", preset, { shouldDirty: true, shouldValidate: true });
		setValue("protocol", defaults.protocol, { shouldDirty: true, shouldValidate: true });
		setValue("port", defaults.port, { shouldDirty: true, shouldValidate: true });
	};

	const setHikvisionRuntimeMode = (mode: "auto" | "direct") => {
		const next: DeviceConfigRecord = {
			...getDeviceConfigRecord(watchedConfig),
			vendor: "Hikvision",
		};

		if (mode === "auto") {
			next.preferHostReverseBridge = "true";
			next.hikvisionSdkRuntimeTransport = "ssh-reverse-forward";
		} else {
			delete next.preferHostReverseBridge;
			delete next.hikvisionRuntimeAddress;
			delete next.hikvisionRuntimePort;
			delete next.hikvisionRuntimeProtocol;
			delete next.hikvisionSdkRuntimeAddress;
			delete next.hikvisionSdkRuntimePort;
			delete next.hikvisionSdkRuntimeTransport;
			delete next.hikvisionReverseBridgeIndex;
		}

		setValue("config", next, { shouldDirty: true, shouldValidate: true });
	};

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingDevice && activeDevice) {
			const activeConfig = getDeviceConfigRecord(activeDevice.config);
			reset({
				name: activeDevice.name,
				address: activeDevice.address,
				port: activeDevice.port,
				protocol: activeDevice.protocol,
				config: {
					...buildDeviceConfigPreset(String(activeConfig.vendor || "Hikvision")),
					...activeConfig,
				},
				access: activeDevice.access || {
					username: "",
					password: "",
				},
			});
		}
	}, [action, isLoadingDevice, activeDevice, reset]);

	const columns: Column<Device>[] = [
		{
			key: "name",
			label: "Name",
			width: "200px",
			required: true,
			priority: "critical",
			render: (value) => (
				<AdminConfigPrimaryCell
					primary={value || "Unnamed device"}
					secondary={null}
					title={String(value || "")}
				/>
			),
		},
		{
			key: "address",
			label: "Address",
			width: "150px",
			required: true,
			priority: "high",
			render: (value) => (value ? <AdminConfigCodeChip>{value}</AdminConfigCodeChip> : <AdminConfigMutedDash />),
		},
		{
			// Synthetic key: reachability comes from GET /api/device/:id/health, not a Device column.
			key: "reachability",
			label: "Status",
			width: "140px",
			required: true,
			priority: "critical",
			render: (_value, device) => {
				const entry = deviceHealthMap.get(device.id);
				const reachability = entry?.reachability;
				const status = reachability?.status || "checking";
				const label = reachability?.label || "Checking…";
				const title =
					reachability?.detail ||
					"Live reachability from HRIS health check (network + device API).";
				return (
					<span
						className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${getDeviceReachabilityBadgeClass(status)}`}
						title={title}
						data-testid="device-reachability-status"
						data-device-id={device.id}
						data-reachability={status}
						aria-label={`${device.name || "Device"} ${label}`}>
						<span
							className={`h-2 w-2 shrink-0 rounded-full ${getDeviceReachabilityDotClass(status)}`}
							aria-hidden="true"
						/>
						{label}
					</span>
				);
			},
		},
		{
			key: "config",
			label: "Vendor",
			width: "150px",
			priority: "high",
			render: (value) => {
				const config = getDeviceConfigRecord(value);
				const vendor = String(config.vendor || config.type || "");
				const model = String(config.model || "");
				return vendor ? (
					<AdminConfigPrimaryCell
						primary={vendor}
						secondary={model || null}
						title={model || vendor}
					/>
				) : (
					<AdminConfigMutedDash />
				);
			},
		},
		{
			key: "port",
			label: "Port",
			width: "100px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => (value ? <AdminConfigCodeChip>{value}</AdminConfigCodeChip> : <AdminConfigMutedDash />),
		},
		{
			key: "protocol",
			label: "Protocol",
			width: "120px",
			priority: "medium",
			hideBelow: "xl",
			render: (value) => (
				<AdminConfigSourceChip>{String(value).toUpperCase()}</AdminConfigSourceChip>
			),
		},
	];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		// replace: avoid history stack traps that make X feel stuck while loaders run.
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				mutator(next);
				return next;
			},
			{ replace: true },
		);
	};

	const openCreate = () => {
		reset({
			name: "",
			address: "",
			port: 80,
			protocol: "http",
			config: getDefaultDeviceConfig(),
			access: {
				username: "",
				password: "",
			},
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (device: Device) => {
		// Don't populate form here - let the useEffect handle it with fresh data from API
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", device.id);
		});
	};

	const onSubmit = (data: DeviceFormData) => {
		// Check if we're editing by looking at search params
		const isEditing = action === "edit";
		const normalizedConfig = normalizeDeviceConfigForSubmit(
			data.config,
			isEditing ? activeDevice?.config : undefined,
			{
				name: data.name,
				address: data.address,
				protocol: data.protocol,
			},
		);

		if (isEditing && activeDevice) {
			const normalizedAccess = normalizeAccessForSubmit(data.access);
			const updatePayload: UpdateDeviceRequest = {
				name: data.name,
				address: data.address,
				port: data.port,
				protocol: data.protocol,
				config: normalizedConfig,
				access: normalizedAccess,
			};

			updateDeviceMutation.mutate(
				{ id: activeDevice.id, payload: updatePayload },
				{
					onSuccess: () => {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					},
				},
			);
		} else {
			const normalizedAccess = normalizeAccessForSubmit(data.access);
			const payload: CreateDeviceRequest = {
				name: data.name,
				address: data.address,
				port: data.port,
				protocol: data.protocol,
				config: normalizedConfig,
				access: normalizedAccess,
			};

			createDeviceMutation.mutate(payload, {
				onSuccess: () => {
					reset();
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					});
				},
			});
		}
	};

	const handleDelete = (device: Device) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", device.id);
		});
	};

	const confirmDelete = () => {
		if (!activeDevice) return;
		deleteDeviceMutation.mutate(activeDevice.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const handleView = (device: Device) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", device.id);
		});
	};

	const openReviewSync = (device?: Device) => {
		updateSearchParams((next) => {
			next.set("action", "sync-review");
			if (device?.id) next.set("deviceId", device.id);
			else next.delete("deviceId");
			next.set("syncPanel", "overview");
			next.delete("id");
			next.delete("enrollmentAction");
			next.delete("employeeId");
		});
	};

	const openDeviceUsers = (device?: Device) => {
		updateSearchParams((next) => {
			next.set("action", "device-users");
			if (device?.id) next.set("deviceId", device.id);
			else next.delete("deviceId");
			next.set("syncPanel", "users");
			next.delete("id");
			next.delete("enrollmentAction");
			next.delete("employeeId");
		});
	};

	const openEvents = (device: Device) => {
		navigate(`/admin/configuration/devices/events?deviceId=${encodeURIComponent(device.id)}`);
	};

	const openAllEvents = () => {
		navigate("/admin/configuration/devices/events?view=saved");
	};

	// Check if modal/page should show loading state for deep links
	const isDeepLinkLoading = !!activeDeviceId && isLoadingDevice;

	if (action === "view") {
		return (
			<DeviceConsolePage
				device={activeDevice}
				isLoading={isDeepLinkLoading}
				onBack={() =>
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					})
				}
				onEdit={openEdit}
				onEvents={openEvents}
				onReviewSync={openReviewSync}
				onDeviceUsers={openDeviceUsers}
			/>
		);
	}

	const renderActions = (item: Device) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<TerminalSquare className="h-4 w-4 mr-2" /> Device Console
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openReviewSync(item)}>
					<RefreshCw className="h-4 w-4 mr-2" /> Sync Center
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openDeviceUsers(item)}>
					<UsersRound className="h-4 w-4 mr-2" /> View Device Users
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEvents(item)}>
					<Activity className="h-4 w-4 mr-2" /> View Device Events
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Server-side search handler
	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("search", query);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Devices"
				data={items}
				columns={columns}
				onAdd={openCreate}
				addButtonLabel="Add Device"
				titleActions={
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Button
							variant="outline"
							onClick={openAllEvents}
							className="h-9 px-3 text-xs">
							<Activity className="h-4 w-4 mr-2" />
							View all events
						</Button>
						<Button
							variant="outline"
							onClick={() => openReviewSync()}
							className="h-9 px-3 text-xs">
							<RefreshCw className="h-4 w-4 mr-2" />
							Sync Center
						</Button>
					</div>
				}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No devices found"
				emptyDescription="Get started by adding your first device."
				emptyActions={<ConfigurationEmptyGuide label="Add device" onClick={openCreate} />}
				searchWidth="w-80"
				searchPlaceholder="Search devices..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={devicesData?.pagination?.total ?? legacyDevicesData?.pagination?.total}
				onSearch={handleSearch}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportPDF={() => {
					/* your PDF logic */
				}}
				onExportExcel={() => {
					/* your Excel logic */
				}}
				containedScroll
			/>

			{/* Edit / Create Modal */}
			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Device..."
						: action === "edit"
							? "Edit Device"
							: "Add Device"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading device...</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
						<Tabs defaultValue="connection" className="space-y-4">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="connection">Connection</TabsTrigger>
								<TabsTrigger value="runtime">Runtime config</TabsTrigger>
							</TabsList>

							<TabsContent value="connection" className="space-y-5">
								<div className="grid gap-4 md:grid-cols-2">
									<div data-field-path="name">
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Name *
										</div>
										<Input
											placeholder="e.g., Main Entrance Device"
											aria-invalid={false}
											{...register("name")}
										/>
										<ConstraintTokenRow
											tokens={[{ label: "Required", tone: "default" }]}
										/>
									</div>
									<div data-field-path="protocol">
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Protocol *
										</div>
										<Select
											options={protocolOptions}
											value={watchedProtocol || "http"}
											onChange={(v) => setValue("protocol", (v || "http") as DeviceFormData["protocol"])}
											placeholder="Select Protocol"
										/>
										<ConstraintTokenRow
											tokens={[{ label: "Required", tone: "default" }]}
										/>
									</div>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<div data-field-path="address">
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Address *
										</div>
										<Input
											placeholder="e.g., 192.168.1.100"
											aria-invalid={false}
											{...register("address")}
										/>
										<ConstraintTokenRow
											tokens={[{ label: "IP/host", tone: "subtle" }]}
										/>
									</div>
									<div data-field-path="port">
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Port *
										</div>
										<Input
											type="number"
											placeholder="e.g., 80"
											aria-invalid={false}
											{...register("port", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[{ label: "1-65535", tone: "subtle" }]}
										/>
									</div>
								</div>

								<div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
									<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-semibold text-slate-950">Device vendor</p>
											<p className="text-xs text-slate-500">
												Choose the terminal brand. HRIS applies the correct runtime settings automatically.
											</p>
										</div>
										<AdminConfigSourceChip>{watchedVendor}</AdminConfigSourceChip>
									</div>
									<div data-field-path="config.vendor">
										<div className="mb-1 block text-sm font-medium text-gray-700">
											Vendor *
										</div>
										<Select
											options={deviceVendorOptions}
											value={watchedVendor}
											onChange={(value) => applyVendorPreset(value || "Hikvision")}
											placeholder="Select vendor"
										/>
										<p className="mt-1 text-xs text-slate-500">
											{getVendorHelperText(watchedVendor)}
										</p>
									</div>
								</div>

								<div
									data-field-path="config.employeeKioskLoginEnabled"
									className="rounded-md border border-slate-200 bg-white p-4">
									<label
										htmlFor="employeeKioskLoginEnabled"
										className="flex items-start gap-3">
										<Checkbox
											id="employeeKioskLoginEnabled"
											checked={watchedEmployeeKioskLoginEnabled}
											onCheckedChange={(checked) =>
												setValue(
													"config",
													{
														...getDeviceConfigRecord(watchedConfig),
														employeeKioskLoginEnabled: checked === true,
													},
													{ shouldDirty: true, shouldValidate: true },
												)
											}
										/>
										<span className="space-y-1">
											<span className="block text-sm font-medium text-gray-700">
												Enable biometric kiosk login
											</span>
											<span className="block text-xs text-slate-500">
												Allow a fresh attendance tap from this device to sign in the employee kiosk automatically.
											</span>
										</span>
									</label>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<div>
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Username (optional)
										</div>
										<Input
											placeholder="Device username"
											{...register("access.username", {
												setValueAs: (value) => value || undefined,
											})}
										/>
									</div>
									<div>
										<div className="block text-sm font-medium text-gray-700 mb-1">
											Password (optional)
										</div>
										<Input
											type="password"
											placeholder="Device password"
											{...register("access.password", {
												setValueAs: (value) => value || undefined,
											})}
										/>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="runtime" className="space-y-4">
								<div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
									<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-semibold text-slate-950">Runtime path</p>
											<p className="text-xs text-slate-500">
												Review the adapter and bridge values that will be saved with this device.
											</p>
										</div>
										<AdminConfigSourceChip>
											{watchedUsesReverseBridge ? "SSH reverse bridge" : "Direct device"}
										</AdminConfigSourceChip>
									</div>
									<div data-field-path="config.runtimeMode">
										<div className="mb-1 block text-sm font-medium text-gray-700">
											Hikvision runtime mode
										</div>
										<Select
											options={[
												{ value: "auto", label: "Auto local bridge" },
												{ value: "direct", label: "Direct device only" },
											]}
											value={watchedUsesReverseBridge ? "auto" : "direct"}
											onChange={(value) =>
												setHikvisionRuntimeMode(value === "direct" ? "direct" : "auto")
											}
											placeholder="Select runtime mode"
											disabled={watchedVendor !== "Hikvision"}
										/>
										<p className="mt-1 text-xs text-slate-500">
											Local Hikvision test devices on 192.168.254.x use host reverse-forward ports.
										</p>
									</div>
								</div>

								<div className="grid gap-3 md:grid-cols-2">
									<DeviceFact
										label="HTTP runtime"
										value={`${runtimeValue(watchedRuntimeConfig.hikvisionRuntimeAddress)}:${runtimeValue(watchedRuntimeConfig.hikvisionRuntimePort)}`}
										mono
									/>
									<DeviceFact
										label="SDK runtime"
										value={`${runtimeValue(watchedRuntimeConfig.hikvisionSdkRuntimeAddress)}:${runtimeValue(watchedRuntimeConfig.hikvisionSdkRuntimePort)}`}
										mono
									/>
									<DeviceFact
										label="Runtime protocol"
										value={runtimeValue(watchedRuntimeConfig.hikvisionRuntimeProtocol).toUpperCase()}
									/>
									<DeviceFact
										label="Bridge index"
										value={runtimeValue(watchedRuntimeConfig.hikvisionReverseBridgeIndex)}
									/>
								</div>

								<div className="rounded-md border border-slate-200 bg-white p-3">
									<div className="grid gap-3 md:grid-cols-2">
										<DeviceFact
											label="Adapter"
											value={runtimeValue(watchedConfig.source || buildDeviceConfigPreset(watchedVendor).source)}
											mono
										/>
										<DeviceFact
											label="Callback"
											value={runtimeValue(watchedConfig.webhookPath || buildDeviceConfigPreset(watchedVendor).webhookPath)}
											mono
										/>
										<DeviceFact
											label="SDK port"
											value={runtimeValue(watchedConfig.sdkPort || buildDeviceConfigPreset(watchedVendor).sdkPort)}
										/>
										<DeviceFact
											label="SDK transport"
											value={runtimeValue(watchedRuntimeConfig.hikvisionSdkRuntimeTransport || watchedConfig.sdkProtocol)}
										/>
									</div>
								</div>
							</TabsContent>
						</Tabs>

						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createDeviceMutation.isPending || updateDeviceMutation.isPending
								}>
								{action === "edit" ? "Update Device" : "Create Device"}
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
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Device Details"
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading device...</div>
				) : activeDevice && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Name
								</p>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeDevice.name}
								</div>
							</div>
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Protocol
								</p>
								<div className="p-3 bg-gray-50 rounded-md border">
									<Badge variant="secondary">
										{activeDevice.protocol.toUpperCase()}
									</Badge>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Address
								</p>
								<div className="p-3 bg-gray-50 rounded-md border font-mono">
									{activeDevice.address}
								</div>
							</div>
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Port
								</p>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeDevice.port}
								</div>
							</div>
						</div>
						{activeDevice.access && (
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="block text-sm font-medium text-gray-700 mb-1">
										Username
									</p>
									<div className="p-3 bg-gray-50 rounded-md border">
										{activeDevice.access.username || "-"}
									</div>
								</div>
								<div>
									<p className="block text-sm font-medium text-gray-700 mb-1">
										Password
									</p>
									<div className="p-3 bg-gray-50 rounded-md border">
										{activeDevice.access.password ? "********" : "-"}
									</div>
								</div>
							</div>
						)}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Biometric kiosk login
								</p>
								<div className="p-3 bg-gray-50 rounded-md border">
									{getDeviceConfigRecord(activeDevice.config).employeeKioskLoginEnabled === true
										? "Enabled"
										: "Disabled"}
								</div>
							</div>
							<div>
								<p className="block text-sm font-medium text-gray-700 mb-1">
									Vendor
								</p>
								<div className="p-3 bg-gray-50 rounded-md border">
									{String(getDeviceConfigRecord(activeDevice.config).vendor || "-")}
								</div>
							</div>
						</div>
						<DeviceHealthPanel deviceId={activeDevice.id} />
						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeDevice)}>Edit Device</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Device not found</div>
				)}
			</Modal>

			<Modal
				open={action === "sync-review" || action === "device-users"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
							next.delete("syncPanel");
							next.delete("enrollmentAction");
							next.delete("employeeId");
							next.delete("deviceUserSearch");
							next.delete("deviceUserView");
						});
					}
				}}
				title="Sync Center"
				className={HR_MODAL_WIDE_CLASS}>
				<DeviceEnrollmentPanel embedded mode={action === "device-users" ? "device-users" : "sync-review"} />
			</Modal>

			{/* Remove Confirmation Modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Remove Device"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading device...</div>
				) : activeDevice && action === "delete" ? (
					<div className="space-y-4">
						<div className="p-4 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-800">
								Remove <strong>{activeDevice.name}</strong> ({activeDevice.address}:
								{activeDevice.port}) from active configuration. Historical events
								stay available for attendance audit.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteDeviceMutation.isPending}>
								{deleteDeviceMutation.isPending ? "Removing..." : "Remove Device"}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Device not found</div>
				)}
			</Modal>
		</div>
	);
}
