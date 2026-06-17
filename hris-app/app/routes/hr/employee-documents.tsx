import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	HrDataTableManagerFilter,
	hrDataTableDepartmentFilterClass,
	hrDataTableFilterClass,
	hrDataTableSelectTriggerClass,
} from "~/components/molecules/HrDataTableFilters";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { EmployeeDocumentActionModal } from "~/components/organisms/employee-detail/employee-document-action-modal";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	AlertCircle,
	ArrowRight,
	CheckCircle,
	Clock,
	Eye,
	FileCheck,
	FileText,
	MoreVertical,
	UserCheck,
} from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import {
	useEmployee,
	useEmployeeDocumentApprovals,
	useEmployeeDocumentReviewEvents,
	useEmployees,
	useReviewEmployeeDocument,
} from "~/lib/hooks/useEmployees";
import { queryKeys, useDocumentComplianceMetrics } from "~/lib/hooks/useMetrics";
import type { DocumentReviewAuditDetail } from "~/services/metrics.service";
import type {
	EmployeeDocumentActor,
	EmployeeDocumentApprovalRecord,
	EmployeeDocumentPayload,
	EmployeeDocumentReviewEvent,
} from "~/services/employees.service";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

type ComplianceTab = "non-compliant" | "pending-approval" | "history" | "compliant" | "warnings";

type ComplianceDocumentDetail = {
	id: string;
	code: string;
	name: string;
	priorityLevel: "high" | "medium" | "low";
	isMandated: boolean;
	requiredForPayroll: boolean;
	requiredForOnboarding: boolean;
};

interface ComplianceEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	section?: string;
	position: string;
	compliancePercent?: number;
	overallStatus?: "non_compliant" | "warning" | "compliant";
	missingDocs?: string[];
	missingDocCodes?: string[];
	missingMandatedDocs?: string[];
	missingRecommendedDocs?: string[];
	missingDocDetails?: Array<{
		id: string;
		code: string;
		name: string;
		priorityLevel: "high" | "medium" | "low";
		isMandated: boolean;
		requiredForPayroll: boolean;
		requiredForOnboarding: boolean;
	}>;
	documentCount?: number;
	documentTypeCodes?: string[];
	documentTypeNames?: string[];
	compliantDocDetails?: Array<{
		id: string;
		code: string;
		name: string;
		priorityLevel: "high" | "medium" | "low";
		isMandated: boolean;
		requiredForPayroll: boolean;
		requiredForOnboarding: boolean;
	}>;
	recommendedMissingDocs?: string[];
	recommendedMissingDocCodes?: string[];
	recommendedMissingDocDetails?: Array<{
		id: string;
		code: string;
		name: string;
		priorityLevel: "high" | "medium" | "low";
		isMandated: boolean;
		requiredForPayroll: boolean;
		requiredForOnboarding: boolean;
	}>;
	pendingApprovalDocs?: string[];
	pendingApprovalDocCodes?: string[];
	pendingApprovalDocDetails?: Array<{
		id: string;
		code: string;
		name: string;
		priorityLevel: "high" | "medium" | "low";
		isMandated: boolean;
		requiredForPayroll: boolean;
		requiredForOnboarding: boolean;
	}>;
	reviewAuditDetails?: DocumentReviewAuditDetail[];
	documentSearchText: string;
}

interface DocumentApprovalRow {
	id: string;
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	position: string;
	documentName: string;
	documentCode: string;
	documentNumber: string;
	submittedAt: string | null;
	submittedBy: string;
	fileUrl: string | null;
	reviewSource: string;
	record: EmployeeDocumentApprovalRecord;
}

interface DocumentReviewEventRow {
	id: string;
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	position: string;
	documentName: string;
	documentCode: string;
	eventType: string;
	fromStatus: string;
	toStatus: string;
	actor: string;
	actorProfileId: string;
	actorCode: string;
	actorPosition: string;
	actorActionLabel: string;
	occurredAt: string;
	reason: string;
	comments: string;
	record: EmployeeDocumentReviewEvent;
}

const getActorName = (actor?: EmployeeDocumentActor | null) => {
	if (!actor) return "";
	const firstName = actor.person?.personalInfo?.firstName || "";
	const middleName = actor.person?.personalInfo?.middleName || "";
	const lastName = actor.person?.personalInfo?.lastName || "";
	return [firstName, middleName, lastName].filter(Boolean).join(" ").trim() || actor.employeeId;
};

const formatDocumentStatus = (value?: string | null) =>
	String(value || "")
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";

const getReviewActorActionLabel = (eventType?: string | null) => {
	switch (String(eventType || "").toUpperCase()) {
		case "APPROVED":
			return "Verified by";
		case "REJECTED":
			return "Returned by";
		case "SUBMITTED":
			return "Submitted by";
		case "RESUBMITTED":
			return "Resubmitted by";
		case "SUPERSEDED":
			return "Superseded by";
		default:
			return "Updated by";
	}
};

const formatAuditDate = (value?: string | null) => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const getMissingBadgeClasses = (item: {
	isMandated: boolean;
	priorityLevel: "high" | "medium" | "low";
}) => {
	if (!item.isMandated) return "border-amber-200 bg-amber-50 text-amber-800";
	if (item.priorityLevel === "high") return "border-red-300 bg-red-50 text-red-700";
	if (item.priorityLevel === "medium") return "border-red-200 bg-red-50 text-red-700";
	return "border-orange-200 bg-orange-50 text-orange-700";
};

const compliantBadgeClasses =
	"whitespace-nowrap border-green-300 bg-green-50 text-green-700 text-xs";
const pendingApprovalBadgeClasses =
	"whitespace-nowrap border-sky-300 bg-sky-50 text-sky-700 text-xs";

const normalizeDocumentLookupValue = (value?: string | null) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const getPersonDisplayName = (person?: any, fallback?: string | null) => {
	const personalInfo = person?.personalInfo || person;
	const firstName = String(personalInfo?.firstName || "").trim();
	const middleName = String(personalInfo?.middleName || "").trim();
	const lastName = String(personalInfo?.lastName || "").trim();
	return [firstName, middleName, lastName].filter(Boolean).join(" ") || fallback || "";
};

const getInitials = (value?: string | null) =>
	String(value || "")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("") || "HR";

const renderAuditField = (label: string, value?: string | null) => (
	<div>
		<div className="text-xs font-semibold uppercase text-neutral-500">{label}</div>
		<div className="mt-1 min-h-10 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-800">
			{value && value.trim() ? value : "-"}
		</div>
	</div>
);

const getOverallStatusBadge = (status?: ComplianceEmployeeRow["overallStatus"]) => {
	if (status === "non_compliant") {
		return {
			label: "Non-Compliant",
			className: "whitespace-nowrap border-red-300 bg-red-50 text-red-700",
		};
	}
	if (status === "warning") {
		return {
			label: "Warning",
			className: "whitespace-nowrap border-amber-300 bg-amber-50 text-amber-700",
		};
	}
	return {
		label: "Compliant",
		className: "whitespace-nowrap border-green-300 bg-green-50 text-green-700",
	};
};

const CircularProgress = ({
	percent,
	color,
	size = 120,
}: {
	percent: number;
	color: string;
	size?: number;
}) => {
	const clampedPercent = Math.min(Math.max(percent, 0), 100);
	const radius = (size - 8) / 2;
	const circumference = 2 * Math.PI * radius;
	const normalizedPercent = clampedPercent > 0 && clampedPercent < 4 ? 4 : clampedPercent;
	const offset = circumference - (normalizedPercent / 100) * circumference;

	return (
		<svg width={size} height={size} className="transform -rotate-90">
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="#e5e7eb"
				strokeWidth="8"
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth="8"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				strokeLinecap="round"
				className="transition-all duration-500"
			/>
		</svg>
	);
};

const ComplianceSummaryMetric = ({
	label,
	percent,
	color,
	count,
	total,
	description,
}: {
	label: string;
	percent: number;
	color: string;
	count: number;
	total: number;
	description: string;
}) => {
	return (
		<div className="flex flex-col items-center text-center">
			<div className="relative flex h-[140px] w-[140px] items-center justify-center">
				<CircularProgress percent={percent} color={color} size={140} />
				<div className="absolute inset-0 flex flex-col items-center justify-center px-4">
					<div className="text-2xl font-bold" style={{ color }}>
						{percent}%
					</div>
					<div className="mt-1 text-center text-xs font-medium uppercase leading-4 tracking-wide text-gray-500">
						{label}
					</div>
				</div>
			</div>
			<div className="mt-4 text-center text-xs text-gray-700 sm:text-sm">
				<div>
					<span className="font-semibold" style={{ color }}>
						{count}
					</span>{" "}
					<span className="text-gray-500">of</span>{" "}
					<span className="font-semibold">{total}</span>
				</div>
				<div className="mx-auto mt-1 max-w-[10rem] text-[11px] leading-4 text-gray-500">
					{description}
				</div>
			</div>
		</div>
	);
};

