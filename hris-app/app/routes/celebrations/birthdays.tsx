import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Gift } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { Card, CardContent } from "~/components/ui/card";
import employeesService from "~/services/employees.service";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { CelebrantDetailsModal } from "~/components/organisms/celebrations/CelebrantDetailsModal";
import { useBirthdayCelebrants } from "~/lib/hooks/useCelebrations";
import type {
	BirthdayCelebrantItem,
	BirthdayFilterType,
	BirthdayItemType,
} from "~/types/celebrations";

type BirthdayTableRow = {
	id: string;
	type: BirthdayItemType;
	typeLabel: "Employee" | "Kid";
	displayName: string;
	employeeCode: string;
	avatar: string | null;
	profileId: string;
	parentDisplayName: string;
	department: string;
	relationLabel: string;
	dateLabel: string;
	day: number;
	dayGroup: string;
	today: boolean;
	source: BirthdayCelebrantItem;
};

type BirthdayRosterEmployee = {
	id?: string | null;
	employeeId?: string | null;
	user?: {
		avatar?: string | null;
	};
};

const extractRosterEmployees = (payload: unknown): BirthdayRosterEmployee[] => {
	const data = payload as {
		data?: BirthdayRosterEmployee[] | { employees?: BirthdayRosterEmployee[] };
		employees?: BirthdayRosterEmployee[];
	};

	if (Array.isArray(data?.data)) {
		return data.data;
	}

	if (Array.isArray(data?.data?.employees)) {
		return data.data.employees;
	}

	if (Array.isArray(data?.employees)) {
		return data.employees;
	}

	return [];
};

const toMonthLabel = (date: Date): string =>
	date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

const toMonthDayLabel = (year: number, month: number, day: number): string =>
	new Date(year, month - 1, day).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});

const isBirthdayToday = (month: number, day: number): boolean => {
	const today = new Date();
	return today.getMonth() + 1 === month && today.getDate() === day;
};

const getSearchPlaceholder = (type: BirthdayFilterType): string => {
	if (type === "EMPLOYEES") {
		return "Search employee name or ID";
	}
	if (type === "KIDS") {
		return "Search kid name or parent name";
	}
	return "Search employees or kids";
};

