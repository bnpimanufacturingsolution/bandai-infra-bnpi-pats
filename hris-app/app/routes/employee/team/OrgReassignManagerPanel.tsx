import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
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
 * Org chart builder panel (spec gap M4.2): HR/admin can reassign an
 * employee's manager; server enforces cycle prevention.
 */
export function OrgReassignManagerPanel() {
	const queryClient = useQueryClient();
	const { user } = useAuth() as any;
	const role = String(user?.role || "");
	const allowed = ALLOWED_ROLES.has(role);

	const [employeeId, setEmployeeId] = useState("");
	const [managerId, setManagerId] = useState("none");
	const [search, setSearch] = useState("");
	const [saving, setSaving] = useState(false);

	const { data: employeesData } = useEmployees({
		limit: 1000,
		query: search || undefined,
	});
	const employees = useMemo(() => {
		const raw = (employeesData as any)?.data;
		return Array.isArray(raw) ? raw : raw?.employees || [];
	}, [employeesData]);

	const options: SelectOption[] = useMemo(
		() =>
			employees.map((emp: any) => ({
				value: String(emp.id),
				label:
					`${emp.person?.personalInfo?.firstName || ""} ${
						emp.person?.personalInfo?.lastName || ""
					}`.trim() || String(emp.employeeId || emp.id),
			})),
		[employees],
	);

	if (!allowed) return null;

	const save = async () => {
		if (!employeeId) {
			toast.error("Select an employee first");
			return;
		}
		setSaving(true);
		try {
			await hrisApiClient.patch(`/api/employee/${employeeId}/report-to`, {
				reportToId: managerId === "none" ? "" : managerId,
			});
			toast.success("Manager reassigned");
			queryClient.invalidateQueries({ queryKey: ["org-chart"] });
			setEmployeeId("");
			setManagerId("none");
		} catch (error: any) {
			toast.error(error?.data?.errors?.[0]?.message || error?.message || "Reassign failed");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
			<div className="mb-2 text-sm font-semibold text-slate-950">Reassign manager</div>
			<div className="flex flex-col md:flex-row gap-2 md:items-end">
				<div className="flex-1">
					<label className="mb-1 block text-xs font-medium text-slate-600">Employee</label>
					<Input
						placeholder="Search employee by name…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					<div className="mt-2">
						<Select
							options={[
								{ value: "", label: "Select employee…", disabled: true },
								...options,
							]}
							value={employeeId}
							onChange={setEmployeeId}
						/>
					</div>
				</div>
				<div className="md:w-72">
					<label className="mb-1 block text-xs font-medium text-slate-600">
						New manager
					</label>
					<Select
						options={[{ value: "none", label: "No manager (top level)" }, ...options]}
						value={managerId}
						onChange={setManagerId}
					/>
				</div>
				<Button type="button" onClick={save} disabled={saving || !employeeId}>
					{saving ? "Saving…" : "Reassign"}
				</Button>
			</div>
			<p className="mt-2 text-xs text-slate-400">
				Cycles are blocked by the server (a manager cannot report to their own report).
			</p>
		</div>
	);
}

export default OrgReassignManagerPanel;
