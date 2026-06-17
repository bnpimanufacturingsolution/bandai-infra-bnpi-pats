import { User, Briefcase, Building2, Calendar, UserCheck, Hash } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Skeleton } from "~/components/ui/skeleton";
import { Badge } from "~/components/atoms/Badge";

interface DashboardHeaderProps {
	employee: any;
	user: any;
	isLoading: boolean;
	managerName?: string;
	fallbackName?: string;
}

export function DashboardHeader({
	employee,
	user,
	isLoading,
	managerName = "N/A",
	fallbackName = "Employee",
}: DashboardHeaderProps) {
	const getDisplayName = () => {
		if (employee?.person?.personalInfo?.firstName && employee?.person?.personalInfo?.lastName) {
			return `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`;
		}
		if (
			user?.metadata?.employee?.personalInfo?.firstName &&
			user?.metadata?.employee?.personalInfo?.lastName
		) {
			return `${user.metadata.employee.personalInfo.firstName} ${user.metadata.employee.personalInfo.lastName}`;
		}
		if (user?.person?.personalInfo?.firstName && user?.person?.personalInfo?.lastName) {
			return `${user.person.personalInfo.firstName} ${user.person.personalInfo.lastName}`;
		}
		return fallbackName;
	};

	const formatDate = (dateString: string | null | undefined) => {
		if (!dateString) return "N/A";
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const getEmploymentStatusBadgeVariant = (status: string | null | undefined) => {
		switch (status?.toUpperCase()) {
			case "ONBOARDING":
				return "warning-soft";
			case "ACTIVE":
				return "success-soft";
			case "TERMINATED":
				return "destructive-soft";
			case "ON_LEAVE":
				return "info";
			default:
				return "secondary";
		}
	};

	const getEmploymentStatusLabel = (status: string | null | undefined) => {
		if (!status) return "N/A";
		return status
			.split("_")
			.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
			.join(" ");
	};

	const getEmploymentTypeBadgeVariant = (type: string | null | undefined) => {
		switch (type?.toUpperCase()) {
			case "PROBATIONARY":
				return "warning-soft";
			case "REGULAR":
				return "success-soft";
			case "CONTRACTUAL":
				return "info";
			default:
				return "secondary";
		}
	};

	const getEmploymentTypeLabel = (type: string | null | undefined) => {
		if (!type) return "N/A";
		return type
			.split("_")
			.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
			.join(" ");
	};

	const getInitials = () => {
		const firstName = employee?.person?.personalInfo?.firstName || "";
		const lastName = employee?.person?.personalInfo?.lastName || "";
		return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
	};

	return (
		<div
			id="dashboard-profile-banner"
			className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
				{isLoading ? (
					// Loading Skeleton
					<div className="flex flex-col sm:flex-row gap-4 sm:gap-6 -mt-10 relative">
						<Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex-shrink-0 border-4 border-white" />
						<div className="flex-1 pt-0 sm:pt-12 space-y-3">
							<Skeleton className="h-7 w-56" />
							<Skeleton className="h-5 w-64" />
							<div className="flex flex-wrap gap-2 mt-2">
								<Skeleton className="h-5 w-24 rounded-full" />
								<Skeleton className="h-5 w-32 rounded-full" />
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col sm:flex-row gap-4 sm:gap-6 -mt-10 relative">
						{/* Avatar */}
						<div className="flex-shrink-0">
							<div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl sm:text-2xl font-bold border-4 border-white shadow-md">
								{getInitials() || <User className="w-10 h-10 sm:w-12 sm:h-12" />}
							</div>
						</div>

						{/* Info */}
						<div className="flex-1 pt-0 sm:pt-12">
							<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
								<div className="flex-1">
									<h1 className="text-xl sm:text-2xl font-bold text-gray-900">
										{getDisplayName()}
									</h1>
									<p className="text-sm text-gray-600 mt-1">
										{employee?.position?.title || "Position Not Assigned"}
										{employee?.department?.name && (
											<span className="text-gray-400">
												{" "}
												• {employee.department.name} Dept.
											</span>
										)}
									</p>

									{/* Employee ID */}
									{employee?.employeeId && (
										<div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-gray-100 rounded-md border border-gray-200">
											<span className="text-xs text-gray-500">ID:</span>
											<span className="text-xs font-medium text-gray-700 font-mono">
												{employee.employeeId}
											</span>
										</div>
									)}

									{/* Additional Info */}
									{employee?.employmentHireDate && (
										<div className="flex items-center gap-1.5 mt-3 text-sm text-gray-600">
											<Calendar className="w-4 h-4 text-gray-400" />
											<span>{formatDate(employee.employmentHireDate)}</span>
										</div>
									)}
								</div>

								{/* Status Badges and Action Button */}
								<div className="flex flex-col items-start sm:items-end gap-3">
									{/* Status Badges */}
									<div className="flex flex-wrap items-center gap-2">
										{employee?.employmentStatus && (
											<Badge
												variant={getEmploymentStatusBadgeVariant(
													employee.employmentStatus,
												)}>
												{getEmploymentStatusLabel(
													employee.employmentStatus,
												)}
											</Badge>
										)}
										{employee?.employmentType && (
											<Badge
												variant={getEmploymentTypeBadgeVariant(
													employee.employmentType,
												)}>
												{getEmploymentTypeLabel(employee.employmentType)}
											</Badge>
										)}
									</div>

									{/* Manager Info */}
									{managerName && managerName !== "N/A" && (
										<div className="flex items-center gap-1.5 text-sm text-gray-600">
											<UserCheck className="w-4 h-4 text-gray-400" />
											<span className="text-gray-500">Manager:</span>
											<span className="text-gray-900 font-medium">
												{managerName}
											</span>
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
