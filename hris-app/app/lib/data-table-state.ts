export interface DataTableColumnKey<T> {
	key: keyof T | string;
}

export interface DataTableSortState {
	key: string;
	dir: "asc" | "desc";
}

export interface DataTablePaginationModel {
	totalPages: number;
	startIndex: number;
	totalCount: number;
	startDisplay: number;
	endDisplay: number;
}

export type DataTablePaginationItem = number | "ellipsis";

const toSearchText = (value: unknown) => String(value ?? "").toLowerCase();

export function filterAndSortTableRows<T extends Record<string, any>>({
	data,
	columns,
	search,
	searchFields,
	activeFilters,
	sort,
	isServerSide,
}: {
	data: T[];
	columns: DataTableColumnKey<T>[];
	search?: string;
	searchFields?: Array<keyof T | string>;
	activeFilters?: Record<string, string>;
	sort?: DataTableSortState;
	isServerSide?: boolean;
}): T[] {
	if (isServerSide) return data;

	const query = String(search ?? "").trim().toLowerCase();
	const fieldsToSearch =
		searchFields && searchFields.length > 0 ? searchFields : columns.map((column) => column.key);

	const searched = data.filter((item) => {
		if (query === "") return true;
		return fieldsToSearch.some((field) => {
			const value = item[field as keyof T];
			return toSearchText(value).includes(query);
		});
	});

	const filtered = searched.filter((item) => {
		return Object.entries(activeFilters ?? {}).every(([filterKey, filterValue]) => {
			if (!filterValue || filterValue === "all") return true;
			const itemValue = item[filterKey as keyof T];
			return toSearchText(itemValue).includes(filterValue.toLowerCase());
		});
	});

	if (!sort?.key) return filtered;

	return filtered.slice().sort((a, b) => {
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

		const aDate = aValue ? new Date(aValue as string).getTime() : 0;
		const bDate = bValue ? new Date(bValue as string).getTime() : 0;
		return (aDate - bDate) * dir;
	});
}

export function getDataTablePaginationModel({
	rowCount,
	itemsPerPage,
	currentPage,
	isServerSide,
	totalItems,
	totalPages,
}: {
	rowCount: number;
	itemsPerPage: number;
	currentPage: number;
	isServerSide?: boolean;
	totalItems?: number;
	totalPages?: number;
}): DataTablePaginationModel {
	const effectiveTotal = isServerSide ? (totalItems ?? rowCount) : rowCount;
	const calculatedTotalPages = isServerSide
		? (totalPages ?? Math.ceil(effectiveTotal / itemsPerPage))
		: Math.ceil(rowCount / itemsPerPage);
	const resolvedTotalPages = Math.max(1, calculatedTotalPages);
	const startIndex = (currentPage - 1) * itemsPerPage;
	const startDisplay = effectiveTotal === 0 ? 0 : startIndex + 1;
	const endDisplay = Math.min(startIndex + itemsPerPage, effectiveTotal);

	return {
		totalPages: resolvedTotalPages,
		startIndex,
		totalCount: effectiveTotal,
		startDisplay,
		endDisplay,
	};
}

export function getDataTablePaginationItems({
	currentPage,
	totalPages,
}: {
	currentPage: number;
	totalPages: number;
}): DataTablePaginationItem[] {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}

	const pages = new Set<number>([1, totalPages]);
	const windowStart = Math.max(2, currentPage - 1);
	const windowEnd = Math.min(totalPages - 1, currentPage + 1);

	for (let page = windowStart; page <= windowEnd; page += 1) {
		pages.add(page);
	}

	if (currentPage <= 4) {
		for (let page = 2; page <= 5; page += 1) {
			pages.add(page);
		}
	}

	if (currentPage >= totalPages - 3) {
		for (let page = totalPages - 4; page <= totalPages - 1; page += 1) {
			pages.add(page);
		}
	}

	const orderedPages = Array.from(pages).sort((a, b) => a - b);
	const items: DataTablePaginationItem[] = [];

	orderedPages.forEach((page, index) => {
		const previousPage = orderedPages[index - 1];
		if (previousPage && page - previousPage > 1) {
			items.push("ellipsis");
		}
		items.push(page);
	});

	return items;
}
