// @ts-nocheck
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Eye, Filter, Plus, Upload } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { type Department } from "~/services/departments.service";
import { type Section } from "~/services/sections.service";
import { DepartmentSectionPicker } from "./DepartmentSectionPicker";
import { DepartmentSelect } from "./DepartmentSelect";

const now = "2026-06-10T00:00:00.000Z";

function department(id: string, name: string, code: string): Department {
	return {
		id,
		name,
		code,
		isActive: true,
		createdAt: now,
		updatedAt: now,
	};
}

function section(id: string, departmentId: string, name: string, code: string): Section {
	return {
		id,
		organizationId: "org-storybook",
		departmentId,
		name,
		code,
		isActive: true,
		createdAt: now,
		updatedAt: now,
	};
}

const baseDepartments = [
	department("dept-production", "Production", "PROD"),
	department("dept-hr", "Human Resources", "HR"),
	department("dept-finance", "Finance", "FIN"),
	department("dept-logistics", "Logistics", "LOG"),
	department("dept-long", "Manufacturing Operations and Workforce Planning", "MOWP"),
];

const baseSections = [
	section("section-assembly", "dept-production", "Assembly", "ASM"),
	section("section-finishing", "dept-production", "Finishing", "FIN"),
	section("section-workforce", "dept-long", "Workforce Planning", "WP"),
	section("section-compliance", "dept-long", "Compliance Scheduling", "CS"),
];

const scrollDepartments = [
	...baseDepartments,
	...Array.from({ length: 20 }, (_, index) =>
		department(`dept-extra-${index}`, `Department ${String(index + 1).padStart(2, "0")}`, `D${index}`),
	),
];

const managerOptions = [
	{ id: "all", name: "All Managers" },
	{ id: "mgr-1", name: "Akira Sato" },
	{ id: "mgr-2", name: "Mika Tanaka" },
	{ id: "mgr-3", name: "Ramon Cruz" },
	{ id: "mgr-4", name: "Long Manager Name For Overflow Review" },
];

const scrollManagerOptions = [
	...managerOptions,
	...Array.from({ length: 20 }, (_, index) => ({
		id: `mgr-extra-${index}`,
		name: `Manager ${String(index + 1).padStart(2, "0")}`,
	})),
];

type ComplianceStoryRow = {
	id: string;
	employee: string;
	employeeId: string;
	department: string;
	section: string;
	position: string;
	compliancePercent: number;
	status: "Non-Compliant" | "Warning" | "Compliant";
	missingDocs: string[];
};

type DirectoryStoryRow = {
	id: string;
	name: string;
	employeeId: string;
	position: string;
	department: string;
	section: string;
	workforceSource: "DIRECT" | "AGENCY";
	employmentHireDate: string;
	status: "Active" | "Onboarding";
};

type TimesheetStoryRow = {
	id: string;
	employee: string;
	period: string;
	department: string;
	status: "Draft" | "Submitted" | "Approved";
	totalHours: string;
};

type BenefitStoryRow = {
	id: string;
	employee: string;
	employeeId: string;
	benefitType: string;
	source: string;
	period: string;
	amount: string;
	status: "Active" | "Pending" | "Completed";
};

const complianceRows: ComplianceStoryRow[] = [
	{
		id: "emp-1",
		employee: "Mark Llames",
		employeeId: "BN-2024-0018",
		department: "Manufacturing Operations and Workforce Planning",
		section: "Compliance Scheduling",
		position: "Senior Production Quality Coordinator",
		compliancePercent: 7,
		status: "Non-Compliant",
		missingDocs: ["Employment Contract", "Valid ID"],
	},
	{
		id: "emp-2",
		employee: "Rio Marasigan",
		employeeId: "BN-2024-0021",
		department: "Production",
		section: "Assembly",
		position: "Junior Supervisor",
		compliancePercent: 82,
		status: "Warning",
		missingDocs: ["Pag-IBIG Fund"],
	},
	{
		id: "emp-3",
		employee: "Anika Rosario De La Cruz",
		employeeId: "BN-2024-0094",
		department: "Human Resources",
		section: "Employee Records",
		position: "People Operations Associate",
		compliancePercent: 100,
		status: "Compliant",
		missingDocs: [],
	},
	{
		id: "emp-4",
		employee: "Kazuo Mendoza",
		employeeId: "BN-2024-0141",
		department: "Logistics",
		section: "Warehouse Dispatch and Inventory Control",
		position: "Inventory Controller",
		compliancePercent: 61,
		status: "Non-Compliant",
		missingDocs: ["Tax Identification Number", "Social Security System"],
	},
];

