import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
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
import { Eye, Edit, Trash2, MoreVertical, UserPlus, Activity, RefreshCw } from "lucide-react";
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
	useCreateDevice,
	useUpdateDevice,
	useDeleteDevice,
} from "~/lib/hooks/useDevices";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DeviceEnrollmentPanel } from "./enroll";

const DeviceFormSchema = CreateDeviceSchema;
type DeviceFormData = CreateDevice;

const protocolOptions: SelectOption[] = [
	{ value: "http", label: "HTTP" },
	{ value: "https", label: "HTTPS" },
	{ value: "tcp", label: "TCP" },
	{ value: "udp", label: "UDP" },
];

const healthToneClass = (ok: boolean) => (ok ? "text-green-700" : "text-amber-700");

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
				<div className="text-sm text-slate-500">Checking...</div>
			) : (
				<div className="grid gap-2 sm:grid-cols-2">
					<HealthCheckRow label="HRIS API" ok value="Online" />
					{isZkteco && checks?.zktecoWebhook ? (
						<HealthCheckRow
							label="ZKTeco webhook"
							ok={Boolean(checks.zktecoWebhook.ok)}
							value={checks.zktecoWebhook.status || "-"}
							detail={checks.zktecoWebhook.path}
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
	const items = (devicesData as any)?.devices || [];

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
			config: {},
			access: {
				username: "",
				password: "",
			},
		},
	});

	const watchedProtocol = watch("protocol");

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingDevice && activeDevice) {
			reset({
				name: activeDevice.name,
				address: activeDevice.address,
				port: activeDevice.port,
				protocol: activeDevice.protocol,
				config: activeDevice.config || {},
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
			render: (value, item) => (
				<AdminConfigPrimaryCell
					primary={value || "Unnamed device"}
					secondary={
						<AdminConfigSourceChip>
						{`${item.address || "-"}:${item.port || "-"}`}
						</AdminConfigSourceChip>
					}
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
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openCreate = () => {
		reset({
			name: "",
			address: "",
			port: 80,
			protocol: "http",
			config: {},
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

		if (isEditing && activeDevice) {
			const updatePayload: UpdateDeviceRequest = {
				name: data.name,
				address: data.address,
				port: data.port,
				protocol: data.protocol,
				config: data.config,
				access: data.access,
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
			const payload: CreateDeviceRequest = {
				name: data.name,
				address: data.address,
				port: data.port,
				protocol: data.protocol,
				config: data.config,
				access: data.access,
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

	const openEnrollment = () => {
		updateSearchParams((next) => {
			next.set("action", "enroll-users");
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

	const renderActions = (item: Device) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEvents(item)}>
					<Activity className="h-4 w-4 mr-2" /> View Events
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeDeviceId && isLoadingDevice;

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
							onClick={openEnrollment}
							className="h-9 px-3 text-xs">
							<UserPlus className="h-4 w-4 mr-2" />
							Enroll Users
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
				totalItems={(devicesData as any)?.pagination?.total}
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
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="name">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name *
								</label>
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
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Protocol *
								</label>
								<Select
									options={protocolOptions}
									value={watchedProtocol || "http"}
									onChange={(v) => setValue("protocol", (v || "http") as any)}
									placeholder="Select Protocol"
								/>
								<ConstraintTokenRow
									tokens={[{ label: "Required", tone: "default" }]}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="address">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Address *
								</label>
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
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Port *
								</label>
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

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Username (optional)
								</label>
								<Input
									placeholder="Device username"
									{...register("access.username", {
										setValueAs: (value) => value || undefined,
									})}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Password (optional)
								</label>
								<Input
									type="password"
									placeholder="Device password"
									{...register("access.password", {
										setValueAs: (value) => value || undefined,
									})}
								/>
							</div>
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
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeDevice.name}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Protocol
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<Badge variant="secondary">
										{activeDevice.protocol.toUpperCase()}
									</Badge>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Address
								</label>
								<div className="p-3 bg-gray-50 rounded-md border font-mono">
									{activeDevice.address}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Port
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeDevice.port}
								</div>
							</div>
						</div>
						{activeDevice.access && (
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Username
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										{activeDevice.access.username || "-"}
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Password
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										{activeDevice.access.password ? "********" : "-"}
									</div>
								</div>
							</div>
						)}
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
				open={action === "enroll-users"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
							next.delete("enrollmentAction");
							next.delete("employeeId");
						});
					}
				}}
				title="Enroll Users"
				className={HR_MODAL_WIDE_CLASS}>
				<DeviceEnrollmentPanel embedded />
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
