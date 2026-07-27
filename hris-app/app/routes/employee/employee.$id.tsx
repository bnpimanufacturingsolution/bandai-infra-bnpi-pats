import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent } from "~/components/atoms/Card";
import { CompensationTab } from "~/components/organisms/employee-detail/compensation-tab";
import { DocumentsTab } from "~/components/organisms/employee-detail/documents-tab";
import { EmploymentDetailsTab } from "~/components/organisms/employee-detail/employment-details-tab";
import { LeaveBalanceTab } from "~/components/organisms/employee-detail/leave-balance-tab";
import { OnboardingTab } from "~/components/organisms/employee-detail/onboarding-tab";
import { PersonalInfoTab } from "~/components/organisms/employee-detail/personal-info-tab";
import { ScheduleTab } from "~/components/organisms/employee-detail/schedule-tab";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useDocumentActionMetrics } from "~/lib/hooks/useMetrics";
import { cn } from "~/lib/utils";
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	Clock,
	FileText,
	User,
} from "lucide-react";

const tabs = [
	{ id: "personal", label: "Personal", icon: User },
	{ id: "employment", label: "Employment", icon: Briefcase },
	{ id: "schedule", label: "Work Schedule", icon: Clock },
	{ id: "compensation", label: "Compensation", icon: Briefcase },
	{ id: "leave-balance", label: "Leave Balance", icon: Calendar },
	{ id: "documents", label: "Documents", icon: FileText },
] as const;

const knownTabIds = new Set<string>([...tabs.map((tab) => tab.id), "boarding"]);

const pageFrameClassName = "h-[calc(100dvh-7rem)]";

export default function EmployeeDetailPage() {
	const { id } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user } = useAuth();
	const requestedTab = searchParams.get("tab") || "personal";
	const activeTab = knownTabIds.has(requestedTab) ? requestedTab : "personal";
	const fromParam = searchParams.get("from");
	const { data: employee, isLoading, error } = useEmployee(id || "");
	const isAdminConfigurationProfile = location.pathname.startsWith(
		"/admin/configuration/employees/",
	);

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
	const shouldShowBackButton =
		Boolean(fromParam) || !isOwnProfile || isAdminConfigurationProfile;

	const handleTabChange = (tabId: string) => {
		setSearchParams((previousParams) => {
			const nextParams = new URLSearchParams(previousParams);
			nextParams.set("tab", tabId);
			return nextParams;
		});
	};

	const handleBack = () => {
		if (fromParam) {
			navigate(`/${fromParam.replace(/-/g, "/")}`);
			return;
		}
		if (isAdminConfigurationProfile) {
			navigate("/admin/configuration/employees");
			return;
		}
		navigate(-1);
	};

	const openProfileSettings = () => navigate("/settings");
	const openChangePassword = () => navigate("/settings?action=changePassword");
	const openResignationFlow = () => navigate("/employee/requests/resignation-request");

	if (isLoading) {
		return (
			<div className={cn("flex flex-col gap-4 overflow-hidden", pageFrameClassName)}>
				<div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
				<div className="flex min-h-0 flex-1 flex-col gap-0">
					<div className="h-12 animate-pulse border-b border-border bg-muted/30" />
					<div className="min-h-0 flex-1 animate-pulse rounded-b-2xl border border-border border-t-0 bg-muted/20" />
				</div>
			</div>
		);
	}

	if (error || !employee) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Card className="w-full max-w-md border-border/80">
					<CardContent className="space-y-4 pt-6 text-center">
						<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
							<User className="h-7 w-7" />
						</div>
						<div className="space-y-1">
							<h1 className="text-lg font-semibold text-foreground">
								Employee Not Found
							</h1>
							<p className="text-sm text-muted-foreground">
								The employee you&apos;re looking for doesn&apos;t exist or is no
								longer available.
							</p>
						</div>
						<Button onClick={() => navigate(-1)}>Go Back</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const profileAvatarUrl = String(
		employee.user?.avatar || (isOwnProfile ? user?.avatar : "") || "",
	).trim();

	return (
		<div
			className={cn("flex flex-col gap-4 overflow-hidden lg:gap-6", pageFrameClassName)}
			data-testid="employee-detail-shell">
			{shouldShowBackButton ? (
				<Button
					type="button"
					variant="ghost"
					onClick={handleBack}
					className="w-fit px-0 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-primary">
					<ArrowLeft className="h-4 w-4" />
					Back
				</Button>
			) : null}

			<section className="employee-detail-tabs flex min-h-0 flex-1 flex-col overflow-hidden">
				<div
					className="employee-detail-tab-rail sticky top-0 z-10 shrink-0 bg-background/95 backdrop-blur"
					data-testid="employee-detail-tab-bar"
					role="tablist"
					aria-label="Employee profile sections">
					{tabs.map((tab) => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.id;

						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => handleTabChange(tab.id)}
								className="employee-detail-tab">
								<Icon className="h-4 w-4 shrink-0" />
								{tab.label}
								{tab.id === "documents" && documentsBadgeCount > 0 ? (
									<Badge
										className={cn(
											"rounded-full px-2 py-0.5 text-[10px]",
											isActive
												? "bg-primary text-primary-foreground"
												: "border-primary/15 bg-primary/10 text-primary",
										)}>
										{documentsBadgeCount}
									</Badge>
								) : null}
							</button>
						);
					})}
				</div>

				<div
					className={cn(
						"employee-detail-tab-panel--roundout modern-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6",
						activeTab === tabs[0].id && "employee-detail-tab-panel--first-active",
						activeTab === tabs[tabs.length - 1].id &&
							"employee-detail-tab-panel--last-active",
					)}
					data-testid="employee-detail-tab-panel"
					role="tabpanel">
						{activeTab === "personal" ? (
							<PersonalInfoTab
								employee={employee}
								isOwnProfile={isOwnProfile}
								avatarUrl={profileAvatarUrl}
								onUpdateProfile={openProfileSettings}
								onChangePassword={openChangePassword}
								onResignationFlow={openResignationFlow}
							/>
						) : null}
						{activeTab === "employment" ? (
							<EmploymentDetailsTab employee={employee} />
						) : null}
						{activeTab === "schedule" ? <ScheduleTab employee={employee} /> : null}
						{activeTab === "compensation" ? (
							<CompensationTab employee={employee} />
						) : null}
						{activeTab === "leave-balance" ? (
							<LeaveBalanceTab employee={employee} />
						) : null}
						{activeTab === "documents" ? (
							<DocumentsTab employee={employee} canEdit={isOwnProfile} />
						) : null}
						{activeTab === "boarding" ? <OnboardingTab employee={employee} /> : null}
				</div>
			</section>
		</div>
	);
}