export default function BirthdayCelebrationsPage() {
	const [selectedDate, setSelectedDate] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
	);
	const [activeType, setActiveType] = useState<BirthdayFilterType>("ALL");
	const [selectedItem, setSelectedItem] = useState<BirthdayCelebrantItem | null>(null);

	const month = selectedDate.getMonth() + 1;
	const year = selectedDate.getFullYear();

	const { data, isLoading, error } = useBirthdayCelebrants({
		month,
		year,
		type: "ALL",
		search: "",
	});

	const { data: rosterData } = useQuery({
		queryKey: ["employees", "birthday-roster"],
		queryFn: () =>
			employeesService
				.clearQueryParams()
				.select(["id", "employeeId", "person.personalInfo", "user.avatar"])
				.paginate(1, 1000)
				.getEmployees(true),
		staleTime: 5 * 60 * 1000,
		enabled: !error && data?.state !== "NO_ORG",
	});

	const rosterEmployees = useMemo(
		() => extractRosterEmployees(rosterData),
		[rosterData],
	);

	const employeeRosterById = useMemo(() => {
		const map = new Map<string, { employeeCode: string; avatar: string | null }>();

		for (const employee of rosterEmployees) {
			const profileId = String(employee.id || "").trim();
			if (!profileId) continue;

			map.set(profileId, {
				employeeCode: String(employee.employeeId || "").trim(),
				avatar: String(employee.user?.avatar || "").trim() || null,
			});
		}

		return map;
	}, [rosterEmployees]);

	const canShowNoOrg = data?.state === "NO_ORG";
	const allItems = useMemo(() => data?.items || [], [data?.items]);
	const employeeCount = allItems.filter((item) => item.type === "EMPLOYEE_BIRTHDAY").length;
	const kidCount = allItems.filter((item) => item.type === "CHILD_BIRTHDAY").length;

	const filteredItems = useMemo(() => {
		if (activeType === "EMPLOYEES") {
			return allItems.filter((item) => item.type === "EMPLOYEE_BIRTHDAY");
		}

		if (activeType === "KIDS") {
			return allItems.filter((item) => item.type === "CHILD_BIRTHDAY");
		}

		return allItems;
	}, [allItems, activeType]);

	const tableRows = useMemo<BirthdayTableRow[]>(() => {
		return filteredItems
			.map((item) => {
				const today = isBirthdayToday(item.month, item.day);
				const dayLabel = toMonthDayLabel(year, item.month, item.day);
				const isEmployee = item.type === "EMPLOYEE_BIRTHDAY";
				const rosterEntry = isEmployee
					? employeeRosterById.get(String(item.employeeId || "").trim())
					: undefined;

				return {
					id: item.id,
					type: item.type,
					typeLabel: (isEmployee ? "Employee" : "Kid") as "Employee" | "Kid",
					displayName: item.displayName,
					employeeCode: rosterEntry?.employeeCode || "",
					avatar: rosterEntry?.avatar ?? null,
					profileId: isEmployee ? String(item.employeeId || "").trim() : "",
					parentDisplayName: item.parentDisplayName || "",
					department: item.department || "",
					relationLabel: isEmployee
						? item.department || "No department"
						: `Child of ${item.parentDisplayName || "Unknown"}`,
					dateLabel: dayLabel,
					day: item.day,
					dayGroup: dayLabel,
					today,
					source: item,
				};
			})
			.sort((a, b) => {
				if (a.day !== b.day) {
					return a.day - b.day;
				}
				return a.displayName.localeCompare(b.displayName, undefined, {
					sensitivity: "base",
				});
			});
	}, [employeeRosterById, filteredItems, year]);

	const dayGroupOrder = useMemo(
		() => Array.from(new Set(tableRows.map((row) => row.dayGroup))),
		[tableRows],
	);

	const goToPreviousMonth = () => {
		setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
	};

	const goToNextMonth = () => {
		setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
	};

	const columns: Column<BirthdayTableRow>[] = [
		{
			key: "displayName",
			label: "Celebrant",
			sortable: false,
			width: "34%",
			render: (_value, item) => (
				<div className="flex min-w-0 items-center gap-2">
					{item.type === "EMPLOYEE_BIRTHDAY" ? (
						<EmployeeTableCell
							profileId={item.profileId || undefined}
							fullName={item.displayName}
							employeeId={item.employeeCode || "-"}
							avatar={item.avatar}
						/>
					) : (
						<EmployeeTableCell
							fullName={item.displayName}
							employeeId={
								item.parentDisplayName
									? `Child of ${item.parentDisplayName}`
									: "Kid celebrant"
							}
							avatar={null}
						/>
					)}
					{item.today && (
						<Badge variant="success-soft" className="shrink-0 px-2 py-0.5 text-[10px]">
							Today
						</Badge>
					)}
				</div>
			),
		},
		{
			key: "typeLabel",
			label: "Type",
			sortable: false,
			width: "16%",
			render: (_value, item) => (
				<Badge variant={item.type === "EMPLOYEE_BIRTHDAY" ? "info" : "warning-soft"}>
					{item.typeLabel}
				</Badge>
			),
		},
		{
			key: "relationLabel",
			label: "Department / Parent",
			sortable: false,
			width: "32%",
			render: (value) => <span className="text-gray-700">{value}</span>,
		},
		{
			key: "dateLabel",
			label: "Birthday",
			sortable: false,
			width: "18%",
			render: (value) => <span className="font-medium text-gray-800">{value}</span>,
		},
	];

	return (
		<div className="space-y-6">
			{!isLoading && error && (
				<Card>
					<CardContent className="py-10 text-center text-red-600">
						{error.message || "Failed to load birthday celebrants."}
					</CardContent>
				</Card>
			)}

			{!isLoading && !error && canShowNoOrg && (
				<Card>
					<CardContent className="py-10 text-center text-gray-700">
						{data?.message || "No organization assigned."}
					</CardContent>
				</Card>
			)}

			{!error && !canShowNoOrg && (
				<DataTable<BirthdayTableRow>
					title="Monthly Celebrants"
					description={`Showing birthdays for ${toMonthLabel(selectedDate)}`}
					data={tableRows}
					columns={columns}
					searchFields={[
						"displayName",
						"employeeCode",
						"parentDisplayName",
						"relationLabel",
					]}
					searchPlaceholder={getSearchPlaceholder(activeType)}
					isLoading={isLoading}
					emptyMessage="No celebrants found"
					emptyDescription="No birthdays match the selected month and view."
					showFilters={false}
					showExport={false}
					showPagination={false}
					groupBy={{
						key: "dayGroup",
						order: dayGroupOrder,
						renderGroupHeader: (groupLabel) => (
							<div className="flex items-center gap-2">
								<Gift className="h-4 w-4" />
								<span className="font-semibold">{groupLabel}</span>
							</div>
						),
					}}
					customFilters={
						<div className="flex items-center gap-2">
							<span className="text-xs font-semibold text-gray-600">View</span>
							<Select
								value={activeType}
								onValueChange={(value) =>
									setActiveType(value as BirthdayFilterType)
								}>
								<SelectTrigger className="w-[220px] h-10 rounded-xl border-neutral-200 bg-white text-xs shadow-sm">
									<SelectValue placeholder="Select view" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">All ({allItems.length})</SelectItem>
									<SelectItem value="EMPLOYEES">
										Employees ({employeeCount})
									</SelectItem>
									<SelectItem value="KIDS">Kids ({kidCount})</SelectItem>
								</SelectContent>
							</Select>
						</div>
					}
					headerActions={
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon"
								onClick={goToPreviousMonth}
								className="h-10 w-10 rounded-xl">
								<ChevronLeft className="w-4 h-4" />
							</Button>
							<div className="min-w-[170px] text-center font-semibold text-gray-900">
								{toMonthLabel(selectedDate)}
							</div>
							<Button
								variant="outline"
								size="icon"
								onClick={goToNextMonth}
								className="h-10 w-10 rounded-xl">
								<ChevronRight className="w-4 h-4" />
							</Button>
						</div>
					}
					rowClassName={(row) => (row.today ? "bg-green-50/50" : "")}
					renderActions={(row) => (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setSelectedItem(row.source)}
							className="h-8">
							<Eye className="h-4 w-4 mr-1" />
							Details
						</Button>
					)}
				/>
			)}

			<CelebrantDetailsModal
				item={selectedItem}
				year={year}
				rosterByProfileId={employeeRosterById}
				onClose={() => setSelectedItem(null)}
			/>
		</div>
	);
}
