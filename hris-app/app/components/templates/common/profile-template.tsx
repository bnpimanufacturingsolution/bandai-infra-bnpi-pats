import { useEffect, useState, useRef, type ChangeEvent } from "react";

import { cn } from "~/lib/utils";

import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChangePasswordModal } from "~/components/modals/ChangePasswordModal";
import { useAuth } from "~/lib/hooks/use-auth";
import { useToastContext } from "~/lib/contexts/toast-context";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import {
	Lock,
	User as UserIcon,
	Mail,
	Briefcase,
	Shield,
	LogOut,
	Info,
	Bell,
	Camera,
	Check,
	Loader2,
	X,
} from "lucide-react";
import { ResignationFlowModal } from "./ResignationFlowModal";
import { useRequests } from "~/lib/hooks/useRequests";
import { EmployeeDocumentsCard } from "~/components/organisms/EmployeeDocumentsCard";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import userService from "~/services/user.service";
import { userKeys } from "~/lib/hooks/useUsers";

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const getInitials = (firstName?: string, lastName?: string, fallback?: string) => {
	const firstInitial = firstName?.trim()?.[0] || "";
	const lastInitial = lastName?.trim()?.[0] || "";
	const initials = `${firstInitial}${lastInitial}`.trim();
	return (initials || fallback?.trim()?.[0] || "U").toUpperCase();
};

