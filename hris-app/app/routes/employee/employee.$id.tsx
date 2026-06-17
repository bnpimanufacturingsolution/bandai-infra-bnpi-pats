import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { PersonalInfoTab } from "~/components/organisms/employee-detail/personal-info-tab";
import { EmploymentDetailsTab } from "~/components/organisms/employee-detail/employment-details-tab";
import { CompensationTab } from "~/components/organisms/employee-detail/compensation-tab";
import { LeaveBalanceTab } from "~/components/organisms/employee-detail/leave-balance-tab";
import { DocumentsTab } from "~/components/organisms/employee-detail/documents-tab";
import { ScheduleTab } from "~/components/organisms/employee-detail/schedule-tab";
import { OnboardingTab } from "~/components/organisms/employee-detail/onboarding-tab";
import { Badge } from "~/components/atoms/Badge";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import { useDocumentActionMetrics } from "~/lib/hooks/useMetrics";
import {
	User,
	Briefcase,
	DollarSign,
	Calendar,
	FileText,
	Clock,
	ArrowLeft,
	ListTodo,
	Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export default function EmployeeDetailPage() {
	const { id } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
	const activeTab = searchParams.get("tab") || "personal";
	const fromParam = searchParams.get("from");
	const { data: employee, isLoading, error } = useEmployee(id || "");

	// Check if viewing own profile
	const isOwnProfile = user?.metadata?.employee?.id === id;
	const { data: documentActionMetrics } = useDocumentActionMetrics(id, {
		enabled: isOwnProfile && !!id,
	});
	const documentsBadgeCount =
		documentActionMetrics?.items.filter(
			(item) =>
				item.priorityState !== "optional" &&
				(item.isActionable || item.priorityState === "pending_approval"),
		).length || 0;
	// Only show back button if came from another page OR viewing someone else's profile
	const shouldShowBackButton = fromParam || !isOwnProfile;

	// Define tabs - keeping the same order as requested
	const tabs = [
		{ id: "personal", label: "Personal", icon: User },
		{ id: "employment", label: "Employment", icon: Briefcase },
		{ id: "schedule", label: "Work Schedule", icon: Clock },
		{ id: "compensation", label: "Compensation", icon: DollarSign },
		{ id: "leave-balance", label: "Leave Balance", icon: Calendar },
		{ id: "documents", label: "Documents", icon: FileText },
	];

	// Helper to change tabs with URL deep linking
	const handleTabChange = (tabId: string) => {
		const params = new URLSearchParams(searchParams);
		params.set("tab", tabId);
		setSearchParams(params);
	};

	// Handle back navigation
	const handleBack = () => {
		if (fromParam) {
			// Convert encoded path back (replace - with /)
			const decodedPath = fromParam.replace(/-/g, "/");
			navigate(`/${decodedPath}`);
		} else {
			navigate(-1);
		}
	};

	const openEmployeeTeam = () => {
		if (!id) return;
		const next = new URLSearchParams();
		next.set("tab", "overview");
		next.set("page", "1");
		next.set("managerId", id);
		next.set("teamScope", "direct-reports");
		navigate(`/employee/team?${next.toString()}`);
	};

	const openEmployeeTimesheet = () => {
		if (!id) return;
		navigate(`/employee/${id}/attendance?action=view-timesheet`);
	};

	const openEmployeeAttendance = () => {
		if (!id) return;
		navigate(`/employee/${id}/attendance`);
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gray-50">
				{/* Loading Skeleton */}
				<div className="max-w-6xl mx-auto px-4 py-6">
					{/* Profile Header Skeleton */}
					<div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
						<div className="flex gap-6 items-start">
							<div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse"></div>
							<div className="flex-1 space-y-3">
								<div className="h-7 bg-gray-200 rounded w-48 animate-pulse"></div>
								<div className="h-5 bg-gray-200 rounded w-64 animate-pulse"></div>
								<div className="flex gap-4 mt-4">
									<div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
									<div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
								</div>
							</div>
						</div>
					</div>

					{/* Tabs Skeleton */}
					<div className="flex gap-2 mb-6">
						{[1, 2, 3, 4, 5, 6, 7].map((i) => (
							<div
								key={i}
								className="h-10 bg-gray-200 rounded-lg w-24 animate-pulse"
							/>
						))}
					</div>

					{/* Content Skeleton */}
					<div className="bg-white rounded-xl border border-gray-200 p-6">
						<div className="space-y-4">
							{[1, 2, 3].map((i) => (
								<div key={i} className="space-y-2">
									<div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
									<div className="h-5 bg-gray-200 rounded w-48 animate-pulse"></div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (error || !employee) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
					<div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
						<User className="w-8 h-8 text-red-600" />
					</div>
					<p className="text-gray-900 font-semibold text-lg mb-2">Employee Not Found</p>
					<p className="text-gray-600 text-sm">
						The employee you&apos;re looking for doesn&apos;t exist or has been removed.
					</p>
					<button
						onClick={() => navigate(-1)}
						className="mt-6 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
						Go Back
					</button>
				</div>
			</div>
		);
	}

	const getInitials = () => {
		const firstName = employee.person?.personalInfo?.firstName || "";
		const lastName = employee.person?.personalInfo?.lastName || "";
		return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
	};

	const getFullName = () => {
		const { firstName, middleName, lastName } = employee.person?.personalInfo || {};
		const parts = [firstName, middleName, lastName].filter(Boolean);
		return parts.join(" ");
	};

	const profileAvatarUrl = String(
		employee.user?.avatar || (isOwnProfile ? user?.avatar : "") || "",
	).trim();

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-6xl mx-auto px-4 py-6">
				{/* Back Button */}
				{shouldShowBackButton && (
					<button
						onClick={handleBack}
						className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors mb-4">
						<ArrowLeft className="w-4 h-4" />
						Back
					</button>
				)}

				{/* Profile Header Section - Clean & Minimal */}
				<div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
					{/* Cover/Banner Area - Subtle pattern */}
					<div className="h-20 bg-orange-50 relative">
						<div
							className="absolute inset-0 opacity-30"
							style={{
								backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f97316' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
							}}
						/>
					</div>

					{/* Profile Info */}
					<div className="px-6 pb-6">
						<div className="flex flex-col sm:flex-row gap-4 sm:gap-6 -mt-10 relative">
							{/* Avatar */}
							<div className="flex-shrink-0">
								<DropdownMenu
									open={isAvatarMenuOpen}
									onOpenChange={setIsAvatarMenuOpen}>
									<DropdownMenuTrigger asChild>
										<Avatar
											className="w-20 h-20 sm:w-24 sm:h-24 cursor-pointer border-4 border-white shadow-md ring-orange-300 transition hover:ring-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400"
											onMouseEnter={() => setIsAvatarMenuOpen(true)}
											onContextMenu={(event) => {
												event.preventDefault();
												setIsAvatarMenuOpen(true);
											}}
											title="Open employee actions">
											{profileAvatarUrl ? (
												<AvatarImage
													src={profileAvatarUrl}
													alt={getFullName() || "Employee avatar"}
													className="object-cover"
												/>
											) : null}
											<AvatarFallback className="bg-orange-500 text-white text-xl sm:text-2xl font-bold">
												{getInitials()}
											</AvatarFallback>
										</Avatar>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="w-48">
										<DropdownMenuItem onClick={openEmployeeTeam}>
											<Users className="mr-2 h-4 w-4" />
											View Team
										</DropdownMenuItem>
										<DropdownMenuItem onClick={openEmployeeTimesheet}>
											<ListTodo className="mr-2 h-4 w-4" />
											View Timesheet
										</DropdownMenuItem>
										<DropdownMenuItem onClick={openEmployeeAttendance}>
											<Calendar className="mr-2 h-4 w-4" />
											View Attendance
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							{/* Info */}
							<div className="flex-1 pt-0 sm:pt-12">
								<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
									<div>
										<h1 className="text-xl font-bold text-gray-900">
											{getFullName()}
										</h1>
										<p className="text-sm text-gray-600 mt-1">
											{employee.level?.name ? `${employee.level.name} ` : ""}
											{employee.position?.title || "Position Not Assigned"}
											{employee.department?.name && (
												<span className="text-gray-400">
													{" "}
													• {employee.department.name}
												</span>
											)}
										</p>

										{/* Employee ID */}
										{employee.employeeId && (
											<div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-gray-100 rounded-md">
												<span className="text-xs text-gray-500">ID:</span>
												<span className="text-xs font-medium text-gray-700 font-mono">
													{employee.employeeId}
												</span>
											</div>
										)}
									</div>

									{/* Status Badge */}
									<div className="flex items-center">
										{employee.employmentStatus === "ACTIVE" ? (
											<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
												<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
												<span className="text-xs font-medium text-green-700">
													Active
												</span>
											</span>
										) : (
											<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
												<span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
												<span className="text-xs font-medium text-red-700">
													{employee.employmentStatus || "Inactive"}
												</span>
											</span>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Tabs Navigation - Horizontal Pills Style */}
				<div className="flex gap-1 mb-6 overflow-x-auto pb-2 scrollbar-hide">
					{tabs.map((tab) => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								onClick={() => handleTabChange(tab.id)}
								className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
									isActive
										? "bg-orange-500 text-white shadow-sm"
										: "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600"
								}`}>
								<Icon className="w-4 h-4" />
								{tab.label}
								{tab.id === "documents" && documentsBadgeCount > 0 && (
									<Badge
										className={
											isActive
												? "border-white/20 bg-white/20 text-white"
												: "border-orange-200 bg-orange-50 text-orange-700"
										}>
										{documentsBadgeCount}
									</Badge>
								)}
							</button>
						);
					})}
				</div>

				{/* Tab Content */}
				<div className="bg-white rounded-xl border border-gray-200 p-6">
					{activeTab === "personal" && <PersonalInfoTab employee={employee} />}
					{activeTab === "employment" && <EmploymentDetailsTab employee={employee} />}
					{activeTab === "schedule" && <ScheduleTab employee={employee} />}
					{activeTab === "compensation" && <CompensationTab employee={employee} />}
					{activeTab === "leave-balance" && <LeaveBalanceTab employee={employee} />}
					{activeTab === "documents" && (
						<DocumentsTab employee={employee} canEdit={isOwnProfile} />
					)}
					{activeTab === "boarding" && <OnboardingTab employee={employee} />}
				</div>
			</div>
		</div>
	);
}
