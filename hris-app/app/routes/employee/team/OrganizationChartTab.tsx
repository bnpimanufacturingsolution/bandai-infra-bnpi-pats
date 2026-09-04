import {
	useCallback,
	useState,
	useMemo,
	useEffect,
	useLayoutEffect,
	useRef,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
	useEmployees,
	useEmployee,
	useOrganizationReportingCounts,
} from "~/lib/hooks/useEmployees";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { Button } from "~/components/atoms/Button";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { SearchableSelect, type SearchableSelectOption } from "~/components/ui/searchable-select";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import {
	Users,
	Building,
	ChevronDown,
	ChevronRight,
	ZoomIn,
	ZoomOut,
	X,
	Printer,
	Maximize2,
	Minimize2,
} from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import { OrgReassignManagerPanel } from "./OrgReassignManagerPanel";
import {
	buildOrganizationReportingDeepLink,
	type Employee as BaseEmployee,
	type OrganizationReportingCountKey,
} from "~/services/employees.service";
import type { Department } from "~/services/departments.service";

interface Employee extends BaseEmployee {
	reportTo?: {
		id: string;
		employeeId?: string;
		firstName?: string;
		lastName?: string;
		email?: string;
		person?: {
			personalInfo?: {
				firstName: string;
				lastName: string;
				middleName?: string;
			};
		};
	} | null;
}

interface TreeNode {
	employee: Employee;
	children: TreeNode[];
	level: number;
}

const MIN_EFFECTIVE_SCALE = 0.05;
const MAX_EFFECTIVE_SCALE = 3;
const ZOOM_STEP = 0.15;
const FIT_PADDING_RATIO = 0.94;
const MIN_FIT_SCALE = 0.12;
const PRESENTATION_SCALE = 0.35;
const SCALE_EPSILON = 0.001;
const FULL_ORG_CHART_LIMIT = 5000;
const ORG_CHART_FIELDS =
	"id,userId,person.personalInfo,person.contactInfo,employeeId,employmentHireDate,employmentTerminationDate,department,departmentId,level,position,employmentStatus,reportToId,reportTo.person.personalInfo,reportTo.id";
const ORG_CHART_MANAGER_FIELDS =
	"id,userId,role,person.personalInfo,person.contactInfo,employeeId,employmentHireDate,employmentTerminationDate,department,departmentId,level,position,employmentStatus,employmentType,probationEndDate,reportToId,reportTo.person.personalInfo,reportTo.id";

function getFitScale(container: HTMLDivElement, content: HTMLDivElement) {
	const containerWidth = container.clientWidth;
	const containerHeight = container.clientHeight;
	const contentWidth = content.scrollWidth;
	const contentHeight = content.scrollHeight;

	if (!containerWidth || !containerHeight || !contentWidth || !contentHeight) {
		return 1;
	}

	const scaleX = (containerWidth * FIT_PADDING_RATIO) / contentWidth;
	const scaleY = (containerHeight * FIT_PADDING_RATIO) / contentHeight;
	return Math.max(MIN_FIT_SCALE, Math.min(scaleX, scaleY, 1));
}

// --- Components ---

function EmployeeNode({
	node,
	isExpanded,
	onToggle,
	onSelect,
	onOpenProfile,
	hasChildren,
	isFocused,
}: {
	node: TreeNode;
	isExpanded: boolean;
	onToggle: () => void;
	onSelect: () => void;
	onOpenProfile: () => void;
	hasChildren: boolean;
	isFocused: boolean;
}) {
	const { employee, level } = node;
	const firstName = employee.person?.personalInfo?.firstName || "";
	const lastName = employee.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim() || employee.employeeId;
	const position = employee.position?.title || "No Position";
	const department = employee.department?.name;
	const directReportCount = node.children.length;

	// Visual styles based on level/hierarchy
	const getLevelStyles = (lvl: number) => {
		switch (lvl) {
			case 0: // Root/Manager
				return {
					border: "border-orange-500",
					bg: "bg-white",
					header: "bg-orange-50",
					text: "text-gray-900",
					avatar: "bg-orange-600",
				};
			case 1: // Direct Reports
				return {
					border: "border-gray-400",
					bg: "bg-white",
					header: "bg-gray-50",
					text: "text-gray-800",
					avatar: "bg-gray-700",
				};
			default: // Others
				return {
					border: "border-gray-300",
					bg: "bg-white",
					header: "bg-gray-50",
					text: "text-gray-700",
					avatar: "bg-gray-500",
				};
		}
	};

	const styles = getLevelStyles(level);
	const avatarUrl = String(employee.user?.avatar || "").trim();

	return (
		<div className="flex flex-col items-center z-10 relative group">
			<div
				className={`
                    relative flex flex-col items-center w-56 rounded-lg border-t-4 shadow-sm hover:shadow-md transition-all duration-150
                    cursor-pointer
                    ${styles.border} ${styles.bg}
                    ${isFocused ? "ring-2 ring-orange-200 shadow-md border-orange-500" : ""}
				`}
				data-employee-id={employee.id}
				data-orgchart-card="true"
				onClick={onSelect}
				onContextMenu={(event) => {
					event.preventDefault();
					onOpenProfile();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect();
					}
				}}
				role="button"
				tabIndex={0}
				title="Click to focus. Right-click to view profile.">
				{/* Avatar - Main Attraction */}
				<div className="pt-3 mb-2">
					<EmployeeAvatar
						src={avatarUrl}
						alt={fullName}
						size="xl"
					/>
				</div>

				{/* Name and Position */}
				<div className="flex flex-col items-center px-3 pb-2 text-center">
					<h3 className={`font-bold text-sm truncate w-full ${styles.text}`}>
						{fullName}
					</h3>
					<p className="text-xs text-gray-500 truncate mt-0.5 w-full">{position}</p>
					{directReportCount > 0 && (
						<p className="mt-1 text-[11px] font-medium text-gray-500">
							{directReportCount} direct report{directReportCount === 1 ? "" : "s"}
						</p>
					)}
				</div>

				{/* Department */}
				{department && (
					<div className="w-full px-3 pb-2 border-t border-gray-100 pt-2">
						<div className="flex items-center gap-2 justify-center text-xs text-gray-600">
							<Building size={12} className="text-gray-400 shrink-0" />
							<span className="truncate text-center">{department}</span>
						</div>
					</div>
				)}

				{/* Expand/Collapse Icon */}
				{hasChildren && (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onToggle();
						}}
						className={`pb-2 transition-colors ${isFocused ? "text-primary" : "text-gray-400 hover:text-gray-600"}`}>
						{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					</button>
				)}
			</div>
		</div>
	);
}

