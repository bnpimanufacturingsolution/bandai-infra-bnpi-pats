import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import {
	Users,
	Clock,
	Calendar as CalendarIcon,
	FileText,
	User,
	Heart,
	ChevronRight,
	Hourglass,
	MapPin,
	Eye,
	Download,
	CheckCircle,
	XCircle,
} from "lucide-react";
import { Calendar } from "~/components/ui/calendar";
import type { Holiday } from "~/components/ui/calendar";
import { useState, useEffect, useContext } from "react";
import AuthContext from "~/contexts/auth-context";
import employeesService, { type Employee } from "~/services/employees.service";
import { useNavigate } from "react-router";
import { useStatusSummary } from "~/lib/hooks/useMetrics";
import { useRequests, useUpdateRequest } from "~/lib/hooks/useRequests";

export default function Dashboard() {
	const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
	const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
	const [employee, setEmployee] = useState<Employee | null>(null);
	const [isLoadingEmployee, setIsLoadingEmployee] = useState(true);
	const [statusPeriod, setStatusPeriod] = useState<"today" | "week" | "month">("today");
	const authContext = useContext(AuthContext);
	const user = authContext?.user;
	const navigate = useNavigate();

	// Calculate date ranges for status summary based on selected period
	const getStatusDateRange = () => {
		const now = new Date();
		let from: Date;
		let to: Date = now;

		switch (statusPeriod) {
			case "today":
				from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
				break;
			case "week":
				// Get the start of the week (Sunday)
				const dayOfWeek = now.getDay();
				from = new Date(now);
				from.setDate(now.getDate() - dayOfWeek);
				from.setHours(0, 0, 0, 0);
				break;
			case "month":
				from = new Date(now.getFullYear(), now.getMonth(), 1);
				break;
			default:
				from = now;
		}

		return {
			from: from.toISOString().split("T")[0],
			to: to.toISOString().split("T")[0],
		};
	};

	const statusDateRange = getStatusDateRange();

	// Fetch status summary based on selected period
	const { data: statusSummaryData, isLoading: isLoadingStatusSummary } = useStatusSummary(
		statusDateRange.from,
		statusDateRange.to,
	);

	// Fetch employee data when component mounts and user is available
	useEffect(() => {
		const fetchEmployeeData = async () => {
			// Wait for user to be loaded
			if (authContext?.isLoading) {
				return;
			}

			if (!user?.metadata?.employee?.id) {
				console.log("No employeeId found in user metadata");
				setIsLoadingEmployee(false);
				return;
			}

			try {
				setIsLoadingEmployee(true);
				const fields =
					"person.personalInfo.firstName,person.personalInfo.lastName,department.name,position.title,employeeId,department.manager.person.personalInfo.firstName,department.manager.person.personalInfo.lastName,employmentHireDate";
				const employeeData = await employeesService.getEmployeeById(
					user.metadata?.employee?.id,
					fields,
				);
				setEmployee(employeeData);
			} catch (error) {
				console.error("Error fetching employee data:", error);
			} finally {
				setIsLoadingEmployee(false);
			}
		};

		fetchEmployeeData();
	}, [user?.metadata?.employee?.id, authContext?.isLoading]);

	// Philippines holidays for 2024-2025
	const philippinesHolidays: Holiday[] = [
		// 2024 Holidays
		{
			date: new Date(2024, 0, 1), // January 1, 2024
			name: "New Year's Day",
			type: "GOVERNMENT",
			description:
				"A national holiday in the Philippines celebrating the first day of the year. It is a non-working holiday observed throughout the country.",
		},
		{
			date: new Date(2024, 1, 25), // February 25, 2024
			name: "People Power Revolution",
			type: "GOVERNMENT",
			description:
				"Also known as EDSA Revolution, this holiday commemorates the peaceful revolution in 1986 that ended the Marcos dictatorship and restored democracy in the Philippines.",
		},
		{
			date: new Date(2024, 2, 28), // March 28, 2024 (Maundy Thursday)
			name: "Maundy Thursday",
			type: "GOVERNMENT",
			description:
				"A Christian holiday commemorating the Last Supper of Jesus Christ with the Apostles. It is part of the Holy Week observances.",
		},
		{
			date: new Date(2024, 2, 29), // March 29, 2024 (Good Friday)
			name: "Good Friday",
			type: "GOVERNMENT",
			description:
				"A Christian holiday commemorating the crucifixion of Jesus Christ and his death at Calvary. It is observed during Holy Week.",
		},
		{
			date: new Date(2024, 3, 9), // April 9, 2024
			name: "Day of Valor (Araw ng Kagitingan)",
			type: "GOVERNMENT",
			description:
				"Commemorates the fall of Bataan during World War II. This day honors the Filipino and American soldiers who fought and sacrificed their lives.",
		},
		{
			date: new Date(2024, 4, 1), // May 1, 2024
			name: "Labor Day",
			type: "GOVERNMENT",
			description:
				"Also known as Araw ng mga Manggagawa, this holiday honors the contributions and achievements of Filipino workers and the labor movement.",
		},
		{
			date: new Date(2024, 5, 12), // June 12, 2024
			name: "Independence Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the Philippine Declaration of Independence from Spain on June 12, 1898. This is one of the most important national holidays.",
		},
		{
			date: new Date(2024, 7, 26), // August 26, 2024 (Last Monday of August)
			name: "National Heroes Day",
			type: "GOVERNMENT",
			description:
				"A national holiday honoring all Filipino heroes, known and unknown. It is observed on the last Monday of August.",
		},
		{
			date: new Date(2024, 10, 30), // November 30, 2024
			name: "Bonifacio Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the birth of Andrés Bonifacio, one of the Philippines' national heroes and the founder of the Katipunan revolutionary movement.",
		},
		{
			date: new Date(2024, 11, 25), // December 25, 2024
			name: "Christmas Day",
			type: "GOVERNMENT",
			description:
				"A Christian holiday celebrating the birth of Jesus Christ. Christmas is one of the most widely celebrated holidays in the Philippines.",
		},
		{
			date: new Date(2024, 11, 30), // December 30, 2024
			name: "Rizal Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the life and works of Dr. José Rizal, the national hero of the Philippines. It marks the anniversary of his execution in 1896.",
		},
		{
			date: new Date(2024, 11, 31), // December 31, 2024
			name: "New Year's Eve",
			type: "COMPANY",
			description:
				"A company holiday observed on the last day of the year. This is typically a half-day or full-day holiday depending on company policy.",
		},
		// 2025 Holidays
		{
			date: new Date(2025, 0, 1), // January 1, 2025
			name: "New Year's Day",
			type: "GOVERNMENT",
			description:
				"A national holiday in the Philippines celebrating the first day of the year. It is a non-working holiday observed throughout the country.",
		},
		{
			date: new Date(2025, 3, 17), // April 17, 2025 (Maundy Thursday)
			name: "Maundy Thursday",
			type: "GOVERNMENT",
			description:
				"A Christian holiday commemorating the Last Supper of Jesus Christ with the Apostles. It is part of the Holy Week observances.",
		},
		{
			date: new Date(2025, 3, 18), // April 18, 2025 (Good Friday)
			name: "Good Friday",
			type: "GOVERNMENT",
			description:
				"A Christian holiday commemorating the crucifixion of Jesus Christ and his death at Calvary. It is observed during Holy Week.",
		},
		{
			date: new Date(2025, 3, 9), // April 9, 2025
			name: "Day of Valor (Araw ng Kagitingan)",
			type: "GOVERNMENT",
			description:
				"Commemorates the fall of Bataan during World War II. This day honors the Filipino and American soldiers who fought and sacrificed their lives.",
		},
		{
			date: new Date(2025, 4, 1), // May 1, 2025
			name: "Labor Day",
			type: "GOVERNMENT",
			description:
				"Also known as Araw ng mga Manggagawa, this holiday honors the contributions and achievements of Filipino workers and the labor movement.",
		},
		{
			date: new Date(2025, 5, 12), // June 12, 2025
			name: "Independence Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the Philippine Declaration of Independence from Spain on June 12, 1898. This is one of the most important national holidays.",
		},
		{
			date: new Date(2025, 7, 25), // August 25, 2025 (Last Monday of August)
			name: "National Heroes Day",
			type: "GOVERNMENT",
			description:
				"A national holiday honoring all Filipino heroes, known and unknown. It is observed on the last Monday of August.",
		},
		{
			date: new Date(2025, 10, 30), // November 30, 2025
			name: "Bonifacio Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the birth of Andrés Bonifacio, one of the Philippines' national heroes and the founder of the Katipunan revolutionary movement.",
		},
		{
			date: new Date(2025, 11, 25), // December 25, 2025
			name: "Christmas Day",
			type: "GOVERNMENT",
			description:
				"A Christian holiday celebrating the birth of Jesus Christ. Christmas is one of the most widely celebrated holidays in the Philippines.",
		},
		{
			date: new Date(2025, 11, 30), // December 30, 2025
			name: "Rizal Day",
			type: "GOVERNMENT",
			description:
				"Commemorates the life and works of Dr. José Rizal, the national hero of the Philippines. It marks the anniversary of his execution in 1896.",
		},
	];

	const handleHolidayClick = (holiday: Holiday) => {
		setSelectedHoliday(holiday);
		setIsHolidayModalOpen(true);
	};

	// Sample data for company news
	const companyNews = [
		{
			id: 1,
			title: "Holiday Party Announcement",
			date: "Today",
			author: "HR Department",
			icon: Heart,
		},
		{
			id: 2,
			title: "New Benefits Program Starting January 2024",
			date: "Yesterday",
			author: "Benefits Team",
			icon: Heart,
		},
		{
			id: 3,
			title: "Q4 Company Performance Update",
			date: "2 days ago",
			author: "CEO",
			icon: FileText,
		},
		{
			id: 4,
			title: "Employee Recognition Program Launch",
			date: "3 days ago",
			author: "HR Department",
			icon: User,
		},
	];

	return (
		<div className="space-y-6">
			{/* Profile Banner */}
			<div className="bg-orange-50 rounded-lg border border-orange-200 p-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-6">
						<div className="w-20 h-20 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
							<User className="w-10 h-10 text-gray-700" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-gray-900">
								{(() => {
									if (isLoadingEmployee) return "Loading...";
									if (
										employee?.person?.personalInfo?.firstName &&
										employee?.person?.personalInfo?.lastName
									) {
										return `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`;
									}
									if (
										user?.metadata?.employee?.personalInfo?.firstName &&
										user?.metadata?.employee?.personalInfo?.lastName
									) {
										return `${user.metadata.employee.personalInfo.firstName} ${user.metadata.employee.personalInfo.lastName}`;
									}
									if (
										user?.person?.personalInfo?.firstName &&
										user?.person?.personalInfo?.lastName
									) {
										return `${user.person.personalInfo.firstName} ${user.person.personalInfo.lastName}`;
									}
									return "HR User";
								})()}
							</h1>
							<p className="text-gray-700">
								{(employee as any)?.position?.title ||
									employee?.positionId ||
									"HR Specialist"}
							</p>
							<div className="mt-2 text-sm space-y-1 text-gray-700">
								<div>
									Department:{" "}
									{(employee as any)?.department?.name ||
										employee?.departmentId ||
										"N/A"}
								</div>
								<div>
									Employee ID:{" "}
									{employee?.employeeId || user?.metadata?.employee?.id || "N/A"}
								</div>
							</div>
						</div>
					</div>
					<div className="flex flex-col items-end gap-2">
						<Button className="theme-btn">Log Time</Button>
						<div className="text-right text-sm space-y-1 text-gray-700">
							<div>
								Manager:{" "}
								{(() => {
									const manager = (employee as any)?.department?.manager;
									if (
										manager?.person?.personalInfo?.firstName &&
										manager?.person?.personalInfo?.lastName
									) {
										return `${manager.person.personalInfo.firstName} ${manager.person.personalInfo.lastName}`;
									}
									return "N/A";
								})()}
							</div>
							<div>
								Hire Date:{" "}
								{employee?.employmentHireDate
									? new Date(employee.employmentHireDate).toLocaleDateString(
											"en-US",
											{
												year: "numeric",
												month: "long",
												day: "numeric",
											},
										)
									: "N/A"}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
				{/* Left Column - Status Summary */}
				<div className="lg:col-span-3 space-y-6">
					{/* Status Summary Card */}
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="flex items-center gap-2">
									<Users className="w-5 h-5 text-orange-500" />
									Attendance Status
								</CardTitle>
								<select
									value={statusPeriod}
									onChange={(e) =>
										setStatusPeriod(
											e.target.value as "today" | "week" | "month",
										)
									}
									className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
									<option value="today">Today</option>
									<option value="week">This Week</option>
									<option value="month">This Month</option>
								</select>
							</div>
						</CardHeader>
						<CardContent>
							{isLoadingStatusSummary ? (
								<div className="flex items-center justify-center h-32">
									<div className="text-gray-600 text-sm">Loading...</div>
								</div>
							) : statusSummaryData?.metrics?.statusSummary ? (
								<div className="grid grid-cols-3 gap-4">
									{/* Present */}
									<div className="p-4 bg-green-50 rounded-lg border border-green-200">
										<div className="flex flex-col items-center text-center">
											<CheckCircle className="w-8 h-8 text-green-600 mb-2" />
											<span className="text-2xl font-bold text-green-900">
												{statusSummaryData.metrics.statusSummary.PRESENT}
											</span>
											<span className="text-xs font-medium text-green-700 mt-1">
												Present
											</span>
										</div>
									</div>

									{/* Leave */}
									<div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
										<div className="flex flex-col items-center text-center">
											<CalendarIcon className="w-8 h-8 text-yellow-600 mb-2" />
											<span className="text-2xl font-bold text-yellow-900">
												{statusSummaryData.metrics.statusSummary.LEAVE}
											</span>
											<span className="text-xs font-medium text-yellow-700 mt-1">
												On Leave
											</span>
										</div>
									</div>

									{/* Absent */}
									<div className="p-4 bg-red-50 rounded-lg border border-red-200">
										<div className="flex flex-col items-center text-center">
											<XCircle className="w-8 h-8 text-red-600 mb-2" />
											<span className="text-2xl font-bold text-red-900">
												{statusSummaryData.metrics.statusSummary.ABSENT}
											</span>
											<span className="text-xs font-medium text-red-700 mt-1">
												Absent
											</span>
										</div>
									</div>
								</div>
							) : (
								<div className="flex items-center justify-center h-32">
									<div className="text-gray-600 text-sm">No data available</div>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Company Calendar */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center gap-2">
								<CalendarIcon className="w-5 h-5 text-orange-500" />
								Company Calendar
							</CardTitle>
						</div>
					</CardHeader>
					<CardContent>
						<Calendar
							holidays={philippinesHolidays}
							onHolidayClick={handleHolidayClick}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Holiday Details Modal */}
			<Modal
				open={isHolidayModalOpen}
				onOpenChange={setIsHolidayModalOpen}
				title={selectedHoliday?.name}
				description={
					selectedHoliday?.date
						? selectedHoliday.date.toLocaleDateString("en-US", {
								weekday: "long",
								year: "numeric",
								month: "long",
								day: "numeric",
							})
						: ""
				}>
				{selectedHoliday && (
					<div className="space-y-4 mt-4">
						<div className="flex items-center gap-2">
							<span
								className={`px-3 py-1 rounded-full text-sm font-medium ${
									selectedHoliday.type === "COMPANY"
										? "bg-orange-100 text-orange-800"
										: "bg-blue-100 text-blue-800"
								}`}>
								{selectedHoliday.type === "COMPANY"
									? "Company Holiday"
									: "Government Holiday"}
							</span>
						</div>
						{selectedHoliday.description && (
							<div className="pt-4 border-t">
								<h3 className="text-sm font-semibold text-gray-900 mb-2">
									About this holiday
								</h3>
								<p className="text-sm text-gray-700 leading-relaxed">
									{selectedHoliday.description}
								</p>
							</div>
						)}
					</div>
				)}
			</Modal>

			{/* Company News */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<FileText className="w-5 h-5 text-orange-500" />
							Company News
						</CardTitle>
						<button className="text-gray-600 text-sm hover:text-gray-800">
							View All &gt;
						</button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{companyNews.map((news) => (
							<div
								key={news.id}
								className="flex items-start gap-3 pb-4 border-b border-gray-200 last:border-b-0 last:pb-0">
								<div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-50">
									<news.icon className="w-4 h-4 text-orange-600" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-medium text-gray-900 mb-1">
										{news.title}
									</p>
									<p className="text-xs text-gray-500">
										{news.date} | {news.author}
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
