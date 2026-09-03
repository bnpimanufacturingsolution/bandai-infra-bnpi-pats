import { describe, expect, it } from "vitest";
import {
	filterAndSortTableRows,
	getDataTablePaginationItems,
	getDataTablePaginationModel,
} from "./data-table-state";

type ConfigRow = {
	id: string;
	name: string;
	code: string;
	department: string;
	isActive: boolean;
	rank: number;
	effectiveDate: string;
};

const rows: ConfigRow[] = [
	{
		id: "dept-1",
		name: "People Operations",
		code: "HR",
		department: "Admin",
		isActive: true,
		rank: 3,
		effectiveDate: "2026-01-15",
	},
	{
		id: "dept-2",
		name: "Software Engineering",
		code: "ENG",
		department: "Technology",
		isActive: true,
		rank: 1,
		effectiveDate: "2026-01-05",
	},
	{
		id: "dept-3",
		name: "Facilities",
		code: "FAC",
		department: "Admin",
		isActive: false,
		rank: 2,
		effectiveDate: "2026-02-01",
	},
];

const columns = [
	{ key: "name" },
	{ key: "code" },
	{ key: "department" },
	{ key: "isActive" },
	{ key: "rank" },
	{ key: "effectiveDate" },
] satisfies Array<{ key: keyof ConfigRow }>;

describe("data table state helpers", () => {
	it("searches configured admin config fields case-insensitively", () => {
		const result = filterAndSortTableRows({
			data: rows,
			columns,
			search: " eng ",
			searchFields: ["name", "code"],
			sort: { key: "", dir: "asc" },
		});

		expect(result.map((row) => row.id)).toEqual(["dept-2"]);
	});

	it("combines search with active filters and ignores the all sentinel", () => {
		const result = filterAndSortTableRows({
			data: rows,
			columns,
			search: "admin",
			activeFilters: {
				department: "Admin",
				isActive: "all",
			},
			sort: { key: "rank", dir: "asc" },
		});

		expect(result.map((row) => row.id)).toEqual(["dept-3", "dept-1"]);
	});

	it("filters boolean admin config status values accurately", () => {
		const result = filterAndSortTableRows({
			data: rows,
			columns,
			activeFilters: { isActive: "false" },
			sort: { key: "", dir: "asc" },
		});

		expect(result.map((row) => row.id)).toEqual(["dept-3"]);
	});

	it("sorts strings, numbers, booleans, and date-like values with the same table rules", () => {
		expect(
			filterAndSortTableRows({
				data: rows,
				columns,
				sort: { key: "name", dir: "asc" },
			}).map((row) => row.name),
		).toEqual(["Facilities", "People Operations", "Software Engineering"]);

		expect(
			filterAndSortTableRows({
				data: rows,
				columns,
				sort: { key: "rank", dir: "desc" },
			}).map((row) => row.rank),
		).toEqual([3, 2, 1]);

		expect(
			filterAndSortTableRows({
				data: rows,
				columns,
				sort: { key: "isActive", dir: "asc" },
			}).map((row) => row.id),
		).toEqual(["dept-3", "dept-1", "dept-2"]);

		expect(
			filterAndSortTableRows({
				data: rows,
				columns,
				sort: { key: "effectiveDate", dir: "asc" },
			}).map((row) => row.id),
		).toEqual(["dept-2", "dept-1", "dept-3"]);
	});

	it("leaves server-side admin config rows untouched because the API already searched and filtered", () => {
		const result = filterAndSortTableRows({
			data: rows,
			columns,
			search: "nothing local should match",
			activeFilters: { isActive: "false" },
			sort: { key: "name", dir: "desc" },
			isServerSide: true,
		});

		expect(result).toBe(rows);
	});

	it("computes client-side result counts and display range from filtered rows", () => {
		const pagination = getDataTablePaginationModel({
			rowCount: 23,
			itemsPerPage: 10,
			currentPage: 3,
		});

		expect(pagination).toEqual({
			totalPages: 3,
			startIndex: 20,
			totalCount: 23,
			startDisplay: 21,
			endDisplay: 23,
		});
	});

	it("uses server totals while falling back to visible rows when count metadata is missing", () => {
		expect(
			getDataTablePaginationModel({
				rowCount: 10,
				itemsPerPage: 10,
				currentPage: 2,
				isServerSide: true,
				totalItems: 42,
			}),
		).toMatchObject({
			totalPages: 5,
			totalCount: 42,
			startDisplay: 11,
			endDisplay: 20,
		});

		expect(
			getDataTablePaginationModel({
				rowCount: 7,
				itemsPerPage: 10,
				currentPage: 1,
				isServerSide: true,
			}),
		).toMatchObject({
			totalPages: 1,
			totalCount: 7,
			startDisplay: 1,
			endDisplay: 7,
		});
	});

	it("keeps compact pagination windows accurate for long admin config lists", () => {
		expect(getDataTablePaginationItems({ currentPage: 1, totalPages: 5 })).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(getDataTablePaginationItems({ currentPage: 6, totalPages: 12 })).toEqual([
			1,
			"ellipsis",
			5,
			6,
			7,
			"ellipsis",
			12,
		]);
		expect(getDataTablePaginationItems({ currentPage: 11, totalPages: 12 })).toEqual([
			1,
			"ellipsis",
			8,
			9,
			10,
			11,
			12,
		]);
	});
});
