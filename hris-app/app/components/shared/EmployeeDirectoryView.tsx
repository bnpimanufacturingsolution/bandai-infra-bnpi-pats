import { useNavigate, useLocation } from "react-router-dom";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { Mail, Phone, Building, Briefcase, MapPin, Search } from "lucide-react";
import type { Employee } from "~/services/employees.service";

type ApiEmployee = Employee & {
	department?: { name?: string };
	position?: { title?: string };
	level?: { name?: string; rank?: number };
	user?: { email?: string; avatar?: string };
};

export default function EmployeeDirectoryView() {
	const navigate = useNavigate();
	const location = useLocation();

	const { data: employeesData, isLoading } = useEmployees({
		page: 1,
		limit: 100,
		document: true,
	});

	const employees = (employeesData as any)?.employees || [];

	const handleEmployeeClick = (employeeId: string) => {
		// Encode current path (replace / with - for clean URLs)
		const encodedPath = location.pathname.substring(1).replace(/\//g, "-");
		navigate(`/employee/${employeeId}?from=${encodedPath}`);
	};

	const getInitials = (firstName?: string, lastName?: string) => {
		if (!firstName && !lastName) return "?";
		const first = firstName?.charAt(0) || "";
		const last = lastName?.charAt(0) || "";
		return (first + last).toUpperCase();
	};

	const getStatusColor = (status: string) => {
		const statusColors: Record<string, string> = {
			ACTIVE: "bg-green-100 text-green-800",
			INACTIVE: "bg-gray-100 text-gray-800",
			TERMINATED: "bg-red-100 text-red-800",
			RESIGNED: "bg-yellow-100 text-yellow-800",
			ON_LEAVE: "bg-blue-100 text-blue-800",
		};
		return statusColors[status] || "bg-gray-100 text-gray-800";
	};

	const formatStatus = (status: string) => {
		const statusMap: Record<string, string> = {
			ACTIVE: "Active",
			INACTIVE: "Inactive",
			TERMINATED: "Terminated",
			RESIGNED: "Resigned",
			ON_LEAVE: "On Leave",
		};
		return statusMap[status] || status;
	};

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="animate-pulse">
					<div className="h-10 bg-gray-200 rounded w-full mb-6"></div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
						{[...Array(8)].map((_, i) => (
							<div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Results Count */}
			<div className="text-sm text-gray-600">
				<span>
					{employees.length} {employees.length === 1 ? "employee" : "employees"}
				</span>
			</div>

			{/* Employee Cards Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{employees.map((employee: ApiEmployee) => {
					const firstName = employee.person?.personalInfo?.firstName || "";
					const lastName = employee.person?.personalInfo?.lastName || "";
					const fullName = `${firstName} ${lastName}`.trim() || "Unnamed";
					const email = employee.person?.contactInfo?.email || employee.user?.email;
					const primaryPhone = employee.person?.contactInfo?.phones?.find(
						(phone: any) => phone.isPrimary,
					);
					const phone = primaryPhone
						? `${primaryPhone.countryCode || ""} ${primaryPhone.number || ""}`.trim()
						: null;
					const avatar = employee.user?.avatar;

					return (
						<div
							key={employee.id}
							onClick={() => handleEmployeeClick(employee.id)}
							className="bg-white rounded-lg border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer overflow-hidden">
							{/* Header with Avatar and Status */}
							<div className="bg-gradient-to-br from-orange-50 to-red-50 p-6 relative">
								{/* Status Badge */}
								<div className="absolute top-3 right-3">
									<span
										className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.employmentStatus)}`}>
										{formatStatus(employee.employmentStatus)}
									</span>
								</div>

								{/* Avatar */}
								<div className="flex justify-center">
									{avatar ? (
										<img
											src={avatar}
											alt={fullName}
											className="w-20 h-20 rounded-full border-4 border-white shadow-md object-cover"
										/>
									) : (
										<div className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-2xl font-bold">
											{getInitials(firstName, lastName)}
										</div>
									)}
								</div>
							</div>

							{/* Content */}
							<div className="p-4 space-y-3">
								{/* Name and Employee ID */}
								<div className="text-center">
									<h3 className="text-lg font-semibold text-gray-900 truncate">
										{fullName}
									</h3>
									<p className="text-xs text-gray-500 font-mono mt-0.5">
										{employee.employeeId}
									</p>
								</div>

								{/* Position and Department */}
								<div className="space-y-2 text-sm">
									{employee.position?.title && (
										<div className="flex items-center gap-2 text-gray-700">
											<Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
											<span className="truncate">
												{employee.position.title}
											</span>
										</div>
									)}
									{employee.department?.name && (
										<div className="flex items-center gap-2 text-gray-700">
											<Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
											<span className="truncate">
												{employee.department.name}
											</span>
										</div>
									)}
									{employee.workLocation && (
										<div className="flex items-center gap-2 text-gray-700">
											<MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
											<span className="truncate capitalize">
												{employee.workLocation.toLowerCase()}
											</span>
										</div>
									)}
								</div>

								{/* Contact Info */}
								<div className="pt-3 border-t border-gray-100 space-y-2">
									{email && (
										<div className="flex items-center gap-2 text-xs text-gray-600">
											<Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
											<span className="truncate">{email}</span>
										</div>
									)}
									{phone && (
										<div className="flex items-center gap-2 text-xs text-gray-600">
											<Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
											<span className="truncate">{phone}</span>
										</div>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Empty State */}
			{!isLoading && employees.length === 0 && (
				<div className="text-center py-12">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
						<Search className="w-8 h-8 text-gray-400" />
					</div>
					<h3 className="text-lg font-medium text-gray-900 mb-2">No employees found</h3>
					<p className="text-gray-500">No employees available at this time</p>
				</div>
			)}
		</div>
	);
}