export function MyProfile() {
	const { user, getCurrentUser } = useAuth();
	const { toast } = useToastContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();

	// Deep link URL params
	const action = searchParams.get("action");
	const tab = searchParams.get("tab");
	const documentsRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

	// Scroll to documents section if action is 'documents'
	useEffect(() => {
		if ((action === "documents" || tab === "documents") && documentsRef.current) {
			documentsRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [action, tab]);

	// Check if user needs to change password on mount

	const handlePasswordChanged = async () => {
		// Clear URL params
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete("action");
				return next;
			},
			{ replace: true },
		);

		// Refresh user data to get updated metadata (requirePasswordChange should now be false)
		try {
			await getCurrentUser();
			toast.success(
				"Password changed successfully! You can now access your dashboard.",
				"Success",
			);
			// Redirect to dashboard
			navigate("/dashboard");
		} catch (error) {
			console.error("Error refreshing user data after password change:", error);
		}
	};

	const employeeInfo = user?.metadata?.employee;
	const isPasswordChangeEnforced = user?.metadata?.requirePasswordChange === true;
	const firstName = employeeInfo?.personalInfo?.firstName || "";
	const lastName = employeeInfo?.personalInfo?.lastName || "";
	const profileName =
		`${firstName} ${lastName}`.trim() || user?.userName || user?.email || "User";
	const profileInitials = getInitials(firstName, lastName, user?.email);
	const currentAvatarUrl = String(user?.avatar || "").trim();
	const visibleAvatarUrl = avatarPreviewUrl || currentAvatarUrl;

	// Resignation Flow State
	const [isResignationModalOpen, setIsResignationModalOpen] = useState(false);
	const employeeId = user?.metadata?.employee?.id;
	// organizationId is on the user object, not deep inside employee.metadata
	const organizationId = user?.organizationId;

	// Check existing resignation requests
	const { data: requestsData } = useRequests({
		filter: [{ type: "RESIGNATION", requesterId: employeeId }],
	});
	const existingResignation = (requestsData as any)?.requests?.find((r: any) =>
		["NEW", "PENDING", "PROCESSING", "APPROVED", "COMPLETED"].includes(r.status),
	);
	const notificationsPath =
		user?.role === "hris-hr-manager" || user?.role === "hris-hr-user"
			? "/hr/notifications"
			: user?.role === "admin"
				? "/admin/notifications"
				: "/employee/notifications";

	useEffect(() => {
		if (!avatarFile) {
			setAvatarPreviewUrl(null);
			return;
		}

		const nextPreviewUrl = URL.createObjectURL(avatarFile);
		setAvatarPreviewUrl(nextPreviewUrl);

		return () => {
			URL.revokeObjectURL(nextPreviewUrl);
		};
	}, [avatarFile]);

	const avatarMutation = useMutation({
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append("avatar", file);
			return userService.updateCurrentUserAvatar(formData);
		},
		onSuccess: async () => {
			await Promise.all([
				getCurrentUser(),
				queryClient.invalidateQueries({ queryKey: userKeys.all }),
			]);
			setAvatarFile(null);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			toast.success("Profile photo updated successfully.", "Success");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update profile photo.", "Upload failed");
		},
	});

	const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] || null;
		if (!nextFile) return;

		if (!AVATAR_ALLOWED_TYPES.has(nextFile.type)) {
			toast.error(
				"Use a JPG, PNG, or WEBP image for your profile photo.",
				"Unsupported file",
			);
			event.target.value = "";
			return;
		}

		if (nextFile.size > AVATAR_MAX_SIZE_BYTES) {
			toast.error("Choose an image smaller than 5 MB.", "File too large");
			event.target.value = "";
			return;
		}

		setAvatarFile(nextFile);
	};

	const handleAvatarCancel = () => {
		setAvatarFile(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleAvatarSave = () => {
		if (!avatarFile || avatarMutation.isPending) return;
		avatarMutation.mutate(avatarFile);
	};

	return (
		<div className="p-6 space-y-6">
			{/* Header Section with Profile Info */}
			<div className="rounded-lg border border-[#f3b08a] bg-gradient-to-r from-[#fff3ea] via-[#fff8f3] to-[#ffe9d8] p-8 shadow-sm">
				<div className="flex items-center gap-6">
					<div className="relative">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={avatarMutation.isPending}
							aria-label="Choose profile photo"
							className="group relative rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[#f05a0f]/25 disabled:cursor-not-allowed">
							<Avatar className="w-24 h-24 rounded-full border-2 border-white/90 bg-white shadow-md">
								{visibleAvatarUrl ? (
									<AvatarImage
										src={visibleAvatarUrl}
										alt={`${profileName} profile photo`}
										className="object-cover"
									/>
								) : null}
								<AvatarFallback className="bg-white text-[#e95a0c] text-3xl font-bold">
									{profileInitials}
								</AvatarFallback>
							</Avatar>
							<span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
								<Camera className="h-6 w-6 text-white" />
							</span>
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={avatarMutation.isPending}
							aria-label="Edit profile photo"
							className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#f05a0f] text-white shadow-md transition hover:bg-[#db520e] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f05a0f]/25 disabled:cursor-not-allowed disabled:opacity-70">
							<Camera className="h-3.5 w-3.5" />
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							className="sr-only"
							onChange={handleAvatarChange}
						/>
						{avatarFile && (
							<div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 flex gap-2">
								<Button
									type="button"
									onClick={handleAvatarSave}
									disabled={avatarMutation.isPending}
									className="h-8 rounded-lg border border-[#f05a0f] bg-[#f05a0f] px-3 text-xs text-white shadow-sm hover:bg-[#db520e]">
									{avatarMutation.isPending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<Check className="h-3.5 w-3.5" />
									)}
									Save
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={handleAvatarCancel}
									disabled={avatarMutation.isPending}
									className="h-8 rounded-lg border-[#f3c6a8] px-3 text-xs text-[#a34e19] hover:bg-[#fff2e8]">
									<X className="h-3.5 w-3.5" />
									Cancel
								</Button>
							</div>
						)}
					</div>
					<div className="flex-1">
						<h1 className="text-3xl font-bold mb-2 text-gray-900">
							{employeeInfo?.personalInfo?.firstName}{" "}
							{employeeInfo?.personalInfo?.lastName}
						</h1>
						<div className="flex items-center gap-4 text-[#8a4a22]">
							<div className="flex items-center gap-2">
								<Mail className="w-4 h-4 text-[#e95a0c]" />
								<span>{user?.email}</span>
							</div>
							{employeeInfo?.position && (
								<div className="flex items-center gap-2">
									<Briefcase className="w-4 h-4 text-[#e95a0c]" />
									<span>{employeeInfo.position.title}</span>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* User Information Card */}
				<Card className="gap-0 pt-0 pb-6 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
					<CardHeader className="items-center bg-gradient-to-br from-gray-50 to-white border-b border-gray-100 px-6 py-5">
						<CardTitle className="flex items-center gap-2 text-gray-800">
							<UserIcon className="w-5 h-5 text-[#f05a0f]" />
							Personal Information
						</CardTitle>
					</CardHeader>
					<CardContent className="p-6 space-y-4">
						<div className="space-y-3">
							<div className="flex justify-between py-3 border-b border-gray-100">
								<span className="text-sm font-medium text-gray-600">Email</span>
								<span className="text-sm text-gray-900">
									{user?.email || "N/A"}
								</span>
							</div>
							<div className="flex justify-between py-3 border-b border-gray-100">
								<span className="text-sm font-medium text-gray-600">Role</span>
								<span className="text-sm text-gray-900 capitalize">
									{user?.role?.replace(/-/g, " ") || "N/A"}
								</span>
							</div>
							{employeeInfo?.department && (
								<div className="flex justify-between py-3 border-b border-gray-100">
									<span className="text-sm font-medium text-gray-600">
										Department
									</span>
									<span className="text-sm text-gray-900">
										{employeeInfo.department.name}
									</span>
								</div>
							)}
							{(employeeInfo as { section?: { name?: string } } | undefined)?.section && (
								<div className="flex justify-between py-3 border-b border-gray-100">
									<span className="text-sm font-medium text-gray-600">
										Section
									</span>
									<span className="text-sm text-gray-900">
										{
											(employeeInfo as { section?: { name?: string } }).section
												?.name
										}
									</span>
								</div>
							)}
							{employeeInfo?.level && (
								<div className="flex justify-between py-3">
									<span className="text-sm font-medium text-gray-600">Level</span>
									<span className="text-sm text-gray-900">
										{employeeInfo.level.name}
									</span>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Security Settings Card */}
				<Card className="gap-0 pt-0 pb-6 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
					<CardHeader className="items-center bg-gradient-to-br from-gray-50 to-white border-b border-gray-100 px-6 py-5">
						<CardTitle className="flex items-center gap-2 text-gray-800">
							<Shield className="w-5 h-5 text-[#f05a0f]" />
							Security Settings
						</CardTitle>
					</CardHeader>
					<CardContent className="p-6">
						<div className="space-y-4">
							<div className="rounded-lg border border-[#f3c6a8] bg-gradient-to-br from-[#fff6ef] to-[#fff1e6] p-5 shadow-[0_8px_24px_rgba(233,90,12,0.08)]">
								<div className="flex items-start gap-3">
									<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#f4c3a1] bg-white">
										<Lock className="w-4 h-4 text-[#f05a0f]" />
									</div>
									<div className="flex-1">
										<h3 className="font-semibold text-gray-900 mb-1">
											Password Management
										</h3>
										<p className="text-sm text-gray-600 mb-4">
											Keep your account secure by regularly updating your
											password
										</p>
										<Button
											onClick={() => {
												setSearchParams((prev) => {
													const next = new URLSearchParams(prev);
													next.set("action", "changePassword");
													return next;
												});
											}}
											className="rounded-lg bg-[#f05a0f] text-white shadow-sm hover:bg-[#db520e] border border-[#f05a0f]">
											<Lock className="w-4 h-4 mr-2" />
											Change Password
										</Button>
										<Button
											variant="outline"
											onClick={() => navigate(notificationsPath)}
											className="ml-2 rounded-lg border-[#f3c6a8] text-[#a34e19] hover:bg-[#fff2e8]">
											<Bell className="w-4 h-4 mr-2" />
											View Notifications
										</Button>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Account Actions Card (Danger Zone) */}
				<Card className="gap-0 pt-0 pb-6 rounded-lg overflow-hidden border border-gray-200 shadow-sm lg:col-span-2">
					<CardHeader className="items-center bg-gradient-to-br from-gray-50 to-white border-b border-gray-100 px-6 py-5">
						<CardTitle className="flex items-center gap-2 text-gray-800">
							<Shield className="w-5 h-5 text-red-600" />
							Account Actions
						</CardTitle>
					</CardHeader>
					<CardContent className="p-6">
						<div className="flex items-start justify-between gap-4 p-5 bg-red-50 border border-red-100 rounded-xl">
							<div className="flex items-start gap-3">
								<div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
									<LogOut className="w-5 h-5 text-red-600 ml-0.5" />
								</div>
								<div>
									<h3 className="font-semibold text-gray-900 mb-1">
										Resignation & Exit
									</h3>
									<p className="text-sm text-gray-600 max-w-xl">
										Initiate the formal resignation process. This will start an
										approval workflow with your manager and HR department.
									</p>

									{existingResignation && (
										<div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium border border-amber-200">
											<Info className="w-3 h-3 mr-1.5" />
											{existingResignation.status === "COMPLETED"
												? "Resignation Completed"
												: "Resignation in Progress"}
										</div>
									)}
								</div>
							</div>

							<Button
								variant="outline"
								onClick={() => setIsResignationModalOpen(true)}
								disabled={!!existingResignation}
								className={cn(
									"border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800",
									existingResignation && "opacity-50 cursor-not-allowed",
								)}>
								{existingResignation ? "Request Active" : "Leave Company"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{employeeId && organizationId && (
				<ResignationFlowModal
					isOpen={isResignationModalOpen}
					onClose={() => setIsResignationModalOpen(false)}
					employeeId={employeeId}
					organizationId={organizationId}
				/>
			)}

			{/* Change Password Modal */}

			<ChangePasswordModal
				isOpen={action === "changePassword"}
				onClose={() => {
					if (isPasswordChangeEnforced) return;
					setSearchParams(
						(prev) => {
							const next = new URLSearchParams(prev);
							next.delete("action");
							return next;
						},
						{ replace: true },
					);
				}}
				onPasswordChanged={handlePasswordChanged}
				userEmail={user?.email || ""}
				enforceLock={isPasswordChangeEnforced}
			/>
		</div>
	);
}
