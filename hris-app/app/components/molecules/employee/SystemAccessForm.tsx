import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { useEffect, useMemo, useRef } from "react";
import type { FormData } from "~/types/employee-form.types";
import { useRoles } from "~/lib/hooks/useRoles";
import { useDepartment } from "~/lib/hooks/useDepartments";
import { useLevel } from "~/lib/hooks/useLevels";
import { usePosition } from "~/lib/hooks/usePositions";
import { buildDefaultEmployeePassword } from "~/lib/utils/default-employee-password";
import { deriveRoleAndFlags, roleLabel, type HrisRole } from "~/lib/utils/role-derivation";

interface SystemAccessFormProps {
	form: UseFormReturn<FormData>;
	isEditMode?: boolean;
	showDefaultPassword?: boolean;
}

const sanitizeUsername = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const getRoleFlags = (roleName?: string | null) => ({
	isManager: roleName === "hris-employee-manager" || roleName === "hris-line-leader",
	isHrManager: roleName === "hris-hr-manager",
});

const formatRoleName = (roleName?: string | null) => {
	if (!roleName) return "";
	if (
		roleName === "hris-hr-manager" ||
		roleName === "hris-hr-user" ||
		roleName === "hris-employee-manager" ||
		roleName === "hris-line-leader" ||
		roleName === "hris-employee"
	) {
		return roleLabel(roleName as HrisRole);
	}
	return roleName
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

export function SystemAccessForm({
	form,
	isEditMode = false,
	showDefaultPassword = !isEditMode,
}: SystemAccessFormProps) {
	const { register, control, getValues, setValue } = form;
	const previousEmployeeIdRef = useRef<string>("");

	const { data: rolesData, isLoading: isLoadingRoles } = useRoles(true);

	const roles = useMemo(() => rolesData?.data?.roles ?? [], [rolesData]);

	const personEmail = useWatch({ control, name: "person.contactInfo.email" });
	const employeeId = useWatch({ control, name: "employee.employeeId" });
	const firstName = useWatch({ control, name: "person.personalInfo.firstName" });
	const lastName = useWatch({ control, name: "person.personalInfo.lastName" });
	const employeeRoleName = (useWatch({ control, name: "employee" }) as any)?.role;
	const currentRoleId = useWatch({ control, name: "user.roleId" });
	const watchedDeptId = useWatch({ control, name: "employee.departmentId" });
	const watchedLevelId = useWatch({ control, name: "employee.levelId" });
	const watchedPositionId = useWatch({ control, name: "employee.positionId" });
	const { data: selectedDeptData } = useDepartment(watchedDeptId || "");
	const { data: selectedLevelData } = useLevel(watchedLevelId || "");
	const { data: selectedPositionData } = usePosition(watchedPositionId || "");

	const selectedDept = useMemo(() => {
		const record = selectedDeptData as any;
		if (!record) return null;
		const recordId = record._id || record.id;
		return recordId === watchedDeptId ? record : null;
	}, [selectedDeptData, watchedDeptId]);

	const selectedLevel = useMemo(() => {
		const record = selectedLevelData as any;
		if (!record) return null;
		const recordId = record._id || record.id;
		return recordId === watchedLevelId ? record : null;
	}, [selectedLevelData, watchedLevelId]);

	const selectedPosition = useMemo(() => {
		const record = selectedPositionData as any;
		if (!record) return null;
		const recordId = record._id || record.id;
		return recordId === watchedPositionId ? record : null;
	}, [selectedPositionData, watchedPositionId]);

	const derivedResult = useMemo(
		() =>
			selectedDept && (selectedLevel || selectedPosition)
				? deriveRoleAndFlags({
						department: selectedDept as { isHr?: boolean | string | null },
						level: selectedLevel as { isManager?: boolean | string | null },
						position: selectedPosition as { isManager?: boolean | string | null },
					})
				: null,
		[selectedDept, selectedLevel, selectedPosition],
	);

	const selectedRole = useMemo(
		() =>
			roles.find(
				(role: any) =>
					String(role?.id || role?._id || "") === String(currentRoleId || ""),
			),
		[roles, currentRoleId],
	);
	const roleDisplayName =
		selectedRole?.name || derivedResult?.role || employeeRoleName || "";
	const roleDisplayValue = isLoadingRoles
		? "Loading role..."
		: formatRoleName(roleDisplayName) || "Role not assigned";

	const resolveFallbackRole = useMemo(() => {
		if (roles.length === 0) return null;
		const preferredRoleOrder = [
			"hris-employee",
			"hris-employee-manager",
			"hris-hr-user",
			"hris-hr-manager",
			"hris-admin",
			"admin",
			"super_admin",
		];
		for (const roleName of preferredRoleOrder) {
			const matched = roles.find((role: any) => role.name === roleName);
			if (matched) return matched;
		}
		return roles[0];
	}, [roles]);

	// Auto-set user.roleId to the matching role from the auth service list
	useEffect(() => {
		if (!watchedDeptId || (!watchedLevelId && !watchedPositionId) || !derivedResult) {
			setValue("employee.derivedRole" as any, undefined);
			setValue("employee.isManager", false);
			setValue("employee.isHrManager" as any, false);
			return;
		}

		setValue("employee.derivedRole" as any, derivedResult.role);
		setValue("employee.isManager", derivedResult.isManager);
		setValue("employee.isHrManager" as any, derivedResult.isHrManager);

		console.info("[ROLE_DERIVATION][UI][SystemAccess]", {
			departmentId: watchedDeptId,
			levelId: watchedLevelId,
			positionId: watchedPositionId,
			departmentKeys: selectedDept ? Object.keys(selectedDept) : [],
			levelKeys: selectedLevel ? Object.keys(selectedLevel) : [],
			positionKeys: selectedPosition ? Object.keys(selectedPosition) : [],
			departmentIsHr: selectedDept?.isHr,
			levelIsManager: selectedLevel?.isManager,
			positionIsManager: selectedPosition?.isManager,
			derivedRole: derivedResult.role,
			derivedFlags: {
				isManager: derivedResult.isManager,
				isHrManager: derivedResult.isHrManager,
			},
		});

		if (roles.length === 0) return;
		const matchingRole = roles.find((r: any) => r.name === derivedResult.role);
		if (matchingRole && (!isEditMode || !currentRoleId)) {
			setValue("user.roleId", matchingRole.id);
		}
	}, [
		currentRoleId,
		derivedResult,
		isEditMode,
		roles,
		setValue,
		watchedDeptId,
		watchedLevelId,
		watchedPositionId,
		selectedDept,
		selectedLevel,
		selectedPosition,
	]);

	// Edit-mode fallback: match by stored role name when no derivation available
	useEffect(() => {
		if (
			isEditMode &&
			employeeRoleName &&
			!currentRoleId &&
			roles.length > 0 &&
			!derivedResult
		) {
			const m = roles.find((r: any) => r.name === employeeRoleName);
			if (m) setValue("user.roleId", m.id);
		}
	}, [isEditMode, employeeRoleName, currentRoleId, roles, setValue, derivedResult]);

	// Create-mode fallback so quick navigation/prefill never lands with an empty role.
	useEffect(() => {
		if (isEditMode || isLoadingRoles || currentRoleId || !resolveFallbackRole) return;
		setValue("user.roleId", resolveFallbackRole.id, { shouldValidate: true });
		setValue("employee.role", resolveFallbackRole.name || "");
		setValue("employee.derivedRole" as any, resolveFallbackRole.name || undefined);
		const roleFlags = getRoleFlags(resolveFallbackRole.name);
		setValue("employee.isManager", roleFlags.isManager);
		setValue("employee.isHrManager" as any, roleFlags.isHrManager);
	}, [currentRoleId, isEditMode, isLoadingRoles, resolveFallbackRole, setValue]);

	useEffect(() => {
		if (personEmail) setValue("user.email", personEmail);
	}, [personEmail, setValue]);

	useEffect(() => {
		if (firstName && lastName) {
			setValue("user.userName", sanitizeUsername(`${firstName}-${lastName}`));
		}
	}, [firstName, lastName, setValue]);

	useEffect(() => {
		if (employeeId && !isEditMode && lastName) {
			setValue("user.password", buildDefaultEmployeePassword(lastName, employeeId));
		}
	}, [employeeId, lastName, isEditMode, setValue]);

	useEffect(() => {
		if (!employeeId) {
			previousEmployeeIdRef.current = employeeId || "";
			return;
		}

		const currentDeviceEmpId = String(getValues("employee.deviceEmpId") || "").trim();
		const previousEmployeeId = previousEmployeeIdRef.current;
		if (!currentDeviceEmpId || currentDeviceEmpId === previousEmployeeId) {
			setValue("employee.deviceEmpId", employeeId, {
				shouldDirty: Boolean(currentDeviceEmpId),
				shouldValidate: false,
			});
		}
		previousEmployeeIdRef.current = employeeId;
	}, [employeeId, getValues, setValue]);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-bold tracking-tight text-foreground">System Access</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{isEditMode
						? "View account credentials - email and password update is not supported here"
						: "Configure account credentials for the new employee"}
				</p>
			</div>

			<div className="space-y-5">
				<div data-field-path="user.email">
					<label className="block text-sm font-normal text-muted-foreground/70 mb-1.5">
						Email Address
					</label>
					<input
						type="email"
						disabled
						className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
						{...register("user.email")}
					/>
					<p className="text-xs text-muted-foreground mt-1">
						{isEditMode ? "Email cannot be changed" : "From Personal Information"}
					</p>
				</div>

				<div data-field-path="employee.role">
					<label className="block text-sm font-normal text-muted-foreground/70 mb-1.5">
						Role
					</label>
					<input
						type="text"
						disabled
						value={roleDisplayValue}
						className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
					/>
				</div>

				<div data-field-path="employee.deviceEmpId">
					<label className="block text-sm font-normal text-muted-foreground/70 mb-1.5">
						Biometric User ID
					</label>
					<input
						type="text"
						className="w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm text-gray-900"
						placeholder={employeeId || "Same as Employee ID"}
						{...register("employee.deviceEmpId")}
					/>
					<p className="text-xs text-muted-foreground mt-1">
						Used to match device callbacks to this employee. Defaults to Employee ID.
					</p>
				</div>

				{showDefaultPassword && (
					<div className="bg-gray-50 px-4 py-3 rounded-md border border-gray-200">
						<div className="flex items-center gap-2 text-sm">
							<span className="text-muted-foreground">
								{isEditMode ? "Initial password:" : "Default password:"}
							</span>
							<code className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-800 font-mono text-xs">
								{lastName && employeeId
									? buildDefaultEmployeePassword(lastName, employeeId)
									: "Wait for Last Name & Employee ID"}
							</code>
						</div>
						<p className="text-xs text-muted-foreground mt-1.5">
							Format: lastname (no spaces) + employeeId + !{new Date().getFullYear()}{" "}
							(e.g. delacruz101!{new Date().getFullYear()})
						</p>
					</div>
				)}

				{isEditMode && (
					<div className="bg-blue-50 px-4 py-3 rounded-md border border-blue-200">
						<div className="flex items-start gap-2">
							<svg
								className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"
								fill="currentColor"
								viewBox="0 0 20 20">
								<path
									fillRule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
									clipRule="evenodd"
								/>
							</svg>
							<div>
								<p className="text-sm font-medium text-blue-900">
									Password will not be changed
								</p>
								<p className="text-xs text-blue-700 mt-1">
									Updating this employee will not affect their existing password
								</p>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