const directoryRows: DirectoryStoryRow[] = [
	{
		id: "dir-1",
		name: "Arvin Salud",
		employeeId: "00021",
		position: "Deputy General Manager",
		department: "Production",
		section: "Assembly",
		workforceSource: "DIRECT",
		employmentHireDate: "7/1/2013",
		status: "Active",
	},
	{
		id: "dir-2",
		name: "Lesley Almero",
		employeeId: "00050",
		position: "Senior Manager",
		department: "QCU/Business Strategy/Customer Service",
		section: "Customer Service",
		workforceSource: "DIRECT",
		employmentHireDate: "7/1/2013",
		status: "Active",
	},
	{
		id: "dir-3",
		name: "Ivy Llarena",
		employeeId: "00032",
		position: "Senior Supervisor",
		department: "Business Strategy",
		section: "Planning",
		workforceSource: "DIRECT",
		employmentHireDate: "7/1/2013",
		status: "Active",
	},
];

const timesheetRows: TimesheetStoryRow[] = [
	{
		id: "ts-1",
		employee: "Mark Llames",
		period: "Jun 1 - Jun 15, 2026",
		department: "Manufacturing Operations and Workforce Planning",
		status: "Submitted",
		totalHours: "96.00",
	},
	{
		id: "ts-2",
		employee: "Rio Marasigan",
		period: "Jun 1 - Jun 15, 2026",
		department: "Production / Assembly",
		status: "Draft",
		totalHours: "88.00",
	},
	{
		id: "ts-3",
		employee: "Anika Rosario De La Cruz",
		period: "May 16 - May 31, 2026",
		department: "Human Resources / Employee Records",
		status: "Approved",
		totalHours: "104.00",
	},
];

const benefitRows: BenefitStoryRow[] = [
	{
		id: "benefit-1",
		employee: "Jeffry Balani Lizardo",
		employeeId: "01803",
		benefitType: "Adjustment OT/ND",
		source: "AON",
		period: "PP-20260426-20260511",
		amount: "+PHP281.25",
		status: "Active",
	},
	{
		id: "benefit-2",
		employee: "Dianne Bernadette Tividad Manalo",
		employeeId: "01791",
		benefitType: "Adjustment OT/ND",
		source: "AON",
		period: "PP-20260426-20260511",
		amount: "+PHP47.77",
		status: "Active",
	},
	{
		id: "benefit-3",
		employee: "Mariane Camitan Carbajosa",
		employeeId: "01733",
		benefitType: "Modified HDMF 2",
		source: "MHDMF2",
		period: "PP-20260426-20260511",
		amount: "-PHP250.00",
		status: "Active",
	},
];

const complianceColumns: Column<ComplianceStoryRow>[] = [
	{
		key: "employee",
		label: "Employee",
		sortable: true,
		required: true,
		width: "26%",
		render: (_value, row) => (
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-neutral-950">
					{row.employee}
				</div>
				<div className="truncate text-xs font-medium text-neutral-500">
					{row.employeeId}
				</div>
			</div>
		),
	},
	{
		key: "department",
		label: "Department",
		sortable: true,
		width: "24%",
		render: (_value, row) => (
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-neutral-800">
					{row.department}
				</div>
				<div className="truncate text-xs text-neutral-500">{row.section}</div>
			</div>
		),
	},
	{
		key: "position",
		label: "Position",
		sortable: true,
		width: "20%",
		render: (value) => <span className="block truncate text-sm text-neutral-700">{value}</span>,
	},
	{
		key: "compliancePercent",
		label: "Compliance %",
		sortable: true,
		width: "12%",
		render: (value) => (
			<span className="text-sm font-semibold text-neutral-950">{value}%</span>
		),
	},
	{
		key: "status",
		label: "Status",
		sortable: true,
		width: "12%",
		render: (value) => (
			<Badge
				variant="outline"
				className={
					value === "Compliant"
						? "border-green-200 bg-green-50 text-green-700"
						: value === "Warning"
							? "border-amber-200 bg-amber-50 text-amber-700"
							: "border-red-200 bg-red-50 text-red-700"
				}>
				{value}
			</Badge>
		),
	},
];

const directoryColumns: Column<DirectoryStoryRow>[] = [
	{
		key: "name",
		label: "Name",
		sortable: true,
		required: true,
		width: "18%",
		render: (_value, row) => (
			<div className="min-w-0 space-y-1">
				<div className="truncate text-sm font-semibold text-neutral-950">{row.name}</div>
				<span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] font-medium text-neutral-700">
					{row.employeeId}
				</span>
			</div>
		),
	},
	{
		key: "position",
		label: "Position",
		sortable: true,
		width: "18%",
		render: (value) => <span className="text-sm font-medium text-neutral-800">{value}</span>,
	},
	{
		key: "department",
		label: "Department",
		sortable: true,
		width: "24%",
		render: (_value, row) => (
			<div className="min-w-0 space-y-0.5">
				<div className="truncate text-sm font-medium text-neutral-800">
					{row.department}
				</div>
				<div className="truncate text-[11px] text-neutral-500">{row.section}</div>
			</div>
		),
	},
	{
		key: "workforceSource",
		label: "Workforce",
		width: "10%",
		render: (value) => (
			<Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
				{value}
			</Badge>
		),
	},
	{
		key: "employmentHireDate",
		label: "Hire Date",
		width: "12%",
		render: (value) => <span className="text-sm font-medium text-neutral-700">{value}</span>,
	},
	{
		key: "status",
		label: "Employment Status",
		width: "14%",
		render: (value) => (
			<Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
				{value}
			</Badge>
		),
	},
];

