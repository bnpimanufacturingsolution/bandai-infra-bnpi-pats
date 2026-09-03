import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { DatePicker } from "~/components/atoms/DatePicker";
import {
	Eye,
	MoreVertical,
	Trash2,
	Download,
	Calendar,
	UserMinus,
	ListCheck,
	Edit,
	FileText,
} from "lucide-react";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { useLevels } from "~/lib/hooks/useLevels";
import { useAgencies } from "~/lib/hooks/useAgencies";
import { useSections } from "~/lib/hooks/useSections";
import { useCreateTermination, useSubmitTermination } from "~/lib/hooks/useTerminations";
import { useAuth } from "~/lib/hooks/use-auth";
import type { Employee } from "~/services/employees.service";
import type { Position } from "~/services/positions.service";
import type { Level } from "~/services/levels.service";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import { SearchableSelect } from "~/components/ui/searchable-select";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { Textarea } from "~/components/ui/textarea";
import { TERMINATION_TYPE_LABELS, type TerminationType } from "~/zod/termination.zod";
import { EmployeeImportModal } from "~/components/organisms/employee/EmployeeImportModal";
import { EmploymentStatusText } from "~/components/shared/EmploymentStatusText";
import {
	getActiveManpowerStatusFilterBranches,
	getActiveManpowerStatusScope,
} from "~/lib/utils/manpower-distribution-links";
import {
	AdminConfigCodeChip,
	AdminConfigDateText,
	AdminConfigMutedDash,
	AdminConfigSourceChip,
} from "~/lib/ui/admin-configuration-table";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";

type ApiEmployee = Employee & {
	department?: { id?: string; name?: string };
	section?: { id?: string; name?: string; code?: string | null };
	position?: { id?: string; title?: string };
	level?: { id?: string; name?: string; rank?: number };
	user?: { email?: string };
};

const NO_DIRECT_REPORTS_MANAGER_VALUE = "__no_direct_reports__";

type EmployeeDisplay = {
	id: string;
	name: string;
	firstName: string;
	lastName: string;
	avatar?: string;
	email: string;
	employeeId: string;
	departmentId?: string | null;
	positionId?: string | null;
	sectionId?: string | null;
	levelId?: string | null;
	department: string;
	section: string;
	level: string;
	position: string;
	status: string;
	phone: string;
	employmentHireDate: string;
	employmentType: string;
	workLocation: string;
	workforceSource: "DIRECT" | "AGENCY";
	agencyName: string;
	agencyCode: string;
};

const formatEmployeeForDisplay = (employee: ApiEmployee): EmployeeDisplay => {
	const firstName = employee.person?.personalInfo?.firstName || "";
	const lastName = employee.person?.personalInfo?.lastName || "";
	const fullName =
		`${firstName} ${lastName}`.trim() || employee.person?.personalInfo?.firstName || "Unnamed";
	const avatar = String(employee.user?.avatar || "").trim();
	const primaryPhone = employee.person?.contactInfo?.phones?.find(
		(phone: any) => phone.isPrimary,
	);
	const mobileNumber = primaryPhone
		? `${primaryPhone.countryCode || ""} ${primaryPhone.number || ""}`.trim()
		: "N/A";

	const statusMap: Record<string, string> = {
		OFFBOARDING: "Offboarding",
		ACTIVE: "Active",
		INACTIVE: "Inactive",
		TERMINATED: "Terminated",
		RESIGNED: "Resigned",
		RETIRED: "Retired",
		ON_LEAVE: "On Leave",
		ONBOARDING: "Onboarding",
		RESIGNATION_REQUESTED: "Resignation Requested",
		SERVING_NOTICE: "Serving Notice",
		FORMER_EMPLOYEE: "Former Employee",
	};

	const employmentTypeMap: Record<string, string> = {
		REGULAR: "Full time",
		PROBATIONARY: "Probationary",
		CONTRACTUAL: "Contractor",
		PART_TIME: "Part time",
		CONSULTANT: "Consultant",
		INTERN: "Intern",
	};

	return {
		id: employee.id,
		name: fullName,
		firstName,
		lastName,
		avatar: avatar || undefined,
		email: employee.person?.contactInfo?.email || employee.user?.email || "N/A",
		employeeId: employee.employeeId,
		departmentId: employee.department?.id || employee.departmentId || null,
		positionId: employee.position?.id || employee.positionId || null,
		sectionId: employee.section?.id || employee.sectionId || null,
		levelId: employee.level?.id || employee.levelId || null,
		department: employee.department?.name || "N/A",
		section: employee.section?.name || "N/A",
		level: employee.level?.name || "N/A",
		position: employee.position?.title || "N/A",
		status: statusMap[employee.employmentStatus] || employee.employmentStatus || "N/A",
		phone: mobileNumber,
		employmentHireDate: employee.employmentHireDate
			? new Date(employee.employmentHireDate).toLocaleDateString()
			: "N/A",
		employmentType:
			employmentTypeMap[employee.employmentType] || employee.employmentType || "N/A",
		workLocation: employee.workLocation || "N/A",
		workforceSource: (employee.workforceSource as "DIRECT" | "AGENCY" | undefined) || "DIRECT",
		agencyName: employee.agency?.name || "N/A",
		agencyCode: employee.agency?.code || "N/A",
	};
};

const getEmployeeDepartmentId = (employee: ApiEmployee) =>
	employee.department?.id || (employee as any).departmentId || null;

interface EmployeeListProps {
	role: "hr-user" | "hr-manager";
	showEmail?: boolean;
	showPhone?: boolean;
	hideAdd?: boolean;
	hideImport?: boolean;
	hideExport?: boolean;
	showViewProfileAction?: boolean;
	showAttendanceAction?: boolean;
	showPayrollAction?: boolean;
	showTerminateAction?: boolean;
	disableEmployeeDeepLinks?: boolean;
	defaultManagerId?: string;
	managerFilterEditable?: boolean;
	actionVariant?: "hr-default" | "team-overview";
}

