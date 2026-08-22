import { useParams, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import EmployeePayrollsPage from "~/components/templates/common/payroll-template";
import { Skeleton } from "~/components/ui/skeleton";

function EmployeePayrollPageSkeleton({
	showBackButton,
	showEmployeeHeader,
}: {
	showBackButton: boolean;
	showEmployeeHeader: boolean;
}) {
	return (
		<div className="container mx-auto py-6 px-4 lg:px-6 max-w-7xl">
			{showBackButton && (
				<div className="mb-4">
					<Skeleton className="h-5 w-16" />
				</div>
			)}
			<div className="space-y-6">
				{showEmployeeHeader && (
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<Skeleton className="h-8 w-72" />
							<Skeleton className="h-4 w-56" />
						</div>
					</div>
				)}
				<div className="bg-gray-50/30 rounded-xl">
					<div className="grid lg:grid-cols-3 gap-8 p-1">
						<div className="lg:col-span-2 space-y-6">
							<div className="flex items-center justify-between gap-4">
								<Skeleton className="h-6 w-40" />
								<div className="flex items-center gap-2">
									<Skeleton className="h-9 w-40 rounded-md" />
									<Skeleton className="h-9 w-24 rounded-md" />
								</div>
							</div>
							<div className="space-y-4">
								{Array.from({ length: 4 }).map((_, index) => (
									<div
										key={`route-payroll-skeleton-${index}`}
										className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
										<div className="flex items-center justify-between gap-4">
											<div className="flex items-center gap-4">
												<div className="bg-gray-50 rounded-lg p-3 min-w-[60px] space-y-2">
													<Skeleton className="h-3 w-8 mx-auto" />
													<Skeleton className="h-6 w-7 mx-auto" />
												</div>
												<div className="space-y-2">
													<Skeleton className="h-5 w-36" />
													<div className="flex gap-2">
														<Skeleton className="h-4 w-24" />
														<Skeleton className="h-4 w-24" />
													</div>
												</div>
											</div>
											<div className="flex items-center gap-8">
												<div className="space-y-2">
													<Skeleton className="h-3 w-10 ml-auto" />
													<Skeleton className="h-5 w-20 ml-auto" />
												</div>
												<div className="space-y-2">
													<Skeleton className="h-3 w-14 ml-auto" />
													<Skeleton className="h-6 w-24 ml-auto" />
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
						<div className="space-y-6">
							<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<Skeleton className="h-5 w-28" />
									<Skeleton className="h-6 w-16 rounded-full" />
								</div>
								<Skeleton className="h-3 w-36" />
								<Skeleton className="h-40 w-40 rounded-full mx-auto" />
								{Array.from({ length: 3 }).map((_, index) => (
									<div
										key={`route-payroll-summary-skeleton-${index}`}
										className="flex items-center justify-between">
										<Skeleton className="h-4 w-20" />
										<Skeleton className="h-5 w-24" />
									</div>
								))}
								<Skeleton className="h-9 w-full rounded-md" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function EmployeePayrollDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { data: employee, isLoading, error } = useEmployee(id || "");

	// Check if viewing own payroll
	const isOwnPayroll = user?.metadata?.employee?.id === id;
	// Only show back button if viewing someone else's payroll
	const shouldShowBackButton = !isOwnPayroll;

	const handleBack = () => {
		navigate(-1);
	};

	const getFullName = () => {
		if (!employee) return "";
		const { firstName, middleName, lastName } = employee.person?.personalInfo || {};
		const parts = [firstName, middleName, lastName].filter(Boolean);
		return parts.join(" ");
	};

	if (isLoading) {
		return (
			<EmployeePayrollPageSkeleton
				showBackButton={shouldShowBackButton}
				showEmployeeHeader={shouldShowBackButton}
			/>
		);
	}

	if (error || !employee) {
		return (
			<div className="container mx-auto py-6 px-4 lg:px-6 max-w-7xl">
				{shouldShowBackButton && (
					<div className="mb-4">
						<button
							onClick={handleBack}
							className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary transition-colors">
							<ArrowLeft className="w-4 h-4" />
							Back
						</button>
					</div>
				)}
				<div className="flex items-center justify-center py-16">
					<div className="text-center">
						<p className="text-red-600 font-semibold mb-2">Employee Not Found</p>
						<p className="text-gray-600 text-sm">
							The employee you&apos;re looking for doesn&apos;t exist or has been
							removed.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-6 px-4 lg:px-6 max-w-7xl">
			{/* Back Button */}
			{shouldShowBackButton && (
				<div className="mb-4">
					<button
						onClick={handleBack}
						className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary transition-colors">
						<ArrowLeft className="w-4 h-4" />
						Back
					</button>
				</div>
			)}

			{/* Page Content */}
			<div className="space-y-6">
				{!isOwnPayroll && (
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold">{getFullName()}&apos;s Payroll</h1>
							<p className="text-gray-600">
								View and manage payroll records for {employee.employeeId}
							</p>
						</div>
					</div>
				)}

				{/* Payroll Component */}
				<EmployeePayrollsPage employeeIdOverride={id} />
			</div>
		</div>
	);
}