const timesheetColumns: Column<TimesheetStoryRow>[] = [
	{
		key: "employee",
		label: "Employee",
		sortable: true,
		required: true,
		width: "24%",
		render: (value) => <span className="text-sm font-semibold text-neutral-950">{value}</span>,
	},
	{
		key: "period",
		label: "Period",
		sortable: true,
		width: "20%",
		render: (value) => <span className="text-sm font-medium text-neutral-800">{value}</span>,
	},
	{
		key: "department",
		label: "Department",
		sortable: true,
		width: "24%",
		render: (value) => <span className="text-sm font-medium text-neutral-800">{value}</span>,
	},
	{
		key: "status",
		label: "Status",
		sortable: true,
		width: "14%",
		render: (value) => (
			<Badge
				variant="outline"
				className={
					value === "Approved"
						? "border-green-200 bg-green-50 text-green-700"
						: value === "Submitted"
							? "border-sky-200 bg-sky-50 text-sky-700"
							: "border-neutral-200 bg-neutral-50 text-neutral-700"
				}>
				{value}
			</Badge>
		),
	},
	{
		key: "totalHours",
		label: "Total Hours",
		sortable: true,
		width: "12%",
		render: (value) => <span className="text-sm font-semibold text-neutral-950">{value}</span>,
	},
];

const benefitColumns: Column<BenefitStoryRow>[] = [
	{
		key: "employee",
		label: "Employee",
		required: true,
		width: "24%",
		render: (_value, row) => (
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-neutral-950">
					{row.employee}
				</div>
				<div className="truncate text-xs font-medium text-neutral-500">
					{row.employeeId}
				</div>
			</div>
		),
	},
	{
		key: "benefitType",
		label: "Benefit Type",
		width: "20%",
		render: (_value, row) => (
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-neutral-900">
					{row.benefitType}
				</div>
				<div className="truncate text-xs font-medium text-neutral-500">{row.source}</div>
			</div>
		),
	},
	{
		key: "period",
		label: "Payroll Period",
		width: "20%",
		render: (value) => <span className="text-sm font-medium text-neutral-800">{value}</span>,
	},
	{
		key: "amount",
		label: "Amount",
		width: "12%",
		render: (value) => <span className="text-sm font-semibold text-neutral-950">{value}</span>,
	},
	{
		key: "status",
		label: "Status",
		width: "12%",
		render: (value) => (
			<Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
				{value}
			</Badge>
		),
	},
];