const SmallCircularProgress = ({
	percent,
	color,
	size = 56,
}: {
	percent: number;
	color: string;
	size?: number;
}) => {
	const clampedPercent = Math.min(Math.max(percent, 0), 100);
	const strokeWidth = 5;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (clampedPercent / 100) * circumference;

	return (
		<svg width={size} height={size}>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="#e5e7eb"
				strokeWidth={strokeWidth}
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				strokeLinecap="round"
				className="transition-all duration-500"
			/>
		</svg>
	);
};

export default function EmployeeDocumentsPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action");
	const selectedEmployeeId = searchParams.get("id") || "";
	const selectedReviewDocumentId = searchParams.get("docId") || "";
	const selectedHistoryEventId = searchParams.get("eventId") || "";
	const selectedTab = (searchParams.get("tab") as ComplianceTab | null) || "non-compliant";
	const selectedDocumentType = searchParams.get("docType") || "all";
	const selectedDepartmentId = searchParams.get("departmentId") || "all";
	const selectedSectionId = searchParams.get("sectionId") || "all";
	const selectedManagerId = searchParams.get("managerId") || "all";
	const selectedPage = Math.max(Number(searchParams.get("page") || "1"), 1);
	const selectedQuery = searchParams.get("query") || "";
	const selectedActionDocumentType = searchParams.get("documentType") || "";
	const selectedActionDocumentNumber = searchParams.get("documentNumber") || "";
	const isDocumentActionModalOpen =
		(action === "add-doc" || action === "edit-doc") && !!selectedEmployeeId;
	const isReviewModalOpen =
		action === "review" && !!selectedEmployeeId && !!selectedReviewDocumentId;
	const isHistoryDetailModalOpen = action === "history-detail" && !!selectedHistoryEventId;
	const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
	const [rejectionReason, setRejectionReason] = useState("");
	const reviewDocument = useReviewEmployeeDocument();
	const { data: selectedActionEmployee } = useEmployee(selectedEmployeeId);

	const organizationId: string | undefined =
		user?.organizationId || user?.organization?.id || undefined;
	const currentActorLabel =
		getPersonDisplayName(
			(user as any)?.metadata?.employee?.person ||
				(user as any)?.metadata?.employee?.personalInfo ||
				(user as any)?.employee?.person ||
				(user as any)?.person,
			(user as any)?.metadata?.employee?.employeeId ||
				(user as any)?.employee?.employeeId ||
				user?.email ||
				"Current HR user",
		) || "Current HR user";

	useEffect(() => {
		if (searchParams.get("tab")) return;
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.set("tab", "non-compliant");
			return params;
		});
	}, [searchParams, setSearchParams]);

	const openDocumentAction = useCallback(
		(params: {
			employeeId: string;
			documentType: string;
			mode?: "add" | "edit";
			documentNumber?: string | null;
		}) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.set("action", params.mode === "edit" ? "edit-doc" : "add-doc");
				next.set("id", params.employeeId);
				next.set("documentType", params.documentType);
				if (params.documentNumber) {
					next.set("documentNumber", params.documentNumber);
				} else {
					next.delete("documentNumber");
				}
				return next;
			});
		},
		[setSearchParams],
	);

	const closeDocumentAction = useCallback(() => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.delete("action");
			params.delete("id");
			params.delete("documentType");
			params.delete("documentNumber");
			return params;
		});
	}, [setSearchParams]);

	const openReview = useCallback(
		(employeeId: string, documentId: string) => {
			setReviewMode("approve");
			setRejectionReason("");
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				params.set("tab", "pending-approval");
				params.set("action", "review");
				params.set("id", employeeId);
				params.set("docId", documentId);
				return params;
			});
		},
		[setSearchParams],
	);

	const closeReview = useCallback(() => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.delete("action");
			params.delete("id");
			params.delete("docId");
			return params;
		});
		setRejectionReason("");
	}, [setSearchParams]);

	const handleTabChange = (tab: string) => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.set("tab", tab);
			params.set("page", "1");
			return params;
		});
	};

	const handleDocumentTypeChange = useCallback(
		(value: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				if (value === "all") {
					params.delete("docType");
				} else {
					params.set("docType", value);
				}
				params.set("page", "1");
				return params;
			});
		},
		[setSearchParams],
	);

	const handleDepartmentChange = useCallback(
		(value: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				if (value === "all") {
					params.delete("departmentId");
					params.delete("sectionId");
				} else {
					params.set("departmentId", value);
					params.delete("sectionId");
				}
				params.delete("managerId");
				params.set("page", "1");
				return params;
			});
		},
		[setSearchParams],
	);

	const handleSectionChange = useCallback(
		(departmentId: string, sectionId: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				params.set("departmentId", departmentId);
				params.set("sectionId", sectionId);
				params.delete("managerId");
				params.set("page", "1");
				return params;
			});
		},
		[setSearchParams],
	);

	const handleManagerChange = useCallback(
		(value: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				if (value === "all") {
					params.delete("managerId");
				} else {
					params.set("managerId", value);
				}
				params.set("page", "1");
				return params;
			});
		},
		[setSearchParams],
	);

	const handleSearchChange = useCallback(
		(value: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				if (value.trim()) {
					params.set("query", value.trim());
				} else {
					params.delete("query");
				}
				params.set("page", "1");
				return params;
			});
		},
		[setSearchParams],
	);

	const handlePageChange = useCallback(
		(page: number) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				params.set("page", String(page));
				return params;
			});
		},
		[setSearchParams],
	);

	const openReviewHistory = useCallback(() => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.set("tab", "history");
			params.set("page", "1");
			params.delete("action");
			params.delete("id");
			params.delete("docId");
			params.delete("query");
			return params;
		});
	}, [setSearchParams]);

	const openHistoryDetail = useCallback(
		(eventId: string) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				params.set("tab", "history");
				params.set("action", "history-detail");
				params.set("eventId", eventId);
				params.delete("id");
				params.delete("docId");
				return params;
			});
		},
		[setSearchParams],
	);

	const closeHistoryDetail = useCallback(() => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.delete("action");
			params.delete("eventId");
			return params;
		});
	}, [setSearchParams]);

	const openEmployeeDocuments = useCallback(
		(employeeId: string) => {
			navigate(`/employee/${employeeId}?tab=documents`);
		},
		[navigate],
	);

	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 100,
		sort: "name",
		order: "asc",
	});
	const departments = useMemo(
		() => (departmentsData as any)?.departments || [],
		[departmentsData],
	);
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const sections = useMemo(() => (sectionsData as any)?.sections || [], [sectionsData]);

	const { data: managersData } = useEmployees({
		page: 1,
		limit: 100,
		filter: "directReports:exists",
	});
	const allManagers = useMemo(
		() => (managersData as any)?.employees || (managersData as any)?.data?.employees || [],
		[managersData],
	);
	const filteredManagers = useMemo(() => {
		return allManagers.filter((manager: any) => {
			const matchesDepartment =
				selectedDepartmentId === "all" || manager.department?.id === selectedDepartmentId;
			const matchesSection =
				selectedSectionId === "all" ||
				manager.section?.id === selectedSectionId ||
				manager.sectionId === selectedSectionId;
			return matchesDepartment && matchesSection;
		});
	}, [allManagers, selectedDepartmentId, selectedSectionId]);

	const { data: complianceData, isLoading: isLoadingCompliance } = useDocumentComplianceMetrics(
		organizationId,
		selectedDepartmentId === "all" ? undefined : selectedDepartmentId,
		selectedSectionId === "all" ? undefined : selectedSectionId,
		selectedManagerId === "all" ? undefined : selectedManagerId,
	);

	const documentMetrics = complianceData?.metrics?.documentComplianceMetrics;
	const documentTypeOptions = useMemo(
		() =>
			(documentMetrics?.documentBreakdown || [])
				.map((documentType) => ({
					value: documentType.code || documentType.id,
					label: documentType.name,
					id: documentType.id,
				}))
				.filter((item) => item.value && item.label)
				.sort((a, b) => a.label.localeCompare(b.label)),
		[documentMetrics],
	);
	const selectedDocumentTypeId = useMemo(
		() =>
			selectedDocumentType === "all"
				? undefined
				: documentTypeOptions.find((option) => option.value === selectedDocumentType)?.id,
		[documentTypeOptions, selectedDocumentType],
	);
	const documentApprovalParams = useMemo(
		() => ({
			status: "PENDING",
			page: selectedTab === "pending-approval" ? selectedPage : 1,
			limit: 20,
			departmentId: selectedDepartmentId === "all" ? undefined : selectedDepartmentId,
			sectionId: selectedSectionId === "all" ? undefined : selectedSectionId,
			reportToId: selectedManagerId === "all" ? undefined : selectedManagerId,
			documentTypeId: selectedDocumentTypeId,
			query: selectedQuery || undefined,
		}),
		[
			selectedDepartmentId,
			selectedDocumentTypeId,
			selectedManagerId,
			selectedPage,
			selectedQuery,
			selectedSectionId,
			selectedTab,
		],
	);
	const documentHistoryParams = useMemo(
		() => ({
			page: selectedTab === "history" ? selectedPage : 1,
			limit: 20,
		}),
		[selectedPage, selectedTab],
	);
	const { data: documentApprovalsData } = useEmployeeDocumentApprovals(documentApprovalParams, {
		enabled: selectedTab === "pending-approval",
	});
	const { data: documentReviewEventsData, isLoading: isLoadingReviewEvents } =
		useEmployeeDocumentReviewEvents(documentHistoryParams, {
			enabled: selectedTab === "history",
		});

	const normalizedNonCompliantEmployees = useMemo<ComplianceEmployeeRow[]>(() => {
		const items = documentMetrics?.nonCompliantEmployees || [];
		return items.map((employee) => {
			const missingDocCodes = employee.missingDocCodes || [];
			const missingDocs = employee.missingDocs || [];
			const missingDocDetails = employee.missingDocDetails || [];
			const pendingApprovalDocs = employee.pendingApprovalDocs || [];
			const pendingApprovalDocCodes = employee.pendingApprovalDocCodes || [];
			const pendingApprovalDocDetails = employee.pendingApprovalDocDetails || [];
			const reviewAuditDetails = employee.reviewAuditDetails || [];
			return {
				...employee,
				compliancePercent: employee.compliancePercent ?? 0,
				overallStatus: employee.overallStatus || "non_compliant",
				missingDocs,
				missingDocCodes,
				missingMandatedDocs: employee.missingMandatedDocs || [],
				missingRecommendedDocs: employee.missingRecommendedDocs || [],
				missingDocDetails,
				pendingApprovalDocs,
				pendingApprovalDocCodes,
				pendingApprovalDocDetails,
				reviewAuditDetails,
				documentSearchText: [
					...missingDocs,
					...missingDocCodes,
					...missingDocDetails.map((item) => item.code),
					...pendingApprovalDocs,
					...pendingApprovalDocCodes,
				]
					.filter(Boolean)
					.join(" "),
			};
		});
	}, [documentMetrics?.nonCompliantEmployees]);
	const normalizedCompliantEmployees = useMemo<ComplianceEmployeeRow[]>(() => {
		const items = documentMetrics?.compliantEmployees || [];
		return items.map((employee) => {
			const documentTypeCodes = employee.documentTypeCodes || [];
			const documentTypeNames = employee.documentTypeNames || [];
			const compliantDocDetails = employee.compliantDocDetails || [];
			const recommendedMissingDocs = employee.recommendedMissingDocs || [];
			const recommendedMissingDocCodes = employee.recommendedMissingDocCodes || [];
			const recommendedMissingDocDetails = employee.recommendedMissingDocDetails || [];
			const reviewAuditDetails = employee.reviewAuditDetails || [];
			return {
				...employee,
				compliancePercent: employee.compliancePercent ?? 100,
				overallStatus: employee.overallStatus || "compliant",
				documentTypeCodes,
				documentTypeNames,
				compliantDocDetails,
				recommendedMissingDocs,
				recommendedMissingDocCodes,
				recommendedMissingDocDetails,
				reviewAuditDetails,
				documentSearchText: [
					...documentTypeNames,
					...documentTypeCodes,
					...compliantDocDetails.map((item) => item.code),
					...compliantDocDetails.map((item) => item.name),
					...recommendedMissingDocs,
					...recommendedMissingDocCodes,
				]
					.filter(Boolean)
					.join(" "),
			};
		});
	}, [documentMetrics?.compliantEmployees]);
	const normalizedWarningEmployees = useMemo<ComplianceEmployeeRow[]>(() => {
		const items = documentMetrics?.warningEmployees || [];
		return items.map((employee) => {
			const documentTypeCodes = employee.documentTypeCodes || [];
			const documentTypeNames = employee.documentTypeNames || [];
			const compliantDocDetails = employee.compliantDocDetails || [];
			const recommendedMissingDocs = employee.recommendedMissingDocs || [];
			const recommendedMissingDocCodes = employee.recommendedMissingDocCodes || [];
			const recommendedMissingDocDetails = employee.recommendedMissingDocDetails || [];
			const reviewAuditDetails = employee.reviewAuditDetails || [];
			return {
				...employee,
				compliancePercent: employee.compliancePercent ?? 100,
				overallStatus: employee.overallStatus || "warning",
				documentTypeCodes,
				documentTypeNames,
				compliantDocDetails,
				recommendedMissingDocs,
				recommendedMissingDocCodes,
				recommendedMissingDocDetails,
				reviewAuditDetails,
				documentSearchText: [
					...documentTypeNames,
					...documentTypeCodes,
					...compliantDocDetails.map((item) => item.code),
					...compliantDocDetails.map((item) => item.name),
					...recommendedMissingDocs,
					...recommendedMissingDocCodes,
				]
					.filter(Boolean)
					.join(" "),
			};
		});
	}, [documentMetrics?.warningEmployees]);
	const normalizedPendingApprovalEmployees = useMemo<ComplianceEmployeeRow[]>(() => {
		const items = documentMetrics?.pendingApprovalEmployees || [];
		return items.map((employee) => {
			const pendingApprovalDocs = employee.pendingApprovalDocs || [];
			const pendingApprovalDocCodes = employee.pendingApprovalDocCodes || [];
			const pendingApprovalDocDetails = employee.pendingApprovalDocDetails || [];
			const reviewAuditDetails = employee.reviewAuditDetails || [];
			return {
				...employee,
				compliancePercent: employee.compliancePercent ?? 0,
				overallStatus: employee.overallStatus || "non_compliant",
				pendingApprovalDocs,
				pendingApprovalDocCodes,
				pendingApprovalDocDetails,
				reviewAuditDetails,
				documentSearchText: [
					...pendingApprovalDocs,
					...pendingApprovalDocCodes,
					...pendingApprovalDocDetails.map((item) => item.code),
					...pendingApprovalDocDetails.map((item) => item.name),
				]
					.filter(Boolean)
					.join(" "),
			};
		});
	}, [documentMetrics?.pendingApprovalEmployees]);
	const normalizedCleanCompliantEmployees = useMemo<ComplianceEmployeeRow[]>(
		() => normalizedCompliantEmployees,
		[normalizedCompliantEmployees],
	);
	const filteredNonCompliantEmployees = useMemo(
		() =>
			selectedDocumentType === "all"
				? normalizedNonCompliantEmployees
				: normalizedNonCompliantEmployees.filter((employee) =>
						employee.missingDocCodes?.includes(selectedDocumentType),
					),
		[selectedDocumentType, normalizedNonCompliantEmployees],
	);
	const filteredCompliantEmployees = useMemo(
		() =>
			selectedDocumentType === "all"
				? normalizedCleanCompliantEmployees
				: normalizedCleanCompliantEmployees.filter((employee) =>
						employee.documentTypeCodes?.includes(selectedDocumentType),
					),
		[selectedDocumentType, normalizedCleanCompliantEmployees],
	);
	const filteredWarningEmployees = useMemo(
		() =>
			selectedDocumentType === "all"
				? normalizedWarningEmployees
				: normalizedWarningEmployees.filter((employee) =>
						employee.recommendedMissingDocCodes?.includes(selectedDocumentType),
					),
		[selectedDocumentType, normalizedWarningEmployees],
	);
	const filteredPendingApprovalEmployees = useMemo(
		() =>
			selectedDocumentType === "all"
				? normalizedPendingApprovalEmployees
				: normalizedPendingApprovalEmployees.filter((employee) =>
						employee.pendingApprovalDocCodes?.includes(selectedDocumentType),
					),
		[selectedDocumentType, normalizedPendingApprovalEmployees],
	);
	const documentApprovalRows = useMemo<DocumentApprovalRow[]>(() => {
		const actors = documentApprovalsData?.actors || {};
		return (documentApprovalsData?.documents || []).map((document) => {
			const employee = document.employee;
			const submittedBy = actors[document.reviewSubmittedById || ""];
			return {
				id: document.id,
				employeeId: employee.id,
				employeeCode: employee.employeeId,
				employeeName: getActorName(employee),
				department: employee.department?.name || "-",
				position: employee.position?.title || "-",
				documentName: document.documentType?.name || document.name || document.type,
				documentCode: document.documentType?.code || document.type || "-",
				documentNumber: document.number || "-",
				submittedAt: document.reviewSubmittedAt || document.createdAt || null,
				submittedBy: getActorName(submittedBy) || getActorName(employee),
				fileUrl: document.fileUrl || null,
				reviewSource: formatDocumentStatus(document.reviewSource),
				record: document,
			};
		});
	}, [documentApprovalsData]);
	const documentReviewEventRows = useMemo<DocumentReviewEventRow[]>(() => {
		const actors = documentReviewEventsData?.actors || {};
		return (documentReviewEventsData?.events || []).map((event) => {
			const document = event.document;
			const employee = document?.employee;
			const actor = actors[event.actorEmployeeId || ""];
			return {
				id: event.id,
				employeeId: event.employeeId,
				employeeCode: employee?.employeeId || "-",
				employeeName: getActorName(employee),
				department: employee?.department?.name || "-",
				position: employee?.position?.title || "-",
				documentName: document?.documentType?.name || document?.name || "-",
				documentCode: document?.documentType?.code || document?.type || "-",
				eventType: formatDocumentStatus(event.eventType),
				fromStatus: formatDocumentStatus(event.fromStatus),
				toStatus: formatDocumentStatus(event.toStatus),
				actor: getActorName(actor) || "System",
				actorProfileId: actor?.id || "",
				actorCode: actor?.employeeId || "",
				actorPosition: actor?.position?.title || actor?.department?.name || "",
				actorActionLabel: getReviewActorActionLabel(event.eventType),
				occurredAt: event.occurredAt,
				reason: event.reason || "",
				comments: event.comments || "",
				record: event,
			};
		});
	}, [documentReviewEventsData]);
	const selectedHistoryEvent = useMemo(
		() => documentReviewEventRows.find((event) => event.id === selectedHistoryEventId) || null,
		[documentReviewEventRows, selectedHistoryEventId],
	);
	const selectedReviewEmployee = useMemo(() => {
		const approvalRow = documentApprovalRows.find(
			(row) => row.employeeId === selectedEmployeeId,
		);
		if (approvalRow) {
			return {
				id: selectedEmployeeId,
				employeeId: approvalRow.employeeCode,
				name: approvalRow.employeeName,
				department: approvalRow.department,
				position: approvalRow.position,
				documentSearchText: "",
			} as ComplianceEmployeeRow;
		}
		return (
			normalizedPendingApprovalEmployees.find(
				(employee) => employee.id === selectedEmployeeId,
			) ||
			normalizedNonCompliantEmployees.find(
				(employee) => employee.id === selectedEmployeeId,
			) ||
			null
		);
	}, [
		documentApprovalRows,
		normalizedNonCompliantEmployees,
		normalizedPendingApprovalEmployees,
		selectedEmployeeId,
	]);
	const selectedReviewDetail = useMemo(() => {
		const approvalRow = documentApprovalRows.find((row) => row.id === selectedReviewDocumentId);
		if (approvalRow) {
			return {
				documentId: approvalRow.id,
				name: approvalRow.documentName,
				status: approvalRow.record.reviewStatus || "PENDING",
				submittedAt: approvalRow.record.reviewSubmittedAt || approvalRow.record.createdAt,
				submittedByLabel: approvalRow.submittedBy,
				documentNumber: approvalRow.documentNumber,
				fileUrl: approvalRow.fileUrl,
				approvedAt: approvalRow.record.reviewApprovedAt,
				approvedByLabel: "",
				rejectedAt: approvalRow.record.reviewRejectedAt,
				rejectedByLabel: "",
			} as DocumentReviewAuditDetail;
		}
		return (
			selectedReviewEmployee?.reviewAuditDetails?.find(
				(item) => item.documentId === selectedReviewDocumentId,
			) || null
		);
	}, [documentApprovalRows, selectedReviewDocumentId, selectedReviewEmployee]);
	const warningEmployeesCount =
		documentMetrics?.warningEmployeesCount || normalizedWarningEmployees.length;
	const pendingApprovalEmployeesCount =
		documentApprovalsData?.count ||
		documentMetrics?.pendingApprovalEmployeesCount ||
		normalizedPendingApprovalEmployees.length;

	const selectedActionExistingDocument = useMemo(() => {
		const documents = selectedActionEmployee?.documents || [];
		if (!documents.length) return null;

		if (selectedActionDocumentNumber) {
			const byNumber = documents.find(
				(document) => document.number === selectedActionDocumentNumber,
			);
			if (byNumber) return byNumber;
		}

		const selectedTypeKey = normalizeDocumentLookupValue(selectedActionDocumentType);
		if (!selectedTypeKey) return null;

		return (
			documents.find((document) => {
				const documentKeys = [document.documentTypeId, document.type, document.name].map(
					normalizeDocumentLookupValue,
				);
				return documentKeys.includes(selectedTypeKey);
			}) || null
		);
	}, [
		selectedActionDocumentNumber,
		selectedActionDocumentType,
		selectedActionEmployee?.documents,
	]);

	const selectedActionMode =
		action === "edit-doc" && selectedActionExistingDocument ? "edit" : "add";
	const selectedReviewExistingDocument = useMemo<EmployeeDocumentPayload | null>(() => {
		const approvalRecord =
			documentApprovalRows.find((row) => row.id === selectedReviewDocumentId)?.record || null;
		if (!approvalRecord) return null;

		return {
			id: approvalRecord.id,
			name: approvalRecord.name,
			type: approvalRecord.type,
			documentTypeId: approvalRecord.documentType?.id || null,
			documentType: approvalRecord.documentType
				? {
						id: approvalRecord.documentType.id,
						code: approvalRecord.documentType.code || approvalRecord.type || "",
						name: approvalRecord.documentType.name,
					}
				: null,
			number: approvalRecord.number || undefined,
			issueDate: approvalRecord.issueDate || undefined,
			expiryDate: approvalRecord.expiryDate || undefined,
			fileUrl: approvalRecord.fileUrl || undefined,
			ext: approvalRecord.ext || undefined,
			fieldValues: null,
			metadata: {
				reviewStatus: approvalRecord.reviewStatus,
				reviewSubmittedAt: approvalRecord.reviewSubmittedAt,
				reviewSubmittedById: approvalRecord.reviewSubmittedById,
				reviewApprovedAt: approvalRecord.reviewApprovedAt,
				reviewApprovedById: approvalRecord.reviewApprovedById,
				reviewRejectedAt: approvalRecord.reviewRejectedAt,
				reviewRejectedById: approvalRecord.reviewRejectedById,
				reviewRejectionReason: approvalRecord.reviewRejectionReason,
				reviewSource: approvalRecord.reviewSource,
			},
		} as EmployeeDocumentPayload;
	}, [documentApprovalRows, selectedReviewDocumentId]);
	const selectedActionEmployeeLabel = selectedActionEmployee
		? `${getPersonDisplayName(
				selectedActionEmployee.person,
				selectedActionEmployee.employeeId,
			)}${selectedActionEmployee.employeeId ? ` (${selectedActionEmployee.employeeId})` : ""}`
		: selectedEmployeeId;

	const submitReview = useCallback(async (nextMode: "approve" | "reject" = reviewMode) => {
		if (!selectedReviewDetail?.documentId || !selectedReviewEmployee?.id) return;
		await reviewDocument.mutateAsync({
			documentId: selectedReviewDetail.documentId,
			employeeId: selectedReviewEmployee.id,
			action: nextMode,
			rejectionReason: nextMode === "reject" ? rejectionReason.trim() : undefined,
		});
		closeReview();
	}, [
		closeReview,
		rejectionReason,
		reviewDocument,
		reviewMode,
		selectedReviewDetail?.documentId,
		selectedReviewEmployee?.id,
	]);

	const employeeColumns = useMemo<Column<ComplianceEmployeeRow>[]>(() => {
		const baseColumns: Column<ComplianceEmployeeRow>[] = [
			{
				key: "name",
				label: "Employee",
				sortable: true,
				width: "24%",
				render: (value, item) => {
					if (!item) return <div>-</div>;
					return (
						<EmployeeTableCell
							profileId={item.id}
							fullName={item.name}
							employeeId={item.employeeId}
						/>
					);
				},
			},
			{
				key: "department",
				label: "Department",
				sortable: true,
				width: "14%",
			},
			{
				key: "position",
				label: "Position",
				sortable: true,
				width: "14%",
			},
			{
				key: "compliancePercent",
				label: "Compliance %",
				sortable: true,
				width: "10%",
				render: (value, item) => {
					if (!item) return <div>-</div>;
					const percent = Math.round(Number(item.compliancePercent || 0));
					const tone =
						percent >= 100
							? "text-green-700"
							: percent >= 60
								? "text-amber-700"
								: "text-red-700";
					return <span className={`text-sm font-semibold ${tone}`}>{percent}%</span>;
				},
			},
			{
				key: "overallStatus",
				label: "Status",
				sortable: true,
				width: "12%",
				render: (value, item) => {
					if (!item) return <div>-</div>;
					const badge = getOverallStatusBadge(item.overallStatus);
					return (
						<Badge variant="outline" className={badge.className}>
							{badge.label}
						</Badge>
					);
				},
			},
		];

		const detailColumn: Column<ComplianceEmployeeRow> =
			selectedTab === "non-compliant"
				? {
						key: "missingDocs",
						label: "Missing Documents",
						width: "20%",
						render: (value, item) => {
							if (!item) return <div>-</div>;
							const details = item.missingDocDetails || [];
							if (!details.length) return <div>-</div>;
							const displayDocs = details.slice(0, 2);
							const remainingCount = details.length - 2;
							return (
								<div className="flex flex-wrap items-center gap-1.5">
									{displayDocs.map((doc, idx) => (
										<Badge
											key={`${item.id}-${doc.code}-${idx}`}
											variant="outline"
											className={`whitespace-nowrap text-xs font-medium ${getMissingBadgeClasses(doc)}`}>
											{doc.name}
										</Badge>
									))}
									{remainingCount > 0 ? (
										<Badge
											variant="outline"
											className="whitespace-nowrap border-gray-300 bg-gray-50 text-gray-600 text-xs">
											+{remainingCount} more
										</Badge>
									) : null}
								</div>
							);
						},
					}
				: selectedTab === "pending-approval"
					? {
							key: "pendingApprovalDocs",
							label: "Pending Approval Documents",
							width: "18%",
							render: (value, item) => {
								if (!item) return <div>-</div>;
								const details = item.pendingApprovalDocDetails || [];
								if (!details.length) return <div>-</div>;
								const displayDocs = details.slice(0, 2);
								const remainingCount = details.length - 2;
								return (
									<div className="flex flex-wrap items-center gap-1">
										{displayDocs.map((doc, idx) => (
											<Badge
												key={`${item.id}-pending-${doc.code}-${idx}`}
												variant="outline"
												className={pendingApprovalBadgeClasses}>
												{doc.name}
											</Badge>
										))}
										{remainingCount > 0 ? (
											<Badge
												variant="outline"
												className="whitespace-nowrap border-gray-300 bg-gray-50 text-gray-600 text-xs">
												+{remainingCount} more
											</Badge>
										) : null}
									</div>
								);
							},
						}
					: selectedTab === "warnings"
						? {
								key: "recommendedMissingDocs",
								label: "Warnings",
								width: "20%",
								render: (value, item) => {
									if (!item) return <div>-</div>;
									const recommendedMissing =
										item.recommendedMissingDocDetails || [];
									if (!recommendedMissing.length) return <div>-</div>;
									const displayDocs = recommendedMissing.slice(0, 2);
									const remainingCount = recommendedMissing.length - 2;
									return (
										<div className="flex flex-wrap items-center gap-1.5">
											{displayDocs.map((doc, idx) => (
												<Badge
													key={`${item.id}-warning-${doc.code}-${idx}`}
													variant="outline"
													className={`whitespace-nowrap text-xs font-medium ${getMissingBadgeClasses(doc)}`}>
													{doc.name}
												</Badge>
											))}
											{remainingCount > 0 ? (
												<Badge
													variant="outline"
													className="whitespace-nowrap border-gray-300 bg-gray-50 text-gray-600 text-xs">
													+{remainingCount} more
												</Badge>
											) : null}
										</div>
									);
								},
							}
						: {
								key: "documentCount",
								label: "Compliant Documents",
								sortable: true,
								width: "20%",
								render: (value, item) => {
									if (!item) return <div>-</div>;
									const compliantDocs = item.compliantDocDetails || [];
									if (!compliantDocs.length) return <div>-</div>;
									const displayDocs = compliantDocs.slice(0, 2);
									const remainingCount = compliantDocs.length - 2;
									return (
										<div className="flex flex-wrap items-center gap-1">
											{displayDocs.map((doc, idx) => (
												<Badge
													key={`${item.id}-compliant-${doc.code}-${idx}`}
													variant="outline"
													className={compliantBadgeClasses}>
													<CheckCircle className="mr-1 h-3 w-3" />
													{doc.name}
												</Badge>
											))}
											{remainingCount > 0 ? (
												<Badge
													variant="outline"
													className="whitespace-nowrap border-gray-300 bg-gray-50 text-gray-600 text-xs">
													+{remainingCount} more
												</Badge>
											) : null}
										</div>
									);
								},
							};

		const actionColumn: Column<ComplianceEmployeeRow> = {
			key: "actions",
			label: "Actions",
			width: "8%",
			className: "text-right",
			headerClassName: "text-right",
			render: (value, item) => {
				if (!item) return <div>-</div>;
				const pendingApprovalDocs = item.pendingApprovalDocDetails || [];
				const needsUploadDocs =
					selectedTab === "pending-approval"
						? []
						: [
								...(item.missingDocDetails || []),
								...(selectedTab === "warnings"
									? item.recommendedMissingDocDetails || []
									: []),
							];
				const replaceDocs = selectedTab === "pending-approval" ? [] : item.compliantDocDetails || [];
				const resolvePendingReviewDocumentId = (document: ComplianceDocumentDetail) =>
					item.reviewAuditDetails?.find(
						(audit) =>
							normalizeDocumentLookupValue(audit.name) ===
								normalizeDocumentLookupValue(document.name) ||
							normalizeDocumentLookupValue(audit.code) ===
								normalizeDocumentLookupValue(document.code) ||
							normalizeDocumentLookupValue(audit.id) ===
								normalizeDocumentLookupValue(document.id),
					)?.documentId ||
					documentApprovalRows.find(
						(row) =>
							row.employeeId === item.id &&
							(normalizeDocumentLookupValue(row.documentName) ===
								normalizeDocumentLookupValue(document.name) ||
								normalizeDocumentLookupValue(row.documentCode) ===
									normalizeDocumentLookupValue(document.code) ||
								normalizeDocumentLookupValue(row.id) ===
									normalizeDocumentLookupValue(document.id)),
					)?.id;
				const firstPendingApprovalDoc = pendingApprovalDocs.find((document) =>
					Boolean(resolvePendingReviewDocumentId(document)),
				);
				const firstActionDoc =
					selectedTab === "pending-approval"
						? firstPendingApprovalDoc || null
						: needsUploadDocs[0] || replaceDocs[0] || null;
				const isWarningMenu = selectedTab === "warnings";
				const missingMenuClasses = isWarningMenu
					? {
							trigger: "text-amber-800 focus:bg-amber-50 focus:text-amber-900",
							icon: "text-amber-600",
							label: "text-amber-700",
							item: "text-amber-900 focus:bg-amber-50 focus:text-amber-950",
						}
					: {
							trigger: "text-red-700 focus:bg-red-50 focus:text-red-800",
							icon: "text-red-600",
							label: "text-red-700",
							item: "text-red-800 focus:bg-red-50 focus:text-red-900",
						};

				const renderDocumentActionItems = (
					documents: ComplianceDocumentDetail[],
					mode: "add" | "edit",
				) =>
					documents.slice(0, 8).map((document) => (
						<DropdownMenuItem
							key={`${item.id}-${mode}-${document.id || document.code}`}
							onClick={() =>
								openDocumentAction({
									employeeId: item.id,
									documentType: document.id || document.code,
									mode,
								})
							}
							className={`cursor-pointer ${
								mode === "add"
									? missingMenuClasses.item
									: "text-neutral-800 focus:bg-emerald-50 focus:text-emerald-900"
							}`}>
							<FileText
								className={`mr-2 h-4 w-4 ${
									mode === "add" ? missingMenuClasses.icon : "text-emerald-600"
								}`}
							/>
							<span className="truncate">{document.name}</span>
						</DropdownMenuItem>
					));

				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="h-8 w-8 p-0">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem
								onClick={() => openEmployeeDocuments(item.id)}
								className="cursor-pointer">
								<Eye className="mr-2 h-4 w-4" />
								View Documents
							</DropdownMenuItem>
							{needsUploadDocs.length ? (
								<DropdownMenuSub>
									<DropdownMenuSubTrigger
										className={`cursor-pointer ${missingMenuClasses.trigger}`}>
										<FileText
											className={`mr-2 h-4 w-4 ${missingMenuClasses.icon}`}
										/>
										{isWarningMenu
											? "Add warning record"
											: "Add missing record"}
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent className="w-64">
										<DropdownMenuLabel
											className={`text-xs ${missingMenuClasses.label}`}>
											{isWarningMenu
												? "Optional warnings"
												: "Missing records"}
										</DropdownMenuLabel>
										{renderDocumentActionItems(needsUploadDocs, "add")}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							) : null}
							{replaceDocs.length ? (
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className="cursor-pointer text-neutral-800 focus:bg-emerald-50 focus:text-emerald-900">
										<FileCheck className="mr-2 h-4 w-4 text-emerald-600" />
										Replace existing
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent className="w-64">
										<DropdownMenuLabel className="text-xs text-emerald-700">
											Existing records
										</DropdownMenuLabel>
										{renderDocumentActionItems(replaceDocs, "edit")}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							) : null}
							{pendingApprovalDocs.length ? (
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className="cursor-pointer text-sky-800 focus:bg-sky-50 focus:text-sky-900">
										<FileText className="mr-2 h-4 w-4 text-sky-600" />
										Review pending
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent className="w-64">
										<DropdownMenuLabel className="text-xs text-sky-700">
											Waiting for HR
										</DropdownMenuLabel>
										{pendingApprovalDocs.slice(0, 8).map((document) => {
											const reviewDocumentId =
												resolvePendingReviewDocumentId(document);
											return (
												<DropdownMenuItem
													key={`${item.id}-review-${document.id || document.code}`}
													disabled={!reviewDocumentId}
													onClick={() => {
														if (reviewDocumentId) {
															openReview(item.id, reviewDocumentId);
														}
													}}
													className="cursor-pointer text-sky-900 focus:bg-sky-50 focus:text-sky-950">
													<FileText className="mr-2 h-4 w-4 text-sky-600" />
													<span className="min-w-0">
														<span className="block truncate">
															{document.name}
														</span>
														<span className="block truncate text-xs text-sky-700/80">
															{document.code}
														</span>
													</span>
												</DropdownMenuItem>
											);
										})}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							) : null}
							{firstActionDoc ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() => {
											if (selectedTab === "pending-approval") {
												const reviewDocumentId =
													resolvePendingReviewDocumentId(firstActionDoc);
												if (reviewDocumentId) {
													openReview(item.id, reviewDocumentId);
												}
												return;
											}
											openDocumentAction({
												employeeId: item.id,
												documentType:
													firstActionDoc.id || firstActionDoc.code,
												mode: needsUploadDocs.length ? "add" : "edit",
											});
										}}
										className={`cursor-pointer ${
											selectedTab === "pending-approval"
												? "text-sky-900 focus:bg-sky-50 focus:text-sky-950"
												: needsUploadDocs.length
													? missingMenuClasses.item
													: "text-emerald-900 focus:bg-emerald-50 focus:text-emerald-950"
										}`}>
										<FileText
											className={`mr-2 h-4 w-4 ${
												selectedTab === "pending-approval"
													? "text-sky-600"
													: needsUploadDocs.length
													? missingMenuClasses.icon
													: "text-emerald-600"
											}`}
										/>
										{selectedTab === "pending-approval"
											? "Review next pending"
											: "Open next record"}
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		};

		return [...baseColumns, detailColumn, actionColumn];
	}, [documentApprovalRows, openDocumentAction, openEmployeeDocuments, openReview, selectedTab]);

	const documentReviewEventColumns = useMemo<Column<DocumentReviewEventRow>[]>(
		() => [
			{
				key: "occurredAt",
				label: "When",
				width: "14%",
				render: (_value, item) => (
					<span className="font-medium text-neutral-800">
						{formatAuditDate(item.occurredAt) || "-"}
					</span>
				),
			},
			{
				key: "employeeName",
				label: "Employee",
				width: "21%",
				render: (_value, item) => (
					<EmployeeTableCell
						profileId={item.employeeId}
						fullName={item.employeeName}
						employeeId={item.employeeCode}
					/>
				),
			},
			{
				key: "documentName",
				label: "Document",
				width: "20%",
				render: (_value, item) => (
					<div className="space-y-1">
						<div className="font-semibold text-neutral-900">{item.documentName}</div>
						<div className="text-xs text-neutral-500">{item.documentCode}</div>
					</div>
				),
			},
			{
				key: "eventType",
				label: "Event",
				width: "12%",
				render: (_value, item) => (
					<Badge
						variant="outline"
						className="border-neutral-300 bg-neutral-50 text-neutral-700">
						{item.eventType}
					</Badge>
				),
			},
			{
				key: "toStatus",
				label: "Movement",
				width: "15%",
				render: (_value, item) => (
					<div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-700">
						<span className="rounded-md bg-neutral-50 px-2 py-1 text-xs text-neutral-600">
							{item.fromStatus}
						</span>
						<span className="text-neutral-400">-&gt;</span>
						<span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-900">
							{item.toStatus}
						</span>
					</div>
				),
			},
			{
				key: "actor",
				label: "Handled By",
				width: "18%",
				render: (_value, item) => (
					<div className="min-w-0 space-y-1">
						<div className="text-xs font-medium text-neutral-500">
							{item.actorActionLabel}
						</div>
						<div className="truncate text-sm font-semibold text-neutral-900">
							{item.actor}
						</div>
						{item.actorCode || item.actorPosition ? (
							<div className="truncate text-xs text-neutral-500">
								{[item.actorCode, item.actorPosition].filter(Boolean).join(" - ")}
							</div>
						) : null}
					</div>
				),
			},
			{
				key: "actions",
				label: "Details",
				width: "8%",
				className: "text-right",
				headerClassName: "text-right",
				render: (_value, item) => (
					<Button variant="outline" size="sm" onClick={() => openHistoryDetail(item.id)}>
						<Eye className="mr-2 h-4 w-4" />
						View
					</Button>
				),
			},
		],
		[openHistoryDetail],
	);

	const documentFilterControls = useMemo(() => {
		if (!documentTypeOptions.length && !departments.length) return null;
		const managerOptions = [
			{ value: "all", label: "All Manager" },
			...filteredManagers.map((manager: any) => {
				const firstName = manager.person?.personalInfo?.firstName || "";
				const lastName = manager.person?.personalInfo?.lastName || "";
				return {
					value: manager.id,
					label: `${firstName} ${lastName}`.trim() || manager.employeeId || "Manager",
				};
			}),
		];

		return (
			<>
				<div className={hrDataTableDepartmentFilterClass}>
				<DepartmentSectionPicker
					variant="datatable"
					departments={departments}
					sections={sections}
					departmentId={selectedDepartmentId}
					sectionId={selectedSectionId}
					onDepartmentChange={handleDepartmentChange}
					onSectionChange={handleSectionChange}
				/>
				</div>

				<div className={hrDataTableFilterClass}>
					<HrDataTableManagerFilter
						value={selectedManagerId}
						onValueChange={handleManagerChange}
						options={managerOptions}
						dataUi="timesheet-manager-trigger"
					/>
				</div>

				<div className={hrDataTableFilterClass}>
				<Select value={selectedDocumentType} onValueChange={handleDocumentTypeChange}>
					<SelectTrigger className={hrDataTableSelectTriggerClass}>
						<SelectValue placeholder="Document type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Document Types</SelectItem>
						{documentTypeOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				</div>
			</>
		);
	}, [
		departments,
		documentTypeOptions,
		filteredManagers,
		handleDepartmentChange,
		handleDocumentTypeChange,
		handleManagerChange,
		handleSectionChange,
		sections,
		selectedDepartmentId,
		selectedDocumentType,
		selectedManagerId,
		selectedSectionId,
	]);

	return (
		<div className="space-y-6">
			<Card className="overflow-hidden">
				<CardContent className="p-3 sm:p-4">
					{isLoadingCompliance ? (
						<div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-center lg:gap-8">
							<div className="flex flex-col justify-center px-2 sm:px-4 lg:w-[36rem] lg:max-w-[36rem] lg:flex-shrink-0">
								<div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-3 sm:gap-4">
									<Skeleton className="h-[140px] w-[140px] rounded-full" />
									<Skeleton className="h-[140px] w-[140px] rounded-full" />
									<Skeleton className="h-[140px] w-[140px] rounded-full" />
								</div>
								<Skeleton className="mx-auto mt-6 h-10 w-56" />
							</div>
							<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-3 lg:max-w-3xl">
								{[1, 2, 3, 4, 5].map((i) => (
									<Skeleton key={i} className="h-10 w-full" />
								))}
							</div>
						</div>
					) : (
						<div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-center lg:gap-8">
							<div className="flex flex-col justify-center px-2 sm:px-4 lg:w-[36rem] lg:max-w-[36rem] lg:flex-shrink-0">
								<div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-3 sm:gap-4">
									<ComplianceSummaryMetric
										label="Non-Compliant"
										percent={Math.round(
											100 - (documentMetrics?.compliancePercentage || 0),
										)}
										color="#ef4444"
										count={documentMetrics?.nonCompliantEmployeesCount || 0}
										total={documentMetrics?.totalEmployees || 0}
										description="Employees non-compliant"
									/>
									<ComplianceSummaryMetric
										label="Warnings"
										percent={Math.round(
											((warningEmployeesCount || 0) /
												Math.max(documentMetrics?.totalEmployees || 0, 1)) *
												100,
										)}
										color="#d97706"
										count={warningEmployeesCount}
										total={documentMetrics?.totalEmployees || 0}
										description="Employees with warnings"
									/>
									<ComplianceSummaryMetric
										label="Overall Compliance"
										percent={Math.round(
											documentMetrics?.compliancePercentage || 0,
										)}
										color="#16a34a"
										count={documentMetrics?.compliantEmployeesCount || 0}
										total={documentMetrics?.totalEmployees || 0}
										description="Employees compliant on mandated docs"
									/>
								</div>
								<div className="mt-6 text-center text-xs text-gray-700 sm:text-sm">
									<div>
										<span className="font-semibold text-blue-600">
											{(
												documentMetrics?.verifiedDocuments || 0
											).toLocaleString()}
										</span>{" "}
										<span className="text-gray-500">of</span>{" "}
										<span className="font-semibold">
											{(
												documentMetrics?.totalDocuments || 0
											).toLocaleString()}
										</span>
									</div>
									<div className="text-[11px] text-gray-500">
										Mandated document requirements satisfied
									</div>
								</div>
							</div>

							<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-3 lg:max-w-3xl">
								{(documentMetrics?.documentBreakdown || [])
									.slice(0, 6)
									.map((doc, index) => {
										const colors = [
											"#3b82f6",
											"#8b5cf6",
											"#06b6d4",
											"#ec4899",
											"#f97316",
											"#14b8a6",
										];
										const color = colors[index % colors.length];
										const percent = Math.round(doc.percentage);
										return (
											<div
												key={doc.id}
												className="flex items-center gap-3 sm:gap-3.5">
												<div className="flex-shrink-0">
													<SmallCircularProgress
														percent={percent}
														color={color}
														size={32}
													/>
												</div>
												<div className="flex-1">
													<div className="flex items-center justify-between gap-4 text-[11px] font-medium text-gray-700 sm:text-xs">
														<span className="pr-2 leading-4">
															{doc.name}
														</span>
														<span className="flex-shrink-0">
															{percent}%
														</span>
													</div>
													<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
														<div
															className="h-full rounded-full"
															style={{
																width: `${percent}%`,
																backgroundColor: color,
															}}
														/>
													</div>
												</div>
											</div>
										);
									})}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
					<CardHeader className="space-y-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="flex items-center gap-2">
									{selectedTab === "non-compliant" ? (
										<>
											<AlertCircle className="h-5 w-5 text-red-500" />
											Employee Document Compliance
										</>
									) : selectedTab === "pending-approval" ? (
										<>
											<FileCheck className="h-5 w-5 text-sky-500" />
											Document Approval Queue
										</>
									) : selectedTab === "history" ? (
										<>
											<FileText className="h-5 w-5 text-neutral-500" />
											Document Review History
										</>
									) : selectedTab === "warnings" ? (
										<>
											<AlertCircle className="h-5 w-5 text-amber-500" />
											Employee Document Warnings
										</>
									) : (
										<>
											<CheckCircle className="h-5 w-5 text-green-500" />
											Employee Document Compliance
										</>
									)}
								</CardTitle>
							</div>
							<TabsList className="flex-wrap justify-start">
								<TabsTrigger value="non-compliant" className="whitespace-nowrap">
									Non-Compliant (
									{documentMetrics?.nonCompliantEmployeesCount || 0})
								</TabsTrigger>
								<TabsTrigger value="compliant" className="whitespace-nowrap">
									Compliant ({normalizedCleanCompliantEmployees.length})
								</TabsTrigger>
								<TabsTrigger value="pending-approval" className="whitespace-nowrap">
									Pending Approval ({pendingApprovalEmployeesCount})
								</TabsTrigger>
								<TabsTrigger value="warnings" className="whitespace-nowrap">
									Warnings ({warningEmployeesCount})
								</TabsTrigger>
								<TabsTrigger value="history" className="whitespace-nowrap">
									Review History
								</TabsTrigger>
							</TabsList>
						</div>
					</CardHeader>
					<CardContent>
						<TabsContent value="non-compliant" className="mt-0">
							<div id="non-compliant-employees" />
							<DataTable<ComplianceEmployeeRow>
								title="Non-Compliant Employees"
								data={filteredNonCompliantEmployees}
								columns={employeeColumns}
								searchFields={[
									"name",
									"employeeId",
									"department",
									"position",
									"documentSearchText",
								]}
								showSearch
								searchPlaceholder="Search employees, IDs, departments, positions, or documents..."
								customFilters={documentFilterControls}
								alwaysShowPagination
								noCard
							/>
						</TabsContent>
						<TabsContent value="compliant" className="mt-0">
							<DataTable<ComplianceEmployeeRow>
								title="Compliant Employees"
								data={filteredCompliantEmployees}
								columns={employeeColumns}
								emptyMessage={
									selectedDocumentType === "all"
										? "No fully compliant employees yet"
										: "No compliant employees for this document type"
								}
								emptyDescription={
									selectedDocumentType === "all"
										? "Employees appear here once every mandated document requirement is satisfied, even if optional documents still have warnings."
										: "Try another document type or check the non-compliant tab for missing requirements."
								}
								searchFields={[
									"name",
									"employeeId",
									"department",
									"position",
									"documentSearchText",
								]}
								showSearch
								searchPlaceholder="Search employees, IDs, departments, positions, or documents..."
								customFilters={documentFilterControls}
								alwaysShowPagination
								noCard
							/>
						</TabsContent>
						<TabsContent value="pending-approval" className="mt-0">
							<DataTable<ComplianceEmployeeRow>
								title="Employees With Pending Document Approval"
								data={filteredPendingApprovalEmployees}
								columns={employeeColumns}
								isLoading={isLoadingCompliance}
								emptyMessage={
									selectedDocumentType === "all"
										? "No pending document approvals right now"
										: "No pending approvals for this document type"
								}
								emptyDescription={
									selectedDocumentType === "all"
										? "Employees appear here when they submitted a required document and HR still needs to verify it for the employee record."
										: "Try another document type or switch tabs to review other compliance issues."
								}
								emptyActions={
									<Button
										type="button"
										variant="outline"
										onClick={openReviewHistory}>
										<FileText className="mr-2 h-4 w-4" />
										View Review History
									</Button>
								}
								searchFields={[
									"name",
									"employeeId",
									"department",
									"position",
									"documentSearchText",
								]}
								showSearch
								searchPlaceholder="Search employees, IDs, departments, positions, or approval documents..."
								customFilters={documentFilterControls}
								titleActions={
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={openReviewHistory}>
										<FileText className="mr-2 h-4 w-4" />
										Review History
									</Button>
								}
								alwaysShowPagination
								noCard
							/>
						</TabsContent>
						<TabsContent value="warnings" className="mt-0">
							<DataTable<ComplianceEmployeeRow>
								title="Employees With Optional Warnings"
								data={filteredWarningEmployees}
								columns={employeeColumns}
								emptyMessage={
									selectedDocumentType === "all"
										? "No optional warnings right now"
										: "No warnings for this document type"
								}
								emptyDescription={
									selectedDocumentType === "all"
										? "Warnings appear only after an employee is already compliant on all mandated documents and is missing only optional items."
										: "Try another document type or switch tabs to review related records."
								}
								searchFields={[
									"name",
									"employeeId",
									"department",
									"position",
									"documentSearchText",
								]}
								showSearch
								searchPlaceholder="Search employees, IDs, departments, positions, or documents..."
								customFilters={documentFilterControls}
								alwaysShowPagination
								noCard
							/>
						</TabsContent>
						<TabsContent value="history" className="mt-0">
							<DataTable<DocumentReviewEventRow>
								title="Document Review History"
								description="Audit movement from submitted, approved, returned, resubmitted, and system-synced document review events."
								data={documentReviewEventRows}
								columns={documentReviewEventColumns}
								isLoading={isLoadingReviewEvents}
								emptyMessage="No document review history yet"
								emptyDescription="Submitted, approved, returned, and resubmitted document review events will appear here."
								searchFields={[
									"employeeName",
									"employeeCode",
									"documentName",
									"documentCode",
									"eventType",
									"actor",
								]}
								showSearch={false}
								onPageChange={handlePageChange}
								currentPage={
									documentReviewEventsData?.pagination?.page || selectedPage
								}
								totalItems={documentReviewEventsData?.count || 0}
								totalPages={documentReviewEventsData?.pagination?.totalPages || 1}
								itemsPerPage={documentReviewEventsData?.pagination?.limit || 20}
								alwaysShowPagination
								noCard
							/>
						</TabsContent>
					</CardContent>
				</Tabs>
			</Card>

			<Dialog
				open={isHistoryDetailModalOpen}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) closeHistoryDetail();
				}}>
				<DialogContent className="sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle>Review Event Details</DialogTitle>
					</DialogHeader>
					{selectedHistoryEvent ? (
						<div className="space-y-4">
							<div className="rounded-lg border border-neutral-200 bg-white p-4">
								<div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
									<div className="flex min-w-0 flex-1 items-start gap-3">
										<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
											{getInitials(selectedHistoryEvent.employeeName)}
										</div>
										<div className="min-w-0">
											<div className="text-xs font-semibold uppercase text-neutral-500">
												Employee record affected
											</div>
											<div className="mt-1 truncate text-base font-semibold text-neutral-950">
												{selectedHistoryEvent.employeeName}
											</div>
											<div className="text-sm text-neutral-500">
												{[
													selectedHistoryEvent.employeeCode,
													selectedHistoryEvent.department,
													selectedHistoryEvent.position,
												]
													.filter(Boolean)
													.join(" - ")}
											</div>
											<Button
												type="button"
												variant="link"
												size="sm"
												className="mt-2 h-auto p-0 text-xs text-sky-700"
												onClick={() =>
													navigate(
														`/employee/${selectedHistoryEvent.employeeId}?tab=documents`,
													)
												}>
												Open employee documents
											</Button>
										</div>
									</div>

									<div className="flex min-w-0 flex-1 items-start gap-3 border-t border-neutral-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
										<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-semibold text-orange-700 ring-1 ring-orange-200">
											{getInitials(selectedHistoryEvent.actor)}
										</div>
										<div className="min-w-0">
											<div className="text-xs font-semibold uppercase text-neutral-500">
												{selectedHistoryEvent.actorActionLabel}
											</div>
											<div className="mt-1 truncate text-base font-semibold text-neutral-950">
												{selectedHistoryEvent.actor}
											</div>
											<div className="text-sm text-neutral-500">
												{[
													selectedHistoryEvent.actorCode,
													selectedHistoryEvent.actorPosition,
												]
													.filter(Boolean)
													.join(" - ") || "System"}
											</div>
										</div>
									</div>
								</div>
							</div>

							<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
								<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												variant="outline"
												className="border-neutral-300 bg-white text-neutral-700">
												{selectedHistoryEvent.eventType}
											</Badge>
											<span className="text-sm text-neutral-500">
												{formatAuditDate(selectedHistoryEvent.occurredAt)}
											</span>
										</div>
										<div className="mt-3 text-lg font-semibold text-neutral-950">
											{selectedHistoryEvent.documentName}
										</div>
										<div className="text-sm text-neutral-500">
											{selectedHistoryEvent.documentCode}
										</div>
									</div>

									<div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
										<span className="rounded-md bg-neutral-50 px-2 py-1 text-sm font-medium text-neutral-700">
											{selectedHistoryEvent.fromStatus}
										</span>
										<ArrowRight className="h-4 w-4 text-neutral-400" />
										<span className="rounded-md bg-orange-50 px-2 py-1 text-sm font-semibold text-orange-800">
											{selectedHistoryEvent.toStatus}
										</span>
									</div>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-3">
								<div className="rounded-lg border border-neutral-200 bg-white p-4">
									<div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
										<Clock className="h-4 w-4" />
										Audit timestamp
									</div>
									<div className="mt-2 text-sm font-semibold text-neutral-900">
										{formatAuditDate(selectedHistoryEvent.occurredAt) || "-"}
									</div>
								</div>
								<div className="rounded-lg border border-neutral-200 bg-white p-4">
									<div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
										<UserCheck className="h-4 w-4" />
										Accountability
									</div>
									<div className="mt-2 text-sm font-semibold text-neutral-900">
										{selectedHistoryEvent.actor}
									</div>
								</div>
								<div className="rounded-lg border border-neutral-200 bg-white p-4">
									<div className="text-xs font-semibold uppercase text-neutral-500">
										Source
									</div>
									<div className="mt-2 text-sm font-semibold text-neutral-900">
										{formatDocumentStatus(selectedHistoryEvent.record.source)}
									</div>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-2">
								<div className="rounded-lg border border-neutral-200 bg-white p-4">
									<div className="text-xs font-semibold uppercase text-neutral-500">
										Reason
									</div>
									<div className="mt-2 text-sm text-neutral-800">
										{selectedHistoryEvent.reason || "-"}
									</div>
								</div>
								<div className="rounded-lg border border-neutral-200 bg-white p-4">
									<div className="text-xs font-semibold uppercase text-neutral-500">
										Comments
									</div>
									<div className="mt-2 text-sm text-neutral-800">
										{selectedHistoryEvent.comments || "-"}
									</div>
								</div>
							</div>

							<div className="rounded-lg border border-neutral-200 bg-white p-4">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<div className="text-xs font-semibold uppercase text-neutral-500">
											Evidence
										</div>
										<div className="mt-1 text-sm text-neutral-600">
											File and field changes captured with this review event.
										</div>
									</div>
									{selectedHistoryEvent.record.fileUrl ? (
										<Button variant="outline" size="sm" asChild>
											<a
												href={selectedHistoryEvent.record.fileUrl}
												target="_blank"
												rel="noreferrer">
												<Eye className="mr-2 h-4 w-4" />
												Open file
											</a>
										</Button>
									) : null}
								</div>
								{selectedHistoryEvent.record.fieldChanges ? (
									<pre className="mt-3 max-h-44 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">
										{JSON.stringify(
											selectedHistoryEvent.record.fieldChanges,
											null,
											2,
										)}
									</pre>
								) : (
									<div className="mt-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
										No field-level changes were captured for this event.
									</div>
								)}
							</div>

							<div className="flex justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={closeHistoryDetail}>
									Close
								</Button>
							</div>
						</div>
					) : (
						<div className="py-8 text-center text-sm text-neutral-500">
							The selected review event could not be found. Refresh history and try
							again.
						</div>
					)}
				</DialogContent>
			</Dialog>

			<EmployeeDocumentActionModal
				key={`${action}-${selectedEmployeeId}-${selectedReviewDocumentId || selectedActionDocumentType}-${selectedActionDocumentNumber}-${selectedActionMode}`}
				employeeId={selectedEmployeeId}
				open={
					isDocumentActionModalOpen ||
					(isReviewModalOpen && Boolean(selectedReviewExistingDocument))
				}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						if (isReviewModalOpen) {
							closeReview();
						} else {
							closeDocumentAction();
						}
					}
				}}
				mode={isReviewModalOpen ? "edit" : selectedActionMode}
				existingDocument={
					isReviewModalOpen ? selectedReviewExistingDocument : selectedActionExistingDocument
				}
				initialDocumentType={
					isReviewModalOpen
						? selectedReviewExistingDocument?.documentTypeId ||
							selectedReviewExistingDocument?.type ||
							selectedReviewExistingDocument?.name ||
							selectedReviewDetail?.name
						: selectedActionDocumentType
				}
				lockDocumentType={
					isReviewModalOpen ||
					Boolean(selectedActionDocumentType)
				}
				actor="hr"
				actorLabel={currentActorLabel}
				targetEmployeeLabel={selectedActionEmployeeLabel}
				targetEmployeeCode={selectedActionEmployee?.employeeId}
				onSaved={() => {
					closeDocumentAction();
					queryClient.invalidateQueries({
						queryKey: [...queryKeys.metrics.all, "documentCompliance"],
					});
				}}
				reviewAction={
					isReviewModalOpen
						? {
								enabled: true,
								mode: reviewMode,
								onModeChange: (mode) => {
									setReviewMode(mode);
									if (mode === "approve") setRejectionReason("");
								},
								rejectionReason,
								onRejectionReasonChange: setRejectionReason,
								onSubmit: submitReview,
								isPending: reviewDocument.isPending,
							}
						: undefined
				}
			/>
		</div>
	);
}
