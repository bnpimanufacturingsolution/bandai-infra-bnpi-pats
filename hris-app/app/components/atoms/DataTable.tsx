import * as React from "react";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Input } from "./Input";
import { ExportScopeModal, type ExportScope } from "~/components/molecules/ExportScopeModal";
import {
	filterAndSortTableRows,
	getDataTablePaginationItems,
	getDataTablePaginationModel,
} from "~/lib/data-table-state";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Search,
	Filter,
	ChevronUp,
	ChevronDown,
	ArrowUpDown,
	Plus,
	Upload,
	Download,
	MoreVertical,
	ChevronLeft,
	ChevronRight,
	Eye,
	EyeOff,
	FileText,
	FileSpreadsheet,
	ChevronDownIcon,
	ChevronRightIcon,
} from "lucide-react";

export interface Column<T> {
	key: keyof T | string;
	label: string;
	sortable?: boolean;
	searchable?: boolean;
	render?: (value: any, item: T) => ReactNode;
	className?: string;
	width?: string;
	headerClassName?: string;
	required?: boolean;
	priority?: "critical" | "high" | "medium" | "low";
	hideBelow?: "xl" | "lg" | "md" | "sm";
	pin?: "left" | "right";
	isActionColumn?: boolean;
}

export interface FilterOption {
	key: string;
	label: string;
	type?: "select" | "date";
	options: { value: string; label: string }[];
}

export interface GroupStyleConfig {
	container?: string; // Border and background for the group container
	header?: string; // Background and text color for the header
	badge?: string; // Badge color classes
}

export interface GroupConfig {
	key: string;
	order?: string[]; // Order of groups (e.g., ["SUBMITTED", "APPROVED", "REJECTED"])
	defaultCollapsed?: string[]; // Which groups should be collapsed by default
	renderGroupHeader?: (groupValue: string, items: any[], isCollapsed: boolean) => ReactNode;
	renderGroupFooter?: (groupValue: string, items: any[]) => ReactNode;
	styles?: Record<string, GroupStyleConfig>; // Custom styles per group value
}

export interface DataTableProps<T> {
	title: string;
	description?: string;
	data: T[];
	columns: Column<T>[];
	searchFields?: (keyof T)[];
	filters?: FilterOption[];
	onAdd?: () => void;
	onEdit?: (item: T) => void;
	onDelete?: (item: T) => void;
	onView?: (item: T) => void;
	onImport?: () => void;
	onExport?: () => void;
	onExportCSV?: (context: { scope: ExportScope; currentItems: T[] }) => void | Promise<void>;
	onExportPDF?: () => void;
	onExportExcel?: () => void;
	isLoading?: boolean;
	emptyMessage?: string;
	emptyDescription?: string;
	/** Rendered below the empty description (e.g. setup guide button). */
	emptyActions?: ReactNode;
	itemsPerPage?: number;
	renderActions?: (item: T) => ReactNode;
	className?: string;
	showSearch?: boolean;
	showFilters?: boolean;
	showPagination?: boolean;
	alwaysShowPagination?: boolean;
	showExport?: boolean;
	loadingRows?: number;
	searchWidth?: string;
	columnVisibility?: Record<string, boolean>;
	onColumnVisibilityChange?: (column: string, visible: boolean) => void;
	addButtonLabel?: string;
	addButtonClassName?: string;
	addButtonStyle?: React.CSSProperties;
	noCard?: boolean; // New prop to render without card wrapper
	headerActions?: ReactNode; // Custom actions to render in the header
	titleActions?: ReactNode; // Actions rendered beside title/description in CardHeader
	customFilters?: ReactNode; // Custom filters to render before the action buttons
	filterButtonLabel?: string; // Label for the filter button (default: "Filters")
	filterValues?: Record<string, string>; // Controlled advanced filter values for server-side lists
	rowClassName?: (item: T) => string; // Function to determine row className based on item
	// Grouping props
	groupBy?: GroupConfig; // Configuration for grouping data
	// Server-side props
	onSearch?: (query: string) => void;
	onFilterChange?: (filters: Record<string, string>) => void;
	onPageChange?: (page: number) => void;
	onSort?: (key: string, direction: "asc" | "desc") => void;
	sortKey?: string;
	sortDirection?: "asc" | "desc";
	currentPage?: number;
	totalItems?: number;
	totalPages?: number;
	searchPlaceholder?: string;
	searchValue?: string; // Controlled search value for server-side search
	containedScroll?: boolean; // Keep dense admin tables scrolling inside the table shell.
}

