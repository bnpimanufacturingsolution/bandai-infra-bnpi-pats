import { useParams, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useDebugDeleteTodayAttendance, useEmployee } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import AttendanceTemplate from "~/components/templates/common/attendance-template";
import TimesheetsTab from "~/routes/employee/dashboard/TimesheetsTab";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/atoms/Button";

function EmployeeAttendancePageSkeleton({ showBackButton }: { showBackButton: boolean }) {
	return (
		<div className="container mx-auto py-6 px-4 lg:px-6 max-w-7xl">
			{showBackButton && (
				<div className="mb-4">
					<Skeleton className="h-5 w-16" />
				</div>
			)}
			<div className="space-y-6">
				<div className="inline-flex w-full max-w-sm gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1">
					<Skeleton className="h-10 flex-1 rounded-md bg-white" />
					<Skeleton className="h-10 flex-1 rounded-md bg-white" />
				</div>
				<div className="bg-gray-50/30 rounded-xl">
					<div className="grid lg:grid-cols-3 gap-8 p-1">
						<div className="lg:col-span-2 space-y-6">
							<div className="flex items-center justify-between gap-4">
								<Skeleton className="h-6 w-44" />
								<div className="flex items-center gap-2">
									<Skeleton className="h-9 w-40 rounded-md" />
									<Skeleton className="h-9 w-36 rounded-md" />
								</div>
							</div>
							<div className="space-y-4">
								{Array.from({ length: 4 }).map((_, index) => (
									<div
										key={`route-attendance-skeleton-${index}`}
										className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
										<div className="flex items-center justify-between gap-4">
											<div className="flex items-center gap-4">
												<div className="bg-gray-50 rounded-lg p-3 min-w-[60px] space-y-2">
													<Skeleton className="h-3 w-8 mx-auto" />
													<Skeleton className="h-6 w-7 mx-auto" />
												</div>
												<div className="space-y-2">
													<Skeleton className="h-5 w-32" />
													<div className="flex gap-2">
														<Skeleton className="h-4 w-24" />
														<Skeleton className="h-4 w-24" />
													</div>
												</div>
											</div>
											<div className="space-y-2">
												<Skeleton className="h-3 w-12 ml-auto" />
												<Skeleton className="h-6 w-16 ml-auto" />
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
						<div className="space-y-6">
							<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<Skeleton className="h-5 w-24" />
									<Skeleton className="h-6 w-20 rounded-full" />
								</div>
								<Skeleton className="h-3 w-28" />
								{Array.from({ length: 4 }).map((_, index) => (
									<div
										key={`route-summary-skeleton-${index}`}
										className="flex items-center justify-between">
										<Skeleton className="h-4 w-20" />
										<Skeleton className="h-5 w-8" />
									</div>
								))}
							</div>
							<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
								<Skeleton className="h-5 w-28" />
								<div className="grid grid-cols-2 gap-3">
									<div className="bg-gray-50 rounded-lg p-3 space-y-2">
										<Skeleton className="h-3 w-14" />
										<Skeleton className="h-5 w-20" />
									</div>
									<div className="bg-gray-50 rounded-lg p-3 space-y-2">
										<Skeleton className="h-3 w-16" />
										<Skeleton className="h-5 w-20" />
									</div>
								</div>
								<Skeleton className="h-10 w-full rounded-md" />
								<Skeleton className="h-10 w-full rounded-md" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function EmployeeAttendanceDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const { data: employee, isLoading, error } = useEmployee(id || "");
	const debugDeleteTodayAttendance = useDebugDeleteTodayAttendance();
	const isOwnAttendance = user?.metadata?.employee?.id === id;

	// Get active tab from URL, default to "attendance"
	const activeTab = searchParams.get("tab") || "attendance";
	const isDebugMode = searchParams.get("debug") === "true";
	const isManagerView = searchParams.get("viewer") === "manager";
	const shouldHideEmployeeActions = !isOwnAttendance || isManagerView;

	// Helper to change tabs
	const setActiveTab = (tab: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("tab", tab);
			return next;
		});
	};

	// Only show back button if viewing someone else's attendance
	const shouldShowBackButton = !isOwnAttendance;

	const handleBack = () => {
		navigate(-1);
	};

	const getFullName = () => {
		if (!employee) return "";
		const { firstName, middleName, lastName } = employee.person?.personalInfo || {};
		const parts = [firstName, middleName, lastName].filter(Boolean);
		return parts.join(" ");
	};

	const handleDebugResetToday = () => {
		if (!id || debugDeleteTodayAttendance.isPending) return;
		const employeeName = getFullName() || employee?.employeeId || "this employee";
		const confirmed = window.confirm(
			`Delete today's attendance and attendance obligation rows for ${employeeName}? This is for debug replay only.`,
		);
		if (!confirmed) return;
		debugDeleteTodayAttendance.mutate(id);
	};

	const tabs = [
		{ id: "attendance", label: "Attendance" },
		{ id: "timesheets", label: "Timesheets" },
	];

	if (isLoading) {
		return <EmployeeAttendancePageSkeleton showBackButton={shouldShowBackButton} />;
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
		<div className="container mx-auto max-w-7xl">
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
				{/* Tabs */}
				<div className="inline-flex w-full max-w-sm gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
								activeTab === tab.id
									? "bg-white text-[color:var(--gt-700)] shadow-sm"
									: "text-gray-600 hover:text-gray-900"
							}`}>
							{tab.label}
						</button>
					))}
				</div>

				{isDebugMode && activeTab === "attendance" && (
					<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-sm font-semibold text-red-900">
									Debug attendance reset
								</p>
								<p className="text-xs text-red-700">
									Deletes today&apos;s attendance ledger and live obligation rows only.
								</p>
								{debugDeleteTodayAttendance.data && (
									<p className="mt-1 text-xs text-red-800">
										Last reset {debugDeleteTodayAttendance.data.businessDate}:{" "}
										{debugDeleteTodayAttendance.data.attendanceDeleted} attendance,{" "}
										{
											debugDeleteTodayAttendance.data
												.attendanceObligationsDeleted
										}{" "}
										obligation.
									</p>
								)}
							</div>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={handleDebugResetToday}
								disabled={debugDeleteTodayAttendance.isPending}>
								<Trash2 className="size-4" />
								{debugDeleteTodayAttendance.isPending
									? "Resetting"
									: "Reset Today"}
							</Button>
						</div>
					</div>
				)}

				{/* Tab Content */}
				<>
					{activeTab === "attendance" && (
						<AttendanceTemplate
							employeeIdOverride={id}
							hideTodaySection={shouldHideEmployeeActions}
							hideTimesheetActions={shouldHideEmployeeActions}
						/>
					)}
					{activeTab === "timesheets" && (
						<TimesheetsTab
							employeeIdOverride={id}
							showActions={!shouldHideEmployeeActions}
						/>
					)}
				</>
			</div>
		</div>
	);
}
