import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";

type ReportEmployeeRosterEntry = {
	id?: string | null;
	employeeId?: string | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			middleName?: string | null;
			lastName?: string | null;
		};
	};
	user?: {
		avatar?: string | null;
	};
};

interface ReportEmployeeCellProps {
	rosterEmployees?: ReportEmployeeRosterEntry[];
	employeeId?: string | null;
	employeeCode?: string | null;
	fullName?: string | null;
	name?: string | null;
	fallbackName?: string;
	className?: string;
	onClick?: () => void;
}

const normalizeText = (value?: string | null) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();

const buildRosterNameVariants = (employee?: ReportEmployeeRosterEntry | null) => {
	const firstName = String(employee?.person?.personalInfo?.firstName || "").trim();
	const middleName = String(employee?.person?.personalInfo?.middleName || "").trim();
	const lastName = String(employee?.person?.personalInfo?.lastName || "").trim();

	return [
		[firstName, middleName, lastName].filter(Boolean).join(" ").trim(),
		[firstName, lastName].filter(Boolean).join(" ").trim(),
	].filter(Boolean);
};

const resolveRosterEmployee = (
	rosterEmployees: ReportEmployeeRosterEntry[] = [],
	employeeId?: string | null,
	employeeCode?: string | null,
	fullName?: string | null,
) => {
	const normalizedEmployeeName = normalizeText(fullName);
	const identityCandidates = [employeeId, employeeCode]
		.map(normalizeText)
		.filter(Boolean);

	return (
		rosterEmployees.find((employee) =>
			identityCandidates.some((candidate) =>
				[
					normalizeText(employee.id),
					normalizeText(employee.employeeId),
				].includes(candidate),
			),
		) ||
		rosterEmployees.find((employee) =>
			buildRosterNameVariants(employee).some(
				(nameVariant) => normalizeText(nameVariant) === normalizedEmployeeName,
			),
		) ||
		null
	);
};

export function resolveReportEmployeeCell({
	rosterEmployees,
	employeeId,
	employeeCode,
	fullName,
	name,
}: Pick<
	ReportEmployeeCellProps,
	"rosterEmployees" | "employeeId" | "employeeCode" | "fullName" | "name"
>) {
	const resolvedName = String(fullName || name || "").trim() || undefined;
	const resolvedRosterEmployee = resolveRosterEmployee(
		rosterEmployees,
		employeeId,
		employeeCode,
		resolvedName,
	);

	return {
		fullName:
			resolvedName ||
			buildRosterNameVariants(resolvedRosterEmployee).find((value) => value) ||
			undefined,
		employeeId:
			String(employeeCode || employeeId || resolvedRosterEmployee?.employeeId || resolvedRosterEmployee?.id || "").trim() ||
			undefined,
		avatar: String(resolvedRosterEmployee?.user?.avatar || "").trim() || undefined,
	};
}

export function ReportEmployeeCell({
	rosterEmployees,
	employeeId,
	employeeCode,
	fullName,
	name,
	fallbackName = "N/A",
	className,
	onClick,
}: ReportEmployeeCellProps) {
	const resolved = resolveReportEmployeeCell({
		rosterEmployees,
		employeeId,
		employeeCode,
		fullName,
		name,
	});

	return (
		<EmployeeTableCell
			fullName={resolved.fullName}
			employeeId={resolved.employeeId}
			avatar={resolved.avatar ?? null}
			fallbackName={fallbackName}
			className={className}
			onClick={onClick}
		/>
	);
}
