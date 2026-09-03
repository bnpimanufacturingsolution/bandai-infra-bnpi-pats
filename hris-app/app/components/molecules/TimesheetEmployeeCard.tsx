import { Building2, Briefcase } from "lucide-react";

export interface TimesheetEmployeeData {
	id?: string;
	employeeCode?: string;
	person?: {
		personalInfo?: {
			firstName?: string;
			middleName?: string;
			lastName?: string;
			suffix?: string;
		};
	};
	position?: {
		id?: string;
		title?: string;
		code?: string;
	};
	department?: {
		id?: string;
		name?: string;
		code?: string;
	};
	embeddedSchedule?: unknown;
}

interface TimesheetEmployeeCardProps {
	employee?: TimesheetEmployeeData;
	className?: string;
	profileId?: string;
	onOpenProfile?: (employeeId: string) => void;
}

export function TimesheetEmployeeCard({
	employee,
	className = "",
	profileId,
	onOpenProfile,
}: TimesheetEmployeeCardProps) {
	if (!employee) return null;

	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const initials = `${firstName[0] || ""}${lastName[0] || ""}`;

	const fullName =
		[
			employee?.person?.personalInfo?.firstName,
			employee?.person?.personalInfo?.middleName,
			employee?.person?.personalInfo?.lastName,
			employee?.person?.personalInfo?.suffix,
		]
			.filter(Boolean)
			.join(" ") || "Employee";
	const resolvedProfileId = profileId || employee.id;
	const canOpenProfile = Boolean(onOpenProfile && resolvedProfileId);

	return (
		<div className={`bg-white rounded-lg px-4 py-3.5 border border-gray-200 ${className}`}>
			{canOpenProfile ? (
				<button
					type="button"
					onClick={() => onOpenProfile?.(resolvedProfileId as string)}
					className="w-full flex items-center gap-3 rounded-md text-left transition enabled:hover:bg-gray-50 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-orange-300">
					<div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-gray-900">
						{initials}
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-base font-semibold text-gray-900 truncate">{fullName}</p>
						<div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
							{employee?.position && (
								<span className="flex items-center gap-1">
									<Briefcase className="w-3 h-3" />
									{employee.position.title}
								</span>
							)}
							{employee?.department && (
								<span className="flex items-center gap-1">
									<Building2 className="w-3 h-3" />
									{employee.department.name}
								</span>
							)}
						</div>
						{employee?.employeeCode && (
							<p className="text-xs text-gray-400 mt-0.5">
								ID: {employee.employeeCode}
							</p>
						)}
					</div>
				</button>
			) : (
				<div className="flex items-center gap-3">
					<div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-gray-900">
						{initials}
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-base font-semibold text-gray-900 truncate">{fullName}</p>
						<div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
							{employee?.position && (
								<span className="flex items-center gap-1">
									<Briefcase className="w-3 h-3" />
									{employee.position.title}
								</span>
							)}
							{employee?.department && (
								<span className="flex items-center gap-1">
									<Building2 className="w-3 h-3" />
									{employee.department.name}
								</span>
							)}
						</div>
						{employee?.employeeCode && (
							<p className="text-xs text-gray-400 mt-0.5">
								ID: {employee.employeeCode}
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
