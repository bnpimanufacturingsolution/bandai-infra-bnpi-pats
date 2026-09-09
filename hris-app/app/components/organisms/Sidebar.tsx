import { NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	LayoutDashboard,
	Users,
	Wallet,
	Clock,
	Clock3,
	Calendar,
	CalendarRange,
	CheckSquare,
	User,
	Settings,
	X,
	Home,
	Briefcase,
	ChevronDown,
	ChevronRight,
	FileText,
	FileEdit,
	UserCog,
	Award,
	Gift,
	Play,
	TrendingDown,
	TrendingUp,
	BarChart3,
	History,
	ListCheck,
	Gavel,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useActionMetrics } from "~/lib/hooks/useMetrics";
import { BANDAI_SIDEBAR_LOGO_URL } from "~/constants/branding";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

interface NavItem {
	id: string;
	label: string;
	path: string;
	icon: React.ReactNode;
	requiredRoles?: string[];
	submenu?: NavItem[];
	badge?: number;
}

interface SidebarProps {
	onClose?: () => void;
}

/**
 * Role-Aware Sidebar Component
 *
 * Shows different navigation items based on user role:
 * - Employee: Basic features (profile, payroll, attendance, requests)
 * - Manager: Team, approvals, plus basic features
 * - HR Manager/User: Employee management, payroll management, plus basic features
 * - Admin: System administration (separate layout)
 */
