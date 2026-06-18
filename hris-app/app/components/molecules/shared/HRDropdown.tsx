import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2, Users, Settings } from "lucide-react";
import { useManagedDepartments } from "~/lib/hooks/useEmployees";
import AuthContext from "~/contexts/auth-context";
import { useContext } from "react";

export interface HRDropdownProps {
	className?: string;
}

export function HRDropdown({ className = "" }: HRDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const { user } = useContext(AuthContext)!;

	// Get employee ID from user metadata
	const employeeId = user?.metadata?.employee?.id;

	// Fetch managed departments
	const {
		data: managedDepartmentsData,
		isLoading,
		error,
	} = useManagedDepartments(employeeId || "", { include: "employees,positions", count: true });

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (dropdownRef.current && !dropdownRef.current.contains(target)) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	// Don't render if no employee ID or if user is not a manager
	if (!employeeId || !user?.role?.includes("manager")) {
		return null;
	}

	const departments = managedDepartmentsData?.departments || [];

	return (
		<div className={`relative ${className}`} ref={dropdownRef}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
				<Building2 className="w-4 h-4" />
				<span className="hidden sm:inline">HR</span>
				<ChevronDown
					className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
					{/* Header */}
					<div className="px-4 py-2 border-b border-gray-200">
						<h3 className="text-sm font-semibold text-gray-900">Managed Departments</h3>
						<p className="text-xs text-gray-500">
							{departments.length} department{departments.length !== 1 ? "s" : ""}
						</p>
					</div>

					{/* Loading state */}
					{isLoading && (
						<div className="px-4 py-3 text-sm text-gray-500">
							Loading departments...
						</div>
					)}

					{/* Error state */}
					{error && (
						<div className="px-4 py-3 text-sm text-red-500">
							Failed to load departments
						</div>
					)}

					{/* Departments list */}
					{departments.length > 0 && (
						<div className="max-h-64 overflow-y-auto">
							{departments.map((department) => (
								<div
									key={department.id}
									className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
									<div className="flex items-start justify-between">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
												<div className="min-w-0">
													<h4 className="text-sm font-medium text-gray-900 truncate">
														{department.name}
													</h4>
													<p className="text-xs text-gray-500 truncate">
														{department.code}
													</p>
												</div>
											</div>
											{department.description && (
												<p className="text-xs text-gray-500 mt-1 line-clamp-2">
													{department.description}
												</p>
											)}
										</div>
									</div>

									{/* Department stats */}
									<div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
										{department.employeeCount !== undefined && (
											<div className="flex items-center gap-1">
												<Users className="w-3 h-3" />
												<span>{department.employeeCount} employees</span>
											</div>
										)}
										{department.positions &&
											department.positions.length > 0 && (
												<div className="flex items-center gap-1">
													<Settings className="w-3 h-3" />
													<span>
														{department.positions.length} positions
													</span>
												</div>
											)}
									</div>

									{/* Status indicator */}
									<div className="flex items-center gap-2 mt-2">
										<div
											className={`w-2 h-2 rounded-full ${
												department.isActive ? "bg-green-400" : "bg-gray-400"
											}`}
										/>
										<span className="text-xs text-gray-500">
											{department.isActive ? "Active" : "Inactive"}
										</span>
									</div>
								</div>
							))}
						</div>
					)}

					{/* Empty state */}
					{!isLoading && !error && departments.length === 0 && (
						<div className="px-4 py-6 text-center">
							<Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
							<p className="text-sm text-gray-500">No departments managed</p>
							<p className="text-xs text-gray-400 mt-1">
								You are not managing any departments
							</p>
						</div>
					)}

					{/* Footer */}
					{departments.length > 0 && (
						<div className="px-4 py-2 border-t border-gray-200">
							<button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
								View All Departments
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