function ManagerSelectStory({
	defaultOpen = false,
	value = "all",
	variant = "compact",
	options = managerOptions,
}: {
	defaultOpen?: boolean;
	value?: string;
	variant?: "compact" | "datatable" | "report";
	options?: typeof managerOptions;
}) {
	const [selectedValue, setSelectedValue] = useState(value);
	const triggerClassName =
		variant === "datatable"
			? "h-10 w-[220px] rounded-lg border-neutral-200 bg-white text-xs font-semibold text-gray-700 shadow-sm"
			: variant === "report"
				? "h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm"
				: "h-9 w-full min-w-[170px] rounded-md border-neutral-200 bg-white text-xs shadow-sm sm:w-[190px]";

	return (
		<Select value={selectedValue} onValueChange={setSelectedValue} open={defaultOpen}>
			<SelectTrigger
				data-ui="timesheet-manager-trigger"
				className={triggerClassName}>
				<SelectValue placeholder="Manager" />
			</SelectTrigger>
			<SelectContent data-ui="timesheet-manager-popup">
				{options.map((manager) => (
					<SelectItem
						key={manager.id}
						value={manager.id}
						data-ui="timesheet-manager-item">
						{manager.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function PickerStory({
	defaultOpen = false,
	openSubDepartmentId,
	departmentId,
	sectionId,
	departments = baseDepartments,
	sections = baseSections,
	variant = "compact",
}: {
	defaultOpen?: boolean;
	openSubDepartmentId?: string;
	departmentId?: string;
	sectionId?: string;
	departments?: Department[];
	sections?: Section[];
	variant?: "compact" | "datatable" | "report";
}) {
	const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId);
	const [selectedSectionId, setSelectedSectionId] = useState(sectionId);

	return (
		<DepartmentSectionPicker
			variant={variant}
			departments={departments}
			sections={sections}
			departmentId={selectedDepartmentId}
			sectionId={selectedSectionId}
			open={defaultOpen}
			openSubDepartmentId={openSubDepartmentId}
			onDepartmentChange={(nextDepartmentId) => {
				setSelectedDepartmentId(nextDepartmentId === "all" ? undefined : nextDepartmentId);
				setSelectedSectionId(undefined);
			}}
			onSectionChange={(nextDepartmentId, nextSectionId) => {
				setSelectedDepartmentId(nextDepartmentId);
				setSelectedSectionId(nextSectionId);
			}}
		/>
	);
}

function DepartmentSelectStory({
	defaultOpen = false,
	value = "all",
	departments = baseDepartments,
}: {
	defaultOpen?: boolean;
	value?: string;
	departments?: Department[];
}) {
	const [selectedValue, setSelectedValue] = useState(value);

	return (
		<DepartmentSelect
			departments={departments}
			value={selectedValue}
			onValueChange={setSelectedValue}
			open={defaultOpen}
			allLabel="All Department"
			triggerClassName="h-10"
		/>
	);
}

function ComparisonCanvas({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-w-[640px] items-start gap-4 bg-white p-6">
			{children}
		</div>
	);
}

function LabeledComparisonCanvas({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-w-[720px] grid-cols-2 gap-4 bg-white p-6">
			{children}
		</div>
	);
}

function ComparisonSlot({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<div className="mb-2 text-xs font-semibold text-neutral-500">{label}</div>
			<div className="flex min-h-[260px] items-start">{children}</div>
		</div>
	);
}

function ToolbarButton({
	children,
	tone = "default",
}: {
	children: ReactNode;
	tone?: "default" | "primary";
}) {
	return (
		<button
			type="button"
			className={
				tone === "primary"
					? "inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white shadow-sm"
					: "inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm"
			}>
			{children}
		</button>
	);
}

const toolbarSelectTriggerClass =
	"h-10 w-full min-w-0 rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm";

function DataTableToolbarCanvas() {
	return (
		<div className="flex min-w-[980px] items-center gap-2 rounded-lg bg-white p-6">
			<div className="flex h-10 w-[320px] items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm text-gray-500 shadow-sm">
				Search...
			</div>
			<ToolbarButton>
				<Upload className="h-4 w-4" />
				Import
			</ToolbarButton>
			<ToolbarButton tone="primary">
				<Plus className="h-4 w-4" />
				Add
			</ToolbarButton>
			<PickerStory variant="datatable" />
			<ManagerSelectStory variant="datatable" />
			<ToolbarButton>
				<Filter className="h-4 w-4" />
				Advanced Filters
			</ToolbarButton>
			<ToolbarButton>
				<Eye className="h-4 w-4" />
				Columns
			</ToolbarButton>
		</div>
	);
}

function ToolbarSelectStory({
	value = "all",
	placeholder,
	options,
	open = false,
	dataUi,
}: {
	value?: string;
	placeholder: string;
	options: { value: string; label: string }[];
	open?: boolean;
	dataUi?: string;
}) {
	const [selectedValue, setSelectedValue] = useState(value);
	const contentDataUi = dataUi?.replace("-trigger", "-popup");
	const itemDataUi = dataUi?.replace("-trigger", "-item");

	return (
		<Select value={selectedValue} onValueChange={setSelectedValue} open={open}>
			<SelectTrigger data-ui={dataUi} className={toolbarSelectTriggerClass}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent data-ui={contentDataUi}>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} data-ui={itemDataUi}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function BenefitToolbarControls({
	openControl,
	departmentId,
	sectionId,
	narrow = false,
}: {
	openControl?: "department" | "manager";
	departmentId?: string;
	sectionId?: string;
	narrow?: boolean;
}) {
	const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId);
	const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
	const commonClass = narrow
		? "min-w-[170px] flex-[1_1_170px]"
		: "min-w-[170px] flex-[1_1_170px] sm:max-w-[220px]";

	return (
		<>
			<div
				className={
					narrow
						? "min-w-[190px] flex-[1_1_220px]"
						: "min-w-[190px] flex-[1_1_220px] sm:max-w-[280px]"
				}>
				<DepartmentSectionPicker
					variant="datatable"
					departments={scrollDepartments}
					sections={baseSections}
					departmentId={selectedDepartmentId}
					sectionId={selectedSectionId}
					open={openControl === "department" ? true : undefined}
					className="w-full sm:w-full"
					onDepartmentChange={(value) => {
						setSelectedDepartmentId(value === "all" ? undefined : value);
						setSelectedSectionId(undefined);
					}}
					onSectionChange={(nextDepartmentId, nextSectionId) => {
						setSelectedDepartmentId(nextDepartmentId);
						setSelectedSectionId(nextSectionId);
					}}
				/>
			</div>
			<div className={commonClass}>
				<ToolbarSelectStory
					open={openControl === "manager"}
					placeholder="All Manager"
					dataUi="timesheet-manager-trigger"
					options={managerOptions.map((manager) => ({
						value: manager.id,
						label: manager.name,
					}))}
				/>
			</div>
		</>
	);
}

function BenefitsManagementCanvas({
	openControl,
	narrow = false,
}: {
	openControl?: "department" | "manager";
	narrow?: boolean;
}) {
	return (
		<div className={narrow ? "w-[760px] bg-neutral-50 p-5" : "w-full bg-neutral-50 p-6"}>
			<DataTable<BenefitStoryRow>
				title="Benefits Management"
				description="Manage employee benefit enrollments and coverage"
				data={benefitRows}
				columns={benefitColumns}
				searchFields={["employee", "employeeId", "benefitType", "source"]}
				showSearch
				searchWidth={narrow ? "w-full sm:w-[230px]" : "w-80"}
				searchPlaceholder="Search employees or benefits..."
				onAdd={() => undefined}
				addButtonLabel="Add Adjustment"
				addButtonClassName="bg-orange-600 hover:bg-orange-700 text-white"
				filters={[
					{
						key: "source",
						label: "Source",
						options: [
							{ value: "AON", label: "AON - Adjustment OT/ND" },
							{ value: "MHDMF2", label: "MHDMF2 - Modified HDMF 2" },
						],
					},
					{
						key: "direction",
						label: "Direction",
						options: [
							{ value: "COMPENSATION", label: "Compensation" },
							{ value: "DEDUCTION", label: "Deductions" },
						],
					},
					{
						key: "status",
						label: "Status",
						options: [
							{ value: "ACTIVE", label: "Active" },
							{ value: "PENDING", label: "Pending" },
							{ value: "COMPLETED", label: "Completed" },
						],
					},
				]}
				filterValues={{ source: "AON" }}
				filterButtonLabel="Advanced Filters"
				customFilters={<BenefitToolbarControls openControl={openControl} narrow={narrow} />}
				renderActions={() => (
					<button
						type="button"
						className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700">
						...
					</button>
				)}
				alwaysShowPagination
			/>
		</div>
	);
}

function PayrollToolbarCanvas({
	openControl,
	past = false,
	narrow = false,
}: {
	openControl?: "department" | "manager";
	past?: boolean;
	narrow?: boolean;
}) {
	return (
		<div className={narrow ? "w-[760px] bg-neutral-50 p-5" : "w-full bg-neutral-50 p-6"}>
			<DataTable<BenefitStoryRow>
				title="Employee Payroll Management"
				description={past ? "All past payroll records" : "View employee payroll records for Period 1 - Jun 2026"}
				data={past ? benefitRows : []}
				columns={benefitColumns}
				searchFields={["employee", "employeeId", "period"]}
				showSearch
				searchWidth={narrow ? "w-full sm:w-[230px]" : "w-80"}
				searchPlaceholder="Search payroll..."
				filters={[
					{
						key: "employeeId",
						label: "Employee",
						options: [
							{ value: "emp-1", label: "Jeffry Balani Lizardo" },
							{ value: "emp-2", label: "Dianne Bernadette Tividad Manalo" },
						],
					},
					...(past
						? [
								{
									key: "periodId",
									label: "Period",
									options: [
										{ value: "period-1", label: "Period 1 - Jun 2026" },
										{ value: "period-2", label: "Period 2 - Apr 2026" },
									],
								},
							]
						: []),
				]}
				filterValues={past ? { periodId: "period-2" } : {}}
				filterButtonLabel="Advanced Filters"
				customFilters={<BenefitToolbarControls openControl={openControl} narrow={narrow} />}
				renderActions={() => (
					<button
						type="button"
						className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700">
						...
					</button>
				)}
				alwaysShowPagination
			/>
		</div>
	);
}

function ComplianceFilterControls({
	openControl,
	openSubDepartmentId,
	departmentId,
	sectionId,
}: {
	openControl?: "department" | "manager" | "document";
	openSubDepartmentId?: string;
	departmentId?: string;
	sectionId?: string;
}) {
	const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId);
	const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
	const [selectedManagerId, setSelectedManagerId] = useState("all");
	const [selectedDocumentType, setSelectedDocumentType] = useState("all");
	const complianceSections = [
		...baseSections,
		section("section-records", "dept-hr", "Employee Records", "ER"),
		section(
			"section-dispatch",
			"dept-logistics",
			"Warehouse Dispatch and Inventory Control",
			"WDIC",
		),
	];

	return (
		<>
			<DepartmentSectionPicker
				openSubDepartmentId={openSubDepartmentId}
				open={openControl === "department" ? true : undefined}
				departmentId={selectedDepartmentId}
				sectionId={selectedSectionId}
				departments={scrollDepartments}
				sections={complianceSections}
				variant="datatable"
				onDepartmentChange={(nextDepartmentId) => {
					setSelectedDepartmentId(nextDepartmentId === "all" ? undefined : nextDepartmentId);
					setSelectedSectionId(undefined);
				}}
				onSectionChange={(nextDepartmentId, nextSectionId) => {
					setSelectedDepartmentId(nextDepartmentId);
					setSelectedSectionId(nextSectionId);
				}}
			/>
			<Select
				value={selectedManagerId}
				onValueChange={setSelectedManagerId}
				open={openControl === "manager" ? true : undefined}>
				<SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm sm:w-[220px]">
					<SelectValue placeholder="Manager" />
				</SelectTrigger>
				<SelectContent>
					{managerOptions.map((manager) => (
						<SelectItem key={manager.id} value={manager.id}>
							{manager.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={selectedDocumentType}
				onValueChange={setSelectedDocumentType}
				open={openControl === "document" ? true : undefined}>
				<SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm sm:w-[220px]">
					<SelectValue placeholder="Document type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Document Types</SelectItem>
					<SelectItem value="contract">Employment Contract</SelectItem>
					<SelectItem value="tin">Tax Identification Number</SelectItem>
					<SelectItem value="sss">Social Security System</SelectItem>
					<SelectItem value="valid-id">Valid ID</SelectItem>
					<SelectItem value="long">
						Pre-employment Medical Clearance and Government Requirement Waiver
					</SelectItem>
				</SelectContent>
			</Select>
		</>
	);
}

function EmployeeDocumentsComplianceCanvas({
	openControl,
	openSubDepartmentId,
	narrow = false,
	empty = false,
}: {
	openControl?: "department" | "manager" | "document";
	openSubDepartmentId?: string;
	narrow?: boolean;
	empty?: boolean;
}) {
	return (
		<div className={narrow ? "w-[430px] bg-neutral-50 p-4" : "w-full bg-neutral-50 p-6"}>
			<div className="rounded-lg border border-neutral-200 bg-white">
				<div className="flex flex-col gap-3 border-b border-neutral-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex h-5 w-5 items-center justify-center rounded-full border border-red-200 text-xs font-semibold text-red-600">
							!
						</span>
						<h2 className="truncate text-base font-semibold text-neutral-950">
							Employee Document Compliance
						</h2>
					</div>
					<div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-neutral-100 p-1 text-xs font-semibold text-neutral-600">
						<span className="rounded-md bg-white px-3 py-1.5 text-neutral-950 shadow-sm">
							Non-Compliant (163)
						</span>
						<span className="px-3 py-1.5">Compliant (2054)</span>
						<span className="px-3 py-1.5">Pending Approval (0)</span>
						<span className="px-3 py-1.5">Warnings (2054)</span>
						<span className="px-3 py-1.5">Review History</span>
					</div>
				</div>
				<div className="p-5">
					<DataTable<ComplianceStoryRow>
						title="Non-Compliant Employees"
						data={empty ? [] : complianceRows}
						columns={complianceColumns}
						searchFields={["employee", "employeeId", "department", "section", "position"]}
						showSearch
						searchPlaceholder="Search employees, IDs, departments, positions, or documents..."
						customFilters={
							<ComplianceFilterControls
								openControl={openControl}
								openSubDepartmentId={openSubDepartmentId}
								departmentId={openSubDepartmentId}
							/>
						}
						alwaysShowPagination
						noCard
						emptyMessage="No employees match these filters"
						emptyDescription="Try another department, section, manager, or document type."
					/>
				</div>
			</div>
		</div>
	);
}

function EmployeeDirectoryReferenceCanvas({ narrow = false }: { narrow?: boolean }) {
	return (
		<div className={narrow ? "w-[430px] bg-neutral-50 p-4" : "w-full bg-neutral-50 p-6"}>
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<DataTable<DirectoryStoryRow>
					title="Employee Directory"
					data={directoryRows}
					columns={directoryColumns}
					searchFields={["name", "employeeId", "position", "department", "section"]}
					showSearch
					searchPlaceholder="Search..."
					customFilters={
						<>
							<DepartmentSectionPicker
								variant="datatable"
								departments={scrollDepartments}
								sections={baseSections}
								departmentId="all"
								onDepartmentChange={() => undefined}
								onSectionChange={() => undefined}
							/>
							<ManagerSelectStory variant="datatable" />
						</>
					}
					alwaysShowPagination
					noCard
				/>
			</div>
		</div>
	);
}

function TimesheetReferenceCanvas() {
	return (
		<div className="w-full bg-neutral-50 p-6">
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<DataTable<TimesheetStoryRow>
					title="Active Timesheets"
					data={timesheetRows}
					columns={timesheetColumns}
					searchFields={["employee", "period", "department", "status"]}
					showSearch
					searchPlaceholder="Search timesheets..."
					customFilters={
						<>
							<DepartmentSectionPicker
								variant="datatable"
								departments={scrollDepartments}
								sections={baseSections}
								departmentId="all"
								onDepartmentChange={() => undefined}
								onSectionChange={() => undefined}
							/>
							<Select value="all">
								<SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm sm:w-[170px]">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Statuses</SelectItem>
									<SelectItem value="SUBMITTED">Submitted</SelectItem>
									<SelectItem value="APPROVED">Approved</SelectItem>
								</SelectContent>
							</Select>
						</>
					}
					alwaysShowPagination
					noCard
				/>
			</div>
		</div>
	);
}

function TypographyParityComparisonCanvas() {
	return (
		<div className="grid w-full gap-6 bg-neutral-50 p-6">
			<div className="min-w-0">
				<div className="mb-2 text-xs font-semibold uppercase text-neutral-500">
					Reference: Employee Directory
				</div>
				<EmployeeDirectoryReferenceCanvas />
			</div>
			<div className="min-w-0">
				<div className="mb-2 text-xs font-semibold uppercase text-neutral-500">
					Target: Employee Documents
				</div>
				<EmployeeDocumentsComplianceCanvas />
			</div>
			<div className="min-w-0">
				<div className="mb-2 text-xs font-semibold uppercase text-neutral-500">
					Adjacent: Timesheets
				</div>
				<TimesheetReferenceCanvas />
			</div>
		</div>
	);
}

function ReportFilterCanvas() {
	return (
		<div className="flex min-w-[720px] items-end gap-4 bg-white p-6">
			<div className="space-y-1">
				<div className="block text-sm font-medium">Department</div>
				<PickerStory variant="report" />
			</div>
			<div className="w-[160px] space-y-1">
				<div className="block text-sm font-medium">Manager</div>
				<ManagerSelectStory variant="report" />
			</div>
			<div className="w-[180px] space-y-1">
				<div className="block text-sm font-medium">Period</div>
				<Select value="all">
					<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
						<SelectValue placeholder="All Periods" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Periods</SelectItem>
						<SelectItem value="current">Current Period</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

function TimesheetFilterCanvas() {
	return (
		<div className="flex min-w-[520px] items-center gap-2 bg-white p-6">
			<PickerStory defaultOpen openSubDepartmentId="dept-production" />
			<ManagerSelectStory defaultOpen />
		</div>
	);
}

const meta = {
	title: "HR/Filters/Department Selects",
	parameters: {
		layout: "centered",
	},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DepartmentClosed: Story = {
	render: () => <PickerStory />,
};

export const DepartmentOpen: Story = {
	render: () => <PickerStory defaultOpen />,
};

export const DepartmentSubmenuOpen: Story = {
	render: () => <PickerStory defaultOpen openSubDepartmentId="dept-production" />,
};

export const DepartmentSelected: Story = {
	render: () => <PickerStory departmentId="dept-production" />,
};

export const SectionSelected: Story = {
	render: () => <PickerStory departmentId="dept-production" sectionId="section-assembly" />,
};

export const LongDepartmentName: Story = {
	render: () => <PickerStory departmentId="dept-long" />,
};

export const ScrollHeavyDepartmentList: Story = {
	render: () => <PickerStory defaultOpen departments={scrollDepartments} />,
};

export const ManagersClosed: Story = {
	render: () => <ManagerSelectStory />,
};

export const ManagersOpen: Story = {
	render: () => <ManagerSelectStory defaultOpen />,
};

export const ManagersSelected: Story = {
	render: () => <ManagerSelectStory defaultOpen value="mgr-2" />,
};

export const SimpleDepartmentClosed: Story = {
	render: () => <DepartmentSelectStory />,
};

export const SimpleDepartmentOpen: Story = {
	render: () => <DepartmentSelectStory defaultOpen />,
};

export const SimpleDepartmentSelected: Story = {
	render: () => <DepartmentSelectStory defaultOpen value="dept-production" />,
};

export const SimpleDepartmentLongName: Story = {
	render: () => <DepartmentSelectStory value="dept-long" />,
};

export const SimpleDepartmentScrollHeavy: Story = {
	render: () => <DepartmentSelectStory defaultOpen departments={scrollDepartments} />,
};

export const SideBySideOpen: Story = {
	render: () => (
		<ComparisonCanvas>
			<PickerStory defaultOpen openSubDepartmentId="dept-production" />
			<ManagerSelectStory defaultOpen />
		</ComparisonCanvas>
	),
};

export const DataTableToolbarParity: Story = {
	render: () => <DataTableToolbarCanvas />,
};

export const DatatableDepartmentOpen: Story = {
	render: () => <PickerStory variant="datatable" defaultOpen />,
};

export const DatatableManagerOpen: Story = {
	render: () => <ManagerSelectStory variant="datatable" defaultOpen />,
};

export const DatatableDepartmentSelected: Story = {
	render: () => (
		<PickerStory
			variant="datatable"
			defaultOpen
			departmentId="dept-production"
			openSubDepartmentId="dept-production"
		/>
	),
};

export const DatatableManagerSelected: Story = {
	render: () => <ManagerSelectStory variant="datatable" defaultOpen value="mgr-2" />,
};

export const DatatableDepartmentSubmenuOpen: Story = {
	render: () => (
		<PickerStory
			variant="datatable"
			defaultOpen
			openSubDepartmentId="dept-production"
		/>
	),
};

export const TimesheetDepartmentOpen: Story = {
	render: () => <PickerStory defaultOpen />,
};

export const TimesheetManagerOpen: Story = {
	render: () => <ManagerSelectStory defaultOpen />,
};

export const ReportDepartmentOpen: Story = {
	render: () => <PickerStory variant="report" defaultOpen />,
};

export const ReportManagerOpen: Story = {
	render: () => <ManagerSelectStory variant="report" defaultOpen />,
};

export const LongLabelsSideBySide: Story = {
	render: () => (
		<LabeledComparisonCanvas>
			<ComparisonSlot label="Department">
				<PickerStory variant="datatable" departmentId="dept-long" />
			</ComparisonSlot>
			<ComparisonSlot label="Manager">
				<ManagerSelectStory variant="datatable" value="mgr-4" />
			</ComparisonSlot>
		</LabeledComparisonCanvas>
	),
};

export const ScrollHeavySideBySide: Story = {
	render: () => (
		<LabeledComparisonCanvas>
			<ComparisonSlot label="Department">
				<PickerStory variant="datatable" defaultOpen departments={scrollDepartments} />
			</ComparisonSlot>
			<ComparisonSlot label="Manager">
				<ManagerSelectStory
					variant="datatable"
					defaultOpen
					options={scrollManagerOptions}
				/>
			</ComparisonSlot>
		</LabeledComparisonCanvas>
	),
};

export const BenefitsToolbarDefault: Story = {
	render: () => <BenefitsManagementCanvas />,
	parameters: { layout: "fullscreen" },
};

export const BenefitsToolbarDepartmentOpen: Story = {
	render: () => <BenefitsManagementCanvas openControl="department" />,
	parameters: { layout: "fullscreen" },
};

export const BenefitsToolbarManagerOpen: Story = {
	render: () => <BenefitsManagementCanvas openControl="manager" />,
	parameters: { layout: "fullscreen" },
};

export const BenefitsToolbarNarrowWrapped: Story = {
	render: () => <BenefitsManagementCanvas narrow />,
	parameters: { layout: "fullscreen" },
};

export const PayrollActiveToolbarDefault: Story = {
	render: () => <PayrollToolbarCanvas />,
	parameters: { layout: "fullscreen" },
};

export const PayrollActiveDepartmentOpen: Story = {
	render: () => <PayrollToolbarCanvas openControl="department" />,
	parameters: { layout: "fullscreen" },
};

export const PayrollActiveManagerOpen: Story = {
	render: () => <PayrollToolbarCanvas openControl="manager" />,
	parameters: { layout: "fullscreen" },
};

export const PayrollPastToolbarDefault: Story = {
	render: () => <PayrollToolbarCanvas past />,
	parameters: { layout: "fullscreen" },
};

export const PayrollPastNarrowWrapped: Story = {
	render: () => <PayrollToolbarCanvas past narrow />,
	parameters: { layout: "fullscreen" },
};

export const ReportFilterParity: Story = {
	render: () => <ReportFilterCanvas />,
};

export const TimesheetFilterParity: Story = {
	render: () => <TimesheetFilterCanvas />,
};

export const NarrowWrappedToolbar: Story = {
	render: () => (
		<div className="flex w-[420px] flex-wrap items-center gap-2 bg-white p-6">
			<PickerStory variant="datatable" departmentId="dept-long" />
			<ManagerSelectStory variant="datatable" value="mgr-4" />
			<ToolbarButton>
				<Filter className="h-4 w-4" />
				Advanced Filters
			</ToolbarButton>
		</div>
	),
};

export const EmployeeDocumentsComplianceDefault: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsDepartmentOpen: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas openControl="department" />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsSectionSubmenuOpen: Story = {
	render: () => (
		<EmployeeDocumentsComplianceCanvas
			openControl="department"
			openSubDepartmentId="dept-production"
		/>
	),
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsManagerOpen: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas openControl="manager" />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsDocumentTypeOpen: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas openControl="document" />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsNarrowWrapped: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas narrow />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDocumentsEmptyState: Story = {
	render: () => <EmployeeDocumentsComplianceCanvas empty />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDirectoryTypographyReference: Story = {
	render: () => <EmployeeDirectoryReferenceCanvas />,
	parameters: { layout: "fullscreen" },
};

export const EmployeeDirectoryMobileReference: Story = {
	render: () => <EmployeeDirectoryReferenceCanvas narrow />,
	parameters: { layout: "fullscreen" },
};

export const TimesheetTypographyReference: Story = {
	render: () => <TimesheetReferenceCanvas />,
	parameters: { layout: "fullscreen" },
};

export const DataTableTypographyParityComparison: Story = {
	render: () => <TypographyParityComparisonCanvas />,
	parameters: { layout: "fullscreen" },
};
