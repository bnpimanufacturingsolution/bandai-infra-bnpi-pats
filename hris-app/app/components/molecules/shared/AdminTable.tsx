import { useState, useMemo, type ReactNode } from "react";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { UnifiedSearchBar } from "~/components/molecules/shared/UnifiedSearchBar";
import { ExportDropdown } from "~/components/molecules/shared/ExportDropdown";
import {
	Plus,
	Filter,
	ChevronUp,
	ChevronDown,
	ArrowUpDown,
	Edit,
	Trash2,
	MoreVertical,
} from "lucide-react";

export interface Column<T> {
	key: keyof T | string;
	label: string;
	sortable?: boolean;
	searchable?: boolean;
	render?: (value: any, item: T) => ReactNode;
	className?: string;
}

export interface AdminTableProps<T> {
	title: string;
	description: string;
	icon: ReactNode;
	items: T[];
	columns: Column<T>[];
	searchFields?: (keyof T)[];
	onAdd?: () => void;
	onEdit?: (item: T) => void;
	onDelete?: (item: T) => void;
	onToggleActive?: (item: T) => void;
	isLoading?: boolean;
	emptyMessage?: string;
	emptyDescription?: string;
	fileBaseName?: string;
	renderActions?: (item: T) => ReactNode;
	itemsPerPage?: number;
}