export function Sidebar({ onClose }: SidebarProps) {
	const { user } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();
	const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
	const navScrollRef = useRef<HTMLElement | null>(null);
	const pendingScrollTopRef = useRef<number | null>(null);
	const employeeId = user?.metadata?.employee?.id;
	const { data: actionMetrics } = useActionMetrics({
		enabled: !!employeeId,
	});
	// Parse relative sidebar links consistently without triggering any network call.
	const SIDEBAR_URL_PARSE_BASE = "https://navigation.local";

	useLayoutEffect(() => {
		if (pendingScrollTopRef.current === null || !navScrollRef.current) {
			return;
		}

		const nextScrollTop = pendingScrollTopRef.current;
		navScrollRef.current.scrollTop = nextScrollTop;

		const frameId = window.requestAnimationFrame(() => {
			if (navScrollRef.current) {
				navScrollRef.current.scrollTop = nextScrollTop;
			}
			pendingScrollTopRef.current = null;
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [expandedMenus]);

	if (!user) {
		return null;
	}

	const isHRManager = user?.role === "hris-hr-manager";
	const isHRUser = user?.role === "hris-hr-user";
	const isHR = isHRManager || isHRUser;
	// Line leaders are manager-class (approvals + team surfaces) per the
	// 2026-09-07 line-leader requirement; narrower data scope is enforced API-side.
	const isManager =
		user?.role === "hris-employee-manager" || user?.role === "hris-line-leader";
	const isEmployee = user?.role === "hris-employee";
	const isAdmin = user?.role?.includes("admin");

	const firstName = user?.metadata?.employee?.personalInfo?.firstName || "";
	const lastName = user?.metadata?.employee?.personalInfo?.lastName || "";
	const fullName = firstName && lastName ? `${firstName} ${lastName}` : "User";
	const level = user?.metadata?.employee?.level?.name || "";
	const position = user?.metadata?.employee?.position?.title || "";
	const positionDisplay = level ? `${level} ${position}` : position;
	const department = user?.metadata?.employee?.department?.name || "";
	const avatarUrl = String(user?.avatar || "").trim();
	const isDepartmentManager = !!user?.metadata?.employee?.isDepartmentManager;
	const hrDocumentReviewCount = actionMetrics?.counts.documents.hrPendingApproval || 0;

	// Common to all roles
	const dashboardItem: NavItem = {
		id: "dashboard",
		label: "Dashboard",
		path: "/dashboard",
		icon: <LayoutDashboard className="w-5 h-5" />,
		badge: actionMetrics?.total || 0,
	};

	const profileItem: NavItem = employeeId
		? {
				id: "profile",
				label: "My Profile",
				path: `/employee/${employeeId}`,
				icon: <User className="w-5 h-5" />,
				badge: actionMetrics?.counts.documents.total || 0,
			}
		: { id: "profile", label: "My Profile", path: "#", icon: <User className="w-5 h-5" /> };

	// Working Space items (role-specific, deterministic order)
	const baseWorkingSpaceItems: NavItem[] = [dashboardItem];
	const approvalsPath = isHR ? "/hr/approvals/requests" : "/employee/approvals/requests";
	const approvalsItem: NavItem | null =
		isHR || isManager
			? {
					id: "request-approvals",
					label: "Approvals",
					path: approvalsPath,
					icon: <Users className="w-5 h-5" />,
					badge: actionMetrics?.counts.approvals.total || 0,
				}
			: null;

	const reportsItem: NavItem | null = isHR
		? {
				id: "hr-reports",
				label: "Reports",
				path: "/hr/reports",
				icon: <BarChart3 className="w-5 h-5" />,
				submenu: [
					{
						id: "hr-reports-attendance",
						label: "Attendance Reports",
						path: "/hr/reports/attendance",
						icon: <Clock className="w-4 h-4" />,
					},
					{
						id: "hr-reports-workforce",
						label: "Workforce Analytics",
						path: "/hr/reports/workforce",
						icon: <TrendingUp className="w-4 h-4" />,
					},
					{
						id: "hr-reports-payroll",
						label: "Payroll Reports",
						path: "/hr/reports/payroll",
						icon: <Wallet className="w-4 h-4" />,
					},
					{
						id: "hr-reports-turnover-attrition",
						label: "Turnover & Attrition",
						path: "/hr/reports/turnover-attrition",
						icon: <TrendingDown className="w-4 h-4" />,
					},
					{
						id: "hr-reports-compliance",
						label: "Compliance Reports",
						path: "/hr/reports?document=1601-C&year=2026&month=3&from=2026-03-01&to=2026-03-31",
						icon: <FileText className="w-4 h-4" />,
					},
					{
						id: "hr-reports-billings",
						label: "Billings",
						path: "/hr/billings",
						icon: <FileText className="w-4 h-4" />,
					},
				],
			}
		: null;

	// HR items only visible to HR roles (HR Manager and HR User)
	const hrWorkingSpaceItems: NavItem[] = isHR
		? [
				{
					id: "tickets",
					label: "Tickets",
					path: "/hr/requests/tickets",
					icon: <ListCheck className="w-5 h-5" />,
					badge: actionMetrics?.counts.tickets.total || 0,
				},
				{
					id: "hr-employees",
					label: "Employees",
					path: "/hr/employees",
					icon: <Users className="w-5 h-5" />,
					badge: hrDocumentReviewCount,
					submenu: [
						{
							id: "hr-employees-directory",
							label: "Directory",
							path: "/hr/employees",
							icon: <Users className="w-4 h-4" />,
						},
						{
							id: "hr-employee-documents",
							label: "201 Compliance",
							path: "/hr/employee-documents",
							icon: <FileText className="w-4 h-4" />,
							badge: hrDocumentReviewCount,
						},
						{
							id: "hr-status-changes",
							label: "Employment Eligibility",
							path: "/hr/employee-status-changes",
							icon: <Award className="w-4 h-4" />,
						},
						{
							id: "hr-personnel-action-history",
							label: "Personnel Action History",
							path: "/hr/personnel-actions-history",
							icon: <History className="w-4 h-4" />,
						},
						{
							id: "tasks",
							label: "Tasks",
							path: "/hr/tasks",
							icon: <ListCheck className="w-4 h-4" />,
						},
						{
							id: "celebrations-birthdays",
							label: "Birthdays",
							path: "/celebrations/birthdays",
							icon: <Calendar className="w-5 h-5" />,
						},
					],
				},
				{
					id: "hr-timekeeping",
					label: "Timekeeping",
					path: "/hr/attendance",
					icon: <Clock className="w-5 h-5" />,
					submenu: [
						{
							id: "hr-timekeeping-attendance",
							label: "Attendance",
							path: "/hr/attendance",
							icon: <Calendar className="w-4 h-4" />,
						},
						{
							id: "hr-timekeeping-timesheets",
							label: "Timesheets",
							path: "/hr/timesheets",
							icon: <Clock className="w-4 h-4" />,
						},
						{
							id: "hr-timekeeping-schedules",
							label: "Schedules",
							path: "/hr/employee-schedules",
							icon: <Clock className="w-4 h-4" />,
						},
						{
							id: "hr-timekeeping-corrections",
							label: "Attendance Corrections",
							path: "/hr/time-corrections",
							icon: <FileEdit className="w-4 h-4" />,
						},
						{
							id: "hr-timekeeping-day-status",
							label: "Day-status Review",
							path: "/hr/day-status-review",
							icon: <CalendarRange className="w-4 h-4" />,
						},
						{
							id: "hr-discipline-actions",
							label: "Disciplinary Action",
							path: "/hr/disciplinary-action",
							icon: <Gavel className="w-4 h-4" />,
						},
					],
				},
				{
					id: "hr-payroll",
					label: "Payroll Management",
					path: "/hr/hr-payroll",
					icon: <Wallet className="w-5 h-5" />,
					submenu: [
						{
							id: "hr-run-payroll",
							label: "Run Payroll",
							path: "/hr/run-payroll",
							icon: <Play className="w-4 h-4" />,
						},
						{
							id: "hr-payroll-management",
							label: "Payroll Records",
							path: "/hr/hr-payroll",
							icon: <Wallet className="w-4 h-4" />,
						},
						{
							id: "hr-benefits-management",
							label: "Benefits Management",
							path: "/hr/benefits-management",
							icon: <Gift className="w-4 h-4" />,
						},
					],
				},
				{
					id: "hr-recruitment",
					label: "Recruitment",
					path: "/hr/recruitment",
					icon: <Briefcase className="w-5 h-5" />,
					submenu: [
						{
							id: "hr-recruitment-dashboard",
							label: "Candidates",
							path: "/hr/recruitment",
							icon: <Users className="w-4 h-4" />,
						},
					],
				},
			]
		: [];

	const hrUserTailItems: NavItem[] = isHR
		? [
				{
					id: "hr-audit-logs",
					label: "Audit Logs",
					path: "/hr/audit-logs",
					icon: <FileText className="w-5 h-5" />,
				},
			]
		: [];

	// Required HR tail order: Reports, with Audit Logs last for HR users.
	const trailingItems: NavItem[] = isHR ? [reportsItem!, ...hrUserTailItems] : [];

	const workingSpaceItems: NavItem[] = [
		...baseWorkingSpaceItems,
		...hrWorkingSpaceItems,
		...trailingItems,
	];

	// General items (common to all, except admin)
	const generalItems: NavItem[] = [
		profileItem,
		...(isEmployee || isManager || isHR || isAdmin
			? [
					{
						id: "general-my-team",
						label: "My Team",
						path: "/employee/team",
						icon: <Users className="w-5 h-5" />,
						submenu: [
							{
								id: "general-my-team-overview",
								label: "Overview",
								path: "/employee/team?tab=overview",
								icon: <Users className="w-4 h-4" />,
							},
							{
								id: "general-my-team-organization",
								label: "Organization Chart",
								path: "/employee/team?tab=organization",
								icon: <ChevronRight className="w-4 h-4" />,
							},
							...(isManager
								? [
										{
											id: "general-my-team-timesheets",
											label: "Team Timesheets",
											path: "/employee/team?tab=timesheets",
											icon: <Clock3 className="w-4 h-4" />,
										},
										{
											id: "general-my-team-assign-overtime",
											label: "Assign Overtime",
											path: "/employee/team?tab=overtime",
											icon: <Clock className="w-4 h-4" />,
										},
									]
								: []),
							...(isDepartmentManager
								? [
										{
											id: "general-my-team-schedule-calendar",
											label: "Schedule Calendar",
											path: "/employee/team/schedule-calendar",
											icon: <Calendar className="w-4 h-4" />,
										},
									]
								: []),
						],
					},
				]
			: []),
		...(approvalsItem
			? [
					{
						...approvalsItem,
						id: "general-my-approvals",
						label: "My Approvals",
					},
				]
			: []),
		{
			id: "payroll",
			label: "My Payroll",
			path: employeeId ? `/employee/${employeeId}/payroll` : "/dashboard",
			icon: <Wallet className="w-5 h-5" />,
		},
		{
			id: "attendance",
			label: "My Attendance",
			path: employeeId ? `/employee/${employeeId}/attendance` : "/dashboard",
			icon: <Clock className="w-5 h-5" />,
			badge: actionMetrics?.counts.timesheets.total || 0,
		},
		{
			id: "requests",
			label: "My Requests",
			path: "/employee/requests",
			icon: <Calendar className="w-5 h-5" />,
			badge: actionMetrics?.counts.requests.total || 0,
		},
		{
			id: "benefits",
			label: "My Benefits",
			path: "/employee/benefits/epp",
			icon: <Calendar className="w-5 h-5" />,
			submenu: [
				{
					id: "epp",
					label: "EPP",
					path: "/employee/benefits/epp",
					icon: <Home className="w-4 h-4" />,
				},
			],
		},
	];

	// Personal items (common to all) - use only routes that exist in routes.ts
	const personalItems: NavItem[] = [
		{
			id: "settings",
			label: "Settings",
			path: "/settings",
			icon: <Settings className="w-5 h-5" />,
		},
	];

	const toggleMenu = (menuId: string) => {
		pendingScrollTopRef.current = navScrollRef.current?.scrollTop ?? null;
		setExpandedMenus((prev) => ({
			...prev,
			[menuId]: !prev[menuId],
		}));
	};

	const isActive = (path: string) => {
		const currentPathname = location.pathname;
		const currentSearch = new URLSearchParams(location.search);
		const targetUrl = new URL(path, SIDEBAR_URL_PARSE_BASE);
		const targetPathname = targetUrl.pathname;
		const targetSearch = targetUrl.searchParams;
		const hasTargetQuery = Array.from(targetSearch.keys()).length > 0;

		// Handle profile path specifically - don't match if on a sub-route
		if (
			targetPathname.match(/^\/employee\/[^/]+$/) &&
			currentPathname.match(/^\/employee\/[^/]+$/)
		) {
			return currentPathname === targetPathname;
		}

		// If the item path is a profile path, don't match sub-routes
		if (
			targetPathname.match(/^\/employee\/[^/]+$/) &&
			currentPathname.startsWith(targetPathname + "/")
		) {
			return false;
		}

		// Query-scoped links should only activate on exact pathname + query match.
		if (hasTargetQuery) {
			if (currentPathname !== targetPathname) return false;
			for (const [key, value] of targetSearch.entries()) {
				if (currentSearch.get(key) !== value) return false;
			}
			return true;
		}

		// Exact match
		if (currentPathname === targetPathname) {
			return true;
		}

		// For section links, match nested routes.
		return currentPathname.startsWith(targetPathname + "/");
	};

	const isChildActive = (item: NavItem): boolean => {
		if (!item.submenu) return false;
		return item.submenu.some((sub) => isActive(sub.path) || isChildActive(sub));
	};

	const NavItemComponent = ({
		item,
		isSubmenu = false,
	}: {
		item: NavItem;
		isSubmenu?: boolean;
	}) => {
		const active = isActive(item.path);
		const hasSubmenu = item.submenu && item.submenu.length > 0;
		const childActive = hasSubmenu ? isChildActive(item) : false;
		const parentActive = active || childActive;
		// If the user has explicitly toggled this menu, respect that value.
		// Otherwise (undefined), auto-open it when a child route is active.
		const isExpanded =
			expandedMenus[item.id] !== undefined ? expandedMenus[item.id] : childActive;

		if (item.path === "#") {
			return (
				<div
					className={`px-3 py-2 flex items-center gap-3 ${isSubmenu ? "pl-9 text-gray-400 text-[13px]" : "text-gray-500 text-[14px] font-medium"}`}>
					<div
						className={`shrink-0 opacity-60 text-current flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px] ${isSubmenu ? "[&>svg]:!w-[16px] [&>svg]:!h-[16px]" : ""}`}>
						{item.icon}
					</div>
					<span>{item.label}</span>
				</div>
			);
		}

		// Determine effective active state per context
		const effectiveActive = isSubmenu ? active : parentActive;
		const submenuId = hasSubmenu ? `sidebar-submenu-${item.id}` : undefined;

		if (hasSubmenu) {
			return (
				<div key={item.id}>
					<button
						id={`sidebar-${item.id}`}
						type="button"
						aria-expanded={isExpanded}
						aria-controls={submenuId}
						onClick={() => toggleMenu(item.id)}
						className={`
							px-3 py-2 flex items-center gap-3 rounded-md transition-all duration-200 w-full group relative mb-0.5 text-left
							${isSubmenu ? "pl-9 text-[13px]" : "text-[14px] font-medium"}
							${
								effectiveActive
									? isSubmenu
										? "bg-orange-50/50 text-orange-600 font-semibold"
										: "bg-orange-50 text-orange-600"
									: isSubmenu
										? "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
										: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
							}
						`}>
						{effectiveActive && !isSubmenu && (
							<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-orange-600 rounded-r-md" />
						)}
						<div
							className={`shrink-0 text-current flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px] ${isSubmenu ? "[&>svg]:!w-[16px] [&>svg]:!h-[16px]" : ""}`}>
							{item.icon}
						</div>
						<span className="flex-1 truncate text-gray-500">{item.label}</span>
						{(item.badge || 0) > 0 && (
							<span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
								{item.badge}
							</span>
						)}
						<div
							className={`transition-transform duration-200 ${
								isExpanded ? "rotate-180" : ""
							} ${effectiveActive ? "text-orange-600" : "text-gray-400 group-hover:text-gray-500"}`}>
							<ChevronDown className="w-4 h-4" />
						</div>
					</button>

					<div
						id={submenuId}
						className={`overflow-hidden transition-all duration-200 ease-in-out ${
							isExpanded ? "max-h-96 opacity-100 mt-1" : "max-h-0 opacity-0"
						}`}>
						{item.submenu!.map((subitem) => (
							<NavItemComponent key={subitem.id} item={subitem} isSubmenu={true} />
						))}
					</div>
				</div>
			);
		}

		return (
			<div key={item.id}>
				<NavLink
					id={`sidebar-${item.id}`}
					to={item.path}
					preventScrollReset
					onClick={(event) => {
						onClose?.();
						const targetUrl = new URL(item.path, SIDEBAR_URL_PARSE_BASE);
						const hasTargetQuery = Array.from(targetUrl.searchParams.keys()).length > 0;
						if (
							hasTargetQuery ||
							location.pathname !== targetUrl.pathname ||
							!location.search
						) {
							return;
						}
						event.preventDefault();
						navigate({ pathname: targetUrl.pathname, search: "" });
					}}
					className={`
						px-3 py-2 flex items-center gap-3 rounded-md transition-all duration-200 w-full group relative mb-0.5
						${isSubmenu ? "pl-9 text-[13px]" : "text-[14px] font-medium"}
						${
							effectiveActive
								? isSubmenu
									? "bg-orange-50/50 text-orange-600 font-semibold"
									: "bg-orange-50 text-orange-600"
								: isSubmenu
									? "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
									: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
						}
					`}>
					{effectiveActive && !isSubmenu && (
						<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-orange-600 rounded-r-md" />
					)}
					<div
						className={`shrink-0 text-current flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px] ${isSubmenu ? "[&>svg]:!w-[16px] [&>svg]:!h-[16px]" : ""}`}>
						{item.icon}
					</div>
					<span className="flex-1 truncate text-gray-500">{item.label}</span>
					{!hasSubmenu && (item.badge || 0) > 0 && (
						<span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
							{item.badge}
						</span>
					)}
				</NavLink>
			</div>
		);
	};

	return (
		<div className="sidebar flex flex-col h-full overflow-hidden bg-white">
			{/* Header with Logo and Close Button */}
			<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
				<img
					src={BANDAI_SIDEBAR_LOGO_URL}
					alt="Logo"
					className="h-8 w-auto object-contain object-left"
				/>
				<button
					onClick={() => onClose?.()}
					className="lg:hidden p-1.5 hover:bg-gray-50 rounded-md transition-colors text-gray-500 hover:text-gray-700">
					<X className="w-5 h-5" />
				</button>
			</div>

			{/* User Profile Section */}
			<div className="px-5 py-5 border-b border-gray-100">
				{employeeId ? (
					<NavLink
						to={`/employee/${employeeId}`}
						preventScrollReset
						onClick={() => onClose?.()}
						className="flex items-center gap-3.5 rounded-lg cursor-pointer hover:bg-orange-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 p-1.5 -m-1.5">
						<Avatar className="h-10 w-10 border border-orange-200/50 shadow-sm">
							{avatarUrl ? (
								<AvatarImage
									src={avatarUrl}
									alt={fullName}
									className="object-cover"
								/>
							) : null}
							<AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold text-[13px]">
								{firstName.charAt(0)}
								{lastName.charAt(0)}
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col flex-1 min-w-0 justify-center gap-1.5">
							<span className="text-[13px] font-bold text-gray-900 truncate leading-none">
								{fullName}
							</span>
							<span className="text-[11px] font-medium text-orange-600 truncate leading-none">
								{positionDisplay}
							</span>
							{department && (
								<span className="text-[10px] font-semibold text-gray-400 truncate uppercase tracking-widest leading-none">
									{department} Dept.
								</span>
							)}
						</div>
					</NavLink>
				) : (
					<div className="flex items-center gap-3.5">
						<Avatar className="h-10 w-10 border border-orange-200/50 shadow-sm">
							{avatarUrl ? (
								<AvatarImage
									src={avatarUrl}
									alt={fullName}
									className="object-cover"
								/>
							) : null}
							<AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold text-[13px]">
								{firstName.charAt(0)}
								{lastName.charAt(0)}
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col flex-1 min-w-0 justify-center gap-1.5">
							<span className="text-[13px] font-bold text-gray-900 truncate leading-none">
								{fullName}
							</span>
							<span className="text-[11px] font-medium text-orange-600 truncate leading-none">
								{positionDisplay}
							</span>
							{department && (
								<span className="text-[10px] font-semibold text-gray-400 truncate uppercase tracking-widest leading-none">
									{department} Dept.
								</span>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Navigation */}
			<nav
				ref={navScrollRef}
				className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4 space-y-6">
				{/* Working Space (Role-specific) */}
				{workingSpaceItems.length > 0 && (
					<div>
						<h3
							id="sidebar-category-working-space"
							className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
							Working Space
						</h3>
						<div className="space-y-0.5">
							{workingSpaceItems.map((item) => (
								<NavItemComponent key={item.id} item={item} />
							))}
						</div>
					</div>
				)}

				{/* General (Common to all) */}
				{!isAdmin && (
					<div>
						<h3
							id="sidebar-category-general"
							className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
							General
						</h3>
						<div className="space-y-0.5">
							{generalItems.map((item) => (
								<NavItemComponent key={item.id} item={item} />
							))}
						</div>
					</div>
				)}

				{/* Personal */}
				{!isAdmin && (
					<div>
						<h3
							id="sidebar-category-personal"
							className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
							Personal
						</h3>
						<div className="space-y-0.5">
							{personalItems.map((item) => (
								<NavItemComponent key={item.id} item={item} />
							))}
						</div>
					</div>
				)}
			</nav>
		</div>
	);
}