const DataTable = <T extends Record<string, any>>({
	title,
	description,
	data,
	columns,
	searchFields,
	filters = [],
	onAdd,
	onEdit,
	onDelete,
	onView,
	onImport,
	onExport,
	onExportCSV,
	onExportPDF,
	onExportExcel,
	isLoading = false,
	emptyMessage = "No data found",
	emptyDescription = "There are no items to display.",
	emptyActions,
	itemsPerPage = 10,
	renderActions,
	className,
	showSearch = true,
	showFilters = true,
	showPagination = true,
	alwaysShowPagination = true,
	showExport = true,
	loadingRows = 5,
	searchWidth = "w-80",
	columnVisibility,
	onColumnVisibilityChange,
	addButtonLabel = "Add",
	addButtonClassName,
	addButtonStyle,
	noCard = false, // Default to false for backward compatibility
	rowClassName,
	customFilters,
	headerActions,
	titleActions,
	filterButtonLabel = "Filters",
	filterValues,
	// Grouping props
	groupBy,
	// Server-side props
	onSearch,
	onFilterChange,
	onPageChange,
	onSort,
	sortKey,
	sortDirection,
	currentPage: externalCurrentPage,
	totalItems,
	totalPages: externalTotalPages,
	searchPlaceholder,
	searchValue,
	containedScroll = false,
}: DataTableProps<T>) => {
	const getDefaultColumnVisibility = React.useCallback(
		() =>
			columns.reduce(
				(acc, col) => ({
					...acc,
					[String(col.key)]: columnVisibility?.[String(col.key)] ?? true,
				}),
				{} as Record<string, boolean>,
			),
		[columns, columnVisibility],
	);
	const [sort, setSort] = useState<{
		key: string;
		dir: "asc" | "desc";
	}>({ key: "", dir: "asc" });
	const [search, setSearch] = useState<string>(searchValue || "");
	const [internalCurrentPage, setInternalCurrentPage] = useState(1);
	const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
	const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
	const [showColumnDropdown, setShowColumnDropdown] = useState<boolean>(false);
	const [showExportDropdown, setShowExportDropdown] = useState<boolean>(false);
	const [openFilterSelectKey, setOpenFilterSelectKey] = useState<string | null>(null);
	const [isExportScopeModalOpen, setIsExportScopeModalOpen] = useState<boolean>(false);
	const [isExportingCSV, setIsExportingCSV] = useState<boolean>(false);
	const [selectedColumns, setSelectedColumns] =
		useState<Record<string, boolean>>(getDefaultColumnVisibility);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(groupBy?.defaultCollapsed || []),
	);
	const activeFilterCount = useMemo(
		() => Object.values(activeFilters).filter((value) => value && value !== "all").length,
		[activeFilters],
	);

	// Use server-side pagination if provided, otherwise client-side
	const isServerSide = !!onSearch || !!onFilterChange || !!onPageChange;
	const currentPage = isServerSide ? externalCurrentPage || 1 : internalCurrentPage;

	// Sync search state with searchValue prop when provided (for server-side search)
	useEffect(() => {
		if (searchValue !== undefined) {
			setSearch(searchValue);
		}
	}, [searchValue]);

	useEffect(() => {
		if (!sortKey) return;
		setSort({ key: sortKey, dir: sortDirection || "asc" });
	}, [sortKey, sortDirection]);

	useEffect(() => {
		if (!filterValues) return;
		setActiveFilters(filterValues);
	}, [filterValues]);

	// Sync selectedColumns with columns prop to ensure new columns appear
	useEffect(() => {
		setSelectedColumns((prev) => {
			const next = { ...prev };
			let changed = false;
			columns.forEach((col) => {
				const key = String(col.key);
				const controlledValue = columnVisibility?.[key];
				if (controlledValue !== undefined && next[key] !== controlledValue) {
					next[key] = controlledValue;
					changed = true;
					return;
				}
				if (next[key] === undefined) {
					next[key] = true;
					changed = true;
				}
			});
			return changed ? next : prev;
		});
	}, [columns, columnVisibility]);

	// Get visible columns
	const visibleColumns = useMemo(() => {
		return columns.filter((column) => selectedColumns[String(column.key)]);
	}, [columns, selectedColumns]);

	// Filter and sort data (client-side only when server-side not provided)
	const filteredAndSorted = useMemo(() => {
		return filterAndSortTableRows({
			data,
			columns,
			search,
			searchFields,
			activeFilters,
			sort,
			isServerSide,
		});
	}, [data, search, sort, columns, searchFields, activeFilters, isServerSide]);

	// Grouped data
	const groupedData = useMemo(() => {
		if (!groupBy) return null;

		const groups: Map<string, T[]> = new Map();

		// Group items by the specified key
		filteredAndSorted.forEach((item) => {
			const groupValue = String(item[groupBy.key as keyof T] || "Other");
			if (!groups.has(groupValue)) {
				groups.set(groupValue, []);
			}
			groups.get(groupValue)!.push(item);
		});

		// Sort groups by the specified order
		const orderedGroups: { key: string; items: T[] }[] = [];
		if (groupBy.order) {
			groupBy.order.forEach((orderKey: string) => {
				if (groups.has(orderKey)) {
					orderedGroups.push({ key: orderKey, items: groups.get(orderKey)! });
					groups.delete(orderKey);
				}
			});
		}

		// Add remaining groups that weren't in the order
		groups.forEach((items, key) => {
			orderedGroups.push({ key, items });
		});

		return orderedGroups;
	}, [filteredAndSorted, groupBy]);

	// Toggle group collapse
	const toggleGroupCollapse = (groupKey: string) => {
		setCollapsedGroups((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(groupKey)) {
				newSet.delete(groupKey);
			} else {
				newSet.add(groupKey);
			}
			return newSet;
		});
	};

	// Pagination
	const paginationModel = getDataTablePaginationModel({
		rowCount: filteredAndSorted.length,
		itemsPerPage,
		currentPage,
		isServerSide,
		totalItems,
		totalPages: externalTotalPages,
	});
	const { totalPages, startIndex, totalCount, startDisplay, endDisplay } = paginationModel;
	const paginatedItems = isServerSide
		? data
		: filteredAndSorted.slice(startIndex, startIndex + itemsPerPage);

	const hasExportOptions =
		showExport && (!!onExportCSV || !!onExportPDF || !!onExportExcel || !!onExport);
	const containedHeaderScrollRef = React.useRef<HTMLDivElement | null>(null);
	const containedBodyScrollRef = React.useRef<HTMLDivElement | null>(null);
	const headerClassName = containedScroll ? "z-10" : undefined;
	const desktopTableViewportClassName = containedScroll
		? "hidden min-h-0 md:block"
		: "overflow-x-auto modern-scroll md:block hidden";
	const desktopTableFrameClassName = containedScroll
		? "rounded-lg border border-neutral-200 bg-white"
		: "overflow-x-auto rounded-lg border border-neutral-200 bg-white";
	const containedTableShellClassName =
		"hidden overflow-hidden rounded-lg border border-neutral-200 bg-white md:block";
	const containedTableHeaderViewportClassName =
		"overflow-hidden border-b border-neutral-200 bg-neutral-100";
	const containedTableBodyViewportClassName =
		"max-h-[calc(100vh-31rem)] min-h-[12rem] overflow-auto overscroll-contain modern-scroll";
	const mobileListViewportClassName = cn(
		"md:hidden space-y-3 mt-6",
		containedScroll &&
			"max-h-[24vh] min-h-[10rem] overflow-y-auto overscroll-contain modern-scroll pr-1",
	);
	const cardClassName = cn(
		"rounded-lg",
		containedScroll && "flex flex-col overflow-visible",
		className,
	);
	const cardContentClassName = containedScroll
		? "flex min-h-0 flex-1 flex-col overflow-visible"
		: undefined;
	const hasActionsColumn = !!(onEdit || onDelete || onView || renderActions);
	const actionColumnWidth = "132px";
	const hasOptionalColumns = columns.some((column) => !column.required && column.priority !== "critical");
	const tableClassName = cn("w-full text-sm", containedScroll ? "table-fixed" : "min-w-max");
	const totalVisibleColumns = visibleColumns.length + (hasActionsColumn ? 1 : 0);
	const getColumnWidth = (column: Column<T>) =>
		column.width || `${100 / Math.max(totalVisibleColumns, 1)}%`;
	const getColumnResponsiveClassName = (column: Column<T>) => {
		const hideBelow = column.hideBelow;
		if (hideBelow === "xl") return "hidden xl:table-cell";
		if (hideBelow === "lg") return "hidden lg:table-cell";
		if (hideBelow === "md") return "hidden md:table-cell";
		if (hideBelow === "sm") return "hidden sm:table-cell";
		return "";
	};
	const getPinnedColumnClassName = (column: Column<T>, align: "header" | "cell" = "cell") => {
		if (column.pin !== "left" && column.pin !== "right") return "";
		return cn(
			"sticky z-[5]",
			column.pin === "left" ? "left-0" : "right-0",
			align === "header" ? "bg-neutral-100" : "bg-white group-hover/row:bg-neutral-50",
		);
	};
	const actionColumnClassName =
		"sticky right-0 z-[5] bg-white text-center whitespace-nowrap shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)] group-hover/row:bg-neutral-50";
	const actionHeaderClassName =
		"sticky right-0 z-[6] bg-neutral-100 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]";
	const isColumnSortable = (column: Column<T>) =>
		isServerSide ? column.sortable === true : column.sortable !== false;
	const renderColumnGroup = () => (
		<colgroup>
			{visibleColumns.map((column) => (
				<col key={String(column.key)} style={{ width: getColumnWidth(column) }} />
			))}
			{hasActionsColumn && <col style={{ width: actionColumnWidth }} />}
		</colgroup>
	);
	const syncContainedHeaderScroll = () => {
		if (!containedHeaderScrollRef.current || !containedBodyScrollRef.current) return;
		containedHeaderScrollRef.current.scrollLeft = containedBodyScrollRef.current.scrollLeft;
	};

	const handleCsvExport = async (scope: ExportScope) => {
		if (!onExportCSV) return;
		try {
			setIsExportingCSV(true);
			await onExportCSV({ scope, currentItems: paginatedItems });
			setIsExportScopeModalOpen(false);
		} finally {
			setIsExportingCSV(false);
		}
	};

	const handleSort = (key: string) => {
		const newDir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
		setSort({ key, dir: newDir });

		// Call server-side handler if provided
		if (onSort) {
			onSort(key, newDir);
		} else {
			setInternalCurrentPage(1);
		}
	};

	const handleSearch = (value: string) => {
		setSearch(value);

		// Call server-side handler if provided
		if (onSearch) {
			onSearch(value);
		} else {
			setInternalCurrentPage(1);
		}
	};

	const handleFilter = (filterKey: string, value: string) => {
		const newFilters = {
			...activeFilters,
			[filterKey]: value,
		};
		setActiveFilters(newFilters);

		// Call server-side handler if provided
		if (onFilterChange) {
			onFilterChange(newFilters);
		} else {
			setInternalCurrentPage(1);
		}
	};

	const clearFilters = () => {
		setActiveFilters({});
		setSearch("");

		// Call server-side handlers if provided
		if (onSearch) onSearch("");
		if (onFilterChange) onFilterChange({});

		if (!isServerSide) {
			setInternalCurrentPage(1);
		}
	};

	const clearColumns = () => {
		const defaultVisible = getDefaultColumnVisibility();
		setSelectedColumns(defaultVisible);
		if (onColumnVisibilityChange) {
			columns.forEach((column) => {
				onColumnVisibilityChange(String(column.key), defaultVisible[String(column.key)]);
			});
		}
	};

	// Close dropdowns when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (openFilterSelectKey) return;

			const path = event.composedPath();
			const clickedInsideLayer = path.some((node) => {
				if (!(node instanceof Element)) return false;
				return (
					node.closest("[data-dropdown]") ||
					node.closest("[data-filter-select]") ||
					node.closest("[data-radix-popper-content-wrapper]")
				);
			});

			if (!clickedInsideLayer) {
				setShowFilterDropdown(false);
				setShowColumnDropdown(false);
				setShowExportDropdown(false);
			}
		};

		document.addEventListener("click", handleClickOutside);
		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, [openFilterSelectKey]);

	const renderSortIcon = (columnKey: string) => {
		if (sort.key !== columnKey) {
			return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
		}
		return sort.dir === "asc" ? (
			<ChevronUp className="h-3 w-3" />
		) : (
			<ChevronDown className="h-3 w-3" />
		);
	};

	const renderLoadingSkeleton = () => {
		const header = (
			<table className={tableClassName}>
				{renderColumnGroup()}
				<thead className={headerClassName}>
					<tr className="h-12 text-left text-gray-700 border-b border-neutral-200 bg-neutral-100">
						{visibleColumns.map((column) => (
							<th
								key={String(column.key)}
								className={cn(
									"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
									getColumnResponsiveClassName(column),
									getPinnedColumnClassName(column, "header"),
									column.className,
									column.headerClassName,
								)}>
								{column.label}
							</th>
						))}
						{hasActionsColumn && (
							<th
								className={cn(
									"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
									actionHeaderClassName,
								)}
								data-datatable-action-column>
								Actions
							</th>
						)}
					</tr>
				</thead>
			</table>
		);
		const body = (
			<table className={tableClassName}>
				{renderColumnGroup()}
				<tbody className="divide-y divide-neutral-100">
					{Array.from({ length: loadingRows }).map((_, idx) => (
						<tr key={idx} className="animate-pulse">
							{visibleColumns.map((column) => (
								<td
									key={String(column.key)}
									className={cn(
										"px-4 py-4",
										getColumnResponsiveClassName(column),
										getPinnedColumnClassName(column),
									)}>
									<div className="h-4 bg-gray-200 rounded w-full max-w-[12rem]" />
								</td>
							))}
							{hasActionsColumn && (
								<td className={cn("px-4 py-4", actionColumnClassName)}>
									<div className="ml-auto h-8 bg-gray-200 rounded w-20" />
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
		);

		return (
			<>
				{containedScroll ? (
					<div className={containedTableShellClassName} data-datatable-table-shell>
						<div
							ref={containedHeaderScrollRef}
							className={containedTableHeaderViewportClassName}
							data-datatable-header-viewport>
							{header}
						</div>
						<div
							ref={containedBodyScrollRef}
							className={containedTableBodyViewportClassName}
							data-datatable-body-viewport
							onScroll={syncContainedHeaderScroll}>
							{body}
						</div>
					</div>
				) : (
					<div className="hidden overflow-x-auto rounded-lg border border-neutral-200 bg-white md:block">
						{header}
						{body}
					</div>
				)}
				<div className="space-y-3 md:hidden">
					{Array.from({ length: loadingRows }).map((_, idx) => (
						<div key={idx} className="animate-pulse border rounded-lg p-4">
							<div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
							<div className="h-3 bg-gray-200 rounded w-2/3"></div>
						</div>
					))}
				</div>
			</>
		);
	};

	const renderEmptyState = () => (
		<div className="text-center py-12">
			<div className="mx-auto w-12 h-12 text-gray-400 mb-4 flex items-center justify-center">
				<Search className="w-8 h-8" />
			</div>
			<h3 className="text-lg font-medium text-gray-900 mb-1">{emptyMessage}</h3>
			<p className="text-gray-500">{emptyDescription}</p>
			{emptyActions ? (
				<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
					{emptyActions}
				</div>
			) : null}
		</div>
	);

	const renderPagination = () => {
		if (!showPagination || (!alwaysShowPagination && totalPages <= 1)) return null;

		const handlePageClick = (page: number) => {
			if (onPageChange) {
				onPageChange(page);
			} else {
				setInternalCurrentPage(page);
			}
		};

		const paginationItems = getDataTablePaginationItems({ currentPage, totalPages });

		return (
			<div
				className="mt-4 flex shrink-0 flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between"
				data-datatable-pagination>
				<div className="text-sm text-gray-700">
					Showing {startDisplay} to {endDisplay} of {totalCount} results
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handlePageClick(Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}>
						<ChevronLeft className="h-4 w-4" />
						Previous
					</Button>
					<div className="flex items-center gap-1">
						{paginationItems.map((item, index) => {
							if (item === "ellipsis") {
								return (
									<span
										key={`pagination-ellipsis-${index}`}
										className="flex h-8 w-8 items-center justify-center text-sm text-gray-500">
										...
									</span>
								);
							}

							const pageNum = item;
							return (
								<Button
									key={pageNum}
									variant={currentPage === pageNum ? "default" : "outline"}
									size="sm"
									onClick={() => handlePageClick(pageNum)}
									className="w-8 h-8 p-0">
									{pageNum}
								</Button>
							);
						})}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handlePageClick(Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}>
						Next
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
		);
	};

	const renderDefaultActions = (item: T) => (
		<div className="flex items-center gap-2">
			{onView && (
				<Button variant="outline" size="sm" onClick={() => onView(item)}>
					View
				</Button>
			)}
			{onEdit && (
				<Button variant="outline" size="sm" onClick={() => onEdit(item)}>
					Edit
				</Button>
			)}
			{onDelete && (
				<Button variant="outline" size="sm" onClick={() => onDelete(item)}>
					Delete
				</Button>
			)}
		</div>
	);

	const tableContent = (
		<>
			{/* Search and Filters */}
			{(showSearch || showFilters) && (
				<div className={cn(containedScroll ? "mb-4" : "space-y-4 mb-6")}>
					<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 md:gap-4">
						<div
							className={cn(
								"flex min-w-0 flex-1 items-center gap-2",
								containedScroll
									? cn(
											"flex-wrap md:flex-nowrap md:pb-1",
											showFilterDropdown ||
												showColumnDropdown ||
												showExportDropdown
												? "md:overflow-visible"
												: "md:overflow-x-auto",
										)
									: "flex-wrap",
							)}>
							{showSearch && (
								<div
									className={cn(
										searchWidth,
										"relative group/search w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:flex-none",
									)}>
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/search:text-primary transition-colors" />
									<Input
										placeholder={searchPlaceholder || "Search..."}
										value={search}
										onChange={(e) => handleSearch(e.target.value)}
										className="pl-10 h-10 rounded-lg border-neutral-200 bg-white text-sm shadow-sm transition focus:bg-white focus:ring-2 focus:ring-primary/10"
									/>
								</div>
							)}

							<div className="contents">
								{headerActions && (
									<div className="flex items-center gap-2">{headerActions}</div>
								)}

								{onImport && (
									<Button
										variant="outline"
										onClick={onImport}
										className="h-10 rounded-lg px-3 border-neutral-200 bg-white text-xs font-semibold text-gray-700 shadow-sm transition hover:border-primary/20 hover:bg-primary/5 hover:text-primary">
										<Upload className="h-4 w-4" />
										<span>Import</span>
									</Button>
								)}
								{onAdd && (
									<Button
										onClick={onAdd}
										className={cn(
											"h-10 rounded-lg px-3 text-xs font-semibold shadow-sm transition",
											addButtonClassName,
										)}
										style={addButtonStyle}>
										<Plus className="h-4 w-4" />
										<span>{addButtonLabel}</span>
									</Button>
								)}

								{customFilters}

								{showFilters && filters.length > 0 && (
									<div className="relative" data-dropdown>
										<Button
											variant="outline"
											onClick={(e) => {
												e.stopPropagation();
												setShowFilterDropdown(!showFilterDropdown);
												setShowColumnDropdown(false);
												setShowExportDropdown(false);
											}}
											className="h-10 rounded-lg px-3 border-neutral-200 bg-white text-xs font-semibold text-gray-700 shadow-sm transition hover:border-primary/20 hover:bg-primary/5 hover:text-primary">
											<Filter className="h-4 w-4" />
											<span>{filterButtonLabel}</span>
											{activeFilterCount > 0 && (
												<Badge
													variant="primary-soft"
													className="h-5 min-w-5 px-1 text-[10px] font-semibold">
													{activeFilterCount}
												</Badge>
											)}
										</Button>

										{showFilterDropdown && (
											<div className="absolute right-0 mt-2 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg z-[100]">
												<div className="mb-3 flex items-center justify-between">
													<h4 className="text-xs font-semibold text-gray-900">
														Filters
													</h4>
													<Button
														variant="ghost"
														size="sm"
														onClick={clearFilters}
														className="h-7 text-xs font-medium text-primary hover:bg-primary/5">
														Clear
													</Button>
												</div>
												<div className="space-y-3">
													{filters.map((filter) => (
														<div
															key={filter.key}
															className="space-y-1.5">
															<label className="text-xs font-medium text-gray-600">
																{filter.label}
															</label>
															{filter.type === "date" ? (
																<CalendarDatePicker
																	value={
																		activeFilters[filter.key] ||
																		""
																	}
																	onChange={(value) =>
																		handleFilter(
																			filter.key,
																			value,
																		)
																	}
																	className="h-9 rounded-md border-neutral-200 bg-white text-xs font-medium focus:ring-2 focus:ring-primary/20"
																/>
															) : (
																<Select
																	value={
																		activeFilters[filter.key] ||
																		"all"
																	}
																	onOpenChange={(open) =>
																		setOpenFilterSelectKey(
																			open
																				? filter.key
																				: null,
																		)
																	}
																	onValueChange={(value) =>
																		handleFilter(
																			filter.key,
																			value,
																		)
																	}>
																	<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs font-medium focus:ring-2 focus:ring-primary/20">
																		<SelectValue
																			placeholder={`All ${filter.label}`}
																		/>
																	</SelectTrigger>
																	<SelectContent
																		data-filter-select
																		className="z-[120]">
																		<SelectItem value="all">
																			All {filter.label}
																		</SelectItem>
																		{filter.options.map(
																			(option) => (
																				<SelectItem
																					key={
																						option.value
																					}
																					value={
																						option.value
																					}>
																					{option.label}
																				</SelectItem>
																			),
																		)}
																	</SelectContent>
																</Select>
															)}
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								)}

								{hasOptionalColumns && (
									<div className="relative" data-dropdown>
										<Button
											variant="outline"
											onClick={(e) => {
												e.stopPropagation();
												setShowColumnDropdown(!showColumnDropdown);
												setShowFilterDropdown(false);
												setShowExportDropdown(false);
											}}
											className="h-10 rounded-lg px-3 border-neutral-200 bg-white text-xs font-semibold text-gray-700 shadow-sm transition hover:border-primary/20 hover:bg-primary/5 hover:text-primary">
											<Eye className="h-4 w-4" />
											<span>Columns</span>
										</Button>

										{showColumnDropdown && (
											<div className="absolute right-0 mt-2 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg z-[100]">
												<div className="mb-3 flex items-center justify-between">
													<h4 className="text-xs font-semibold text-gray-900">
														Columns
													</h4>
													<Button
														variant="ghost"
														size="sm"
														onClick={clearColumns}
														className="h-7 text-xs font-medium text-primary hover:bg-primary/5">
														Reset
													</Button>
												</div>
												<div className="max-h-64 overflow-y-auto pr-2 space-y-1.5 modern-scroll">
													{columns.map((column) => {
														const columnKey = String(column.key);
														const isRequired =
															column.required ||
															column.priority === "critical";
														return (
														<label
															key={columnKey}
															className={cn(
																"flex items-center group p-2 rounded-lg transition-colors",
																isRequired
																	? "cursor-not-allowed opacity-60"
																	: "cursor-pointer hover:bg-neutral-50",
															)}>
															<input
																type="checkbox"
																checked={selectedColumns[columnKey]}
																disabled={isRequired}
																onChange={(e) => {
																	if (isRequired) return;
																	const visible =
																		e.target.checked;
																	setSelectedColumns((prev) => ({
																		...prev,
																		[columnKey]: visible,
																	}));
																	onColumnVisibilityChange?.(
																		columnKey,
																		visible,
																	);
																}}
																className="w-3.5 h-3.5 rounded border-neutral-300 text-primary focus:ring-primary/20"
															/>
															<span className="ml-2.5 text-xs font-bold text-gray-700 group-hover:text-primary transition-colors">
																{column.label}
															</span>
														</label>
													);
													})}
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			{onExportCSV && (
				<ExportScopeModal
					open={isExportScopeModalOpen}
					onOpenChange={setIsExportScopeModalOpen}
					onConfirm={handleCsvExport}
					isLoading={isExportingCSV}
					entityLabel={title.toLowerCase()}
					currentCount={paginatedItems.length}
				/>
			)}

			{/* Table */}
			{isLoading ? (
				renderLoadingSkeleton()
			) : data.length === 0 ? (
				<>
					{renderEmptyState()}
					{renderPagination()}
				</>
			) : (
				<>
					<div className={desktopTableViewportClassName}>
						{groupBy && groupedData ? (
							// Grouped Table View
							<div className="space-y-4">
								{groupedData.map((group) => {
									const isCollapsed = collapsedGroups.has(group.key);
									const groupStyle = groupBy.styles?.[group.key];
									const borderColor =
										groupStyle?.container ||
										"border-neutral-200 bg-neutral-50/50";
									const headerColor =
										groupStyle?.header ||
										"bg-gradient-to-r from-neutral-100 to-neutral-50 text-neutral-700 border-b border-neutral-200/50";
									const badgeColor =
										groupStyle?.badge || "bg-neutral-500 text-white";
									const groupFooter = groupBy.renderGroupFooter?.(
										group.key,
										group.items,
									);

									return (
										<div
											key={group.key}
											className={cn(
												"rounded-lg border overflow-hidden",
												borderColor,
											)}>
											{/* Group Header */}
											<button
												type="button"
												onClick={() => toggleGroupCollapse(group.key)}
												className={cn(
													"w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80",
													headerColor,
												)}>
												<div className="flex items-center gap-3">
													{isCollapsed ? (
														<ChevronRightIcon className="h-4 w-4" />
													) : (
														<ChevronDownIcon className="h-4 w-4" />
													)}
													{groupBy.renderGroupHeader ? (
														groupBy.renderGroupHeader(
															group.key,
															group.items,
															isCollapsed,
														)
													) : (
														<span className="font-bold text-sm uppercase tracking-wide">
															{group.key.charAt(0) +
																group.key.slice(1).toLowerCase()}
														</span>
													)}
												</div>
												<Badge
													className={cn("font-bold text-xs", badgeColor)}>
													{group.items.length}{" "}
													{group.items.length === 1 ? "item" : "items"}
												</Badge>
											</button>

											{/* Group Content */}
											{!isCollapsed && (
												<table className={cn(tableClassName, "bg-white")}>
													<thead className={headerClassName}>
														<tr className="h-12 text-left text-gray-700 border-b border-neutral-200 bg-neutral-50/50">
															{visibleColumns.map((column) => {
																const hasActions =
																	onEdit ||
																	onDelete ||
																	onView ||
																	renderActions;
																const totalVisibleColumns =
																	visibleColumns.length +
																	(hasActions ? 1 : 0);
																const dynamicWidth =
																	column.width ||
																	`${100 / totalVisibleColumns}%`;

																return (
																	<th
																		key={String(column.key)}
																		className={cn(
																			"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
																			getColumnResponsiveClassName(
																				column,
																			),
																			getPinnedColumnClassName(
																				column,
																				"header",
																			),
																			column.className,
																			column.headerClassName,
																			isColumnSortable(column)
																				? "cursor-pointer hover:text-gray-900 transition-colors"
																				: "",
																		)}
																		style={{
																			width: dynamicWidth,
																		}}
																		onClick={() =>
																			isColumnSortable(
																				column,
																			) &&
																			handleSort(
																				String(column.key),
																			)
																		}>
																		<div className="inline-flex items-center gap-1.5 whitespace-nowrap">
																			{column.label}
																			{isColumnSortable(
																				column,
																			) &&
																				renderSortIcon(
																					String(
																						column.key,
																					),
																				)}
																		</div>
																	</th>
																);
															})}
															{(onEdit ||
																onDelete ||
																onView ||
																renderActions) && (
																<th
																	className={cn(
																		"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
																		actionHeaderClassName,
																	)}
																	data-datatable-action-column
																	style={{ width: "80px" }}>
																	Actions
																</th>
															)}
														</tr>
													</thead>
													<tbody className="divide-y divide-neutral-100">
														{group.items.map((item, index) => (
															<tr
																key={item.id || index}
																className={cn(
																	"hover:bg-neutral-50/50 transition-colors group/row",
																	rowClassName?.(item),
																)}>
																{visibleColumns.map((column) => (
																	<td
																		key={String(column.key)}
																		className={cn(
																			"px-4 py-4 group-hover/row:text-gray-900 transition-colors",
																			getColumnResponsiveClassName(
																				column,
																			),
																			getPinnedColumnClassName(
																				column,
																			),
																		)}>
																		{column.render ? (
																			column.render(
																				item[
																					column.key as keyof T
																				],
																				item,
																			)
																		) : (
																			<span className="truncate text-gray-700 font-medium h-fit">
																				{String(
																					item[
																						column.key as keyof T
																					] || "-",
																				)}
																			</span>
																		)}
																	</td>
																))}
																{(onEdit ||
																	onDelete ||
																	onView ||
																	renderActions) && (
																	<td
																		className={cn(
																			"px-4 py-4",
																			actionColumnClassName,
																		)}>
																		<div className="flex justify-center">
																			{renderActions
																				? renderActions(item)
																				: renderDefaultActions(
																						item,
																					)}
																		</div>
																	</td>
																)}
															</tr>
														))}
													</tbody>
												</table>
											)}
											{!isCollapsed && groupFooter ? groupFooter : null}
										</div>
									);
								})}
							</div>
						) : (
							// Regular Table View (no grouping)
							<div
								className={
									containedScroll
										? containedTableShellClassName
										: desktopTableFrameClassName
								}
								data-datatable-table-shell>
								<div
									ref={containedScroll ? containedHeaderScrollRef : undefined}
									className={
										containedScroll
											? containedTableHeaderViewportClassName
											: undefined
									}
									data-datatable-header-viewport={containedScroll || undefined}>
									<table className={tableClassName}>
										{renderColumnGroup()}
										<thead className={headerClassName}>
											<tr className="h-12 text-left text-gray-700 border-b border-neutral-200 bg-neutral-100">
												{visibleColumns.map((column) => (
													<th
														key={String(column.key)}
														className={cn(
															"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
															getColumnResponsiveClassName(column),
															getPinnedColumnClassName(
																column,
																"header",
															),
															column.className,
															column.headerClassName,
															isColumnSortable(column)
																? "cursor-pointer hover:text-gray-900 transition-colors"
																: "",
														)}
														onClick={() =>
															isColumnSortable(column) &&
															handleSort(String(column.key))
														}>
														<div className="inline-flex items-center gap-1.5 whitespace-nowrap">
															{column.label}
															{isColumnSortable(column) &&
																renderSortIcon(String(column.key))}
														</div>
													</th>
												))}
												{hasActionsColumn && (
													<th
														className={cn(
															"px-4 py-3 text-[11px] font-semibold uppercase tracking-normal text-gray-700 whitespace-nowrap align-middle",
															actionHeaderClassName,
														)}
														data-datatable-action-column>
														Actions
													</th>
												)}
											</tr>
										</thead>
									</table>
								</div>
								<div
									ref={containedScroll ? containedBodyScrollRef : undefined}
									className={
										containedScroll
											? containedTableBodyViewportClassName
											: undefined
									}
									data-datatable-body-viewport={containedScroll || undefined}
									onScroll={
										containedScroll ? syncContainedHeaderScroll : undefined
									}>
									<table className={tableClassName}>
										{renderColumnGroup()}
										<tbody className="divide-y divide-neutral-100">
											{paginatedItems.map((item, index) => (
												<tr
													key={item.id || index}
													className={cn(
														"hover:bg-neutral-50/50 transition-colors group/row",
														rowClassName?.(item),
													)}>
													{visibleColumns.map((column) => (
														<td
															key={String(column.key)}
															className={cn(
																"px-4 py-4 group-hover/row:text-gray-900 transition-colors",
																getColumnResponsiveClassName(
																	column,
																),
																getPinnedColumnClassName(column),
															)}>
															{column.render ? (
																column.render(
																	item[column.key as keyof T],
																	item,
																)
															) : (
																<span className="truncate text-gray-700 font-medium h-fit">
																	{String(
																		item[
																			column.key as keyof T
																		] || "-",
																	)}
																</span>
															)}
														</td>
													))}
													{hasActionsColumn && (
														<td
															className={cn(
																"px-4 py-4",
																actionColumnClassName,
															)}>
															<div className="flex justify-center">
																{renderActions
																	? renderActions(item)
																	: renderDefaultActions(item)}
															</div>
														</td>
													)}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>

					{/* Mobile List View - Sleek & Compact */}
					<div className={mobileListViewportClassName}>
						{groupBy && groupedData ? (
							// Grouped Mobile View
							groupedData.map((group) => {
								const isCollapsed = collapsedGroups.has(group.key);
								const groupStyle = groupBy.styles?.[group.key];
								const borderColor =
									groupStyle?.container || "border-neutral-200 bg-neutral-50/50";
								const headerColor =
									groupStyle?.header ||
									"bg-gradient-to-r from-neutral-100 to-neutral-50 text-neutral-700 border-b border-neutral-200/50";
								const badgeColor = groupStyle?.badge || "bg-neutral-500 text-white";
								const statusColumn = columns.find((c) => c.key === "status");
								const groupFooter = groupBy.renderGroupFooter?.(
									group.key,
									group.items,
								);

								return (
									<div
										key={group.key}
										className={cn(
											"rounded-lg border overflow-hidden",
											borderColor,
										)}>
										{/* Group Header */}
										<button
											type="button"
											onClick={() => toggleGroupCollapse(group.key)}
											className={cn(
												"w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80",
												headerColor,
											)}>
											<div className="flex items-center gap-2">
												{isCollapsed ? (
													<ChevronRightIcon className="h-4 w-4" />
												) : (
													<ChevronDownIcon className="h-4 w-4" />
												)}
												{groupBy.renderGroupHeader ? (
													groupBy.renderGroupHeader(
														group.key,
														group.items,
														isCollapsed,
													)
												) : (
													<span className="font-bold text-sm uppercase tracking-wide">
														{group.key.charAt(0) +
															group.key.slice(1).toLowerCase()}
													</span>
												)}
											</div>
											<Badge className={cn("font-bold text-xs", badgeColor)}>
												{group.items.length}
											</Badge>
										</button>

										{/* Group Content */}
										{!isCollapsed && (
											<div className="bg-white divide-y divide-neutral-100">
												{group.items.map((item, index) => (
													<div
														key={item.id || index}
														className="p-4 relative group active:bg-neutral-50 transition-colors">
														<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
															<div className="flex-1 min-w-0">
																<div className="flex items-center gap-2 mb-0.5">
																	<div className="text-sm font-semibold text-gray-900">
																		{columns[0].render
																			? columns[0].render(
																					item[
																						columns[0]
																							.key
																					],
																					item,
																				)
																			: String(
																					item[
																						columns[0]
																							.key
																					] || "-",
																				)}
																	</div>
																</div>
																<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-normal text-gray-500">
																	{visibleColumns
																		.slice(1, 4)
																		.map((column) => (
																			<span
																				key={String(
																					column.key,
																				)}
																				className="flex min-w-0 flex-wrap items-center gap-x-1">
																				<span className="shrink-0">
																					{column.label}:
																				</span>
																				<span className="min-w-0 normal-case text-sm font-medium leading-5 text-gray-900">
																					{column.render
																						? column.render(
																								item[
																									column.key as keyof T
																								],
																								item,
																							)
																						: String(
																								item[
																									column.key as keyof T
																								] ||
																									"-",
																							)}
																				</span>
																			</span>
																		))}
																</div>
															</div>
															{(onEdit ||
																onDelete ||
																onView ||
																renderActions) && (
																<div className="flex items-center justify-start sm:justify-end">
																	{renderActions
																		? renderActions(item)
																		: renderDefaultActions(
																				item,
																			)}
																</div>
															)}
														</div>
													</div>
												))}
											</div>
										)}
										{!isCollapsed && groupFooter ? groupFooter : null}
									</div>
								);
							})
						) : (
							// Regular Mobile View (no grouping)
							<div className="rounded-lg border border-neutral-200 overflow-hidden bg-white">
								{paginatedItems.map((item, index) => {
									const statusColumn = columns.find((c) => c.key === "status");
									return (
										<div
											key={item.id || index}
											className={cn(
												"p-4 relative group active:bg-neutral-50 transition-colors",
												index !== paginatedItems.length - 1 &&
													"border-b border-neutral-100",
											)}>
											<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-0.5">
														<div className="text-sm font-semibold text-gray-900">
															{columns[0].render
																? columns[0].render(
																		item[columns[0].key],
																		item,
																	)
																: String(
																		item[columns[0].key] || "-",
																	)}
														</div>
														{item.status && statusColumn?.render && (
															<div className="scale-75 origin-left">
																{statusColumn.render(
																	item.status,
																	item,
																)}
															</div>
														)}
													</div>
													<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-normal text-gray-500">
														{visibleColumns
															.slice(1, 4)
															.map((column) => (
																<span
																	key={String(column.key)}
																	className="flex min-w-0 flex-wrap items-center gap-x-1">
																	<span className="shrink-0">
																		{column.label}:
																	</span>
																	<span className="min-w-0 normal-case text-sm font-medium leading-5 text-gray-900">
																		{column.render
																			? column.render(
																					item[
																						column.key as keyof T
																					],
																					item,
																				)
																			: String(
																					item[
																						column.key as keyof T
																					] || "-",
																				)}
																	</span>
																</span>
															))}
													</div>
												</div>
												{(onEdit ||
													onDelete ||
													onView ||
													renderActions) && (
													<div className="flex items-center justify-start sm:justify-end">
														{renderActions
															? renderActions(item)
															: renderDefaultActions(item)}
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
					{renderPagination()}
				</>
			)}
		</>
	);

	if (noCard) {
		return <div className={cn("space-y-4", className)}>{tableContent}</div>;
	}

	const renderExportDropdown = () => {
		if (!hasExportOptions) return null;

		return (
			<div className="relative" data-dropdown>
				<Button
					variant="outline"
					onClick={(e) => {
						if (onExport && !onExportCSV && !onExportPDF && !onExportExcel) {
							onExport();
							return;
						}
						e.stopPropagation();
						setShowExportDropdown(!showExportDropdown);
						setShowFilterDropdown(false);
						setShowColumnDropdown(false);
					}}
					className="h-10 rounded-lg px-3 border-neutral-200 bg-white text-xs font-semibold text-gray-700 shadow-sm transition hover:border-primary/20 hover:bg-primary/5 hover:text-primary">
					<Download className="h-4 w-4" />
					<span>Export</span>
				</Button>

				{showExportDropdown && (
					<div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg z-[100]">
						<div className="mb-1 border-b border-neutral-100 p-2">
							<h4 className="text-xs font-semibold text-gray-900">Export</h4>
						</div>
						<div className="space-y-1">
							{onExportCSV && (
								<button
									onClick={() => {
										setShowExportDropdown(false);
										setIsExportScopeModalOpen(true);
									}}
									className="group flex w-full items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-primary/5">
									<FileSpreadsheet className="h-4 w-4 text-gray-400 group-hover:text-primary" />
									<span className="text-xs font-medium text-gray-700 group-hover:text-primary">
										Download CSV
									</span>
								</button>
							)}
							{onExportPDF && (
								<button
									onClick={() => {
										onExportPDF();
										setShowExportDropdown(false);
									}}
									className="group flex w-full items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-primary/5">
									<FileText className="h-4 w-4 text-gray-400 group-hover:text-primary" />
									<span className="text-xs font-medium text-gray-700 group-hover:text-primary">
										Download PDF
									</span>
								</button>
							)}
							{onExportExcel && (
								<button
									onClick={() => {
										onExportExcel();
										setShowExportDropdown(false);
									}}
									className="group flex w-full items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-primary/5">
									<FileSpreadsheet className="h-4 w-4 text-gray-400 group-hover:text-primary" />
									<span className="text-xs font-medium text-gray-700 group-hover:text-primary">
										Download Excel
									</span>
								</button>
							)}
						</div>
					</div>
				)}
			</div>
		);
	};

	return (
		<Card className={cardClassName} style={{ position: "relative", zIndex: 1 }}>
			<CardHeader className={containedScroll ? "shrink-0" : undefined}>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle className="text-lg font-semibold">{title}</CardTitle>
						{description && (
							<CardDescription className="mt-1">{description}</CardDescription>
						)}
					</div>
					<div className="flex min-h-10 flex-wrap items-center justify-start gap-2 sm:justify-end">
						{renderExportDropdown()}
						{titleActions && (
							<div className="flex items-center gap-2">{titleActions}</div>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className={cardContentClassName}>{tableContent}</CardContent>
		</Card>
	);
};

export { DataTable };
