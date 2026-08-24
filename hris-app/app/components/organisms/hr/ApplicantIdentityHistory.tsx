import { History, Briefcase, UserRound } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { EmploymentStatusText } from "~/components/shared/EmploymentStatusText";

export type ApplicantIdentityApplicationRecord = {
	id: string;
	applicantId?: string | null;
	jobTitle?: string | null;
	appliedDate?: string | Date | null;
	currentWorkflowStateKey?: string | null;
	convertedToEmployeeId?: string | null;
	isCurrent?: boolean;
};

export type ApplicantIdentityEmployeeRecord = {
	id: string;
	employeeId?: string | null;
	employmentStatus?: string | null;
	employmentHireDate?: string | Date | null;
	employmentTerminationDate?: string | Date | null;
	positionTitle?: string | null;
	departmentName?: string | null;
};

export type ApplicantIdentityHistoryValue = {
	matched?: boolean;
	reason?: string;
	previousApplications?: ApplicantIdentityApplicationRecord[];
	employees?: ApplicantIdentityEmployeeRecord[];
	summary?: {
		previousApplicationCount?: number;
		employeeCount?: number;
		latestApplicationStatus?: string | null;
		employeeStatuses?: string[];
	};
};

const formatDate = (value?: string | Date | null) => {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString();
};

const formatStateLabel = (value?: string | null) => {
	const key = String(value || "").trim();
	if (!key) return "—";
	return key
		.toLowerCase()
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

const buildSummaryLine = (history: ApplicantIdentityHistoryValue) => {
	const parts: string[] = [];
	const applicationCount = history.summary?.previousApplicationCount ?? 0;
	const latestStatus = history.summary?.latestApplicationStatus;
	if (applicationCount > 0) {
		parts.push(
			latestStatus
				? `Previous application: ${formatStateLabel(latestStatus)}`
				: `${applicationCount} previous application${applicationCount === 1 ? "" : "s"}`,
		);
	}
	const employeeStatuses = history.summary?.employeeStatuses || [];
	if (employeeStatuses.length > 0) {
		parts.push(`Employee record: ${employeeStatuses.map(formatStateLabel).join(", ")}`);
	} else if ((history.summary?.employeeCount || 0) > 0) {
		parts.push("Existing employee record");
	}
	return parts.join(" · ");
};

const unmatchedCopy = (history?: ApplicantIdentityHistoryValue | null) => {
	const reason = String(history?.reason || "");
	if (reason === "missing_name_or_birthday") {
		return "Cannot check history. Date of birth is missing, so first name + last name + birthday cannot be matched.";
	}
	if (reason === "invalid_birthday") {
		return "Cannot check history. Date of birth is invalid.";
	}
	return "No previous application or employee record for this name and birthday.";
};

export function ApplicantIdentityHistory({
	history,
}: {
	history?: ApplicantIdentityHistoryValue | null;
}) {
	const applications = history?.previousApplications || [];
	const employees = history?.employees || [];
	const summaryLine = history ? buildSummaryLine(history) : "";

	if (!history?.matched) {
		return (
			<div className="mt-5 border-t border-[#e8dede] pt-5">
				<div className="flex items-start gap-2">
					<History className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
					<div className="min-w-0 space-y-1">
						<p className="text-sm font-medium text-neutral-900">Applicant history</p>
						<p className="text-sm leading-snug text-[#5f5f63]">{unmatchedCopy(history)}</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-5 border-t border-[#e8dede] pt-5">
			<div className="flex items-start gap-2 rounded-xl bg-amber-50/90 px-3 py-3 ring-1 ring-amber-100">
				<History className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-medium text-neutral-900">Previous Bandai record</p>
					{summaryLine ? (
						<p className="text-sm leading-snug text-[#5f5f63]">{summaryLine}</p>
					) : (
						<p className="text-sm leading-snug text-[#5f5f63]">
							This name and birthday already exist in applicants or employees.
						</p>
					)}
				</div>
			</div>

			<Accordion type="single" collapsible className="mt-3">
				<AccordionItem value="identity-history" className="border-[#e8dede]">
					<AccordionTrigger className="py-3 text-sm font-medium text-neutral-900 hover:no-underline">
						<span className="inline-flex items-center gap-2">
							<History className="h-4 w-4 text-neutral-500" />
							Full history
						</span>
					</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-4 pb-2">
							<section className="space-y-2">
								<h4 className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a8480]">
									<Briefcase className="h-3.5 w-3.5" />
									Previous applications
								</h4>
								{applications.length === 0 ? (
									<p className="text-sm text-[#5f5f63]">No previous applications.</p>
								) : (
									<ul className="divide-y divide-[#e8dede]/90 rounded-lg ring-1 ring-[#e8dede]/80">
										{applications.map((row) => (
											<li key={row.id} className="space-y-1 px-3 py-3">
												<p className="text-sm font-medium text-neutral-900">
													{row.jobTitle || "Open position"}
												</p>
												<p className="text-sm text-[#5f5f63]">
													{formatStateLabel(row.currentWorkflowStateKey)} ·{" "}
													Applied {formatDate(row.appliedDate)}
												</p>
											</li>
										))}
									</ul>
								)}
							</section>

							<section className="space-y-2">
								<h4 className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a8480]">
									<UserRound className="h-3.5 w-3.5" />
									Employee records
								</h4>
								{employees.length === 0 ? (
									<p className="text-sm text-[#5f5f63]">No employee record.</p>
								) : (
									<ul className="divide-y divide-[#e8dede]/90 rounded-lg ring-1 ring-[#e8dede]/80">
										{employees.map((row) => (
											<li key={row.id} className="space-y-1 px-3 py-3">
												<p className="text-sm font-medium text-neutral-900">
													{row.employeeId || "Employee"} ·{" "}
													{row.positionTitle || "—"}
												</p>
												<div className="flex flex-wrap items-center gap-2 text-sm text-[#5f5f63]">
													<EmploymentStatusText status={row.employmentStatus} />
													<span>
														Hired {formatDate(row.employmentHireDate)}
														{row.employmentTerminationDate
															? ` · Left ${formatDate(row.employmentTerminationDate)}`
															: ""}
													</span>
												</div>
												{row.departmentName ? (
													<p className="text-sm text-[#5f5f63]">{row.departmentName}</p>
												) : null}
											</li>
										))}
									</ul>
								)}
							</section>
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
