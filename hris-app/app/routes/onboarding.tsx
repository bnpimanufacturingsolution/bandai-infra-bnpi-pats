import { useContext, useEffect, useState } from "react";
import OnboardingPage from "~/components/templates/onboarding-template";
import AuthContext from "~/contexts/auth-context";
import { useEmployee, useUpdateEmployee, employeesQueryKeys } from "~/lib/hooks/useEmployees";
import { useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { Skeleton } from "~/components/ui/skeleton";
import { isEmployeeOnboardingStatus } from "~/lib/employee-action-block";

function OnboardingFlowSkeleton() {
	return (
		<div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col">
			<div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
				<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-200/20 blur-[100px]" />
				<div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-red-200/20 blur-[100px]" />
			</div>

			<div className="fixed top-0 left-0 right-0 h-1.5 bg-gray-100 z-50">
				<Skeleton className="h-full w-1/3 rounded-none bg-orange-200/60" />
			</div>

			<div className="flex flex-1 relative z-10 pt-4">
				<div className="flex-1 flex items-center justify-center p-4">
					<div className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm shadow-sm p-8 md:p-10 space-y-8">
						<div className="space-y-3">
							<Skeleton className="h-10 w-2/3" />
							<Skeleton className="h-5 w-1/2" />
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<Skeleton className="h-28 rounded-xl" />
							<Skeleton className="h-28 rounded-xl" />
							<Skeleton className="h-28 rounded-xl" />
						</div>

						<div className="space-y-4">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-12 w-full rounded-lg" />
							<Skeleton className="h-12 w-full rounded-lg" />
						</div>

						<div className="flex justify-end gap-3 pt-2">
							<Skeleton className="h-10 w-24 rounded-lg" />
							<Skeleton className="h-10 w-32 rounded-lg" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function OnboardingRoute() {
	const navigate = useNavigate();
	const authContext = useContext(AuthContext);
	const user = authContext?.user;
	const getCurrentUser = authContext?.getCurrentUser; // Get the refresh function
	const queryClient = useQueryClient();
	const updateEmployee = useUpdateEmployee();

	const employeeId = user?.metadata?.employee?.id;
	const requirePasswordChange = user?.metadata?.requirePasswordChange === true;
	const isFirstLogin = user?.metadata?.isFirstLogin !== false;
	const authEmploymentStatus = user?.metadata?.employee?.employmentStatus;

	const [isCompleting, setIsCompleting] = useState(false);

	const { data: employee, isLoading: isLoadingEmployee } = useEmployee(
		employeeId || "",
		"metadata",
	);

	useEffect(() => {
		// Only redirect if we're not currently completing the onboarding process
		// Check the employee employment status as the source of truth for onboarding.
		const resolvedEmploymentStatus = employee?.employmentStatus || authEmploymentStatus;
		const isOnboardingEmployee = isEmployeeOnboardingStatus(resolvedEmploymentStatus);

		if (!isCompleting && (!isOnboardingEmployee || !isFirstLogin) && !isLoadingEmployee) {
			// User is not in onboarding employment status anymore, redirect to dashboard
			navigate("/");
		}
	}, [
		authEmploymentStatus,
		employee,
		isFirstLogin,
		isLoadingEmployee,
		navigate,
		isCompleting,
	]);

	const handleOnboardingComplete = () => {
		if (!employeeId) return;
		setIsCompleting(true);

		// Employee metadata tracks onboarding progress. Password enforcement lives on user metadata.
		const currentMetadata = employee?.metadata || {};

		updateEmployee.mutate(
			{
				id: employeeId,
				payload: {
					metadata: {
						...currentMetadata,
						isFirstLogin: false,
					},
				},
			},
			{
				onSuccess: async () => {
					// Invalidate employee query to get fresh data
					await queryClient.invalidateQueries({
						queryKey: [...employeesQueryKeys.employees.details(), employeeId],
					});

					toast.success("Welcome aboard! You're all set.");

					// Slight delay to ensure toast is seen and state is settled
					setTimeout(() => {
						if (requirePasswordChange) {
							// Force a hard navigation or replace to ensure we land on settings
							navigate("/settings?action=changePassword", { replace: true });
						} else {
							// Refresh user context only when we are leaving onboarding normally.
							if (getCurrentUser) {
								void getCurrentUser();
							}
							navigate("/", { replace: true });
						}
					}, 500);
				},
				onError: (error: any) => {
					setIsCompleting(false);
					toast.error(error?.message || "Failed to update onboarding status");
				},
			},
		);
	};

	const { data: boardingProcess, isLoading: isLoadingBoardingProcess } =
		useBoardingProcessByEmployee(employeeId || "", "ONBOARDING", true);

	if (isLoadingEmployee || (employeeId && isLoadingBoardingProcess)) {
		return <OnboardingFlowSkeleton />;
	}

	if (!employee) {
		return null;
	}

	return (
		<OnboardingPage
			onComplete={handleOnboardingComplete}
			checklistItems={boardingProcess?.checklistItems || []}
			isCompletingOnboarding={isCompleting}
		/>
	);
}
