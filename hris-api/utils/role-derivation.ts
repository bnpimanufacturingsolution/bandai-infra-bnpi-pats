/**
 * Role derivation utility.
 *
 * Canonical API:
 *   deriveRoleAndFlags({ department, level })
 *
 * This is the single source of truth for role + flags.
 * Legacy name-based overload is retained for backward compatibility in tests.
 */

export const MANAGER_LEVELS: readonly string[] = [
	"Director",
	"Senior Manager",
	"Manager",
	"Lead",
];

export const NON_MANAGER_LEVELS: readonly string[] = ["Senior", "Mid", "Junior", "Entry"];

export const VALID_LEVELS: readonly string[] = [...MANAGER_LEVELS, ...NON_MANAGER_LEVELS];

export const HR_DEPARTMENT_NAME = "HR";
export const HR_DEPARTMENT_FULL_NAME = "HUMAN RESOURCES";

export type HrisRole =
	| "hris-hr-manager"
	| "hris-hr-user"
	| "hris-employee-manager"
	| "hris-line-leader"
	| "hris-employee";

export interface DerivedRoleFlags {
	role: HrisRole;
	isManager: boolean;
	isHrManager: boolean;
}

export interface DeptForDerivation {
	isHr?: boolean | string | null;
		name?: string | null;
	code?: string | null;
}

export interface LevelForDerivation {
	isManager?: boolean | string | null;
	name?: string | null;
}

export interface RoleDerivationInput {
	department?: DeptForDerivation | null;
	level?: LevelForDerivation | null;
	position?: LevelForDerivation | null;
	/**
	 * True when the employee is an assigned line leader of at least one section
	 * (section_line_leaders membership). Yields hris-line-leader unless a
	 * higher role (HR manager / employee manager) already applies.
	 */
	isLineLeader?: boolean | string | null;
}

const toStrictBoolean = (value: unknown): boolean => {
	if (value === true) return true;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return false;
};

const roleFromFlags = (
	isHrDept: boolean,
	isMgrLvl: boolean,
	isLineLeader = false,
): HrisRole => {
	if (isHrDept) {
		if (isMgrLvl) return "hris-hr-manager";
		return "hris-hr-user";
	}
	if (isMgrLvl) return "hris-employee-manager";
	if (isLineLeader) return "hris-line-leader";
	return "hris-employee";
};

const withFlags = (role: HrisRole): DerivedRoleFlags => ({
	role,
	isHrManager: role === "hris-hr-manager",
	isManager: role === "hris-employee-manager" || role === "hris-line-leader",
});

/**
 * Canonical overload:
 * deriveRoleAndFlags({ department, level })
 */
export function deriveRoleAndFlags(input: RoleDerivationInput): DerivedRoleFlags;
/**
 * Legacy overload (kept for compatibility):
 * deriveRoleAndFlags(departmentName, levelName, departmentCode?)
 */
export function deriveRoleAndFlags(
	departmentName: string,
	levelName: string,
	departmentCode?: string,
): DerivedRoleFlags;
export function deriveRoleAndFlags(
	inputOrDepartmentName: RoleDerivationInput | string,
	levelName?: string,
	departmentCode?: string,
): DerivedRoleFlags {
	if (typeof inputOrDepartmentName === "object" && inputOrDepartmentName !== null) {
		const department = inputOrDepartmentName.department;
		const level = inputOrDepartmentName.level;

		const isHrFlag = toStrictBoolean(department?.isHr);
		const isMgrFlag =
			toStrictBoolean(level?.isManager) || toStrictBoolean(inputOrDepartmentName.position?.isManager);
		const isLineLeaderFlag = toStrictBoolean(inputOrDepartmentName.isLineLeader);

		const isHrByNameOrCode = isHrDepartment(
			String(department?.name ?? ""),
			String(department?.code ?? ""),
		);
		const isMgrByLevelName = isManagerLevel(String(level?.name ?? ""));

		const isHrDept = isHrFlag || isHrByNameOrCode;
		const isMgrLvl = isMgrFlag || isMgrByLevelName;

		const role = roleFromFlags(isHrDept, isMgrLvl, isLineLeaderFlag);
		return withFlags(role);
	}

	// Legacy path for existing tests/callers
	const departmentName = inputOrDepartmentName;
	const normalizedDept = departmentName.trim().toUpperCase();
	const normalizedLevel = (levelName || "").trim();

	if (!VALID_LEVELS.includes(normalizedLevel)) {
		throw new Error(
			`Invalid level: "${levelName}". Must be one of: ${VALID_LEVELS.join(", ")}`,
		);
	}

	const normalizedCode = departmentCode?.trim().toUpperCase();
	const isHrDept =
		normalizedDept === HR_DEPARTMENT_NAME.toUpperCase() ||
		normalizedDept === HR_DEPARTMENT_FULL_NAME ||
		normalizedCode === HR_DEPARTMENT_NAME.toUpperCase();
	const isMgrLvl = MANAGER_LEVELS.includes(normalizedLevel);

	return withFlags(roleFromFlags(isHrDept, isMgrLvl));
}

/**
 * Backward-compatible record helper.
 * Prefer deriveRoleAndFlags({ department, level }).
 */
export function deriveRoleAndFlagsFromRecord(
	department: DeptForDerivation,
	level: LevelForDerivation | null,
	position?: LevelForDerivation | null,
): DerivedRoleFlags {
	return deriveRoleAndFlags({ department, level, position });
}

export function isManagerLevel(levelName: string): boolean {
	return MANAGER_LEVELS.includes(levelName.trim());
}

export function isHrDepartment(departmentName: string, departmentCode?: string): boolean {
	const name = departmentName.trim().toUpperCase();
	const code = departmentCode?.trim().toUpperCase();
	return (
		name === HR_DEPARTMENT_NAME.toUpperCase() ||
		name === HR_DEPARTMENT_FULL_NAME ||
		code === HR_DEPARTMENT_NAME.toUpperCase()
	);
}
