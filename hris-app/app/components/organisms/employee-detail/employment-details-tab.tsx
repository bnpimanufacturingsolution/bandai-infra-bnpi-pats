import type { ReactNode } from "react";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import type { Employee } from "~/services/employees.service";
import {
	BadgeCheck,
	Briefcase,
	Building2,
	Calendar,
	CheckCircle2,
	Clock,
	MapPin,
	Users,
} from "lucide-react";

interface EmploymentDetailsTabProps {
	employee: Employee;
}

const formatDate = (date?: string | null) => {
	if (!date) return "N/A";
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

const formatEnumLabel = (value?: string | null) => {
	const normalized = String(value || "").trim();
	if (!normalized) return "N/A";
	return normalized
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
};

const calculateTenure = (hireDate?: string | null) => {
	if (!hireDate) return "Not started";

	const start = new Date(hireDate);
	const today = new Date();
	const years = today.getFullYear() - start.getFullYear();
	const months = today.getMonth() - start.getMonth();
	const days = today.getDate() - start.getDate();

	let finalYears = years;
	let finalMonths = months;
	let finalDays = days;

	if (finalDays < 0) {
		finalMonths -= 1;
		finalDays += 30;
	}

	if (finalMonths < 0) {
		finalYears -= 1;
		finalMonths += 12;
	}

	const parts = [];
	if (finalYears > 0) parts.push(`${finalYears}y`);
	if (finalMonths > 0) parts.push(`${finalMonths}m`);
	if (finalDays > 0) parts.push(`${finalDays}d`);

	return parts.length > 0 ? parts.join(" ") : "0d";
};

const getProbationLabel = (probationEndDate?: string | null) => {
	if (!probationEndDate) return null;
	return new Date(probationEndDate) > new Date()
		? "Currently on probation"
		: "Probation completed";
};

export function EmploymentDetailsTab({ employee }: EmploymentDetailsTabProps) {
	const workforceSource = formatEnumLabel(employee.workforceSource);
	const workLocation = formatEnumLabel(employee.workLocation);
	const probationLabel = getProbationLabel(employee.probationEndDate);

	return (
		<div className="grid gap-4 xl:grid-cols-2" data-testid="employment-card-grid">
			<EmploymentCard
				icon={BadgeCheck}
				title="Employment Status"
				rows={[
					{
						label: "Employee ID",
						value: employee.employeeId || "Not assigned",
					},
					{
						label: "Status",
						value: <StatusBadge status={employee.employmentStatus} />,
					},
					{
						label: "Workforce Source",
						value: workforceSource,
					},
				]}
			/>

			<EmploymentCard
				icon={Briefcase}
				title="Work Arrangement"
				rows={[
					{
						label: "Employment Type",
						value: formatEnumLabel(employee.employmentType),
					},
					{
						label: "Work Location",
						value: workLocation,
					},
					...(employee.agency?.name
						? [
								{
									label: "Agency",
									value: employee.agency.name,
									hint: employee.agency.code || null,
								},
							]
						: []),
				]}
				emptyMessage="No work arrangement details available."
			/>

			<EmploymentCard
				icon={Calendar}
				title="Important Dates"
				rows={[
					{
						label: "Hire Date",
						value: formatDate(employee.employmentHireDate),
						hint: `Tenure ${calculateTenure(employee.employmentHireDate)}`,
					},
					{
						label: "Employment Start",
						value: formatDate(employee.employmentStartDate),
					},
					...(employee.probationEndDate
						? [
								{
									label: "Probation End",
									value: formatDate(employee.probationEndDate),
									hint: probationLabel,
								},
							]
						: []),
					...(employee.employmentTerminationDate
						? [
								{
									label: "Termination Date",
									value: formatDate(employee.employmentTerminationDate),
								},
							]
						: []),
				]}
			/>

			<EmploymentCard
				icon={Building2}
				title="Position & Department"
				rows={[
					{
						label: "Department",
						value: employee.department?.name || "Not assigned",
						hint: employee.department?.code || null,
					},
					{
						label: "Section",
						value: employee.section?.name || "Not assigned",
						hint: employee.section?.code || null,
					},
					{
						label: "Position",
						value: employee.position?.title || "Not assigned",
						hint: employee.position?.code || null,
					},
					{
						label: "Level",
						value: employee.level?.name || "Not assigned",
					},
				]}
			/>
		</div>
	);
}

function EmploymentCard({
	icon: Icon,
	title,
	rows,
	emptyMessage,
}: {
	icon: typeof Briefcase;
	title: string;
	rows: Array<{
		label: string;
		value: ReactNode;
		hint?: ReactNode;
	}>;
	emptyMessage?: string;
}) {
	const visibleRows = rows.filter((row) => {
		if (typeof row.value === "string") {
			return row.value.trim().length > 0;
		}
		return row.value !== null && row.value !== undefined;
	});

	return (
		<section className="rounded-2xl border border-border bg-white shadow-sm">
			<div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-4">
				<div className="rounded-xl bg-primary/10 p-2 text-primary">
					<Icon className="h-4 w-4" />
				</div>
				<div>
					<h3 className="text-base font-semibold text-foreground">{title}</h3>
				</div>
			</div>

			{visibleRows.length > 0 ? (
				<div className="divide-y divide-border/70 px-5">
					{visibleRows.map((row) => (
						<div
							key={`${title}-${row.label}`}
							className="flex items-start justify-between gap-4 py-4">
							<div className="min-w-0 space-y-1">
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									{row.label}
								</p>
								{row.hint ? (
									<p className="text-sm text-muted-foreground">{row.hint}</p>
								) : null}
							</div>
							<div className="min-w-0 text-right text-sm font-medium text-foreground">
								{row.value}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="px-5 py-8 text-sm text-muted-foreground">
					{emptyMessage || "No information available."}
				</div>
			)}
		</section>
	);
}