export default function EmployeeList({
	role,
	showEmail = false,
	showPhone = false,
	hideAdd = false,
	hideImport = false,
	hideExport = false,
	showViewProfileAction = true,
	showAttendanceAction = true,
	showPayrollAction = true,
	showTerminateAction = true,
	disableEmployeeDeepLinks = false,
	defaultManagerId,
	managerFilterEditable = true,
	actionVariant = "hr-default",
}: EmployeeListProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();
	const basePath = location.pathname.replace(/\/$/, "");
	const isAdminConfigurationEmployees = basePath === "/admin/configuration/employees";
	const { user } = useAuth();

	// Termination modal state
	const [terminationEmployee, setTerminationEmployee] = useState<EmployeeDisplay | null>(null);
	const [terminationType, setTerminationType] = useState<TerminationType | "">("");
	const [terminationDate, setTerminationDate] = useState("");
	const [lastWorkingDay, setLastWorkingDay] = useState("");
	const [terminationReason, setTerminationReason] = useState("");
	const createTerminationMutation = useCreateTermination();
	const submitTerminationMutation = useSubmitTermination();

	// Get search and pagination params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const statusScopeFilter = searchParams.get("statusScope") || undefined;
	const departmentFilter = searchParams.get("departmentId") || undefined;
	const sectionFilter = searchParams.get("sectionId") || undefined;
	const positionFilter = searchParams.get("positionId") || undefined;
	const employmentTypeFilter = searchParams.get("employmentType") || undefined;
	const levelFilter = searchParams.get("levelId") || undefined;
	const genderFilter = searchParams.get("gender") || undefined;
	const hireDateFromFilter = searchParams.get("hireDateFrom") || undefined;
	const hireDateToFilter = searchParams.get("hireDateTo") || undefined;
	const managerFilter = searchParams.get("managerId") || undefined;
	const backendFilter = searchParams.get("filter") || undefined;
	const useTeamOverviewScope = actionVariant === "team-overview";
	const effectiveManagerFilter = managerFilter || defaultManagerId;
	const rawTeamScopeFilter = searchParams.get("teamScope") || "";
	const teamScopeFilter =
		rawTeamScopeFilter === "direct-reports" ||
		rawTeamScopeFilter === "supervisor-tree" ||
		rawTeamScopeFilter === "supervisor-direct"
			? rawTeamScopeFilter
			: "reporting-tree";
	const workforceSourceFilter = searchParams.get("workforceSource") || undefined;
	const agencyFilter = searchParams.get("agency") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const requestedSortParam = searchParams.get("sort") || "employeeId";
	const backendSortFieldByDisplayColumn: Record<string, string | null> = {
		name: "employeeId",
		employeeId: "employeeId",
		employmentHireDate: "employmentHireDate",
		status: "employmentStatus",
		workforceSource: "workforceSource",
		createdAt: "createdAt",
		updatedAt: "updatedAt",
		position: null,
		department: null,
		section: null,
		level: null,
	};
	const sortParam = backendSortFieldByDisplayColumn[requestedSortParam] || requestedSortParam;
	const orderParam: "asc" | "desc" = searchParams.get("order") === "desc" ? "desc" : "asc";
	const actorEmployeeId = user?.metadata?.employee?.id || undefined;
	const supervisorEmployeeId = user?.metadata?.employee?.reportTo?.id || undefined;
	const selectedTeamManagerId =
		effectiveManagerFilter &&
		effectiveManagerFilter !== "all" &&
		effectiveManagerFilter !== NO_DIRECT_REPORTS_MANAGER_VALUE
			? effectiveManagerFilter
			: undefined;
	const usesManagerScope = !!selectedTeamManagerId;
	const shouldShowNoDirectReports =
		useTeamOverviewScope && effectiveManagerFilter === NO_DIRECT_REPORTS_MANAGER_VALUE;
	const usesReportingTreeScope =
		usesManagerScope &&
		(teamScopeFilter === "reporting-tree" || teamScopeFilter === "supervisor-tree");
	useEffect(() => {
		if (useTeamOverviewScope) return;
		if (!defaultManagerId) return;
		if (searchParams.get("managerId")) return;

		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.set("managerId", defaultManagerId);
				next.set("page", "1");
				return next;
			},
			{ replace: true },
		);
	}, [defaultManagerId, searchParams, setSearchParams, useTeamOverviewScope]);

	const { data: agenciesData } = useAgencies({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const agencies = useMemo(() => (agenciesData as any)?.agencies || [], [agenciesData]);
	const selectedAgency = useMemo(() => {
		if (!agencyFilter || agencyFilter === "all") return null;
		const needle = agencyFilter.trim().toLowerCase();
		return (
			agencies.find((agency: any) => String(agency.id || "") === agencyFilter) ||
			agencies.find(
				(agency: any) =>
					String(agency.name || "")
						.trim()
						.toLowerCase() === needle,
			) ||
			agencies.find(
				(agency: any) =>
					String(agency.code || "")
						.trim()
						.toLowerCase() === needle,
			) ||
			null
		);
	}, [agencies, agencyFilter]);
	const agencyFilterValue = useMemo(() => {
		if (workforceSourceFilter === "DIRECT") return "DIRECT";
		if (workforceSourceFilter === "AGENCY" && selectedAgency?.id) return selectedAgency.id;
		return "all";
	}, [selectedAgency?.id, workforceSourceFilter]);

	const { data: reportingTreeData, isLoading: isLoadingReportingTree } = useEmployees(
		{
			page: 1,
			limit: 1000,
			count: false,
		},
		{
			enabled: usesReportingTreeScope && !!selectedTeamManagerId,
		},
	);
	const reportingTreeEmployees = useMemo(() => {
		const payload = reportingTreeData as any;
		if (Array.isArray(payload?.employees)) return payload.employees as ApiEmployee[];
		if (Array.isArray(payload?.data)) return payload.data as ApiEmployee[];
		if (Array.isArray(payload?.data?.employees)) return payload.data.employees as ApiEmployee[];
		return [];
	}, [reportingTreeData]);
	const reportingTreeReportToIds = useMemo(() => {
		if (!selectedTeamManagerId) return [];

		const childrenByManagerId = new Map<string, ApiEmployee[]>();
		reportingTreeEmployees.forEach((employee) => {
			const reportToId = (employee as any).reportTo?.id || employee.reportToId;
			if (!reportToId) return;
			const children = childrenByManagerId.get(reportToId) || [];
			children.push(employee);
			childrenByManagerId.set(reportToId, children);
		});

		const seen = new Set<string>([selectedTeamManagerId]);
		const queue = [selectedTeamManagerId];
		while (queue.length > 0) {
			const managerId = queue.shift();
			if (!managerId) continue;

			const children = childrenByManagerId.get(managerId) || [];
			children.forEach((child) => {
				if (seen.has(child.id)) return;
				seen.add(child.id);
				queue.push(child.id);
			});
		}

		return Array.from(seen);
	}, [reportingTreeEmployees, selectedTeamManagerId]);

	const filterParts: string[] = [];
	if (backendFilter) {
		filterParts.push(backendFilter);
	}
	if (statusFilter && statusFilter !== "all") {
		filterParts.push(`employmentStatus:${statusFilter}`);
	} else if (statusScopeFilter === getActiveManpowerStatusScope()) {
		filterParts.push(`or(${getActiveManpowerStatusFilterBranches().join(";")})`);
	}
	if (departmentFilter && departmentFilter !== "all") {
		filterParts.push(`departmentId:${departmentFilter}`);
	}
	if (sectionFilter && sectionFilter !== "all") {
		filterParts.push(`sectionId:${sectionFilter}`);
	}
	if (positionFilter && positionFilter !== "all") {
		filterParts.push(`positionId:${positionFilter}`);
	}
	if (employmentTypeFilter && employmentTypeFilter !== "all") {
		filterParts.push(`employmentType:${employmentTypeFilter}`);
	}
	if (levelFilter && levelFilter !== "all") {
		filterParts.push(`levelId:${levelFilter}`);
	}
	if (hireDateFromFilter) {
		filterParts.push(`employmentHireDate>=${hireDateFromFilter}T00:00:00.000Z`);
	}
	if (hireDateToFilter) {
		filterParts.push(`employmentHireDate<=${hireDateToFilter}T23:59:59.999Z`);
	}
	if (workforceSourceFilter && workforceSourceFilter !== "all") {
		filterParts.push(`workforceSource:${workforceSourceFilter}`);
	}
	if (genderFilter && genderFilter !== "all") {
		if (genderFilter === "Unknown") {
			filterParts.push(
				`or(person.personalInfo.gender:null;person.personalInfo.gender:;person.personalInfo.gender:N/A;person.personalInfo.gender:Unknown;person.personalInfo.gender:UNKNOWN;person.personalInfo.gender:unknown)`,
			);
		} else if (genderFilter === "Female") {
			filterParts.push(
				`or(person.personalInfo.gender:Female;person.personalInfo.gender:FEMALE;person.personalInfo.gender:female)`,
			);
		} else if (genderFilter === "Male") {
			filterParts.push(
				`or(person.personalInfo.gender:Male;person.personalInfo.gender:MALE;person.personalInfo.gender:male)`,
			);
		} else {
			filterParts.push(`person.personalInfo.gender:${genderFilter}`);
		}
	}
	if (selectedAgency?.id) {
		filterParts.push(`agencyId:${selectedAgency.id}`);
	}
	if (shouldShowNoDirectReports) {
		filterParts.push(`id:${NO_DIRECT_REPORTS_MANAGER_VALUE}`);
	} else if (selectedTeamManagerId) {
		const teamBranches =
			teamScopeFilter === "direct-reports" || teamScopeFilter === "supervisor-direct"
				? [`reportToId:${selectedTeamManagerId}`]
				: [
						`id:${selectedTeamManagerId}`,
						...(reportingTreeReportToIds.length > 0
							? reportingTreeReportToIds.map((managerId) => `reportToId:${managerId}`)
							: [`reportToId:${selectedTeamManagerId}`]),
					];
		const uniqueTeamBranches = Array.from(new Set(teamBranches));
		filterParts.push(
			uniqueTeamBranches.length === 1
				? uniqueTeamBranches[0]
				: `or(${uniqueTeamBranches.join(";")})`,
		);
	}
	const filterString = filterParts.length > 0 ? filterParts.join(",") : undefined;
	const employeeQuery =
		searchQuery ||
		(agencyFilter && agencyFilter !== "all" && !selectedAgency?.id ? agencyFilter : undefined);

	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 100,
		sort: "name",
		order: "asc",
	});
	const departments = (departmentsData as any)?.departments || [];

	const { data: positionsData } = usePositions({
		page: 1,
		limit: 1000,
		sort: "title",
		order: "asc",
	});
	const positions = useMemo(() => {
		const payload = positionsData as any;
		return payload?.positions || payload?.data?.positions || [];
	}, [positionsData]);

	const { data: levelsData } = useLevels({
		page: 1,
		limit: 1000,
		sort: "rank",
		order: "asc",
	});
	const levels = useMemo(() => {
		const payload = levelsData as any;
		return payload?.levels || payload?.data?.levels || [];
	}, [levelsData]);
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const sections = useMemo(() => {
		const payload = sectionsData as any;
		return payload?.sections || payload?.data?.sections || [];
	}, [sectionsData]);
	const visibleSections = useMemo(() => {
		if (!departmentFilter || departmentFilter === "all") return sections;
		return sections.filter((section: any) => section.departmentId === departmentFilter);
	}, [departmentFilter, sections]);

	const managersQueryParams = useMemo(() => {
		const filterParts = ["directReports:exists"];
		if (departmentFilter && departmentFilter !== "all") {
			filterParts.push(`departmentId:${departmentFilter}`);
		}

		return {
			page: 1,
			limit: 100,
			filter: filterParts.join(","),
		};
	}, [departmentFilter]);
	const { data: managersData, isFetching: isFetchingManagers } =
		useEmployees(managersQueryParams);
	const allManagers = useMemo(() => (managersData as any)?.employees || [], [managersData]);
	const { data: selectedManagerEmployee } = useEmployee(
		selectedTeamManagerId || "",
		"id,employeeId,person.personalInfo,department.id",
	);
	const managers = useMemo(() => {
		const scopedManagers =
			!departmentFilter || departmentFilter === "all"
				? allManagers
				: allManagers.filter(
						(manager: ApiEmployee) =>
							getEmployeeDepartmentId(manager) === departmentFilter,
					);

		if (
			selectedTeamManagerId &&
			selectedManagerEmployee &&
			!scopedManagers.some((manager: ApiEmployee) => manager.id === selectedTeamManagerId)
		) {
			return [selectedManagerEmployee as ApiEmployee, ...scopedManagers];
		}

		return scopedManagers;
	}, [allManagers, departmentFilter, selectedManagerEmployee, selectedTeamManagerId]);

	useEffect(() => {
		if (!departmentFilter || departmentFilter === "all") return;
		if (!managerFilter || managerFilter === "all") return;
		if (useTeamOverviewScope && selectedTeamManagerId) return;
		if (isFetchingManagers) return;
		if (managers.some((manager: ApiEmployee) => manager.id === managerFilter)) return;

		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete("managerId");
				next.set("page", "1");
				return next;
			},
			{ replace: true },
		);
	}, [
		departmentFilter,
		isFetchingManagers,
		managerFilter,
		managers,
		selectedTeamManagerId,
		setSearchParams,
		useTeamOverviewScope,
	]);

	const employeesQueryParams = useMemo(
		() => ({
			page: pageParam,
			limit: limitParam,
			query: employeeQuery,
			filter: filterString,
			sort: sortParam,
			order: orderParam,
			count: true,
		}),
		[employeeQuery, filterString, limitParam, orderParam, pageParam, sortParam],
	);

	const {
		data: employeesData,
		isLoading,
		isFetching,
	} = useEmployees(employeesQueryParams, {
		enabled:
			!shouldShowNoDirectReports &&
			(!useTeamOverviewScope ||
				(!!actorEmployeeId && (!usesReportingTreeScope || !isLoadingReportingTree))),
	});
	const employeesPayload =
		(employeesData as any)?.employees || (employeesData as any)?.pagination
			? (employeesData as any)
			: Array.isArray((employeesData as any)?.data)
				? {
						employees: (employeesData as any).data,
						pagination: (employeesData as any)?.pagination,
					}
				: (employeesData as any)?.data || {};
	const items = employeesPayload?.employees || [];
	const pagination = employeesPayload?.pagination;

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const selectFor = searchParams.get("selectFor");

	// Single employee ID for fetching (when action is view or delete)
	const activeEmployeeId = action === "view" || action === "delete" ? id : null;

	// Single useEmployee hook for all modals (view, delete)
	const { data: activeEmployee, isLoading: isLoadingEmployee } = useEmployee(
		activeEmployeeId || "",
	);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	// Event handlers
	const handleViewEmployee = (item: EmployeeDisplay) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const handleEditEmployee = (item: EmployeeDisplay) => {
		navigate(`${item.id}/edit`);
	};

	const handleDeleteEmployee = (item: EmployeeDisplay) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const confirmDelete = () => {
		if (!activeEmployee) return;
		// Note: Assuming there's a delete mutation, but since it's not implemented, we'll just close
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const handleAddEmployee = () => {
		if (isAdminConfigurationEmployees) {
			navigate(`${basePath}/new?step=0`);
			return;
		}
		navigate(`new`);
	};

	const handleSelectEmployee = (item: EmployeeDisplay) => {
		if (selectFor === "create-pan") {
			navigate(
				`/employee/requests?action=create&kind=personnel-action&targetEmployeeId=${item.id}`,
			);
		}
	};

	const handleTerminateEmployee = (item: EmployeeDisplay) => {
		const today = new Date().toISOString().split("T")[0];
		setTerminationEmployee(item);
		setTerminationType("");
		setTerminationDate(today);
		setLastWorkingDay(today);
		setTerminationReason("");
	};

	const handleCreatePanRequest = (item: EmployeeDisplay) => {
		navigate(
			`/employee/requests?action=create&kind=personnel-action&targetEmployeeId=${item.id}`,
		);
	};

	const handleSubmitTermination = async () => {
		if (
			!terminationEmployee ||
			!terminationType ||
			!terminationDate ||
			!lastWorkingDay ||
			!terminationReason
		) {
			toast.error("Please fill in all required fields");
			return;
		}

		if (terminationReason.length < 10) {
			toast.error("Reason must be at least 10 characters");
			return;
		}

		try {
			const termination = await createTerminationMutation.mutateAsync({
				employeeId: terminationEmployee.id,
				initiatedById: user?.metadata?.employee?.id || "",
				terminationType: terminationType as TerminationType,
				terminationDate: new Date(terminationDate),
				lastWorkingDay: new Date(lastWorkingDay),
				reason: terminationReason,
				supportingDocuments: [],
				legalApprovalRequired: false,
			});

			// Automatically submit for approval
			await submitTerminationMutation.mutateAsync(termination.id);

			toast.success("Termination request submitted successfully");
			setTerminationEmployee(null);
		} catch (error) {
			toast.error("Failed to create termination request");
		}
	};

	const renderConfigLink = ({
		label,
		id,
		path,
		className = "",
		truncate = true,
	}: {
		label?: string | null;
		id?: string | null;
		path: string;
		className?: string;
		/** When false, show the full label (wrap if needed) instead of ellipsis. */
		truncate?: boolean;
	}) => {
		const cleanLabel = String(label || "").trim();
		if (!cleanLabel || cleanLabel === "N/A") {
			return <AdminConfigMutedDash />;
		}

		const textClassName = [
			"max-w-full text-left text-sm font-medium text-slate-800",
			truncate ? "truncate" : "whitespace-normal break-words",
			className,
		]
			.filter(Boolean)
			.join(" ");

		if (!id || !isAdminConfigurationEmployees) {
			return <span className={`text-sm text-slate-700 ${truncate ? "truncate" : "whitespace-normal break-words"} ${className}`}>{cleanLabel}</span>;
		}

		return (
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					navigate(`${path}?action=view&id=${id}`);
				}}
				className={`${textClassName} underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
				title={cleanLabel}>
				{cleanLabel}
			</button>
		);
	};

	// Column balance:
	// - Name is wide enough for full single-line names (no ellipsis for typical lengths)
	// - Position is compact; Department absorbs leftover width with full labels
	// - Workforce / Hire Date / Status / Actions stay compact
	const employeeColumns: Column<EmployeeDisplay>[] = [
		{
			key: "name",
			label: "Name",
			// Avatar (~2.5rem) + gap + full first/last name on one line.
			width: "17rem",
			className: "min-w-0",
			sortable: true,
			searchable: true,
			required: true,
			priority: "critical",
			render: (value, item) => {
				const nameClassName = disableEmployeeDeepLinks
					? "whitespace-nowrap font-medium text-gray-900"
					: "whitespace-nowrap font-medium text-gray-900 hover:text-primary hover:underline";
				// Avatar + single-line name + employee code for every EmployeeList surface
				// (admin configuration, HR employees, team scopes, etc.).
				// Row click (DataTable onRowClick) opens the profile when deep links
				// are enabled; name styling still signals that the row is navigable.
				return (
					<div className="min-w-0 max-w-full">
						<div className="flex min-w-0 items-center gap-3">
							<EmployeeAvatar
								src={item.avatar}
								alt={value}
								size="md"
								className="shrink-0"
							/>
							<div className="min-w-0">
								<div className={nameClassName} title={value}>
									{value}
								</div>
								<div className="mt-1">
									<AdminConfigCodeChip>{item.employeeId}</AdminConfigCodeChip>
								</div>
							</div>
						</div>
					</div>
				);
			},
		},
		{
			key: "position",
			label: "Position",
			// Compact column — titles wrap if needed rather than stealing space from name.
			width: "8.5rem",
			className: "min-w-0 align-middle",
			sortable: false,
			searchable: true,
			required: true,
			priority: "high",
			render: (value, item) => (
				<div className="min-w-0 space-y-0.5">
					{renderConfigLink({
						label: value,
						id: item.positionId,
						path: "/admin/configuration/positions",
						truncate: false,
					})}
					{item.level !== "N/A" && (
						<div className="text-[11px] text-muted-foreground">
							{renderConfigLink({
								label: item.level,
								id: item.levelId,
								path: "/admin/configuration/levels",
								className: "text-[11px] font-normal text-muted-foreground",
								truncate: false,
							})}
						</div>
					)}
				</div>
			),
		},
		{
			key: "department",
			label: "Department",
			// Absorbs leftover table width; show full department/section labels.
			width: "100%",
			className: "min-w-0 align-middle",
			sortable: false,
			searchable: true,
			required: true,
			priority: "high",
			render: (value, item) => (
				<div className="min-w-0 space-y-0.5">
					{renderConfigLink({
						label: value,
						id: item.departmentId,
						path: "/admin/configuration/departments",
						truncate: false,
					})}
					{isAdminConfigurationEmployees && item.section !== "N/A" && (
						<div className="text-[11px] text-muted-foreground">
							{renderConfigLink({
								label: item.section,
								id: item.sectionId,
								path: "/admin/configuration/sections",
								className: "text-[11px] font-normal text-muted-foreground",
								truncate: false,
							})}
						</div>
					)}
				</div>
			),
		},
		{
			key: "workforceSource",
			label: "Workforce",
			width: "5.75rem",
			className: "!px-2 whitespace-nowrap align-middle",
			headerClassName: "!px-2 whitespace-nowrap",
			sortable: true,
			priority: "medium",
			hideBelow: "lg",
			render: (value: "DIRECT" | "AGENCY", item) => (
				<div className="min-w-0 max-w-full">
					<AdminConfigSourceChip
						className="max-w-full"
						title={
							value === "AGENCY"
								? item.agencyCode !== "N/A"
									? item.agencyCode
									: item.agencyName
								: "DIRECT"
						}>
						{value === "AGENCY"
							? item.agencyCode !== "N/A"
								? item.agencyCode
								: item.agencyName
							: "DIRECT"}
					</AdminConfigSourceChip>
				</div>
			),
		},
		...(showEmail
			? [
					{
						key: "email" as const,
						label: "Email",
						width: "12rem",
						className: "min-w-0 max-w-0 overflow-hidden truncate",
						searchable: true,
						priority: "low" as const,
						hideBelow: "xl" as const,
					},
				]
			: []),
		...(showPhone
			? [
					{
						key: "phone" as const,
						label: "Phone",
						width: "7.5rem",
						className: "whitespace-nowrap",
						searchable: true,
						priority: "low" as const,
						hideBelow: "xl" as const,
					},
				]
			: []),
		{
			key: "employmentHireDate",
			label: "Hire Date",
			width: "5.5rem",
			className: "!px-2 whitespace-nowrap align-middle",
			headerClassName: "!px-2 whitespace-nowrap",
			sortable: true,
			priority: "medium",
			hideBelow: "lg",
			render: (value) => <AdminConfigDateText>{value}</AdminConfigDateText>,
		},
		{
			key: "status",
			label: "Status",
			width: "6.5rem",
			className: "!px-2 whitespace-nowrap align-middle",
			headerClassName: "!px-2 whitespace-nowrap",
			sortable: true,
			required: true,
			priority: "critical",
			render: (value: any) => <EmploymentStatusText status={value} />,
		},
	];

	// Filter options
	const managerFilterOption = {
		key: "managerId",
		label: "Manager",
		options: [
			...(useTeamOverviewScope
				? [{ value: NO_DIRECT_REPORTS_MANAGER_VALUE, label: "No Direct Reports" }]
				: []),
			...managers.map((manager: ApiEmployee) => {
				const firstName = manager.person?.personalInfo?.firstName || "";
				const lastName = manager.person?.personalInfo?.lastName || "";
				return {
					value: manager.id,
					label: `${firstName} ${lastName}`.trim() || manager.employeeId,
				};
			}),
		],
	};

	const employeeFilters = [
		{
			key: "sectionId",
			label: "Section",
			options: visibleSections.map((section: any) => ({
				value: section.id,
				label: section.name,
			})),
		},
		{
			key: "gender",
			label: "Gender",
			options: [
				{ value: "Female", label: "Female" },
				{ value: "Male", label: "Male" },
				{ value: "Unknown", label: "Unknown" },
			],
		},
		{
			key: "teamScope",
			label: "Reporting Scope",
			options: [
				{ value: "reporting-tree", label: "Tree" },
				{ value: "direct-reports", label: "Direct" },
				...(supervisorEmployeeId
					? [
							{ value: "supervisor-tree", label: "Supervisor Tree" },
							{ value: "supervisor-direct", label: "Supervisor Direct" },
						]
					: []),
			],
		},
		{
			key: "agency",
			label: "Agency",
			options: [
				{ value: "DIRECT", label: "BNPI / Direct" },
				...agencies.map((agency: any) => ({
					value: agency.id,
					label: agency.code ? `${agency.code} - ${agency.name}` : agency.name,
				})),
			],
		},
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "ACTIVE", label: "Active" },
				{ value: "ONBOARDING", label: "Onboarding" },
				{ value: "INACTIVE", label: "Inactive" },
				{ value: "ON_LEAVE", label: "On Leave" },
				{ value: "OFFBOARDING", label: "Offboarding" },
				{ value: "SERVING_NOTICE", label: "Serving Notice" },
				{ value: "RESIGNATION_REQUESTED", label: "Resignation Requested" },
				{ value: "TERMINATED", label: "Terminated" },
				{ value: "RESIGNED", label: "Resigned" },
				{ value: "RETIRED", label: "Retired" },
				{ value: "FORMER_EMPLOYEE", label: "Former Employee" },
			],
		},
		{
			key: "employmentType",
			label: "Employment Type",
			options: [
				{ value: "REGULAR", label: "Regular" },
				{ value: "PROBATIONARY", label: "Probationary" },
				{ value: "CONTRACTUAL", label: "Contractual" },
				{ value: "PART_TIME", label: "Part time" },
				{ value: "CONSULTANT", label: "Consultant" },
				{ value: "INTERN", label: "Intern" },
			],
		},
		{
			key: "positionId",
			label: "Position",
			options: positions.map((position: Position) => ({
				value: position.id,
				label: position.title,
			})),
		},
		{
			key: "levelId",
			label: "Level",
			options: levels.map((level: Level) => ({
				value: level.id,
				label: level.rank ? `${level.name} (Rank ${level.rank})` : level.name,
			})),
		},
		{
			key: "hireDateFrom",
			label: "Hire Date From",
			type: "date" as const,
			options: [],
		},
		{
			key: "hireDateTo",
			label: "Hire Date To",
			type: "date" as const,
			options: [],
		},
	];

	const handleViewProfile = (item: EmployeeDisplay) => {
		// Admin configuration must stay under /admin/* so the admin sidebar layout
		// does not switch to the unified employee workspace.
		if (isAdminConfigurationEmployees) {
			navigate(`/admin/configuration/employees/${item.id}`);
			return;
		}
		// Encode current path (replace / with - for clean URLs)
		const encodedPath = location.pathname.substring(1).replace(/\//g, "-");
		navigate(`/employee/${item.id}?from=${encodedPath}`);
	};

	const handleEmployeeRowClick = (item: EmployeeDisplay) => {
		if (disableEmployeeDeepLinks) return;
		if (selectFor === "create-pan") {
			handleSelectEmployee(item);
			return;
		}
		if (selectFor) return;
		handleViewProfile(item);
	};

	const handleViewTeamAttendance = (item: EmployeeDisplay) => {
		const next = new URLSearchParams();
		next.set("tab", "attendance");
		next.set("viewer", "manager");
		navigate(`/employee/${item.id}/attendance?${next.toString()}`);
	};

	const handleViewTeamTimesheet = (item: EmployeeDisplay) => {
		const next = new URLSearchParams();
		next.set("tab", "timesheets");
		next.set("viewer", "manager");
		navigate(`/employee/${item.id}/attendance?${next.toString()}`);
	};

	const handleViewAttendance = (item: EmployeeDisplay) => {
		const next = new URLSearchParams();
		next.set("employee", item.id);
		navigate(`/hr/attendance?${next.toString()}`);
	};

	const handleViewPayroll = (item: EmployeeDisplay) => {
		const next = new URLSearchParams();
		next.set("employeeId", item.id);
		next.set("open", "view");
		navigate(`/hr/hr-payroll?${next.toString()}`);
	};

	const renderActions = (item: EmployeeDisplay) => {
		if (selectFor) {
			return (
				<Button variant="outline" size="sm" onClick={() => handleSelectEmployee(item)}>
					Select
				</Button>
			);
		}

		if (actionVariant === "team-overview") {
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="w-8 h-8 p-0">
							<MoreVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onClick={() => handleViewProfile(item)}>
							<Eye className="h-4 w-4 mr-2" /> View Profile
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => handleViewTeamAttendance(item)}>
							<Calendar className="h-4 w-4 mr-2" /> View Attendance
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => handleViewTeamTimesheet(item)}>
							<ListCheck className="h-4 w-4 mr-2" /> View Timesheet
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => handleCreatePanRequest(item)}>
							<FileText className="h-4 w-4 mr-2" /> Create Personnel Action
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					{showViewProfileAction && (
						<DropdownMenuItem onClick={() => handleViewProfile(item)}>
							<Eye className="h-4 w-4 mr-2" /> View Profile
						</DropdownMenuItem>
					)}
					{showAttendanceAction && (
						<DropdownMenuItem onClick={() => handleViewAttendance(item)}>
							<Calendar className="h-4 w-4 mr-2" /> View Attendance
						</DropdownMenuItem>
					)}
					{showPayrollAction && (
						<DropdownMenuItem onClick={() => handleViewPayroll(item)}>
							<Download className="h-4 w-4 mr-2" /> View Payroll
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={() => handleEditEmployee(item)}>
						<Edit className="h-4 w-4 mr-2" /> Edit
					</DropdownMenuItem>
					{showTerminateAction && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleTerminateEmployee(item)}
								className="text-orange-600">
								<UserMinus className="h-4 w-4 mr-2" /> Terminate
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeEmployeeId && isLoadingEmployee;

	// Pagination handlers
	const handlePageChange = (page: number) => {
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.set("page", page.toString());
			return newParams;
		});
	};

	const handleSearch = (query: string) => {
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			if (query) {
				newParams.set("search", query);
			} else {
				newParams.delete("search");
			}
			newParams.set("page", "1"); // Reset to first page on search
			return newParams;
		});
	};

	const handleSort = (key: string, direction: "asc" | "desc") => {
		const backendSortKey = backendSortFieldByDisplayColumn[key];
		if (!backendSortKey) return;

		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("sort", backendSortKey);
			next.set("order", direction);
			next.set("page", "1");
			return next;
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			const nextDepartmentFilter = filters.departmentId || "";
			const currentDepartmentFilter = departmentFilter || "";
			const departmentChanged =
				filters.departmentId !== undefined &&
				nextDepartmentFilter !== currentDepartmentFilter;

			if (Object.keys(filters).length === 0) {
				next.delete("status");
				next.delete("statusScope");
				next.delete("departmentId");
				next.delete("sectionId");
				next.delete("positionId");
				next.delete("employmentType");
				next.delete("levelId");
				next.delete("gender");
				next.delete("hireDateFrom");
				next.delete("hireDateTo");
				next.delete("managerId");
				next.delete("teamScope");
				next.delete("workforceSource");
				next.delete("agency");
				next.set("page", "1");
				return next;
			}

			if (filters.status) {
				if (filters.status === "all") {
					next.delete("status");
				} else {
					next.set("status", filters.status);
				}
				next.delete("statusScope");
			}

			if (filters.statusScope) {
				if (filters.statusScope === "all") {
					next.delete("statusScope");
				} else {
					next.set("statusScope", filters.statusScope);
					next.delete("status");
				}
			}

			if (filters.departmentId) {
				if (filters.departmentId === "all") {
					next.delete("departmentId");
					next.delete("sectionId");
					next.delete("managerId");
				} else {
					next.set("departmentId", filters.departmentId);
					if (departmentChanged) {
						next.delete("sectionId");
						next.delete("managerId");
					}
				}
			}

			if (filters.sectionId) {
				if (filters.sectionId === "all") {
					next.delete("sectionId");
				} else {
					next.set("sectionId", filters.sectionId);
				}
			}

			if (filters.positionId) {
				if (filters.positionId === "all") {
					next.delete("positionId");
				} else {
					next.set("positionId", filters.positionId);
				}
			}

			if (filters.employmentType) {
				if (filters.employmentType === "all") {
					next.delete("employmentType");
				} else {
					next.set("employmentType", filters.employmentType);
				}
			}

			if (filters.levelId) {
				if (filters.levelId === "all") {
					next.delete("levelId");
				} else {
					next.set("levelId", filters.levelId);
				}
			}

			if (filters.gender) {
				if (filters.gender === "all") {
					next.delete("gender");
				} else {
					next.set("gender", filters.gender);
				}
			}

			if (filters.hireDateFrom !== undefined) {
				if (!filters.hireDateFrom) {
					next.delete("hireDateFrom");
				} else {
					next.set("hireDateFrom", filters.hireDateFrom);
				}
			}

			if (filters.hireDateTo !== undefined) {
				if (!filters.hireDateTo) {
					next.delete("hireDateTo");
				} else {
					next.set("hireDateTo", filters.hireDateTo);
				}
			}

			if (!departmentChanged && filters.managerId) {
				if (filters.managerId === "all") {
					next.delete("managerId");
				} else {
					next.set("managerId", filters.managerId);
				}
			}

			if (filters.teamScope) {
				if (filters.teamScope === "reporting-tree") {
					next.delete("teamScope");
				} else {
					next.set("teamScope", filters.teamScope);
				}
			}

			if (filters.workforceSource) {
				if (filters.workforceSource === "all") {
					next.delete("workforceSource");
				} else {
					next.set("workforceSource", filters.workforceSource);
				}
			}

			if (filters.agency) {
				if (filters.agency === "all") {
					next.delete("workforceSource");
					next.delete("agency");
				} else if (filters.agency === "DIRECT") {
					next.set("workforceSource", "DIRECT");
					next.delete("agency");
				} else {
					next.set("workforceSource", "AGENCY");
					next.set("agency", filters.agency);
				}
			}

			next.set("page", "1");
			return next;
		});
	};

	const advancedFilterValues = useMemo(
		() => ({
			// Include toolbar filters so the Filters badge counts them too.
			departmentId: departmentFilter || "",
			managerId: effectiveManagerFilter || "",
			status: statusFilter || "",
			sectionId: sectionFilter || "",
			gender: genderFilter || "",
			teamScope: rawTeamScopeFilter || "",
			employmentType: employmentTypeFilter || "",
			positionId: positionFilter || "",
			levelId: levelFilter || "",
			hireDateFrom: hireDateFromFilter || "",
			hireDateTo: hireDateToFilter || "",
			agency: agencyFilterValue,
		}),
		[
			agencyFilterValue,
			departmentFilter,
			effectiveManagerFilter,
			employmentTypeFilter,
			genderFilter,
			hireDateFromFilter,
			hireDateToFilter,
			levelFilter,
			positionFilter,
			rawTeamScopeFilter,
			sectionFilter,
			statusFilter,
		],
	);

	if (isLoading) {
		return (
			<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white p-6">
				{/* Header Skeleton */}
				<div className="mb-3 flex shrink-0 items-center justify-between">
					<div className="space-y-2">
						<div className="h-7 w-48 animate-pulse rounded bg-gray-200"></div>
						<div className="h-4 w-72 animate-pulse rounded bg-gray-200"></div>
					</div>
					<div className="flex gap-2">
						<div className="h-9 w-20 animate-pulse rounded bg-gray-200"></div>
						<div className="h-9 w-20 animate-pulse rounded bg-gray-200"></div>
						<div className="h-9 w-20 animate-pulse rounded bg-gray-200"></div>
					</div>
				</div>

				{/* Filters Skeleton */}
				<div className="mb-3 flex shrink-0 justify-end gap-3">
					<div className="h-10 w-64 max-w-full animate-pulse rounded bg-gray-200"></div>
					<div className="h-10 w-24 animate-pulse rounded bg-gray-200"></div>
					<div className="h-10 w-24 animate-pulse rounded bg-gray-200"></div>
				</div>

				{/* Table Skeleton — fills remaining height */}
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white">
					<div className="shrink-0 border-b bg-gray-50 p-4">
						<div className="flex gap-4">
							<div className="h-4 w-32 animate-pulse rounded bg-gray-200"></div>
							<div className="h-4 w-24 animate-pulse rounded bg-gray-200"></div>
							<div className="h-4 w-28 animate-pulse rounded bg-gray-200"></div>
							<div className="h-4 w-24 animate-pulse rounded bg-gray-200"></div>
							<div className="h-4 w-20 animate-pulse rounded bg-gray-200"></div>
						</div>
					</div>
					<div className="min-h-0 flex-1 divide-y overflow-auto">
						{Array.from({ length: 10 }).map((_, idx) => (
							<div key={idx} className="p-4">
								<div className="flex items-center gap-4">
									<div className="h-10 w-10 animate-pulse rounded-full bg-gray-200"></div>
									<div className="flex-1 space-y-2">
										<div className="h-4 w-3/4 animate-pulse rounded bg-gray-200"></div>
										<div className="h-3 w-1/2 animate-pulse rounded bg-gray-200"></div>
									</div>
									<div className="h-6 w-20 animate-pulse rounded bg-gray-200"></div>
									<div className="h-8 w-8 animate-pulse rounded bg-gray-200"></div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	const searchFields = (
		showEmail
			? ["name", "employeeId", "level", "position", "department", "section", "email"]
			: ["name", "employeeId", "level", "position", "department", "section"]
	) as (keyof EmployeeDisplay)[];

	// Format items for display
	const formattedItems = items.map((employee: ApiEmployee) => formatEmployeeForDisplay(employee));
	const isTableLoading = isLoading || (usesReportingTreeScope && isLoadingReportingTree);
	const currentFilterValues = {
		status: statusFilter || "",
		statusScope: statusScopeFilter || "",
		departmentId: departmentFilter || "",
		sectionId: sectionFilter || "",
		positionId: positionFilter || "",
		levelId: levelFilter || "",
		gender: genderFilter || "",
		hireDateFrom: hireDateFromFilter || "",
		hireDateTo: hireDateToFilter || "",
		managerId: effectiveManagerFilter || "",
		teamScope: teamScopeFilter || "",
		workforceSource: workforceSourceFilter || "",
		agency: agencyFilter || "",
	};

	const isFocusedDirectReportsView =
		useTeamOverviewScope &&
		!!selectedTeamManagerId &&
		(teamScopeFilter === "direct-reports" || teamScopeFilter === "supervisor-direct");

	const renderDirectoryToolbarSelect = (
		option: {
			key: string;
			label: string;
			options: { value: string; label: string }[];
		},
		value: string | undefined,
		placeholder: string,
	) => (
		<div className="w-full min-w-0" data-testid={`${option.key}-toolbar-filter`}>
			<SearchableSelect
				options={[
					{ value: "all", label: `All ${option.label}` },
					...option.options,
				]}
				value={value && value !== "all" ? value : "all"}
				onValueChange={(nextValue) =>
					handleFilterChange({ [option.key]: nextValue || "all" })
				}
				placeholder={placeholder}
				searchPlaceholder={`Search ${option.label.toLowerCase()}...`}
				emptyText={`No ${option.label.toLowerCase()} found.`}
				className="mt-0 h-9 min-h-9 rounded-md border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-primary/20"
			/>
		</div>
	);

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
			<DataTable
				title="Employee Directory"
				className="h-full min-h-0 flex-1 overflow-hidden"
				data={formattedItems}
				columns={employeeColumns}
				filters={employeeFilters}
				searchFields={searchFields}
				onAdd={hideAdd ? undefined : handleAddEmployee}
				onImport={hideImport ? undefined : openImport}
				onRowClick={disableEmployeeDeepLinks ? undefined : handleEmployeeRowClick}
				renderActions={renderActions}
				// Icon menu (or Select button) only — keep sticky Actions narrow.
				// 5rem fits the uppercase "Actions" header + icon button with reduced padding.
				actionColumnWidth={selectFor ? "6.5rem" : "5rem"}
				isLoading={isTableLoading && !isFetching}
				emptyMessage={
					isFocusedDirectReportsView ? "No direct reports" : "No employees found"
				}
				emptyDescription={
					isFocusedDirectReportsView
						? "This employee does not have any direct reports."
						: useTeamOverviewScope
							? "Try another manager or team scope."
							: "No employee records match the current view."
				}
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				totalPages={pagination?.totalPages}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={advancedFilterValues}
				onPageChange={handlePageChange}
				onSort={handleSort}
				sortKey={sortParam}
				sortDirection={orderParam}
				// Department + Manager live inside the Filters popover (not the main toolbar).
				filterPopoverExtra={
					<>
						<div className="space-y-1.5" data-testid="departmentId-toolbar-filter">
							<label className="text-xs font-medium text-gray-600">Department</label>
							<DepartmentSectionPicker
								variant="compact"
								className="w-full min-w-0 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-between"
								departments={departments}
								sections={sections}
								departmentId={departmentFilter}
								sectionId={sectionFilter}
								onDepartmentChange={(nextValue) =>
									handleFilterChange({ departmentId: nextValue })
								}
								onSectionChange={(nextDepartmentId, nextSectionId) =>
									handleFilterChange({
										departmentId: nextDepartmentId,
										sectionId: nextSectionId,
									})
								}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-gray-600">Manager</label>
							{renderDirectoryToolbarSelect(
								managerFilterOption,
								effectiveManagerFilter,
								isFetchingManagers ? "Loading managers" : "All Manager",
							)}
						</div>
					</>
				}
				searchWidth="w-56"
				searchValue={searchQuery || ""}
				filterButtonLabel="Filters"
				filterColumns={2}
				toolbarAlign="right"
				titleActions={
					hideExport ? null : (
						<Button
							variant="ghost"
							onClick={() => console.log("Export")}
							className="h-9 rounded-md border-0 bg-transparent px-2.5 text-xs font-medium text-gray-500 shadow-none transition hover:bg-neutral-100 hover:text-gray-700">
							<Download className="h-3.5 w-3.5 opacity-70" />
							<span>Export</span>
						</Button>
					)
				}
				containedScroll
			/>

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
				title="Employee Details">
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading employee...</div>
				) : activeEmployee && action === "view" ? (
					<div className="space-y-6">
						{/* Personal Information */}
						<div>
							<h3 className="text-sm font-semibold text-gray-900 mb-3">
								Personal Information
							</h3>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Full Name
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{`${activeEmployee.person?.personalInfo?.firstName || ""} ${activeEmployee.person?.personalInfo?.middleName || ""} ${activeEmployee.person?.personalInfo?.lastName || ""}`.trim() ||
												"N/A"}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Employee ID
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900 font-mono">
											{activeEmployee.employeeId || "N/A"}
										</span>
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Email
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{activeEmployee.person?.contactInfo?.email || "N/A"}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Phone
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(() => {
												const primaryPhone =
													activeEmployee.person?.contactInfo?.phones?.find(
														(phone: any) => phone.isPrimary,
													);
												return primaryPhone
													? `${primaryPhone.countryCode || ""} ${primaryPhone.number || ""}`.trim()
													: "N/A";
											})()}
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Employment Information */}
						<div>
							<h3 className="text-sm font-semibold text-gray-900 mb-3">
								Employment Information
							</h3>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Position
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(activeEmployee as ApiEmployee).position?.title ||
												"N/A"}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Department
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(activeEmployee as ApiEmployee).department?.name ||
												"N/A"}
										</span>
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Employment Type
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(() => {
												const typeMap: Record<string, string> = {
													REGULAR: "Full time",
													PROBATIONARY: "Probationary",
													CONTRACTUAL: "Contractor",
													PART_TIME: "Part time",
													CONSULTANT: "Consultant",
													INTERN: "Intern",
												};
												return (
													typeMap[activeEmployee.employmentType] ||
													activeEmployee.employmentType ||
													"N/A"
												);
											})()}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Status
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<EmploymentStatusText
											status={
												(() => {
													const statusMap: Record<string, string> = {
														ACTIVE: "Active",
														INACTIVE: "Inactive",
														TERMINATED: "Terminated",
														RESIGNED: "Resigned",
														RETIRED: "Retired",
														ON_LEAVE: "On Leave",
													};
													return (
														statusMap[activeEmployee.employmentStatus] ||
														activeEmployee.employmentStatus ||
														"N/A"
													);
												})()
											}
										/>
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Hire Date
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{activeEmployee.employmentHireDate
												? new Date(
														activeEmployee.employmentHireDate,
													).toLocaleDateString()
												: "N/A"}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Work Location
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{activeEmployee.workLocation || "N/A"}
										</span>
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Workforce Source
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(activeEmployee as any).workforceSource === "AGENCY"
												? "Indirect (Agency)"
												: "Direct"}
										</span>
									</div>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Agency
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(activeEmployee as any).agency?.name || "N/A"}
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-3 pt-4 border-t">
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
							<Button
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
									handleEditEmployee(
										formatEmployeeForDisplay(activeEmployee as ApiEmployee),
									);
								}}>
								<Edit className="h-4 w-4 mr-2" />
								Edit Employee
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Employee not found</div>
				)}
			</Modal>

			{/* Delete Confirmation Modal */}
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
				title="Delete Employee">
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading employee...</div>
				) : activeEmployee && action === "delete" ? (
					<div className="space-y-4">
						<div className="p-4 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								employee{" "}
								<strong>
									{formatEmployeeForDisplay(activeEmployee as ApiEmployee).name}
								</strong>{" "}
								({activeEmployee.employeeId}).
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
							<Button type="button" variant="destructive" onClick={confirmDelete}>
								Delete Employee
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Employee not found</div>
				)}
			</Modal>

			{/* Import Modal */}
			<EmployeeImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
						});
					}
				}}
			/>

			{/* Termination Modal */}
			<Modal
				open={!!terminationEmployee}
				onOpenChange={(open) => {
					if (!open) {
						setTerminationEmployee(null);
					}
				}}
				title="Terminate Employee">
				{terminationEmployee && (
					<div className="space-y-4">
						<div className="p-4 bg-orange-50 border border-orange-200 rounded-md">
							<p className="text-sm text-orange-800">
								You are initiating the termination process for{" "}
								<strong>{terminationEmployee.name}</strong> (
								{terminationEmployee.employeeId}). This will create a termination
								request that requires HR Director approval.
							</p>
						</div>

						<div>
							<Label htmlFor="terminationType">Termination Type *</Label>
							<Select
								value={terminationType}
								onValueChange={(v: string) =>
									setTerminationType(v as TerminationType)
								}>
								<SelectTrigger>
									<SelectValue placeholder="Select termination type" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(TERMINATION_TYPE_LABELS).map(([key, label]) => (
										<SelectItem key={key} value={key}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label htmlFor="terminationDate">Termination Date *</Label>
								<DatePicker
									value={terminationDate}
									onChange={(date) => setTerminationDate(date)}
								/>
							</div>
							<div>
								<Label htmlFor="lastWorkingDay">Last Working Day *</Label>
								<DatePicker
									value={lastWorkingDay}
									onChange={(date) => setLastWorkingDay(date)}
								/>
							</div>
						</div>

						<div>
							<Label htmlFor="reason">Reason *</Label>
							<Textarea
								id="reason"
								placeholder="Detailed reason for termination (min 10 characters)"
								value={terminationReason}
								onChange={(e) => setTerminationReason(e.target.value)}
								rows={3}
							/>
						</div>

						<div className="flex justify-end gap-3 pt-4 border-t">
							<Button
								type="button"
								variant="outline"
								onClick={() => setTerminationEmployee(null)}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={handleSubmitTermination}
								disabled={
									createTerminationMutation.isPending ||
									submitTerminationMutation.isPending
								}>
								{createTerminationMutation.isPending ||
								submitTerminationMutation.isPending
									? "Processing..."
									: "Submit Termination Request"}
							</Button>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