export function AdminTable<T extends Record<string, any>>({
	title,
	description,
	icon,
	items,
	columns,
	searchFields,
	onAdd,
	onEdit,
	onDelete,
	onToggleActive,
	isLoading = false,
	emptyMessage = "No items found",
	emptyDescription = "Get started by creating your first item.",
	fileBaseName = "data",
	renderActions,
	itemsPerPage = 10,
}: AdminTableProps<T>) {
	const [sort, setSort] = useState<{
		key: string;
		dir: "asc" | "desc";
	}>({ key: "", dir: "asc" });
	const [search, setSearch] = useState<string>("");
	const [currentPage, setCurrentPage] = useState(1);

	// Filter and sort items
	const filteredAndSorted = useMemo(() => {
		const toText = (v: unknown) => String(v ?? "").toLowerCase();
		const q = search.trim().toLowerCase();

		// Filter items
		const filtered = items.filter((item) => {
			if (q === "") return true;

			// Use specific search fields if provided, otherwise search all columns
			const fieldsToSearch = searchFields || columns.map((col) => col.key);
			return fieldsToSearch.some((field) => {
				const value = item[field as keyof T];
				return toText(value).includes(q);
			});
		});

		// Sort items
		const sorted = filtered.slice().sort((a, b) => {
			if (!sort.key) return 0;

			const dir = sort.dir === "asc" ? 1 : -1;
			const aValue = a[sort.key as keyof T];
			const bValue = b[sort.key as keyof T];

			if (typeof aValue === "string" && typeof bValue === "string") {
				return aValue.localeCompare(bValue) * dir;
			}
			if (typeof aValue === "number" && typeof bValue === "number") {
				return (aValue - bValue) * dir;
			}
			if (typeof aValue === "boolean" && typeof bValue === "boolean") {
				return (Number(aValue) - Number(bValue)) * dir;
			}

			// Handle dates or other types
			const aDate = aValue ? new Date(aValue as string).getTime() : 0;
			const bDate = bValue ? new Date(bValue as string).getTime() : 0;
			return (aDate - bDate) * dir;
		});

		return sorted;
	}, [items, search, sort, columns, searchFields]);

	// Pagination
	const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / itemsPerPage));
	const startIndex = (currentPage - 1) * itemsPerPage;
	const paginatedItems = filteredAndSorted.slice(startIndex, startIndex + itemsPerPage);

	const handleSort = (key: string) => {
		setSort((prev) => ({
			key,
			dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
		}));
		setCurrentPage(1); // Reset to first page when sorting
	};

	const handleSearch = (value: string) => {
		setSearch(value);
		setCurrentPage(1); // Reset to first page when searching
	};

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

	const renderSkeleton = () => (
		<div className="space-y-3">
			{Array.from({ length: 4 }).map((_, idx) => (
				<div key={idx} className="animate-pulse border rounded-lg p-4">
					<div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
					<div className="h-3 bg-gray-200 rounded w-2/3" />
				</div>
			))}
		</div>
	);

	const renderEmptyState = () => (
		<div className="text-center py-8">
			<div className="mx-auto w-12 h-12 text-gray-400 mb-4 flex items-center justify-center">
				{icon}
			</div>
			<p className="text-gray-500">{emptyMessage}</p>
			<p className="text-sm text-gray-400">{emptyDescription}</p>
		</div>
	);

	const renderPagination = () => {
		const totalCount = filteredAndSorted.length;
		const startDisplay = totalCount === 0 ? 0 : startIndex + 1;
		const endDisplay = Math.min(startIndex + itemsPerPage, totalCount);

		return (
			<div className="flex items-center justify-between mt-4">
				<div className="text-sm text-gray-700">
					Showing {startDisplay} to {endDisplay} of {totalCount} results
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}>
						Previous
					</Button>
					<span className="text-sm text-gray-700">
						Page {currentPage} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}>
						Next
					</Button>
				</div>
			</div>
		);
	};

	const renderDefaultActions = (item: T) => (
		<div className="flex items-center gap-2">
			{onToggleActive && (
				<Button variant="outline" size="sm" onClick={() => onToggleActive(item)}>
					{item.isActive ? "Deactivate" : "Activate"}
				</Button>
			)}
			{onEdit && (
				<Button variant="outline" size="sm" onClick={() => onEdit(item)}>
					<Edit className="h-4 w-4" />
				</Button>
			)}
			{onDelete && (
				<Button variant="outline" size="sm" onClick={() => onDelete(item)}>
					<Trash2 className="h-4 w-4" />
				</Button>
			)}
		</div>
	);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{icon}
							{title}
						</CardTitle>
						<p className="text-sm text-gray-600 mt-1">{description}</p>
					</div>
					{onAdd && (
						<Button onClick={onAdd}>
							<Plus className="h-4 w-4" />
							Add {title.split(" ")[0]}
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{/* Search and Filters */}
				<div className="flex items-center gap-3 mb-4">
					<div className="flex-1">
						<UnifiedSearchBar
							placeholder={`Search ${title.toLowerCase()}...`}
							value={search}
							onChange={handleSearch}
							variant="compact"
							showFilter={false}
						/>
					</div>
					<ExportDropdown fileBaseName={fileBaseName} />
				</div>

				{/* Table */}
				{isLoading ? (
					renderSkeleton()
				) : items.length === 0 ? (
					renderEmptyState()
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-gray-600 border-b">
										{columns.map((column) => (
											<th
												key={String(column.key)}
												className={`px-3 py-2 ${column.className || ""} ${
													column.sortable !== false
														? "cursor-pointer"
														: ""
												}`}
												onClick={() =>
													column.sortable !== false &&
													handleSort(String(column.key))
												}>
												<div className="inline-flex items-center gap-1">
													{column.label}
													{column.sortable !== false &&
														renderSortIcon(String(column.key))}
												</div>
											</th>
										))}
										{(onEdit ||
											onDelete ||
											onToggleActive ||
											renderActions) && (
											<th className="px-3 py-2">Actions</th>
										)}
									</tr>
								</thead>
								<tbody className="divide-y">
									{paginatedItems.map((item, index) => (
										<tr key={item.id || index} className="hover:bg-gray-50">
											{columns.map((column) => (
												<td key={String(column.key)} className="px-3 py-2">
													{column.render ? (
														column.render(
															item[column.key as keyof T],
															item,
														)
													) : (
														<span>
															{String(
																item[column.key as keyof T] || "-",
															)}
														</span>
													)}
												</td>
											))}
											{(onEdit ||
												onDelete ||
												onToggleActive ||
												renderActions) && (
												<td className="px-3 py-2">
													{renderActions
														? renderActions(item)
														: renderDefaultActions(item)}
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{renderPagination()}
					</>
				)}
			</CardContent>
		</Card>
	);
}
