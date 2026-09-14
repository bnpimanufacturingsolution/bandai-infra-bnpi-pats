import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import type { Employee, EmployeeDocumentPriorityItem } from "~/services/employees.service";
import {
	FileText,
	Download,
	Eye,
	Trash2,
	Upload,
	X,
	Edit,
	Folder,
	LayoutGrid,
	List,
	Search,
	ArrowLeft,
	MoreHorizontal,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { Input } from "~/components/atoms/Input";
import { type SelectOption } from "~/components/atoms/Select";
import { DocumentFileViewer } from "~/components/molecules/document-file-viewer";
import {
	useDeleteEmployeeDocument,
	useUpdateEmployee,
	useCustomDocumentFolders,
	useCreateCustomDocumentFolder,
} from "~/lib/hooks/useEmployees";
import { useDocumentActionMetrics } from "~/lib/hooks/useMetrics";
import { toast } from "sonner";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import { DOCUMENT_TYPE_CATEGORY_OPTIONS } from "~/lib/constants/document-type-categories";
import type { DocumentType } from "~/services/document-types.service";
import { EmployeeDocumentActionModal } from "./employee-document-action-modal";

interface DocumentsTabProps {
	employee: Employee;
	canEdit: boolean;
}

type EmployeeDocumentRecord = NonNullable<Employee["documents"]>[number];

// Document type options
const LEGACY_DOCUMENT_TYPE_OPTIONS: SelectOption[] = [
	{ value: "passport", label: "Passport" },
	{ value: "driver_license", label: "Driver's License" },
	{ value: "sss_id", label: "SSS ID" },
	{ value: "tin_id", label: "TIN ID" },
	{ value: "philhealth_id", label: "PhilHealth ID" },
	{ value: "pagibig_id", label: "Pag-IBIG ID" },
	{ value: "payslip", label: "Payslip" },
	{ value: "birth_certificate", label: "Birth Certificate" },
	{ value: "marriage_certificate", label: "Marriage Certificate" },
	{ value: "contract", label: "Employment Contract" },
	{ value: "certificate", label: "Certificate" },
	{ value: "diploma", label: "Diploma" },
	{ value: "transcript", label: "Transcript of Records" },
	{ value: "clearance", label: "Clearance" },
	{ value: "medical_certificate", label: "Medical Certificate" },
	{ value: "nbi_clearance", label: "NBI Clearance" },
	{ value: "police_clearance", label: "Police Clearance" },
	{ value: "barangay_clearance", label: "Barangay Clearance" },
	{ value: "other", label: "Other" },
];

/** Default page-facing-up glyph (📄). Compare against this — never a Latin-1 "ðŸ“„" mojibake. */
const DEFAULT_DOCUMENT_ICON = "\u{1F4C4}";

const getCanonicalDocumentCategoryValue = (value: string) =>
	DOCUMENT_TYPE_CATEGORY_OPTIONS.find((option) => option.value === value)?.value || value;

const DEFAULT_FOLDER_CATEGORY_BY_ID: Record<string, string> = {
	compliance: getCanonicalDocumentCategoryValue("COMPLIANCE"),
	certificates: getCanonicalDocumentCategoryValue("ONBOARDING"),
	payroll: getCanonicalDocumentCategoryValue("PAYROLL"),
	contracts: getCanonicalDocumentCategoryValue("LEGAL"),
	other: getCanonicalDocumentCategoryValue("OTHER"),
};

export function DocumentsTab({ employee, canEdit }: DocumentsTabProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [documents, setDocuments] = useState(employee.documents || []);
	const [viewerOpen, setViewerOpen] = useState(false);
	const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
	const [selectedDocName, setSelectedDocName] = useState<string | null>(null);
	const [selectedDocExt, setSelectedDocExt] = useState<string | null>(null);

	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [docToDelete, setDocToDelete] = useState<(typeof documents)[0] | null>(null);

	const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	// Directory view state
	const [currentFolder, setCurrentFolder] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

	const [selectedDocumentCategory, setSelectedDocumentCategory] = useState<string | null>(null);

	// Get action and documentNumber from URL
	const action = searchParams.get("action");
	const urlDocumentNumber = searchParams.get("documentNumber");
	const findDocumentByUrlKey = (documentKey?: string | null) => {
		const normalizedKey = String(documentKey || "").trim();
		if (!normalizedKey) return null;
		return (
			documents.find(
				(doc) =>
					String(doc.id || "").trim() === normalizedKey ||
					String((doc as any).documentId || "").trim() === normalizedKey ||
					doc.number === normalizedKey,
			) || null
		);
	};

	// Find the document being edited or viewed
	const editingDocument =
		action === "edit-doc" && urlDocumentNumber ? findDocumentByUrlKey(urlDocumentNumber) : null;

	const viewingDocument =
		action === "view-doc" && urlDocumentNumber ? findDocumentByUrlKey(urlDocumentNumber) : null;

	const deleteMutation = useDeleteEmployeeDocument(employee.id);
	const updateEmployeeMutation = useUpdateEmployee();

	const { data: fetchCustomFolders } = useCustomDocumentFolders(employee.id);
	const { data: documentPriorityData } = useDocumentActionMetrics(employee.id, {
		enabled: !!employee.id,
	});
	const createFolderMutation = useCreateCustomDocumentFolder();
	const { data: documentTypesData } = useDocumentTypes(
		{
			page: 1,
			limit: 100,
			sort: "displayOrder",
			order: "asc",
			filter: "isActive:true",
		},
		{ enabled: !!employee.organizationId },
	);

	// Canonical type normalizer for grouping/filtering legacy and current values.
	const normalizeDocumentType = (type?: string): string => {
		if (!type) return "";
		const typeMap: Record<string, string> = {
			TIN: "tin_id",
			SSS: "sss_id",
			PHILHEALTH: "philhealth_id",
			PAGIBIG: "pagibig_id",
			PAYSLIP: "payslip",
			PASSPORT: "passport",
			DRIVER_LICENSE: "driver_license",
			BIRTH_CERTIFICATE: "birth_certificate",
			MARRIAGE_CERTIFICATE: "marriage_certificate",
			CONTRACT: "contract",
			CERTIFICATE: "certificate",
			DIPLOMA: "diploma",
			TRANSCRIPT: "transcript",
			CLEARANCE: "clearance",
			MEDICAL_CERTIFICATE: "medical_certificate",
			NBI_CLEARANCE: "nbi_clearance",
			POLICE_CLEARANCE: "police_clearance",
			BARANGAY_CLEARANCE: "barangay_clearance",
		};
		return typeMap[type.toUpperCase()] || type.toLowerCase();
	};

	// Helper function to map document type from API to select option value
	const mapDocumentTypeToOption = (type: string): string => {
		return normalizeDocumentType(type);
	};

	const formatDocumentTypeLabel = (type: string) => {
		const normalizedType = normalizeDocumentType(type);
		if (!normalizedType) return "Unknown";
		if (normalizedType === "payslip") return "Payslip";
		return normalizedType.replace(/_/g, " ");
	};

	// Get documentType from URL
	const docTypeParam = searchParams.get("documentType");

	const clearDocumentModalParams = () => {
		updateSearchParams(
			(next) => {
				next.delete("action");
				next.delete("documentNumber");
				next.delete("documentType");
			},
			{ replace: true },
		);
	};

	useEffect(() => {
		setDocuments(employee.documents || []);
	}, [employee.documents]);

	useEffect(() => {
		if (!docTypeParam || action || !canEdit) return;

		updateSearchParams(
			(next) => {
				next.set("action", "add-doc");
			},
			{ replace: true },
		);
	}, [action, canEdit, docTypeParam]);

	// Handle URL actions
	useEffect(() => {
		if (action === "edit-doc" && editingDocument) {
			if (!canEdit) {
				// If not allowed to edit, clear action
				updateSearchParams(
					(next) => {
						next.delete("action");
						next.delete("documentNumber");
					},
					{ replace: true },
				);
				return;
			}
			setSelectedDocumentCategory(null);
		} else if (action === "add-doc") {
			// Allow adding new docs regardless of canEdit (HR/admin can submit for others)
			setSelectedDocumentCategory(null);
		} else if (action === "delete-doc" && urlDocumentNumber) {
			if (!canEdit) {
				// If not allowed to delete, clear action
				updateSearchParams(
					(next) => {
						next.delete("action");
						next.delete("documentNumber");
					},
					{ replace: true },
				);
				return;
			}
			const doc = findDocumentByUrlKey(urlDocumentNumber);
			if (doc) {
				setDocToDelete(doc);
				setIsDeleteModalOpen(true);
			}
		} else {
			// Close delete modal if action is not delete-doc
			if (action !== "delete-doc") {
				setIsDeleteModalOpen(false);
				setDocToDelete(null);
			}
		}
	}, [
		action,
		editingDocument,
		documents,
		urlDocumentNumber,
		docTypeParam,
		setSearchParams,
		canEdit,
	]);

	const updateSearchParams = (
		mutator: (next: URLSearchParams) => void,
		options?: { replace?: boolean },
	) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		}, options);
	};

	const formatDate = (date: string | undefined) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const isExpired = (expiryDate: string | undefined) => {
		if (!expiryDate) return false;
		return new Date(expiryDate) < new Date();
	};

	const getDocumentIcon = (type: string) => {
		switch (normalizeDocumentType(type)) {
			case "payslip":
				return "PAY";
			case "passport":
				return "🛂";
			case "driver_license":
				return "🪪";
			case "sss_id":
			case "tin_id":
			case "philhealth_id":
			case "pagibig_id":
				return "🆔";
			case "birth_certificate":
			case "marriage_certificate":
				return "📋";
			case "contract":
				return "📝";
			case "certificate":
			case "diploma":
			case "transcript":
				return "🎓";
			case "clearance":
			case "nbi_clearance":
			case "police_clearance":
			case "barangay_clearance":
				return "✅";
			case "medical_certificate":
				return "🏥";
			default:
				return DEFAULT_DOCUMENT_ICON;
		}
	};

	const handleAddClick = () => {
		const folderCategory = currentFolder
			? DEFAULT_FOLDER_CATEGORY_BY_ID[currentFolder] || null
			: null;
		setSelectedDocumentCategory(folderCategory);
		updateSearchParams((next) => {
			next.set("action", "add-doc");
			next.delete("documentNumber");
			next.delete("documentType");
		});
	};

	const handleEditClick = (doc: (typeof documents)[0]) => {
		if (!doc.number) {
			toast.error("This document has no document number yet");
			return;
		}
		const documentNumber = doc.number;
		updateSearchParams((next) => {
			next.set("action", "edit-doc");
			next.set("documentNumber", documentNumber);
		});
	};

	const handleViewDocument = (doc: (typeof documents)[0]) => {
		if (!doc.number) {
			toast.error("This document has no document number yet");
			return;
		}
		const documentNumber = doc.number;
		// Open view modal with document details via URL
		updateSearchParams((next) => {
			next.set("action", "view-doc");
			next.set("documentNumber", documentNumber);
		});
	};

	const getFileExtensionFromUrl = (url?: string | null) => {
		if (!url) return "";
		const cleanUrl = url.split("?")[0].split("#")[0];
		const lastSegment = cleanUrl.split("/").pop() || "";
		const dotIndex = lastSegment.lastIndexOf(".");
		if (dotIndex === -1) return "";
		return lastSegment.slice(dotIndex + 1).toLowerCase();
	};

	const sanitizeFilename = (value: string) =>
		value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");

	const buildDownloadFilename = (doc: (typeof documents)[0]) => {
		const base = doc.name || doc.type || "document";
		const employeeSuffix = employee.employeeId ? `-${employee.employeeId}` : "";
		const extFromDoc = (doc as any).ext;
		const extFromUrl = getFileExtensionFromUrl(doc.fileUrl);
		const ext = extFromDoc || extFromUrl || "pdf";
		return `${sanitizeFilename(`${base}${employeeSuffix}`)}.${ext}`;
	};

	// File-first behavior for eye click/deep-link view action.
	// If the document has a fileUrl, open viewer directly and clear URL action params.
	useEffect(() => {
		if (action !== "view-doc" || !viewingDocument?.fileUrl) return;

		setSelectedDocUrl(viewingDocument.fileUrl);
		setSelectedDocName(buildDownloadFilename(viewingDocument));
		setSelectedDocExt(
			(viewingDocument as any).ext || getFileExtensionFromUrl(viewingDocument.fileUrl),
		);
		setViewerOpen(true);

		updateSearchParams(
			(next) => {
				next.delete("action");
				next.delete("documentNumber");
			},
			{ replace: true },
		);
	}, [action, viewingDocument?.number, viewingDocument?.fileUrl]);

	const handleDeleteDocument = (documentKey: string) => {
		updateSearchParams((next) => {
			next.set("action", "delete-doc");
			next.set("documentNumber", documentKey);
		});
	};

	const handleCloseDelete = () => {
		updateSearchParams(
			(next) => {
				next.delete("action");
				next.delete("documentNumber");
			},
			{ replace: true },
		);
	};

	const confirmDelete = () => {
		const documentKey = getDocumentMutationKey(docToDelete);
		if (documentKey) {
			deleteMutation.mutate(documentKey, {
				onSuccess: () => {
					setDocuments((prev) =>
						prev.filter((doc) =>
							docToDelete?.number
								? doc.number !== docToDelete.number
								: getDocumentMutationKey(doc) !== documentKey,
						),
					);
					toast.success("Document deleted successfully");
					handleCloseDelete();
				},
				onError: () => {
					toast.error("Failed to delete document");
				},
			});
		}
	};

	const DEFAULT_FOLDERS = [
		{
			id: "compliance",
			name: "Compliance & Identity",
			category: DEFAULT_FOLDER_CATEGORY_BY_ID.compliance,
			types: [
				"sss_id",
				"tin_id",
				"philhealth_id",
				"pagibig_id",
				"passport",
				"driver_license",
				"nbi_clearance",
				"police_clearance",
				"barangay_clearance",
				"clearance",
			],
		},
		{
			id: "certificates",
			name: "Certificates & Education",
			category: DEFAULT_FOLDER_CATEGORY_BY_ID.certificates,
			types: [
				"birth_certificate",
				"marriage_certificate",
				"diploma",
				"transcript",
				"medical_certificate",
				"certificate",
			],
		},
		{
			id: "contracts",
			name: "Contracts & Agreements",
			category: DEFAULT_FOLDER_CATEGORY_BY_ID.contracts,
			types: ["contract"],
		},
		{
			id: "payroll",
			name: "Payroll Documents",
			category: DEFAULT_FOLDER_CATEGORY_BY_ID.payroll,
			types: ["payslip"],
		},
	];

	// Extract custom folders from new API hook
	const customFolders = fetchCustomFolders || [];

	const CUSTOM_FOLDERS_MAPPED = customFolders.map((cf: any) => ({
		id: cf.id,
		name: cf.name,
		category: null,
		types: [cf.id], // The uploaded document 'type' will exactly match the custom folder 'id'
	}));

	const ALL_FOLDERS = [
		...DEFAULT_FOLDERS,
		...CUSTOM_FOLDERS_MAPPED,
		{
			id: "other",
			name: "Other Uploads",
			category: DEFAULT_FOLDER_CATEGORY_BY_ID.other,
			types: ["other"],
		},
	];

	const configuredDocumentTypes = (documentTypesData?.documentTypes || []).filter(
		(documentType) => documentType.isActive,
	);

	const configuredDocumentTypeOptions = useMemo<SelectOption[]>(
		() =>
			configuredDocumentTypes.map((configuredType) => ({
				value: normalizeDocumentType(configuredType.code || "") || configuredType.id,
				label: configuredType.name,
			})),
		[configuredDocumentTypes],
	);

	const configuredCategoryByTypeValue = useMemo(
		() =>
			new Map(
				configuredDocumentTypes.map((configuredType) => [
					normalizeDocumentType(configuredType.code || "") || configuredType.id,
					String(configuredType.category || "").toUpperCase(),
				]),
			),
		[configuredDocumentTypes],
	);

	const folderIdByCategory = useMemo(
		() =>
			new Map(
				Object.entries(DEFAULT_FOLDER_CATEGORY_BY_ID).map(([folderId, category]) => [
					String(category || "").toUpperCase(),
					folderId,
				]),
			),
		[],
	);

	const configuredDocumentTypeLookup = useMemo(() => {
		const lookup = new Map<string, (typeof configuredDocumentTypes)[number]>();

		for (const configuredType of configuredDocumentTypes) {
			const candidates = [
				String(configuredType.id || "").trim(),
				normalizeDocumentType(configuredType.code || ""),
				normalizeDocumentType(configuredType.name || ""),
				String(configuredType.code || "")
					.trim()
					.toUpperCase(),
				String(configuredType.name || "")
					.trim()
					.toUpperCase(),
			].filter(Boolean);

			for (const candidate of candidates) {
				if (!lookup.has(candidate)) {
					lookup.set(candidate, configuredType);
				}
			}
		}

		return lookup;
	}, [configuredDocumentTypes]);

	const getFolderIdFromLegacyType = (docType?: string | null) => {
		const normalizedDocType = normalizeDocumentType(docType || "");
		for (const folder of ALL_FOLDERS) {
			if (folder.types.includes(normalizedDocType)) return folder.id;
		}
		return "other";
	};

	const resolveConfiguredDocumentType = (params: {
		documentTypeId?: string | null;
		type?: string | null;
		name?: string | null;
	}) => {
		const candidates = [
			String(params.documentTypeId || "").trim(),
			normalizeDocumentType(params.type || ""),
			normalizeDocumentType(params.name || ""),
			String(params.type || "")
				.trim()
				.toUpperCase(),
			String(params.name || "")
				.trim()
				.toUpperCase(),
		].filter(Boolean);

		for (const candidate of candidates) {
			const configuredType = configuredDocumentTypeLookup.get(candidate);
			if (configuredType) return configuredType;
		}

		return null;
	};

	const resolveFolderId = (params: {
		documentTypeId?: string | null;
		type?: string | null;
		name?: string | null;
		category?: string | null;
	}) => {
		const configuredType = resolveConfiguredDocumentType(params);
		const configuredCategory = String(configuredType?.category || "")
			.trim()
			.toUpperCase();
		if (configuredCategory && folderIdByCategory.has(configuredCategory)) {
			return folderIdByCategory.get(configuredCategory) || "other";
		}

		const providedCategory = String(params.category || "")
			.trim()
			.toUpperCase();
		if (providedCategory && folderIdByCategory.has(providedCategory)) {
			return folderIdByCategory.get(providedCategory) || "other";
		}

		return getFolderIdFromLegacyType(params.type || params.name || "");
	};

	const filteredDocuments = useMemo(
		() =>
			documents.filter((doc) => {
				const matchesFolder = currentFolder
					? resolveFolderId({
							documentTypeId: doc.documentTypeId,
							type: doc.type,
							name: doc.name,
						}) === currentFolder
					: true;
				if (!matchesFolder) return false;
				if (searchQuery) {
					const searchLower = searchQuery.toLowerCase();
					const normalizedTypeLabel = normalizeDocumentType(doc.type).replace(/_/g, " ");
					const rawTypeLabel = (doc.type || "").toLowerCase().replace(/_/g, " ");
					const typeMatch =
						normalizedTypeLabel.includes(searchLower) ||
						rawTypeLabel.includes(searchLower);
					const numberMatch = (doc.number || "").toLowerCase().includes(searchLower);
					return typeMatch || numberMatch;
				}
				return true;
			}),
		[currentFolder, documents, searchQuery],
	);

	const priorityItems = documentPriorityData?.items || [];

	const priorityByDocumentNumber = useMemo(
		() =>
			new Map(
				priorityItems
					.filter((item) => item.number)
					.map((item) => [String(item.number), item] as const),
			),
		[priorityItems],
	);

	const priorityByType = useMemo(() => {
		const map = new Map<string, (typeof priorityItems)[number]>();
		for (const item of priorityItems) {
			const typeKey = normalizeDocumentType(item.type) || String(item.documentTypeId || "");
			if (!typeKey || map.has(typeKey)) continue;
			map.set(typeKey, item);
		}
		return map;
	}, [priorityItems]);

	const getPriorityItemForDocument = (doc: EmployeeDocumentRecord) => {
		if (doc.number && priorityByDocumentNumber.has(doc.number)) {
			return priorityByDocumentNumber.get(doc.number) || null;
		}
		const typeKey = normalizeDocumentType(doc.type) || String(doc.documentTypeId || "");
		return priorityByType.get(typeKey) || null;
	};

	const getDocumentMutationKey = (doc?: EmployeeDocumentRecord | null) => {
		if (!doc) return "";
		const priorityItem = getPriorityItemForDocument(doc);
		return (
			String(priorityItem?.documentId || "").trim() ||
			String((doc as any).documentId || "").trim() ||
			String(doc.number || "").trim() ||
			String((doc as any).id || "").trim()
		);
	};

	const canUpdateDocument = (doc?: EmployeeDocumentRecord | null) => {
		if (!canEdit || !doc) return false;
		const priorityItem = getPriorityItemForDocument(doc);
		const reviewStatus = String(
			(doc as any)?.reviewStatus || (doc as any)?.metadata?.review?.status || "",
		)
			.trim()
			.toLowerCase();
		const priorityState = String(priorityItem?.priorityState || "")
			.trim()
			.toLowerCase();
		const state =
			reviewStatus === "pending"
				? "pending_approval"
				: reviewStatus === "rejected"
					? "rejected"
					: priorityState;

		if (state === "pending_approval") return false;

		return (
			priorityItem?.isActionable === true ||
			state === "rejected" ||
			state === "needs_update" ||
			state === "expired" ||
			isExpired(doc.expiryDate)
		);
	};

	const getFolderPriorityItems = (folderId: string) => {
		const folder = ALL_FOLDERS.find((item) => item.id === folderId);
		if (!folder) return [];
		return priorityItems.filter(
			(item) =>
				resolveFolderId({
					documentTypeId: item.documentTypeId,
					type: item.type,
					name: item.displayName,
					category: item.category,
				}) === folder.id,
		);
	};

	const isVisibleDocumentAttentionItem = (item: (typeof priorityItems)[number]) =>
		item.priorityState !== "optional" &&
		(item.isActionable || item.priorityState === "pending_approval");

	const getFolderActionCount = (folderId: string) =>
		getFolderPriorityItems(folderId).filter((item) => isVisibleDocumentAttentionItem(item))
			.length;
	const getFolderPendingApprovalCount = (folderId: string) =>
		getFolderPriorityItems(folderId).filter((item) => item.priorityState === "pending_approval")
			.length;

	const currentFolderPriorityItems = currentFolder ? getFolderPriorityItems(currentFolder) : [];
	const currentFolderMissingVirtualItems = currentFolderPriorityItems.filter(
		(item) => item.isVirtual && item.isActionable && item.priorityState === "missing_required",
	);
	const currentFolderPendingApprovalItems = currentFolderPriorityItems.filter(
		(item) => item.priorityState === "pending_approval",
	);

	const getPriorityBadge = (priorityItem?: (typeof priorityItems)[number] | null) => {
		const state = String(priorityItem?.priorityState || "")
			.trim()
			.toLowerCase();
		if (!state || state === "ready") return null;
		if (state === "missing_required") {
			return {
				label: "Missing",
				className: "border-red-200 bg-red-50 text-red-700",
			};
		}
		if (state === "rejected") {
			return {
				label: "Needs Correction",
				className: "border-rose-200 bg-rose-50 text-rose-700",
			};
		}
		if (state === "pending_approval") {
			return {
				label: "Waiting for HR Approval",
				className: "border-sky-200 bg-sky-50 text-sky-700",
			};
		}
		if (state === "expired") {
			return {
				label: "Expired",
				className: "border-orange-200 bg-orange-50 text-orange-700",
			};
		}
		if (state === "needs_update") {
			return {
				label: "Needs Update",
				className: "border-amber-200 bg-amber-50 text-amber-700",
			};
		}
		if (state === "optional") {
			return {
				label: "Recommended",
				className: "border-slate-200 bg-slate-50 text-slate-700",
			};
		}
		return null;
	};

	const currentFolderExistingCount = filteredDocuments.length;

	const openAddDocumentForType = (documentTypeValue: string) => {
		const folderCategory = currentFolder
			? DEFAULT_FOLDER_CATEGORY_BY_ID[currentFolder] || null
			: null;
		setSelectedDocumentCategory(folderCategory);
		updateSearchParams((next) => {
			next.set("action", "add-doc");
			next.set("documentType", documentTypeValue);
			next.delete("documentNumber");
		});
	};

	const handleAddFolder = () => {
		if (!newFolderName.trim()) return;

		// Prevent duplicates
		if (ALL_FOLDERS.some((f) => f.name.toLowerCase() === newFolderName.trim().toLowerCase())) {
			toast.error("A folder with this name already exists");
			return;
		}

		createFolderMutation.mutate(
			{ employeeId: employee.id, name: newFolderName.trim() },
			{
				onSuccess: () => {
					setIsAddFolderModalOpen(false);
					setNewFolderName("");
					toast.success("Folder created successfully");
				},
				onError: () => {
					toast.error("Failed to create folder");
				},
			},
		);
	};

	// Keep custom folders uploadable directly while allowing category-prefilled filtering.
	const allDocumentTypeOptions = useMemo(() => {
		const baseOptions =
			configuredDocumentTypeOptions.length > 0
				? configuredDocumentTypeOptions
				: LEGACY_DOCUMENT_TYPE_OPTIONS;
		const mergedOptions = [...baseOptions];

		for (const customFolder of CUSTOM_FOLDERS_MAPPED) {
			if (!mergedOptions.some((option) => option.value === customFolder.id)) {
				mergedOptions.push({ value: customFolder.id, label: customFolder.name });
			}
		}

		return mergedOptions;
	}, [configuredDocumentTypeOptions, CUSTOM_FOLDERS_MAPPED]);

	const currentFolderConfig = currentFolder
		? ALL_FOLDERS.find((folder) => folder.id === currentFolder) || null
		: null;

	const filteredDocumentTypeOptions = useMemo(() => {
		if (action === "edit-doc") return allDocumentTypeOptions;
		if (!selectedDocumentCategory || !currentFolderConfig) return allDocumentTypeOptions;

		const categoryMatches = allDocumentTypeOptions.filter((option) => {
			const normalizedValue = normalizeDocumentType(option.value) || option.value;
			return configuredCategoryByTypeValue.get(normalizedValue) === selectedDocumentCategory;
		});
		if (categoryMatches.length > 0) return categoryMatches;

		const folderTypeMatches = allDocumentTypeOptions.filter((option) =>
			currentFolderConfig.types.includes(normalizeDocumentType(option.value) || option.value),
		);
		return folderTypeMatches.length > 0 ? folderTypeMatches : allDocumentTypeOptions;
	}, [
		action,
		allDocumentTypeOptions,
		selectedDocumentCategory,
		currentFolderConfig,
		configuredCategoryByTypeValue,
	]);

	useEffect(() => {
		if (action !== "add-doc") return;
		if (!selectedDocumentCategory || docTypeParam) return;
		if (filteredDocumentTypeOptions.length !== 1) return;

		updateSearchParams(
			(next) => {
				next.set("documentType", filteredDocumentTypeOptions[0].value);
			},
			{ replace: true },
		);
	}, [action, docTypeParam, filteredDocumentTypeOptions, selectedDocumentCategory]);

	return (
		<>
			<div className="space-y-6">
				{/* Title Section */}
				<div className="flex items-center gap-2 mb-2">
					<FileText className="w-6 h-6 text-gray-700" />
					<h2 className="text-xl font-medium text-gray-800">Documents</h2>
				</div>

				{/* Action Bar */}
				<div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-100">
					<div className="flex items-center gap-2 w-full sm:w-auto">
						<div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white shadow-sm">
							<button
								onClick={() => setViewMode("grid")}
								className={`p-2 transition-colors ${viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
								title="Grid View">
								<LayoutGrid className="w-4 h-4" />
							</button>
							<button
								onClick={() => setViewMode("list")}
								className={`p-2 transition-colors ${viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
								title="List View">
								<List className="w-4 h-4" />
							</button>
						</div>
					</div>

					<div className="flex items-center gap-2 w-full sm:w-auto">
						<div className="relative w-full sm:w-64">
							<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
							<Input
								placeholder="Search documents..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9 h-10 w-full bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500 rounded-md shadow-sm"
							/>
						</div>
						<Button
							variant="outline"
							className="px-3 bg-white text-gray-500 border-gray-200 shadow-sm"
							title="Download Selected">
							<Download className="w-4 h-4" />
						</Button>
					</div>
				</div>

				{/* Main Content Area */}
				{currentFolder ? (
					<div className="space-y-6">
						{/* Nested Folder Header */}
						<div className="flex items-center gap-3">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setCurrentFolder(null)}
								className="text-gray-500 hover:text-gray-900 -ml-2">
								<ArrowLeft className="w-4 h-4 mr-1" />
								Back
							</Button>
							<div className="h-4 w-px bg-gray-300"></div>
							<h3 className="text-sm font-medium text-gray-700">
								{ALL_FOLDERS.find((f) => f.id === currentFolder)?.name}
							</h3>
							<Badge
								variant="outline"
								className="ml-2 text-xs font-normal text-gray-500 bg-gray-50">
								{currentFolderExistingCount} items
							</Badge>
							{currentFolderMissingVirtualItems.length > 0 && (
								<Badge className="ml-1 bg-red-500 text-white hover:bg-red-500">
									{currentFolderMissingVirtualItems.length} action
									{currentFolderMissingVirtualItems.length === 1 ? "" : "s"}
								</Badge>
							)}
							{currentFolderPendingApprovalItems.length > 0 && (
								<Badge className="ml-1 border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">
									{currentFolderPendingApprovalItems.length} waiting for HR
								</Badge>
							)}
						</div>

						{currentFolderMissingVirtualItems.length > 0 && (
							<div className="rounded-xl border border-red-100 bg-red-50/70 p-4">
								<p className="text-sm font-medium text-red-800">
									Documents still needed in this folder
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{currentFolderMissingVirtualItems.map((item) => (
										<Button
											key={item.key}
											variant="outline"
											className="h-8 border-red-200 bg-white text-red-700 hover:bg-red-100"
											onClick={() => openAddDocumentForType(item.type)}>
											{item.displayName}
										</Button>
									))}
								</div>
							</div>
						)}

						{currentFolderPendingApprovalItems.length > 0 && (
							<div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
								<p className="text-sm font-medium text-sky-800">
									Submitted and waiting for HR approval
								</p>
								<p className="mt-1 text-xs text-sky-700">
									These files were already submitted. HR still needs to review and
									approve them.
								</p>
							</div>
						)}

						{/* Documents Grid or List */}
						{filteredDocuments.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
								<div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-3 shadow-sm">
									<FileText className="w-5 h-5 text-gray-400" />
								</div>
								<p className="text-gray-900 font-medium text-sm">
									No documents found
								</p>
								<p className="text-gray-500 text-xs mt-1 max-w-sm">
									{searchQuery
										? "Try adjusting your search terms"
										: "This folder is empty. Upload a document to get started."}
								</p>
								{canEdit && !searchQuery && (
									<Button
										onClick={handleAddClick}
										variant="outline"
										className="mt-4 bg-white shadow-sm text-sm h-8">
										<Upload className="w-3.5 h-3.5 mr-2" />
										Upload File
									</Button>
								)}
							</div>
						) : viewMode === "grid" ? (
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
								{filteredDocuments.map((doc, index) => {
									const priorityBadge = getPriorityBadge(
										getPriorityItemForDocument(doc),
									);
									return (
										<div
											key={index}
											className="group relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-orange-300 transition-all flex flex-col items-center text-center">
											{/* Top Right Actions Overlay */}
											<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 overflow-hidden">
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleViewDocument(doc);
													}}
													className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50"
													title="View">
													<Eye className="w-3.5 h-3.5" />
												</button>
												{canEdit && (
													<>
														{canUpdateDocument(doc) ? (
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	handleEditClick(doc);
																}}
																className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 border-l border-gray-100"
																title="Update">
																<Edit className="w-3.5 h-3.5" />
															</button>
														) : null}
														<button
															onClick={(e) => {
																e.stopPropagation();
																const documentKey =
																	getDocumentMutationKey(doc);
																if (documentKey)
																	handleDeleteDocument(
																		documentKey,
																	);
																else
																	toast.error(
																		"This document record cannot be identified yet",
																	);
															}}
															className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 border-l border-gray-100"
															title="Delete">
															<Trash2 className="w-3.5 h-3.5" />
														</button>
													</>
												)}
											</div>

											{/* Icon */}
											<div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-3 shadow-sm border border-gray-100 group-hover:bg-gray-100 transition-colors text-3xl">
												{getDocumentIcon(doc.type) !==
												DEFAULT_DOCUMENT_ICON ? (
													getDocumentIcon(doc.type)
												) : (
													<FileText className="w-8 h-8 text-gray-400" />
												)}
											</div>

											{/* Info */}
											<h4 className="text-sm font-medium text-gray-900 capitalize w-full truncate px-2 mb-1">
												{formatDocumentTypeLabel(doc.type)}
											</h4>
											<p className="text-[11px] text-gray-500 font-mono mb-2 w-full truncate px-2">
												{doc.number || "No document number"}
											</p>
											{!isExpired(doc.expiryDate) && priorityBadge && (
												<span
													className={`mb-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${priorityBadge.className}`}>
													{priorityBadge.label}
												</span>
											)}

											{isExpired(doc.expiryDate) ? (
												<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
													Expired
												</span>
											) : (
												<span className="text-[11px] text-gray-400">
													{formatDate(doc.issueDate)}
												</span>
											)}
										</div>
									);
								})}
							</div>
						) : (
							<div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white shadow-sm">
								{filteredDocuments.map((doc, index) => {
									const priorityBadge = getPriorityBadge(
										getPriorityItemForDocument(doc),
									);
									return (
										<div
											key={index}
											className="flex items-center gap-4 p-3 hover:bg-gray-50 transition-colors">
											<div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 text-xl border border-gray-100">
												{getDocumentIcon(doc.type) !==
												DEFAULT_DOCUMENT_ICON ? (
													getDocumentIcon(doc.type)
												) : (
													<FileText className="w-5 h-5 text-gray-400" />
												)}
											</div>
											<div className="flex-1 min-w-0 flex flex-col justify-center">
												<div className="flex items-center gap-2">
													<h4 className="text-sm font-medium text-gray-900 capitalize truncate">
														{formatDocumentTypeLabel(doc.type)}
													</h4>
													{!isExpired(doc.expiryDate) &&
														priorityBadge && (
															<span
																className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${priorityBadge.className}`}>
																{priorityBadge.label}
															</span>
														)}
													{isExpired(doc.expiryDate) && (
														<span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
															Expired
														</span>
													)}
												</div>
												<p className="text-xs text-gray-500 font-mono mt-0.5">
													{doc.number || "No document number"}
												</p>
											</div>
											<div className="hidden md:flex items-center gap-8 text-xs mr-4">
												<div className="text-right">
													<p className="text-gray-400">Issued</p>
													<p className="text-gray-700 font-medium">
														{formatDate(doc.issueDate)}
													</p>
												</div>
												{doc.expiryDate && (
													<div className="text-right w-20">
														<p className="text-gray-400">Expires</p>
														<p
															className={`font-medium ${isExpired(doc.expiryDate) ? "text-red-600" : "text-gray-700"}`}>
															{formatDate(doc.expiryDate)}
														</p>
													</div>
												)}
											</div>
											<div className="flex items-center gap-1 shrink-0">
												<Button
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
													title="View"
													onClick={() => handleViewDocument(doc)}>
													<Eye className="w-4 h-4" />
												</Button>
												{canEdit && (
													<>
														{canUpdateDocument(doc) ? (
															<Button
																variant="ghost"
																size="sm"
																className="h-8 w-8 p-0 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
																title="Update"
																onClick={() =>
																	handleEditClick(doc)
																}>
																<Edit className="w-4 h-4" />
															</Button>
														) : null}
														<Button
															variant="ghost"
															size="sm"
															className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
															title="Delete"
															onClick={() => {
																const documentKey =
																	getDocumentMutationKey(doc);
																if (documentKey)
																	handleDeleteDocument(
																		documentKey,
																	);
																else
																	toast.error(
																		"This document record cannot be identified yet",
																	);
															}}>
															<Trash2 className="w-4 h-4" />
														</Button>
													</>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : /* Root Folders View */
				viewMode === "grid" ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{ALL_FOLDERS.filter((folder) => {
							if (!searchQuery) return true;
							return folder.name.toLowerCase().includes(searchQuery.toLowerCase());
						}).map((folder) => {
							const actionCount = getFolderActionCount(folder.id);
							const pendingApprovalFolderCount = getFolderPendingApprovalCount(
								folder.id,
							);
							const finalCount = documents.filter(
								(doc) =>
									resolveFolderId({
										documentTypeId: doc.documentTypeId,
										type: doc.type,
										name: doc.name,
									}) === folder.id,
							).length;

							return (
								<button
									key={folder.id}
									onClick={() => setCurrentFolder(folder.id)}
									className="flex flex-col items-center justify-center p-6 bg-gray-50 hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-gray-200 rounded-2xl group text-center disabled:opacity-50">
									<div className="mb-4 relative">
										<Folder className="w-16 h-16 text-gray-400 fill-gray-200 group-hover:text-gray-500 group-hover:fill-gray-300 transition-colors stroke-[1.5]" />
										{actionCount > 0 && (
											<span className="absolute -right-2 -top-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
												{actionCount}
											</span>
										)}
									</div>
									<h3 className="text-sm font-medium text-gray-900 mb-1">
										{folder.name}
									</h3>
									<p className="text-xs text-gray-500">{finalCount} items</p>
									{pendingApprovalFolderCount > 0 && (
										<span className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
											Waiting for HR {pendingApprovalFolderCount}
										</span>
									)}
								</button>
							);
						})}
					</div>
				) : (
					<div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white shadow-sm">
						{ALL_FOLDERS.filter((folder) => {
							if (!searchQuery) return true;
							return folder.name.toLowerCase().includes(searchQuery.toLowerCase());
						}).map((folder) => {
							const actionCount = getFolderActionCount(folder.id);
							const pendingApprovalFolderCount = getFolderPendingApprovalCount(
								folder.id,
							);
							const finalCount = documents.filter(
								(doc) =>
									resolveFolderId({
										documentTypeId: doc.documentTypeId,
										type: doc.type,
										name: doc.name,
									}) === folder.id,
							).length;

							return (
								<button
									key={folder.id}
									onClick={() => setCurrentFolder(folder.id)}
									className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 transition-colors text-left">
									<div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
										<Folder className="w-5 h-5 text-gray-400 fill-gray-200" />
									</div>
									<div className="flex-1 min-w-0 flex flex-col justify-center">
										<h4 className="text-sm font-medium text-gray-900 truncate">
											{folder.name}
										</h4>
										<div className="mt-0.5 flex flex-wrap items-center gap-2">
											<p className="text-xs text-gray-500">
												{finalCount} items
											</p>
											{pendingApprovalFolderCount > 0 && (
												<span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
													Waiting for HR {pendingApprovalFolderCount}
												</span>
											)}
										</div>
									</div>
									{actionCount > 0 && (
										<span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
											{actionCount}
										</span>
									)}
									<div className="pr-4">
										<MoreHorizontal className="w-4 h-4 text-gray-400" />
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Add Folder Modal */}
			<Modal
				open={isAddFolderModalOpen}
				onOpenChange={setIsAddFolderModalOpen}
				title="Create New Folder"
				description="Add a custom folder to organize your specialized documents."
				className="max-w-md">
				<div className="space-y-4 pt-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Folder Name
						</label>
						<Input
							value={newFolderName}
							onChange={(e) => setNewFolderName(e.target.value)}
							placeholder="e.g. Training Materials"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAddFolder();
							}}
						/>
					</div>
					<div className="flex justify-end gap-3 pt-2">
						<Button variant="outline" onClick={() => setIsAddFolderModalOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleAddFolder}
							disabled={!newFolderName.trim() || updateEmployeeMutation.isPending}>
							{updateEmployeeMutation.isPending ? "Creating..." : "Create Folder"}
						</Button>
					</div>
				</div>
			</Modal>

			{/* Add/Edit Document Modal */}
			<EmployeeDocumentActionModal
				open={action === "add-doc" || action === "edit-doc"}
				onOpenChange={(open) => {
					if (open) return;
					clearDocumentModalParams();
					setSelectedDocumentCategory(null);
				}}
				employeeId={employee.id}
				mode={action === "edit-doc" ? "edit" : "add"}
				existingDocument={editingDocument}
				initialDocumentType={docTypeParam ? mapDocumentTypeToOption(docTypeParam) : ""}
				documentTypeOptions={filteredDocumentTypeOptions}
				onSaved={(savedDocument) => {
					if (!savedDocument) return;
					setDocuments((prev) => {
						if (action === "edit-doc" && editingDocument?.number) {
							return prev.map((doc) =>
								doc.number === editingDocument.number
									? { ...doc, ...savedDocument }
									: doc,
							);
						}

						const alreadyExists = prev.some(
							(doc) =>
								doc.number &&
								savedDocument.number &&
								doc.number === savedDocument.number,
						);
						return alreadyExists ? prev : [...prev, savedDocument];
					});
				}}
			/>

			{/* View Document Details Modal (fallback only when no file is attached) */}
			{viewingDocument && !viewingDocument.fileUrl && (
				<DocumentViewModal
					open={action === "view-doc"}
					onClose={() => {
						updateSearchParams(
							(next) => {
								next.delete("action");
								next.delete("documentNumber");
							},
							{ replace: true },
						);
					}}
					document={viewingDocument}
					onEdit={() => {
						updateSearchParams((next) => {
							next.set("action", "edit-doc");
						});
					}}
					onViewFile={() => {
						if (viewingDocument.fileUrl) {
							setSelectedDocUrl(viewingDocument.fileUrl);
							setSelectedDocName(buildDownloadFilename(viewingDocument));
							setSelectedDocExt(
								(viewingDocument as any).ext ||
									getFileExtensionFromUrl(viewingDocument.fileUrl),
							);
							setViewerOpen(true);
						} else {
							toast.error("No file available for this document");
						}
					}}
					canEdit={canUpdateDocument(viewingDocument)}
					priorityItem={getPriorityItemForDocument(viewingDocument)}
					formatDate={formatDate}
					isExpired={isExpired}
					getDocumentIcon={getDocumentIcon}
					formatDocumentTypeLabel={formatDocumentTypeLabel}
				/>
			)}

			{/* Document Viewer - Clean Floating (portaled to escape overflow/transform clipping) */}
			{viewerOpen && selectedDocUrl && typeof document !== "undefined"
				? createPortal(
						<div className="fixed inset-0 z-100 flex items-center justify-center p-4">
							{/* Backdrop */}
							<div
								className="fixed inset-0 bg-black/50"
								onClick={() => setViewerOpen(false)}
							/>
							{/* Viewer Container */}
							<div className="relative z-101 w-full max-w-5xl h-full max-h-[90vh] rounded-lg overflow-hidden shadow-2xl bg-white flex flex-col">
								<div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
									<h3 className="text-lg font-semibold text-gray-900">
										Document Viewer
									</h3>
									<button
										onClick={() => setViewerOpen(false)}
										className="p-2 hover:bg-gray-100 text-gray-900 rounded-lg transition-all">
										<X className="w-6 h-6" />
									</button>
								</div>
								<div className="flex-1 overflow-hidden">
									<DocumentFileViewer
										url={selectedDocUrl}
										fileName={selectedDocName || undefined}
										ext={selectedDocExt || undefined}
									/>
								</div>
							</div>
						</div>,
						document.body,
					)
				: null}

			{/* Delete Confirmation Modal */}
			<Modal
				open={isDeleteModalOpen}
				onOpenChange={(open) => {
					if (!open) handleCloseDelete();
				}}
				title="Delete Document"
				description="Are you sure you want to delete this document? This action cannot be undone."
				className="max-w-md">
				<div className="flex justify-end gap-3 pt-4">
					<Button variant="outline" onClick={handleCloseDelete}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={confirmDelete}
						disabled={deleteMutation.isPending}>
						{deleteMutation.isPending ? "Deleting..." : "Delete"}
					</Button>
				</div>
			</Modal>
		</>
	);
}

// Document View Modal Component
interface DocumentViewModalProps {
	open: boolean;
	onClose: () => void;
	document: any;
	onEdit: () => void;
	onViewFile: () => void;
	canEdit: boolean;
	priorityItem?: EmployeeDocumentPriorityItem | null;
	formatDate: (date: string | undefined) => string;
	isExpired: (expiryDate: string | undefined) => boolean;
	getDocumentIcon: (type: string) => string;
	formatDocumentTypeLabel: (type: string) => string;
}

const formatDocumentFieldValue = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return value.trim() || null;
	if (Array.isArray(value)) {
		const normalized = value
			.map((item) => formatDocumentFieldValue(item))
			.filter((item): item is string => Boolean(item))
			.join(", ");
		return normalized || null;
	}
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
};

const humanizeDocumentFieldLabel = (value: string) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const getPriorityPresentation = (
	document?: any,
	priorityItem?: EmployeeDocumentPriorityItem | null,
	expired?: boolean,
) => {
	const documentReviewStatus = String(
		document?.reviewStatus || document?.metadata?.review?.status || "",
	)
		.trim()
		.toLowerCase();
	const state =
		documentReviewStatus === "pending"
			? "pending_approval"
			: documentReviewStatus === "rejected"
				? "rejected"
				: String(priorityItem?.priorityState || "")
						.trim()
						.toLowerCase();

	if (state === "pending_approval") {
		return {
			label: "Waiting for HR Approval",
			tone: "border-sky-200 bg-sky-50 text-sky-700",
		};
	}

	if (state === "rejected") {
		return {
			label: "Needs Correction",
			tone: "border-rose-200 bg-rose-50 text-rose-700",
		};
	}

	if (state === "needs_update") {
		return {
			label: "Needs Update",
			tone: "border-amber-200 bg-amber-50 text-amber-700",
		};
	}

	if (state === "expired" || expired) {
		return {
			label: "Expired",
			tone: "border-orange-200 bg-orange-50 text-orange-700",
		};
	}

	return {
		label: "On File",
		tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
	};
};

function DocumentViewModal({
	open,
	onClose,
	document,
	onEdit,
	onViewFile,
	canEdit,
	priorityItem,
	formatDate,
	isExpired,
	getDocumentIcon,
	formatDocumentTypeLabel,
}: DocumentViewModalProps) {
	const statusPresentation = getPriorityPresentation(
		document,
		priorityItem,
		isExpired(document.expiryDate),
	);
	const documentFields =
		document?.fieldValues &&
		typeof document.fieldValues === "object" &&
		!Array.isArray(document.fieldValues)
			? (document.fieldValues as Record<string, unknown>)
			: {};
	const detailRows = [
		{
			label: "Document Number",
			value: formatDocumentFieldValue(document.number) || "Not provided",
		},
		{
			label: "Issue Date",
			value: formatDate(document.issueDate),
		},
		{
			label: "Expiry Date",
			value: document.expiryDate ? formatDate(document.expiryDate) : "No expiry date",
		},
	].filter(Boolean);
	const submittedFields = Object.entries(documentFields)
		.map(([key, value]) => ({
			label: humanizeDocumentFieldLabel(key),
			value: formatDocumentFieldValue(value),
		}))
		.filter((item) => item.value);

	return (
		<Modal open={open} onOpenChange={onClose} title="My Document">
			<div className="space-y-4">
				<div className="rounded-[18px] border border-[#eadfda] bg-[#fffdfb] p-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex items-start gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#eadfda] bg-[#fbf8f5] text-2xl">
								{getDocumentIcon(document.type) !== DEFAULT_DOCUMENT_ICON ? (
									getDocumentIcon(document.type)
								) : (
									<FileText className="h-6 w-6 text-gray-400" />
								)}
							</div>
							<div className="min-w-0">
								<h3 className="text-lg font-semibold text-gray-900 capitalize">
									{formatDocumentTypeLabel(document.type)}
								</h3>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									<span
										className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${statusPresentation.tone}`}>
										{statusPresentation.label}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="divide-y divide-[#f0e7e2] rounded-[18px] border border-[#eadfda] bg-white">
					{detailRows.map((item) => (
						<div
							key={item.label}
							className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
							<div className="text-xs font-medium text-gray-500">{item.label}</div>
							<div className="wrap-break-words text-sm font-medium text-gray-900">
								{item.value}
							</div>
						</div>
					))}
				</div>

				{submittedFields.length > 0 ? (
					<div className="divide-y divide-[#f0e7e2] rounded-[18px] border border-[#eadfda] bg-white">
						{submittedFields.map((item) => (
							<div
								key={item.label}
								className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
								<div className="text-xs font-medium text-gray-500">
									{item.label}
								</div>
								<div className="wrap-break-words text-sm text-gray-900">
									{item.value}
								</div>
							</div>
						))}
					</div>
				) : null}

				{document.fileUrl ? (
					<button
						onClick={onViewFile}
						className="flex w-full items-center justify-between rounded-[18px] border border-[#eadfda] bg-white px-4 py-3 text-left transition-colors hover:bg-[#fbf8f5]">
						<span className="flex items-center gap-3 text-sm font-medium text-gray-900">
							<FileText className="h-4 w-4 text-gray-500" />
							View attached file
						</span>
						<Eye className="h-4 w-4 text-gray-500" />
					</button>
				) : null}

				<div className="flex items-center justify-end gap-3 border-t border-[#f0e7e2] pt-4">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
					{canEdit ? (
						<Button onClick={onEdit} className="flex items-center gap-2">
							<Edit className="w-4 h-4" />
							Update Document
						</Button>
					) : null}
				</div>
			</div>
		</Modal>
	);
}
