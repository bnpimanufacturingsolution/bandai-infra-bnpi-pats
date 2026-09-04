import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Briefcase, UserCheck, ArrowRight } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { SearchableSelect, type SearchableSelectOption } from "~/components/ui/searchable-select";
import { hrisApiClient } from "~/lib/api-client";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";

const ALLOWED_ROLES = new Set([
	"hris-admin",
	"hris-hr-manager",
	"admin",
	"super_admin",
	"superadmin",
]);

/**
 * Org chart builder panel: HR/admin can reassign an
 * employee's manager; server enforces cycle prevention.
 */
export function OrgReassignManagerPanel() {
	const queryClient = useQueryClient();
	const { user } = useAuth() as any;
	const role = String(user?.role || "");
	const allowed = ALLOWED_ROLES.has(role);

	const [employeeId, setEmployeeId] = useState("");
	const [managerId, setManagerId] = useState("none");
	const [saving, setSaving] = useState(false);

	const { data: employeesData, isLoading: isLoadingEmployees } = useEmployees({
		limit: 1000,
	});

	const employees = useMemo(() => {
		const raw = (employeesData as any)?.data;
		return Array.isArray(raw) ? raw : raw?.employees || [];
	}, [employeesData]);

	// Selected employee details
	const selectedEmployee = useMemo(() => {
		if (!employeeId) return null;
		return employees.find((emp: any) => String(emp.id) === employeeId) || null;
	}, [employees, employeeId]);

	// Options for selecting which employee to reassign
	const employeeOptions: SearchableSelectOption[] = useMemo(() => {
		return employees.map((emp: any) => {
			const firstName = emp.person?.personalInfo?.firstName || emp.person?.firstName || "";
			const lastName = emp.person?.personalInfo?.lastName || emp.person?.lastName || "";
			const fullName = `${firstName} ${lastName}`.trim() || emp.employeeId || emp.id;
			const position = emp.position?.title || emp.position?.name || "";
			const department = emp.department?.name || "";
			const description = [position, department].filter(Boolean).join(" • ");

			return {
				value: String(emp.id),
				label: `${fullName} (${emp.employeeId || "No Code"})`,
				description: description || undefined,
				badge: department || undefined,
			};
		});
	}, [employees]);

	// Options for selecting the new manager (exclude the selected employee themselves)
	const managerOptions: SearchableSelectOption[] = useMemo(() => {
		const topLevelOption: SearchableSelectOption = {
			value: "none",
			label: "No manager (top level / CEO)",
			description: "Employee reports to no one / Top of reporting hierarchy",
		};

		const filteredEmployees = employeeId
			? employees.filter((emp: any) => String(emp.id) !== employeeId)
			: employees;

		const options = filteredEmployees.map((emp: any) => {
			const firstName = emp.person?.personalInfo?.firstName || emp.person?.firstName || "";
			const lastName = emp.person?.personalInfo?.lastName || emp.person?.lastName || "";
			const fullName = `${firstName} ${lastName}`.trim() || emp.employeeId || emp.id;
			const position = emp.position?.title || emp.position?.name || "";
			const department = emp.department?.name || "";
			const description = [position, department].filter(Boolean).join(" • ");

			return {
				value: String(emp.id),
				label: `${fullName} (${emp.employeeId || "No Code"})`,
				description: description || undefined,
				badge: department || undefined,
			};
		});

		return [topLevelOption, ...options];
	}, [employees, employeeId]);

	if (!allowed) return null;

	const handleEmployeeSelect = (val: string) => {
		setEmployeeId(val);
		if (val) {
			const emp = employees.find((e: any) => String(e.id) === val);
			const currentManagerId = emp?.reportTo?.id || emp?.reportToId || "none";
			setManagerId(currentManagerId);
		} else {
			setManagerId("none");
		}
	};

	const save = async () => {
		if (!employeeId) {
			toast.error("Please select an employee first");
			return;
		}
		setSaving(true);
		try {
			const targetReportToId = managerId === "none" ? "" : managerId;
			await hrisApiClient.patch(`/api/employee/${employeeId}/report-to`, {
				reportToId: targetReportToId,
			});
			toast.success("Manager successfully reassigned");
			await queryClient.invalidateQueries({ queryKey: ["org-chart"] });
			await queryClient.invalidateQueries({ queryKey: ["employees"] });
			await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
			setEmployeeId("");
			setManagerId("none");
		} catch (error: any) {
			toast.error(error?.data?.errors?.[0]?.message || error?.message || "Failed to reassign manager");
		} finally {
			setSaving(false);
		}
	};

	const currentManagerName = useMemo(() => {
		if (!selectedEmployee) return null;
		const mgr = selectedEmployee.reportTo;
		if (!mgr) return "No manager (top level)";
		const fn = mgr.person?.personalInfo?.firstName || mgr.person?.firstName || "";
		const ln = mgr.person?.personalInfo?.lastName || mgr.person?.lastName || "";
		return `${fn} ${ln}`.trim() || mgr.employeeId || "Direct Manager";
	}, [selectedEmployee]);

	return (
		<div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
			<div className="flex items-center gap-2 mb-3">
				<UserCheck className="w-5 h-5 text-orange-600" />
				<div>
					<div className="text-sm font-semibold text-slate-950">Reassign Manager & Reporting Line</div>
					<div className="text-xs text-slate-500">Update reporting structure in the organization hierarchy</div>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
				{/* 1. Employee Selection */}
				<div className="lg:col-span-5">
					<label className="mb-1 block text-xs font-medium text-slate-700">
						Select Employee <span className="text-red-500">*</span>
					</label>
					<SearchableSelect
						options={employeeOptions}
						value={employeeId}
						onValueChange={handleEmployeeSelect}
						placeholder={isLoadingEmployees ? "Loading employees..." : "Search employee by name, code, position..."}
						searchPlaceholder="Type name, position, department..."
						className="h-10 text-xs md:text-sm bg-white"
					/>
				</div>

				{/* 2. New Manager Selection */}
				<div className="lg:col-span-5">
					<label className="mb-1 block text-xs font-medium text-slate-700">
						Assign New Manager / Supervisor <span className="text-red-500">*</span>
					</label>
					<SearchableSelect
						options={managerOptions}
						value={managerId}
						onValueChange={setManagerId}
						disabled={!employeeId}
						placeholder={employeeId ? "Select new manager..." : "Select an employee first"}
						searchPlaceholder="Search supervisor by name, position..."
						className="h-10 text-xs md:text-sm bg-white"
					/>
				</div>

				{/* 3. Action Button */}
				<div className="lg:col-span-2 pt-1 md:pt-5">
					<Button
						type="button"
						variant="primary"
						onClick={save}
						disabled={saving || !employeeId}
						className="w-full h-10 text-xs md:text-sm font-medium"
					>
						{saving ? "Reassigning..." : "Reassign"}
					</Button>
				</div>
			</div>

			{/* Selected Employee Preview Info */}
			{selectedEmployee && (
				<div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
					<div className="flex items-center gap-1 font-medium text-slate-900">
						<span>{selectedEmployee.person?.personalInfo?.firstName || ""} {selectedEmployee.person?.personalInfo?.lastName || ""}</span>
						<span className="text-slate-400">({selectedEmployee.employeeId})</span>
					</div>
					{selectedEmployee.department?.name && (
						<div className="flex items-center gap-1">
							<Building2 className="w-3.5 h-3.5 text-slate-400" />
							<span>{selectedEmployee.department.name}</span>
						</div>
					)}
					{selectedEmployee.position?.title && (
						<div className="flex items-center gap-1">
							<Briefcase className="w-3.5 h-3.5 text-slate-400" />
							<span>{selectedEmployee.position.title}</span>
						</div>
					)}
					<div className="flex items-center gap-1 ml-auto text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
						<span>Current Manager:</span>
						<span className="font-semibold">{currentManagerName}</span>
					</div>
				</div>
			)}

			<p className="mt-2 text-[11px] text-slate-400">
				Cycles are prevented automatically (a manager cannot be reassigned to report to their own direct/indirect report).
			</p>
		</div>
	);
}

export default OrgReassignManagerPanel;