function RecursiveTreeNode({
	node,
	expandedNodes,
	toggleNode,
	selectNode,
	openProfile,
	focusedEmployeeId,
}: {
	node: TreeNode;
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	selectNode: (id: string) => void;
	openProfile: (id: string) => void;
	focusedEmployeeId?: string | null;
}) {
	const isExpanded = expandedNodes.has(node.employee.id);
	const hasChildren = node.children && node.children.length > 0;

	return (
		<div className="flex flex-col items-center">
			<EmployeeNode
				node={node}
				isExpanded={isExpanded}
				onToggle={() => toggleNode(node.employee.id)}
				onSelect={() => selectNode(node.employee.id)}
				onOpenProfile={() => openProfile(node.employee.id)}
				hasChildren={hasChildren}
				isFocused={focusedEmployeeId === node.employee.id}
			/>

			{hasChildren && isExpanded && (
				<div className="flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-200">
					{/* Vertical line connector */}
					<div className="w-px h-8 bg-gray-300"></div>

					{/* Horizontal Connector for multiple children */}
					<div className="flex items-start justify-center relative">
						{/* Only draw horizontal bar if more than 1 child */}
						{node.children.length > 1 && (
							<div
								className="absolute top-0 h-px bg-gray-300 left-0 right-0 mx-auto w-full"
								// This is tricky in CSS flex, explicit width calculation is better or pseudo elements
								// Simplified approach:
								style={{
									left: "calc(50% / var(--child-count))" /* Placeholder */,
								}}
							/>
						)}

						<div className="flex space-x-8 relative">
							{/* Horizontal bar implementation via absolute positioning on children container */}
							{node.children.length > 1 && (
								<div className="absolute top-0 left-[calc(16rem/2)] right-[calc(16rem/2)] h-px bg-gray-300 transform -translate-y-px" />
							)}

							{node.children.map((child, idx) => (
								<div
									key={child.employee.id}
									className="flex flex-col items-center relative">
									{/* Vertical line for child */}
									<div className="w-px h-6 bg-gray-300 -mt-px mb-2"></div>
									<RecursiveTreeNode
										node={child}
										expandedNodes={expandedNodes}
										toggleNode={toggleNode}
										selectNode={selectNode}
										openProfile={openProfile}
										focusedEmployeeId={focusedEmployeeId}
									/>
									{/* Hozizontal connecting lines fix */}
									{node.children.length > 1 && (
										<>
											{idx === 0 && (
												<div
													className="absolute top-0 right-1/2 w-[calc(50%+1rem)] h-px bg-white -mt-px"
													style={{ display: "none" }}
												/>
											)}
											{/* ^ Actual logic needs to be cleaner. The absolute div above is simpler. 
                                              Actually, a common trick is:
                                              Parent -> Line Down
                                              Children Container -> Flex
                                              Child -> 
                                                Line Up (connects to horizontal)
                                                Horizontal Line (connects to siblings)
                                            */}
										</>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// Fixed Tree Node with better lines
function TreeNodeComponent({
	node,
	expandedNodes,
	toggleNode,
	selectNode,
	openProfile,
	focusedEmployeeId,
}: {
	node: TreeNode;
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	selectNode: (id: string) => void;
	openProfile: (id: string) => void;
	focusedEmployeeId?: string | null;
}) {
	const isExpanded = expandedNodes.has(node.employee.id);
	const hasChildren = node.children && node.children.length > 0;

	return (
		<div className="flex flex-col items-center">
			<EmployeeNode
				node={node}
				isExpanded={isExpanded}
				onToggle={() => toggleNode(node.employee.id)}
				onSelect={() => selectNode(node.employee.id)}
				onOpenProfile={() => openProfile(node.employee.id)}
				hasChildren={hasChildren}
				isFocused={focusedEmployeeId === node.employee.id}
			/>

			{hasChildren && isExpanded && (
				<div className="flex flex-col items-center pt-2">
					<div className="w-px h-6 bg-gray-300" />
					<div className="flex items-start justify-center">
						{node.children.map((child, index) => (
							<div
								key={child.employee.id}
								className="relative flex flex-col items-center px-4 pt-6">
								{node.children.length > 1 && (
									<>
										{index > 0 && (
											<div className="absolute left-0 right-1/2 top-0 h-px bg-gray-300" />
										)}
										{index < node.children.length - 1 && (
											<div className="absolute left-1/2 right-0 top-0 h-px bg-gray-300" />
										)}
									</>
								)}
								<div className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-gray-300" />
								<TreeNodeComponent
									node={child}
									expandedNodes={expandedNodes}
									toggleNode={toggleNode}
									selectNode={selectNode}
									openProfile={openProfile}
									focusedEmployeeId={focusedEmployeeId}
								/>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function ReportingMetricLink({
	label,
	value,
	to,
	isLoading,
	tone = "neutral",
}: {
	label: string;
	value: number;
	to: string;
	isLoading?: boolean;
	tone?: "neutral" | "warning";
}) {
	const toneClass =
		tone === "warning"
			? "text-amber-700 hover:text-amber-800"
			: "text-gray-700 hover:text-gray-950";

	return (
		<Link
			to={to}
			className={`inline-flex items-baseline gap-1.5 text-xs underline-offset-4 transition-colors hover:underline ${toneClass}`}
			title={`Open ${label.toLowerCase()}`}>
			<span className="font-medium">{label}</span>
			<span className="font-semibold tabular-nums">
				{isLoading ? "--" : value.toLocaleString()}
			</span>
		</Link>
	);
}

export default function OrganizationChartTab({
	employeeId,
	mode = "team",
}: {
	employeeId?: string;
	mode?: "team" | "full";
}) {
	const { user } = useAuth();
	const navigate = useNavigate();
	const currentEmployeeId = user?.metadata?.employee?.id;
	const [searchParams, setSearchParams] = useSearchParams();
	const [fitScale, setFitScale] = useState(1);
	const [zoomLevel, setZoomLevel] = useState(1);
	const [viewMode, setViewMode] = useState<"presentation" | "fit" | "manual">("presentation");
	const [isPanning, setIsPanning] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const chartDisplayRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const pendingScrollBehaviorRef = useRef<ScrollBehavior>("auto");
	const dragStateRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		scrollLeft: number;
		scrollTop: number;
	} | null>(null);
	const focusEmployeeId = searchParams.get("focus");
	const departmentFilter = searchParams.get("departmentId") || undefined;
	const positionFilter = searchParams.get("positionId") || undefined;
	const expandedParam = searchParams.get("expanded") || "";
	const countScopeDepartmentId =
		mode === "full" && departmentFilter && departmentFilter !== "all"
			? departmentFilter
			: null;

	// Initialize expanded nodes from URL or default
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
		if (expandedParam) {
			return new Set(expandedParam.split(",").filter(Boolean));
		}
		return new Set();
	});

	// Determine team-mode root/filter using reporting relationship:
	// If I have a manager, root/filter on my manager.
	// If I don't have a manager, root/filter on myself.
	const userManagerId = (user?.metadata?.employee as any)?.reportTo?.id;
	let teamFilter: string | undefined;

	if (mode === "team") {
		const teamBranches = [
			...(userManagerId ? [`id:${userManagerId}`, `reportToId:${userManagerId}`] : []),
			...(currentEmployeeId ? [`reportToId:${currentEmployeeId}`] : []),
		];
		if (!userManagerId && currentEmployeeId) {
			teamBranches.unshift(`id:${currentEmployeeId}`);
		}
		teamFilter = teamBranches.length > 0 ? `or(${teamBranches.join(";")})` : undefined;
	}

	// Fetch employees
	const { data: teamMembersResponse, isLoading: isLoadingTeam } = useEmployees({
		page: 1,
		limit: mode === "full" ? FULL_ORG_CHART_LIMIT : 1000,
		filter: teamFilter,
		fields: ORG_CHART_FIELDS,
		document: "true",
		pagination: "true",
		count: "false",
	});

	// Fetch the team-mode root employee (manager when present, otherwise self).
	const rootIdToFetch = mode === "team" ? userManagerId || currentEmployeeId : undefined;

	const { data: rootEmployee, isLoading: isLoadingRoot } = useEmployee(
		rootIdToFetch || "",
		ORG_CHART_FIELDS,
	);

	const isLoading = isLoadingTeam || (!!rootIdToFetch && isLoadingRoot);
	const { data: departmentsData } = useDepartments(
		{
			page: 1,
			limit: 100,
			sort: "name",
			order: "asc",
		},
		{ enabled: mode === "full" },
	);
	const departments = ((departmentsData as any)?.departments || []) as Department[];
	const { data: positionsData } = usePositions(
		{
			page: 1,
			limit: 1000,
			sort: "title",
			order: "asc",
		},
		{ enabled: mode === "full" },
	);
	const positions = useMemo(() => {
		const raw = (positionsData as any)?.positions || (positionsData as any)?.data || [];
		return (Array.isArray(raw) ? raw : raw?.positions || []) as any[];
	}, [positionsData]);
	const { data: managersResponse } = useEmployees({
		page: 1,
		limit: mode === "full" ? FULL_ORG_CHART_LIMIT : 100,
		filter: "directReports:exists",
		fields: ORG_CHART_MANAGER_FIELDS,
		document: "true",
		pagination: "true",
		count: "false",
	});
	const { data: reportingCounts, isLoading: isLoadingReportingCounts } =
		useOrganizationReportingCounts(
			{ departmentId: countScopeDepartmentId },
			{ enabled: mode === "full" },
		);

	const employees = useMemo(() => {
		const fetchedEmployees =
			teamMembersResponse?.employees ||
			(Array.isArray(teamMembersResponse?.data)
				? teamMembersResponse.data
				: teamMembersResponse?.data?.employees || []);

		if (mode === "team" && rootEmployee) {
			// If we fetched a root employee (manager or self), verify they aren't already in the list
			// (unlikely if fetching by reportToId, but good safety)
			const exists = fetchedEmployees.some((e: any) => e.id === rootEmployee.id);
			if (!exists) {
				return [rootEmployee, ...fetchedEmployees];
			}
		}

		return fetchedEmployees;
	}, [teamMembersResponse, rootEmployee, mode]);

	const resolveEmployeeName = (employee: Employee) =>
		`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
		employee.employeeId;

	const ceoEmployee = useMemo(() => {
		if (employees.length === 0) return undefined;

		const ranked = [...employees]
			.map((employee: Employee) => {
				const title = (employee.position?.title || "").toLowerCase();
				const hasCeoTitle =
					title.includes("ceo") ||
					title.includes("chief executive") ||
					title.includes("president");
				const isRoot = !employee.reportTo?.id;
				return {
					employee,
					score: (hasCeoTitle ? 100 : 0) + (isRoot ? 10 : 0),
				};
			})
			.sort((a, b) => b.score - a.score);

		return (
			ranked[0]?.employee || employees.find((employee: Employee) => !employee.reportTo?.id)
		);
	}, [employees]);

	const selectedDepartment = useMemo(
		() => departments.find((department) => department.id === departmentFilter),
		[departmentFilter, departments],
	);

	const isHrDepartmentSelected = Boolean(selectedDepartment?.isHr);

	const departmentEmployees = useMemo(() => {
		if (mode !== "full" || !departmentFilter || departmentFilter === "all") return employees;

		return employees.filter(
			(employee: Employee) =>
				employee.department?.id === departmentFilter ||
				employee.departmentId === departmentFilter,
		);
	}, [departmentFilter, employees, mode]);

	const chartEmployees = useMemo(() => {
		if (mode !== "full") return employees;

		let scopedEmployees = [...employees];

		if (departmentFilter && departmentFilter !== "all") {
			scopedEmployees = scopedEmployees.filter(
				(employee: Employee) =>
					employee.department?.id === departmentFilter ||
					employee.departmentId === departmentFilter,
			);
		}

		if (positionFilter && positionFilter !== "all") {
			scopedEmployees = scopedEmployees.filter(
				(employee: Employee) =>
					employee.position?.id === positionFilter ||
					employee.positionId === positionFilter,
			);
		}

		if (isHrDepartmentSelected && ceoEmployee) {
			const alreadyIncluded = scopedEmployees.some(
				(employee) => employee.id === ceoEmployee.id,
			);
			if (!alreadyIncluded) {
				scopedEmployees.unshift(ceoEmployee);
			}
		}

		return scopedEmployees;
	}, [
		ceoEmployee,
		departmentFilter,
		positionFilter,
		employees,
		isHrDepartmentSelected,
		mode,
	]);

	const allManagers = useMemo(() => {
		const fetchedManagers =
			managersResponse?.employees ||
			(Array.isArray(managersResponse?.data)
				? managersResponse.data
				: managersResponse?.data?.employees || []);

		return (fetchedManagers || []) as Employee[];
	}, [managersResponse]);

	const managerOptionsEmployees = useMemo(() => {
		if (mode !== "full") return [];

		const scopedManagers =
			!departmentFilter || departmentFilter === "all"
				? allManagers
				: allManagers.filter(
						(employee: Employee) =>
							employee.department?.id === departmentFilter ||
							employee.departmentId === departmentFilter,
					);

		if (isHrDepartmentSelected && ceoEmployee) {
			const alreadyIncluded = scopedManagers.some(
				(employee) => employee.id === ceoEmployee.id,
			);
			if (!alreadyIncluded) {
				return [ceoEmployee, ...scopedManagers];
			}
		}

		return scopedManagers;
	}, [allManagers, ceoEmployee, departmentFilter, isHrDepartmentSelected, mode]);

	const employeeMap = useMemo(() => {
		const map = new Map<string, Employee>();
		employees.forEach((employee: Employee) => {
			map.set(employee.id, employee);
		});
		return map;
	}, [employees]);

	const managerOptionIds = useMemo(
		() => new Set(managerOptionsEmployees.map((employee: Employee) => employee.id)),
		[managerOptionsEmployees],
	);

	const childrenIdMap = useMemo(() => {
		const map = new Map<string, string[]>();
		employees.forEach((employee: Employee) => {
			const managerId = employee.reportTo?.id;
			if (!managerId) return;
			const siblings = map.get(managerId) || [];
			siblings.push(employee.id);
			map.set(managerId, siblings);
		});
		return map;
	}, [employees]);

	const getNearestManagerId = (employeeIdToTrace?: string | null) => {
		if (!employeeIdToTrace) return undefined;
		if (managerOptionIds.has(employeeIdToTrace)) return employeeIdToTrace;

		const seen = new Set<string>();
		let current = employeeMap.get(employeeIdToTrace);

		while (current?.reportTo?.id && employeeMap.has(current.reportTo.id)) {
			const managerId = current.reportTo.id;
			if (seen.has(managerId)) break;
			if (managerOptionIds.has(managerId)) return managerId;
			seen.add(managerId);
			current = employeeMap.get(managerId);
		}

		return undefined;
	};

	const _legacySearchOptions = useMemo<SearchableSelectOption[]>(() => {
		if (mode !== "full") return [];

		return [...managerOptionsEmployees]
			.sort((a, b) => {
				const aName = resolveEmployeeName(a);
				const bName = resolveEmployeeName(b);
				return aName.localeCompare(bName, undefined, { sensitivity: "base" });
			})
			.map((employee: Employee) => {
				const fullName = resolveEmployeeName(employee);
				const position = employee.position?.title || "No Position";
				const department = employee.department?.name || "No Department";

				return {
					value: employee.id,
					label: `${fullName} (${employee.employeeId}) • ${position} • ${department}`,
				};
			});
	}, [managerOptionsEmployees, mode]);

	const buildTree = useMemo<TreeNode[]>(() => {
		if (!chartEmployees || chartEmployees.length === 0) return [];

		const employeeMap = new Map<string, Employee>();
		const childrenMap = new Map<string, Employee[]>();

		// Index
		chartEmployees.forEach((emp: Employee) => {
			employeeMap.set(emp.id, emp);
		});

		// Map relationships
		chartEmployees.forEach((emp: Employee) => {
			const reportToId = emp.reportTo?.id;
			if (reportToId && employeeMap.has(reportToId)) {
				const siblings = childrenMap.get(reportToId) || [];
				siblings.push(emp);
				childrenMap.set(reportToId, siblings);
			}
		});

		const constructNode = (emp: Employee, level: number, visited: Set<string>): TreeNode => {
			// Prevent infinite recursion by tracking visited nodes
			if (visited.has(emp.id)) {
				console.warn(`Circular reference detected for employee ${emp.id}`, emp);
				return {
					employee: emp,
					level,
					children: [], // Don't recurse if we've seen this node before
				};
			}

			// Mark this node as visited
			visited.add(emp.id);

			const children = childrenMap.get(emp.id) || [];
			return {
				employee: emp,
				level,
				children: children.map((child) => constructNode(child, level + 1, visited)),
			};
		};

		// If employeeId is provided, show that person and their direct reports
		if (employeeId) {
			// When viewing self and reportTo exists, show manager as root regardless of role
			const reportTo = (user?.metadata as any)?.employee?.reportTo;
			const isViewingSelf = (user?.metadata as any)?.employee?.id === employeeId;

			if (isViewingSelf && reportTo) {
				// Try to find the manager in the loaded employees
				let manager = chartEmployees.find((e: Employee) => e.id === reportTo.id);

				// If manager isn't in the list (e.g. wasn't fetched), construct a temporary one from metadata
				if (!manager) {
					manager = {
						id: reportTo.id,
						employeeId: "MANAGER",
						organizationId: "",
						personId: "",
						userId: "",
						employmentHireDate: new Date().toISOString(),
						employmentTerminationDate: undefined,
						employmentStatus: "ACTIVE",
						employmentType: "REGULAR",
						departmentId: "dept",
						positionId: "mgr",
						defaultScheduleId: "",
						workLocation: "ONSITE",
						basicSalary: 0,
						currency: "PHP",
						payFrequency: "MONTHLY",
						isDeleted: false,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						person: {
							id: "",
							organizationId: "",
							personalInfo: {
								firstName: reportTo.firstName || "",
								lastName: reportTo.lastName || "",
								dateOfBirth: "",
								gender: "prefer_not_to_say",
							},
							contactInfo: {
								email: reportTo.email || "",
								phones: [],
								address: [],
							},
							identification: {
								type: "national_id",
								number: "",
								issuingCountry: "",
								expiryDate: "",
							},
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							isDeleted: false,
						},
						position: {
							id: "mgr",
							organizationId: "",
							title: "Supervisor",
							code: "MGR",
							departmentId: "dept",
							isActive: true,
							isDeleted: false,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						},
						department: {
							id: "dept",
							organizationId: "",
							name: "Management",
							code: "MGT",
							managerId: reportTo.id,
							isActive: true,
							isDefault: false,
							isDeleted: false,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						},
						reportTo: null,
						documents: [],
					} as unknown as Employee;
				}

				if (manager) {
					return [constructNode(manager, 0, new Set<string>())];
				}
			}

			// Otherwise show the employeeId as root
			const rootEmployee = chartEmployees.find((e: Employee) => e.id === employeeId);
			if (rootEmployee) {
				return [constructNode(rootEmployee, 0, new Set<string>())];
			}
		}

		// Otherwise show all root employees (those without reportTo)
		const roots: Employee[] = [];
		const visited = new Set<string>();

		// Helper to detect if an employee is part of a reporting cycle
		const isInCycle = (empId: string, chain: Set<string> = new Set()): boolean => {
			if (chain.has(empId)) return true; // Found a cycle
			if (visited.has(empId)) return false; // Already checked, not a cycle

			const emp = employeeMap.get(empId);
			if (!emp || !emp.reportTo?.id) return false; // No manager, not in cycle

			chain.add(empId);
			const result = isInCycle(emp.reportTo.id, chain);
			chain.delete(empId);

			if (!result) visited.add(empId);
			return result;
		};

		chartEmployees.forEach((emp: Employee) => {
			const reportToId = emp.reportTo?.id;

			// Add as root if:
			// 1. No reportTo, OR
			// 2. reportTo points to non-existent employee, OR
			// 3. Employee is part of a reporting cycle (treat top of cycle as root)
			if (!reportToId || !employeeMap.has(reportToId)) {
				roots.push(emp);
			} else if (isInCycle(emp.id)) {
				// This employee is part of a cycle - add them as root if not already added
				const cycleRoot = roots.find((r) => isInCycle(r.id) && r.id === emp.id);
				if (!cycleRoot) {
					roots.push(emp);
				}
			}
		});

		// If still no roots found (all employees in cycle), pick one arbitrarily
		if (roots.length === 0 && chartEmployees.length > 0) {
			console.warn(
				"No root employees found, all may be in reporting cycles. Using first employee as root.",
			);
			roots.push(chartEmployees[0]);
		}

		return roots.map((root) => constructNode(root, 0, new Set<string>()));
	}, [chartEmployees, employeeId, user?.metadata, user?.role]);

	const getAncestors = (employeeIdToTrace: string) => {
		const ancestors: string[] = [];
		const seen = new Set<string>();
		let current = employeeMap.get(employeeIdToTrace);

		while (current?.reportTo?.id && employeeMap.has(current.reportTo.id)) {
			const managerId = current.reportTo.id;
			if (seen.has(managerId)) break;
			seen.add(managerId);
			ancestors.unshift(managerId);
			current = employeeMap.get(managerId);
		}

		return ancestors;
	};

	const getDescendants = (employeeIdToTrace: string) => {
		const descendants = new Set<string>();
		const queue = [...(childrenIdMap.get(employeeIdToTrace) || [])];

		while (queue.length > 0) {
			const nextId = queue.shift();
			if (!nextId || descendants.has(nextId)) continue;
			descendants.add(nextId);
			queue.push(...(childrenIdMap.get(nextId) || []));
		}

		return descendants;
	};

	const getFocusExpandedIds = (employeeIdToTrace: string) => {
		const ancestorIds = getAncestors(employeeIdToTrace);
		const descendantIds = Array.from(getDescendants(employeeIdToTrace));
		return [...new Set([...ancestorIds, employeeIdToTrace, ...descendantIds])];
	};

	const managerBranchStats = useMemo(() => {
		if (mode !== "full") return [];

		return managerOptionsEmployees
			.map((employee: Employee) => {
				const directReports = childrenIdMap.get(employee.id) || [];
				const descendants = getDescendants(employee.id);
				return {
					id: employee.id,
					directReports: directReports.length,
					descendants: descendants.size,
				};
			})
			.filter((branch) => branch.directReports > 0)
			.sort(
				(a, b) =>
					b.descendants - a.descendants ||
					b.directReports - a.directReports ||
					a.id.localeCompare(b.id),
			);
	}, [childrenIdMap, managerOptionsEmployees, mode]);

	const preferredFallbackManagerId = managerBranchStats[0]?.id || "";
	const managerBranchStatsById = useMemo(
		() => new Map(managerBranchStats.map((branch) => [branch.id, branch])),
		[managerBranchStats],
	);
	const noManagerEmployeeCount = useMemo(
		() =>
			employees.filter((employee: Employee) => !employee.reportTo?.id).length,
		[employees],
	);
	const standaloneEmployeeCount = useMemo(
		() =>
			employees.filter(
				(employee: Employee) =>
					!employee.reportTo?.id && !(childrenIdMap.get(employee.id) || []).length,
			).length,
		[childrenIdMap, employees],
	);
	const reportingMetricValues = {
		totalEmployees: reportingCounts?.totalEmployees ?? chartEmployees.length,
		withDirectReports: reportingCounts?.withDirectReports ?? managerBranchStats.length,
		withoutImmediateSupervisor:
			reportingCounts?.withoutImmediateSupervisor ?? noManagerEmployeeCount,
	};
	const getReportingMetricLink = (key: OrganizationReportingCountKey) =>
		buildOrganizationReportingDeepLink(key, {
			departmentId: countScopeDepartmentId,
		});
	const focusedEmployee = focusEmployeeId ? employeeMap.get(focusEmployeeId) : undefined;
	const focusedEmployeeIsUnmapped =
		Boolean(focusedEmployee) &&
		!focusedEmployee?.reportTo?.id &&
		!(childrenIdMap.get(focusedEmployee?.id || "") || []).length;
	const branchSearchOptions = useMemo<SearchableSelectOption[]>(() => {
		if (mode !== "full") return [];

		const rankedIds = new Set(managerBranchStats.map((branch) => branch.id));
		const rankedManagers = managerBranchStats
			.map((branch) => managerOptionsEmployees.find((employee) => employee.id === branch.id))
			.filter(Boolean) as Employee[];
		const remainingManagers = managerOptionsEmployees
			.filter((employee) => !rankedIds.has(employee.id))
			.sort((a, b) =>
				resolveEmployeeName(a).localeCompare(resolveEmployeeName(b), undefined, {
					sensitivity: "base",
				}),
			);

		return [...rankedManagers, ...remainingManagers].map((employee: Employee) => {
			const fullName = resolveEmployeeName(employee);
			const position = employee.position?.title || "No Position";
			const department = employee.department?.name || "No Department";
			const branch = managerBranchStatsById.get(employee.id);
			const branchSize = branch ? branch.descendants + 1 : 1;
			const directReports = branch?.directReports || 0;

			return {
				value: employee.id,
				label: `${fullName} (${employee.employeeId})`,
				description: `${position} / ${department}`,
				badge:
					directReports > 0
						? `${branchSize} nodes, ${directReports} direct`
						: "No direct reports",
			};
		});
	}, [managerBranchStats, managerBranchStatsById, managerOptionsEmployees, mode]);

	const getBranchPreviewExpandedIds = (branchRootId?: string | null, targetId?: string | null) => {
		if (!branchRootId) return [];

		const directReports = childrenIdMap.get(branchRootId) || [];
		const branchSize = getDescendants(branchRootId).size + 1;
		const targetAncestors = targetId && employeeMap.has(targetId) ? getAncestors(targetId) : [];
		const targetIsInBranch =
			targetId === branchRootId || targetAncestors.includes(branchRootId);

		if (targetIsInBranch && branchSize <= 40) {
			return getFocusExpandedIds(branchRootId);
		}

		if (targetIsInBranch) {
			return [...new Set([branchRootId, ...targetAncestors, targetId].filter(Boolean))] as string[];
		}

		return [...new Set([branchRootId, ...directReports.slice(0, 12)].filter(Boolean))];
	};

	const buildFocusedBranch = (nodes: TreeNode[], targetId: string): TreeNode[] => {
		for (const node of nodes) {
			if (node.employee.id === targetId) {
				return [node];
			}

			const matchingChildren = buildFocusedBranch(node.children, targetId);
			if (matchingChildren.length > 0) {
				return [
					{
						...node,
						children: matchingChildren,
					},
				];
			}
		}

		return [];
	};

	const defaultRootId = useMemo(() => {
		if (departmentFilter && departmentFilter !== "all") {
			if (isHrDepartmentSelected && ceoEmployee?.id) return ceoEmployee.id;
			return buildTree[0]?.employee.id;
		}
		if (ceoEmployee?.id) return ceoEmployee.id;
		return buildTree[0]?.employee.id;
	}, [buildTree, ceoEmployee, departmentFilter, isHrDepartmentSelected]);

	const selectedManagerId = useMemo(() => {
		if (mode !== "full") return focusEmployeeId || "";

		const nearestManagerId = getNearestManagerId(focusEmployeeId);
		if (nearestManagerId) return nearestManagerId;

		if (defaultRootId && managerOptionIds.has(defaultRootId)) return defaultRootId;

		return preferredFallbackManagerId || managerOptionsEmployees[0]?.id || "";
	}, [
		defaultRootId,
		focusEmployeeId,
		managerOptionIds,
		managerOptionsEmployees,
		mode,
		preferredFallbackManagerId,
	]);
	const selectedBranchStats = selectedManagerId
		? managerBranchStatsById.get(selectedManagerId)
		: undefined;

	const focusedBranchTree = useMemo(() => {
		if (mode !== "full") return buildTree;
		const branchRootId = selectedManagerId || focusEmployeeId;
		if (!branchRootId) return buildTree;

		const branch = buildFocusedBranch(buildTree, branchRootId);
		return branch.length > 0 ? branch : buildTree;
	}, [buildTree, focusEmployeeId, mode, selectedManagerId]);

	const visibleBranchNodeCount = useMemo(() => {
		const queue = [...focusedBranchTree];
		let count = 0;
		while (queue.length > 0) {
			const node = queue.shift();
			if (!node) continue;
			count += 1;
			queue.push(...node.children);
		}
		return count;
	}, [focusedBranchTree]);

	const mappedReportingLinkCount = useMemo(
		() => employees.filter((employee: Employee) => Boolean(employee.reportTo?.id)).length,
		[employees],
	);

	const isAllExpanded =
		chartEmployees && chartEmployees.length > 0 && expandedNodes.size === chartEmployees.length;
	const effectiveScale = fitScale * zoomLevel;
	const effectiveScalePercent = Math.max(Math.round(effectiveScale * 100), 1);
	const isFitView = viewMode === "fit";
	const isAtMinZoom = effectiveScale <= MIN_EFFECTIVE_SCALE + SCALE_EPSILON;
	const isAtMaxZoom = effectiveScale >= MAX_EFFECTIVE_SCALE - SCALE_EPSILON;

	const getPresentationZoomLevel = (nextFitScale: number) =>
		getZoomLevelForEffectiveScale(
			Math.max(PRESENTATION_SCALE, nextFitScale),
			nextFitScale,
		);

	const clampEffectiveScale = (scale: number) =>
		Math.min(MAX_EFFECTIVE_SCALE, Math.max(MIN_EFFECTIVE_SCALE, scale));

	const getZoomLevelForEffectiveScale = (scale: number, baseFitScale = fitScale) =>
		clampEffectiveScale(scale) / Math.max(baseFitScale, 0.01);

	const centerContainerScroll = (
		container: HTMLDivElement,
		behavior: ScrollBehavior = "auto",
	) => {
		const centeredLeft = Math.max((container.scrollWidth - container.clientWidth) / 2, 0);

		if (behavior === "auto") {
			container.scrollLeft = centeredLeft;
			container.scrollTop = 0;
			return;
		}

		container.scrollTo({
			left: centeredLeft,
			top: 0,
			behavior,
		});
	};

	const applyViewportPreset = useCallback(
		(behavior = pendingScrollBehaviorRef.current) => {
			const container = containerRef.current;
			const content = contentRef.current;
			if (!container || !content) return;

			const nextFitScale = getFitScale(container, content);
			setFitScale(nextFitScale);

			if (viewMode === "manual") {
				setZoomLevel((prev) =>
					getZoomLevelForEffectiveScale(fitScale * prev, nextFitScale),
				);
				pendingScrollBehaviorRef.current = "auto";
				return;
			}

			const nextZoomLevel = viewMode === "fit" ? 1 : getPresentationZoomLevel(nextFitScale);
			setZoomLevel(nextZoomLevel);
			centerContainerScroll(container, behavior);
			pendingScrollBehaviorRef.current = "auto";
		},
		[viewMode],
	);

	useEffect(() => {
		if (mode !== "full" || employees.length === 0) return;

		const params = new URLSearchParams(searchParams);
		let changed = false;

		const nextFocusId = defaultRootId;

		if (!focusEmployeeId && nextFocusId) {
			params.set("focus", nextFocusId);
			changed = true;
		}

		if (changed) {
			params.delete("expanded");
			setSearchParams(params, { replace: true });
		}
	}, [
		ceoEmployee,
		defaultRootId,
		employeeMap,
		employees.length,
		focusEmployeeId,
		isHrDepartmentSelected,
		mode,
		searchParams,
		setSearchParams,
	]);

	// Sync expanded state with URL and focused branch defaults
	useEffect(() => {
		if (!buildTree || buildTree.length === 0) return;

		if (expandedParam) {
			const urlExpanded = new Set(expandedParam.split(",").filter(Boolean));
			let changed = false;
			if (selectedManagerId && !urlExpanded.has(selectedManagerId)) {
				for (const id of getBranchPreviewExpandedIds(selectedManagerId, focusEmployeeId)) {
					urlExpanded.add(id);
				}
				changed = true;
			}
			setExpandedNodes(urlExpanded);
			if (changed) {
				const params = new URLSearchParams(searchParams);
				params.set("expanded", Array.from(urlExpanded).join(","));
				setSearchParams(params, { replace: true });
			}
			return;
		}

		if (selectedManagerId) {
			const nextExpanded = getBranchPreviewExpandedIds(selectedManagerId, focusEmployeeId);
			setExpandedNodes(new Set(nextExpanded));

			const params = new URLSearchParams(searchParams);
			params.set("expanded", nextExpanded.join(","));
			setSearchParams(params, { replace: true });
			return;
		}

		const rootId = defaultRootId || buildTree[0].employee.id;
		setExpandedNodes(new Set([rootId]));
	}, [
		buildTree,
		defaultRootId,
		employeeMap,
		expandedParam,
		focusEmployeeId,
		searchParams,
		selectedManagerId,
		setSearchParams,
	]);

	useEffect(() => {
		if (!focusEmployeeId || mode !== "full" || viewMode !== "manual") return;

		const element = contentRef.current?.querySelector<HTMLElement>(
			`[data-employee-id="${focusEmployeeId}"]`,
		);
		element?.scrollIntoView({
			behavior: "auto",
			block: "center",
			inline: "center",
		});
	}, [expandedNodes, focusEmployeeId, focusedBranchTree, mode, viewMode]);

	useLayoutEffect(() => {
		applyViewportPreset();
	}, [
		applyViewportPreset,
		buildTree,
		departmentFilter,
		expandedNodes,
		focusEmployeeId,
		selectedManagerId,
		viewMode,
	]);

	useEffect(() => {
		const handleResize = () => {
			applyViewportPreset();
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [applyViewportPreset]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			const nextIsFullscreen = document.fullscreenElement === chartDisplayRef.current;
			setIsFullscreen(nextIsFullscreen);
			if (nextIsFullscreen) {
				requestAnimationFrame(() => applyViewportPreset("smooth"));
			}
		};

		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, [applyViewportPreset]);

	// Helpers
	const toggleNode = (id: string) => {
		setExpandedNodes((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);

			// Update URL with expanded state
			const params = new URLSearchParams(searchParams);
			if (next.size > 0) {
				params.set("expanded", Array.from(next).join(","));
			} else {
				params.delete("expanded");
			}
			setSearchParams(params, { replace: true });

			return next;
		});
	};

	const expandAll = () => {
		if (!chartEmployees) return;
		const allIds = chartEmployees.map((e: Employee) => e.id);
		setExpandedNodes(new Set(allIds));
		setViewMode("presentation");

		// Update URL
		const params = new URLSearchParams(searchParams);
		params.set("expanded", allIds.join(","));
		setSearchParams(params, { replace: true });
	};

	const resetView = () => {
		const params = new URLSearchParams(searchParams);
		const targetFocusId =
			mode === "full" ? selectedManagerId || focusEmployeeId || defaultRootId : defaultRootId;

		if (targetFocusId) {
			params.set("focus", targetFocusId);
		} else {
			params.delete("focus");
		}
		params.delete("managerId");
		setSearchParams(params, { replace: true });
		pendingScrollBehaviorRef.current = "smooth";
		if (viewMode === "presentation") {
			requestAnimationFrame(() => applyViewportPreset("smooth"));
			return;
		}
		setViewMode("presentation");
	};

	const handleFocusEmployee = (value: string) => {
		if (!value) {
			const params = new URLSearchParams(searchParams);
			params.delete("focus");
			params.delete("expanded");
			setSearchParams(params, { replace: true });
			setViewMode("presentation");
			return;
		}

		const nextExpanded = getBranchPreviewExpandedIds(value, value);
		const params = new URLSearchParams(searchParams);
		params.delete("managerId");
		params.set("focus", value);
		params.set("expanded", nextExpanded.join(","));
		setSearchParams(params, { replace: true });
		setExpandedNodes(new Set(nextExpanded));
		setViewMode("presentation");
	};

	const clearFocus = () => {
		const params = new URLSearchParams(searchParams);
		if (defaultRootId) {
			params.set("focus", defaultRootId);
		} else {
			params.delete("focus");
		}
		params.delete("expanded");
		setSearchParams(params, { replace: true });
		setViewMode("presentation");
	};

	const handleDepartmentChange = (value: string) => {
		const params = new URLSearchParams(searchParams);
		if (value === "all") {
			params.delete("departmentId");
		} else {
			params.set("departmentId", value);
		}
		params.delete("focus");
		params.delete("expanded");
		setSearchParams(params, { replace: true });
		setViewMode("presentation");
	};

	const handlePositionChange = (value: string) => {
		const params = new URLSearchParams(searchParams);
		if (value === "all" || !value) {
			params.delete("positionId");
		} else {
			params.set("positionId", value);
		}
		params.delete("focus");
		params.delete("expanded");
		setSearchParams(params, { replace: true });
		setViewMode("presentation");
	};

	const zoomIn = () => {
		setViewMode("manual");
		setZoomLevel((prev) =>
			getZoomLevelForEffectiveScale(fitScale * prev + ZOOM_STEP),
		);
	};

	const zoomOut = () => {
		setViewMode("manual");
		setZoomLevel((prev) =>
			getZoomLevelForEffectiveScale(fitScale * prev - ZOOM_STEP),
		);
	};

	const fitView = () => {
		pendingScrollBehaviorRef.current = "smooth";
		if (viewMode === "fit") {
			requestAnimationFrame(() => applyViewportPreset("smooth"));
			return;
		}
		setViewMode("fit");
	};

	const zoomAtPointer = (nextZoomLevel: number, clientX: number, clientY: number) => {
		const container = containerRef.current;
		const content = contentRef.current;
		if (!container || !content) {
			setZoomLevel(nextZoomLevel);
			return;
		}

		const rect = container.getBoundingClientRect();
		const pointerX = clientX - rect.left;
		const pointerY = clientY - rect.top;
		const previousScale = effectiveScale;
		const nextScale = fitScale * nextZoomLevel;
		const contentWidth = content.scrollWidth;
		const previousOffsetX = (contentWidth * (1 - previousScale)) / 2;
		const nextOffsetX = (contentWidth * (1 - nextScale)) / 2;
		const contentX =
			(pointerX + container.scrollLeft - previousOffsetX) / Math.max(previousScale, 0.001);
		const contentY = (pointerY + container.scrollTop) / Math.max(previousScale, 0.001);

		setViewMode("manual");
		setZoomLevel(nextZoomLevel);

		requestAnimationFrame(() => {
			const nextLeft = nextOffsetX + contentX * nextScale - pointerX;
			const nextTop = contentY * nextScale - pointerY;
			container.scrollLeft = Math.max(nextLeft, 0);
			container.scrollTop = Math.max(nextTop, 0);
		});
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleNativeWheel = (event: WheelEvent) => {
			const isZoomGesture = event.ctrlKey || event.metaKey;
			if (!isZoomGesture) {
				return;
			}

			if (event.cancelable) {
				event.preventDefault();
			}
			event.stopPropagation();

			const delta =
				event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
			const direction = delta < 0 ? 1 : -1;

			const nextZoomLevel = getZoomLevelForEffectiveScale(
				effectiveScale + direction * ZOOM_STEP,
			);

			if (nextZoomLevel === zoomLevel) return;
			zoomAtPointer(nextZoomLevel, event.clientX, event.clientY);
		};

		container.addEventListener("wheel", handleNativeWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleNativeWheel);
	}, [zoomLevel, fitScale, effectiveScale]);

	const handleOpenProfile = (targetEmployeeId: string) => {
		navigate(`/employee/${targetEmployeeId}`);
	};

	const handlePrint = () => {
		const container = containerRef.current;
		const content = contentRef.current;

		if (container && content) {
			const nextFitScale = getFitScale(container, content);
			setFitScale(nextFitScale);
			setZoomLevel(1);
			setViewMode("fit");
			centerContainerScroll(container, "auto");
		}

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				window.print();
			});
		});
	};

	const toggleFullscreen = async () => {
		const chartDisplay = chartDisplayRef.current;
		if (!chartDisplay) return;

		try {
			if (document.fullscreenElement === chartDisplay) {
				await document.exitFullscreen();
			} else {
				await chartDisplay.requestFullscreen();
			}
		} catch (error) {
			console.error("Failed to toggle org chart fullscreen:", error);
		}
	};

	const stopPanning = (pointerId?: number) => {
		const container = containerRef.current;
		if (container && pointerId !== undefined && container.hasPointerCapture(pointerId)) {
			container.releasePointerCapture(pointerId);
		}
		dragStateRef.current = null;
		setIsPanning(false);
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;

		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'[data-orgchart-card="true"],button,a,input,select,textarea,[role="button"]',
			)
		) {
			return;
		}

		const container = containerRef.current;
		if (!container) return;

		dragStateRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			scrollLeft: container.scrollLeft,
			scrollTop: container.scrollTop,
		};
		container.setPointerCapture(event.pointerId);
		setIsPanning(true);
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const dragState = dragStateRef.current;
		const container = containerRef.current;
		if (!dragState || !container || dragState.pointerId !== event.pointerId) return;

		container.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
		container.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
	};

	return (
		<div className="space-y-4">
			<OrgReassignManagerPanel />
			<style>{`
				@media print {
					body * {
						visibility: hidden;
					}

					#org-chart-print-root,
					#org-chart-print-root * {
						visibility: visible;
					}

					#org-chart-print-root {
						position: absolute;
						inset: 0;
						width: 100%;
						height: auto !important;
						overflow: visible !important;
						border: none !important;
						border-radius: 0 !important;
						background: white !important;
					}

					#org-chart-print-root [data-org-chart-scroll] {
						height: auto !important;
						overflow: visible !important;
					}

					#org-chart-print-root [data-org-chart-content] {
						transform: none !important;
					}
				}
			`}</style>
			{/* Header */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 print:hidden">
				<div>
					<h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
						<Building className="w-6 h-6 text-orange-600" />
						Organization Structure
					</h2>
					<p className="text-sm text-gray-600 mt-1">
						{chartEmployees.length} employees / {mappedReportingLinkCount} reporting links
						{mode === "full" && visibleBranchNodeCount > 0
							? ` | ${visibleBranchNodeCount} in branch`
							: ""}
					</p>
					{mode === "full" && (
						<div className="mt-2 flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
							<ReportingMetricLink
								label="Employees"
								value={reportingMetricValues.totalEmployees}
								to={getReportingMetricLink("totalEmployees")}
								isLoading={isLoadingReportingCounts}
							/>
							<ReportingMetricLink
								label="With direct reports"
								value={reportingMetricValues.withDirectReports}
								to={getReportingMetricLink("withDirectReports")}
								isLoading={isLoadingReportingCounts}
							/>
							<ReportingMetricLink
								label="Without immediate supervisor"
								value={reportingMetricValues.withoutImmediateSupervisor}
								to={getReportingMetricLink("withoutImmediateSupervisor")}
								isLoading={isLoadingReportingCounts}
								tone="warning"
							/>
							<span className="text-gray-400">/</span>
							<span>
								{standaloneEmployeeCount} standalone records
							</span>
							{selectedBranchStats ? (
								<span>
									<span className="mr-3 text-gray-400">/</span>
									Selected: {selectedBranchStats.descendants + 1} nodes /{" "}
									{selectedBranchStats.directReports} direct
								</span>
							) : null}
							{focusedEmployeeIsUnmapped ? (
								<span className="font-medium text-amber-700">
									<span className="mr-3 text-gray-400">/</span>
									Focused employee has no immediate supervisor
								</span>
							) : null}
						</div>
					)}
				</div>
				<div className="flex flex-col md:flex-row md:items-center gap-3 md:ml-auto">
					{mode === "full" && (
						<div className="flex flex-wrap items-center gap-2">
							<DepartmentSectionPicker
								departments={departments}
								sections={[]}
								departmentId={departmentFilter || "all"}
								onDepartmentChange={handleDepartmentChange}
								onSectionChange={handleDepartmentChange}
							/>
							<div className="w-48">
								<SearchableSelect
									options={[
										{ value: "all", label: "All Positions" },
										...positions.map((p: any) => ({
											value: String(p.id),
											label: String(p.title || p.name || "Position"),
										})),
									]}
									value={positionFilter || "all"}
									onValueChange={handlePositionChange}
									placeholder="All Positions"
									searchPlaceholder="Search position..."
									className="mt-0 h-9 rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm"
								/>
							</div>
							<div className="w-full md:w-[320px]">
								<SearchableSelect
									options={branchSearchOptions}
									value={selectedManagerId}
									onValueChange={handleFocusEmployee}
									placeholder="Select branch"
									searchPlaceholder="Search supervisor, position, department..."
									emptyText="No reporting branch found."
									className="mt-0 h-9 rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm"
								/>
							</div>
						</div>
					)}
					<div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
						<Button
							variant="ghost"
							onClick={handlePrint}
							className="h-8 w-8 rounded-md px-0 text-gray-500 hover:bg-white hover:text-gray-900"
							title="Print organization chart">
							<Printer className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							onClick={resetView}
							className="h-8 w-8 rounded-md px-0 text-gray-500 hover:bg-white hover:text-gray-900"
							title="Reset to the current branch view">
							<X className="h-4 w-4" />
						</Button>
						<button
							onClick={expandAll}
							className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
								isAllExpanded
									? "bg-white text-gray-900 shadow-sm"
									: "text-gray-500 hover:text-gray-900"
							}`}>
							Expand All
						</button>
					</div>
				</div>
			</div>
			{/* Content */}
			{isLoading ? (
				<div className="w-full h-[calc(100vh-20rem)] overflow-hidden bg-gray-50 rounded-lg border border-gray-200">
					<div className="flex items-center justify-center gap-16 p-8 h-full">
						{/* Root Node Skeleton */}
						<div className="flex flex-col items-center">
							<div className="w-64 h-32 bg-white rounded-xl border-t-4 border-blue-500 shadow-sm animate-pulse">
								<div className="p-3 bg-blue-50 rounded-t-lg border-b border-gray-100">
									<div className="flex gap-3">
										<div className="w-10 h-10 bg-blue-200 rounded-full animate-pulse"></div>
										<div className="flex-1 space-y-2">
											<div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
											<div className="h-3 bg-gray-200 rounded w-32 animate-pulse"></div>
										</div>
									</div>
								</div>
								<div className="p-3 space-y-2">
									<div className="h-3 bg-gray-200 rounded w-full animate-pulse"></div>
									<div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse"></div>
								</div>
							</div>

							{/* Children Skeletons */}
							<div className="flex gap-8 mt-12">
								{Array.from({ length: 3 }).map((_, idx) => (
									<div
										key={idx}
										className="w-64 h-32 bg-white rounded-xl border-t-4 border-orange-400 shadow-sm animate-pulse">
										<div className="p-3 bg-orange-50 rounded-t-lg border-b border-gray-100">
											<div className="flex gap-3">
												<div className="w-10 h-10 bg-orange-200 rounded-full animate-pulse"></div>
												<div className="flex-1 space-y-2">
													<div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
													<div className="h-3 bg-gray-200 rounded w-28 animate-pulse"></div>
												</div>
											</div>
										</div>
										<div className="p-3 space-y-2">
											<div className="h-3 bg-gray-200 rounded w-full animate-pulse"></div>
											<div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse"></div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			) : chartEmployees.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-gray-400">
					<Users className="w-12 h-12 mb-2 opacity-20" />
					<p>No employees found.</p>
				</div>
			) : (
				<div
					id="org-chart-print-root"
					ref={chartDisplayRef}
					className={`relative w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden ${
						isFullscreen ? "h-screen" : "h-[calc(100vh-20rem)]"
					}`}
					title="Drag empty space to pan. Use mouse wheel to zoom.">
					{/* Fixed Zoom Controls */}
					<div className="absolute top-3 right-3 z-30 flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur print:hidden">
						<div className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
							{viewMode === "fit"
								? "Fit View"
								: viewMode === "presentation"
									? "Reset View"
									: "Zoom"}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={zoomOut}
							disabled={isAtMinZoom}
							className="h-8 px-2"
							title="Zoom out">
							<ZoomOut className="w-4 h-4" />
						</Button>
						<div className="min-w-16 text-center text-xs font-semibold text-gray-700">
							{effectiveScalePercent}%
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={zoomIn}
							disabled={isAtMaxZoom}
							className="h-8 px-2"
							title="Zoom in">
							<ZoomIn className="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={fitView}
							className="h-8 px-2 text-xs"
							title="Fit current view">
							Fit
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={toggleFullscreen}
							className="h-8 px-2"
							title={isFullscreen ? "Exit full screen" : "View full screen"}>
							{isFullscreen ? (
								<Minimize2 className="w-4 h-4" />
							) : (
								<Maximize2 className="w-4 h-4" />
							)}
						</Button>
					</div>

					{/* Scrollable Container */}
					<div
						ref={containerRef}
						data-org-chart-scroll
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={(event) => stopPanning(event.pointerId)}
						onPointerCancel={(event) => stopPanning(event.pointerId)}
						className={`w-full h-full overflow-auto overscroll-contain ${
							isPanning ? "cursor-grabbing select-none" : "cursor-grab"
						}`}>
						<div
							ref={contentRef}
							data-org-chart-content
							className="mx-auto flex min-w-fit justify-center gap-16 px-8 py-12"
							style={{
								transform: `scale(${effectiveScale})`,
								transformOrigin: "top center",
							}}>
							{focusedBranchTree.map((rootNode) => (
								<TreeNodeComponent
									key={rootNode.employee.id}
									node={rootNode}
									expandedNodes={expandedNodes}
									toggleNode={toggleNode}
									selectNode={handleFocusEmployee}
									openProfile={handleOpenProfile}
									focusedEmployeeId={focusEmployeeId}
								/>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
