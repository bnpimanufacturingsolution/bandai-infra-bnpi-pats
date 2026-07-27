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
	/** Internal employee record id (profile deep-link). Prefer this when known. */
	profileId?: string | null;
	employeeId?: string | null;
	employeeCode?: string | null;
	fullName?: string | null;
	name?: string | null;
	fallbackName?: string;
	className?: string;
	/** When true (default), cell navigates to `/employee/:profileId` if resolvable. */
	linkToProfile?: boolean;
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
	profileId,
	employeeId,
	employeeCode,
	fullName,
	name,
}: Pick<
	ReportEmployeeCellProps,
	| "rosterEmployees"
	| "profileId"
	| "employeeId"
	| "employeeCode"
	| "fullName"
	| "name"
>) {
	const resolvedName = String(fullName || name || "").trim() || undefined;
	const resolvedRosterEmployee = resolveRosterEmployee(
		rosterEmployees,
		employeeId,
		employeeCode,
		resolvedName,
	);

	// Display code: prefer explicit props, then roster human code (not internal UUID).
	const displayEmployeeId =
		String(
			employeeCode ||
				employeeId ||
				resolvedRosterEmployee?.employeeId ||
				"",
		).trim() || undefined;

	const resolvedProfileId =
		String(profileId || resolvedRosterEmployee?.id || "").trim() || undefined;

	return {
		fullName:
			resolvedName ||
			buildRosterNameVariants(resolvedRosterEmployee).find((value) => value) ||
			undefined,
		employeeId: displayEmployeeId,
		profileId: resolvedProfileId,
		avatar: String(resolvedRosterEmployee?.user?.avatar || "").trim() || undefined,
	};
}

export function ReportEmployeeCell({
	rosterEmployees,
	profileId,
	employeeId,
	employeeCode,
	fullName,
	name,
	fallbackName = "N/A",
	className,
	linkToProfile = true,
	onClick,
}: ReportEmployeeCellProps) {
	const resolved = resolveReportEmployeeCell({
		rosterEmployees,
		profileId,
		employeeId,
		employeeCode,
		fullName,
		name,
	});

	return (
		<EmployeeTableCell
			profileId={linkToProfile && !onClick ? resolved.profileId : undefined}
			fullName={resolved.fullName}
			employeeId={resolved.employeeId}
			avatar={resolved.avatar ?? null}
			fallbackName={fallbackName}
			className={className}
			onClick={onClick}
		/>
	);
}
