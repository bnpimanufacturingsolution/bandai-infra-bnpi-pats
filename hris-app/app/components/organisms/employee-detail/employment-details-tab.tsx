import type { Employee } from "~/services/employees.service";
import {
	CheckCircle,
	AlertCircle,
	Briefcase,
	Calendar,
	Building2,
	Users,
	Clock,
	MapPin,
	BadgeCheck,
} from "lucide-react";

interface EmploymentDetailsTabProps {
	employee: Employee;
}

export function EmploymentDetailsTab({ employee }: EmploymentDetailsTabProps) {
	const formatDate = (date: string | undefined | null) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const calculateTenure = (hireDate: string | undefined) => {
		if (!hireDate) return "0 days";
		const start = new Date(hireDate);
		const today = new Date();
		const years = today.getFullYear() - start.getFullYear();
		const months = today.getMonth() - start.getMonth();
		const days = today.getDate() - start.getDate();

		let finalYears = years;
		let finalMonths = months;
		let finalDays = days;

		if (finalDays < 0) {
			finalMonths--;
			finalDays += 30;
		}
		if (finalMonths < 0) {
			finalYears--;
			finalMonths += 12;
		}

		const parts = [];
		if (finalYears > 0) parts.push(`${finalYears}y`);
		if (finalMonths > 0) parts.push(`${finalMonths}m`);
		if (finalDays > 0) parts.push(`${finalDays}d`);

		return parts.length > 0 ? parts.join(" ") : "0 days";
	};

	const isProbationActive = employee.probationEndDate
		? new Date(employee.probationEndDate) > new Date()
		: false;

	return (
		<div className="space-y-8">
			{/* Employment Status Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<BadgeCheck className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Employment Status</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Employee ID */}
						{employee.employeeId && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Briefcase className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Employee ID
									</span>
								</div>
								<span className="text-sm text-gray-600 font-mono">
									{employee.employeeId}
								</span>
							</div>
						)}

						{/* Employment Status */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<div className="flex items-center gap-3">
								{employee.employmentStatus === "ACTIVE" ? (
									<CheckCircle className="w-4 h-4 text-green-500" />
								) : (
									<AlertCircle className="w-4 h-4 text-red-500" />
								)}
								<span className="text-sm font-medium text-gray-700">Status</span>
							</div>
							<div className="flex items-center gap-2">
								<span
									className="w-2 h-2 rounded-full animate-pulse"
									style={{
										backgroundColor:
											employee.employmentStatus === "ACTIVE"
												? "#22c55e"
												: employee.employmentStatus === "TERMINATED"
													? "#ef4444"
													: "#6b7280",
									}}
								/>
								<span className="text-sm text-gray-600 capitalize">
									{employee.employmentStatus || "N/A"}
								</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Work Arrangement Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Briefcase className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Work Arrangement</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Employment Type */}
						{employee.employmentType && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Briefcase className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Employment Type
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{employee.employmentType}
								</span>
							</div>
						)}

						{/* Work Location */}
						{employee.workLocation && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<MapPin className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Work Location
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{employee.workLocation}
								</span>
							</div>
						)}

						{/* Show empty state if nothing */}
						{!employee.employmentType && !employee.workLocation && (
							<div className="px-4 py-8 text-center">
								<Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
								<p className="text-sm text-gray-500">
									No work arrangement details available
								</p>
							</div>
						)}
					</div>
				</div>
			</section>

			{/* Important Dates Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Calendar className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Important Dates</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Hire Date */}
						{employee.employmentHireDate && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Calendar className="w-4 h-4 text-green-500" />
									<span className="text-sm font-medium text-gray-700">
										Hire Date
									</span>
								</div>
								<div className="text-right">
									<span className="text-sm text-gray-600">
										{formatDate(employee.employmentHireDate)}
									</span>
									<p className="text-xs text-gray-400 mt-0.5">
										Tenure: {calculateTenure(employee.employmentHireDate)}
									</p>
								</div>
							</div>
						)}

						{/* Employment Start Date */}
						{employee.employmentStartDate && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Calendar className="w-4 h-4 text-blue-500" />
									<span className="text-sm font-medium text-gray-700">
										Employment Start Date
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{formatDate(employee.employmentStartDate)}
								</span>
							</div>
						)}

						{/* Probation End Date */}
						{employee.probationEndDate && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Clock className="w-4 h-4 text-amber-500" />
									<span className="text-sm font-medium text-gray-700">
										Probation End
									</span>
								</div>
								<div className="text-right">
									<span className="text-sm text-gray-600">
										{formatDate(employee.probationEndDate)}
									</span>
									<p className="text-xs text-gray-400 mt-0.5">
										{isProbationActive
											? "Currently on probation"
											: "Probation completed"}
									</p>
								</div>
							</div>
						)}

						{/* Termination Date */}
						{employee.employmentTerminationDate && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Calendar className="w-4 h-4 text-red-500" />
									<span className="text-sm font-medium text-gray-700">
										Termination Date
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{formatDate(employee.employmentTerminationDate)}
								</span>
							</div>
						)}

						{/* Show empty state if nothing */}
						{!employee.employmentHireDate &&
							!employee.employmentStartDate &&
							!employee.probationEndDate &&
							!employee.employmentTerminationDate && (
								<div className="px-4 py-8 text-center">
									<Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
									<p className="text-sm text-gray-500">
										No date information available
									</p>
								</div>
							)}
					</div>
				</div>
			</section>

			{/* Position & Department Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Building2 className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Position & Department</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Department */}
						{employee.department && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Users className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Department
									</span>
								</div>
								<div className="text-right">
									<span className="text-sm text-gray-600">
										{employee.department.name || "N/A"}
									</span>
									{employee.department.code && (
										<p className="text-xs text-gray-400 mt-0.5">
											Code: {employee.department.code}
										</p>
									)}
								</div>
							</div>
						)}

						{/* Position */}
						{employee.section && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Users className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Section
									</span>
								</div>
								<div className="text-right">
									<span className="text-sm text-gray-600">
										{employee.section.name || "N/A"}
									</span>
									{employee.section.code && (
										<p className="text-xs text-gray-400 mt-0.5">
											Code: {employee.section.code}
										</p>
									)}
								</div>
							</div>
						)}

						{/* Position */}
						{employee.position && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Briefcase className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Position
									</span>
								</div>
								<div className="text-right">
									<span className="text-sm text-gray-600">
										{employee.position.title || "N/A"}
									</span>
									{employee.position.code && (
										<p className="text-xs text-gray-400 mt-0.5">
											Code: {employee.position.code}
										</p>
									)}
								</div>
							</div>
						)}

						{/* Level */}
						{employee.level && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<BadgeCheck className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">Level</span>
								</div>
								<span className="text-sm text-gray-600">
									{employee.level.name || "N/A"}
								</span>
							</div>
						)}

						{/* Show empty state if nothing */}
						{!employee.department &&
							!employee.section &&
							!employee.position &&
							!employee.level && (
							<div className="px-4 py-8 text-center">
								<Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
								<p className="text-sm text-gray-500">
									No position information available
								</p>
							</div>
						)}
					</div>
				</div>
			</section>
		</div>
	);
}
