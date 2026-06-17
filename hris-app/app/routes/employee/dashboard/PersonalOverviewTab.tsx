import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import {
	FileText,
	User,
	Edit,
	Briefcase,
	Plane,
	Calendar,
	Heart,
	Info,
	ChevronLeft,
	ChevronRight as ChevronRightIcon,
	Plus,
	Paperclip,
	MoreVertical,
	Receipt,
	Clock,
	Eye,
	MapPin,
	GraduationCap,
	CreditCard,
} from "lucide-react";

interface PersonalOverviewTabProps {
	onJobDescriptionModalOpen: () => void;
	onPayslipModalOpen: () => void;
}

export default function PersonalOverviewTab({
	onJobDescriptionModalOpen,
	onPayslipModalOpen,
}: PersonalOverviewTabProps) {
	// Personal Overview data
	const personalInfo = {
		employeeId: "EMP12345",
		idNumber: "0001234567",
		phone: "(555) 123-4567",
		email: "johndoe@company.com",
		birthday: "March 10, 1992",
		gender: "Male",
		maritalStatus: "Single",
		nationality: "USA",
	};

	const addressInfo = {
		address: "456 Main Street",
		country: "USA",
		city: "San Francisco",
		hometown: "Los Angeles",
		postalCode: "94102",
	};

	const education = [
		{
			id: 1,
			degree: "Bachelor of Science in Computer Science",
			school: "Stanford University",
			year: "2014",
			certificate: "Certificate.pdf",
		},
		{
			id: 2,
			degree: "Master of Science in Software Engineering",
			school: "MIT",
			year: "2016",
			certificate: "Certificate.pdf",
		},
	];

	const bankDetails = {
		accountNumber: "9876543210",
		accountName: "John Doe",
		bankName: "Bank of America",
		insuranceCode: "INS123",
		taxCode: "TAX9876",
	};

	const jobInfo = {
		jobTitle: "Software Engineer",
		department: "Engineering",
		employmentType: "Full time",
		contractFile: "Employment Contract.pdf",
		startDate: "Jan 15, 2023",
		contractEndDate: "Jan 15, 2025",
		lineManager: "Jane Smith",
	};

	// Time Off data
	const leaveBalances = [
		{ type: "Annual", days: 15, icon: Calendar },
		{ type: "Sick leave", days: 5, icon: Heart },
		{ type: "Wedding", days: 3, icon: Heart },
		{ type: "Funeral", days: 3, icon: Heart },
		{ type: "Personal leave", days: 5, icon: Calendar },
	];

	const timeOffRequests = [
		{
			id: 1,
			dateFrom: "30/12/2024",
			dateTo: "30/12/2024",
			duration: "1 day",
			leaveType: "Personal leave",
			status: "pending",
			hasAttachment: false,
		},
		{
			id: 2,
			dateFrom: "20/12/2024",
			dateTo: "22/12/2024",
			duration: "3 days",
			leaveType: "Annual leave",
			status: "approved",
			hasAttachment: true,
		},
	];

	// Payroll Processing data
	const payrollData = {
		compensation: {
			payrollType: "Monthly",
			payrollMonth: "Dec 2024",
			totalBasicCompensation: "₱80,000",
			totalDeminis: "₱8,000",
		},
		attendance: {
			daysPresent: 22,
			lateMinutes: 30,
			overtimeMinutes: 120,
			scheduleAdjustmentMinutes: 0,
			absentMinutes: 0,
		},
		governmentDeduction: {
			totalSSS: "₱6,000",
			totalPhilhealth: "₱2,500",
			totalPagIbig: "₱1,000",
			totalTax: "₱8,500",
		},
		adjustments: {
			totalAdjPlus: "₱5,000",
			totalAdjMinus: "₱1,000",
		},
		total: {
			totalAdditionalEarning: "₱65,000",
			totalDeductions: "₱9,000",
			totalTaxableIncome: "₱5,200",
			grossIncome: "₱70,000",
			withholdingTax: "₱6,800",
			totalNonTaxable: "₱7,200",
			netPay: "₱62,000",
		},
	};

	return (
		<div className="space-y-6">
			{/* Profile Banner */}
			<div className="theme-banner p-6">
				<div className="flex items-center gap-6">
					<div className="w-20 h-20 rounded-full bg-[color:var(--gt-50)] border border-[color:var(--gt-200)] flex items-center justify-center">
						<User className="w-10 h-10 text-[color:var(--gt-700)]" />
					</div>
					<div className="flex-1">
						<h1 className="text-2xl font-bold  text-[color:var(--gt-700)]/80">
							John Doe
						</h1>
						<p className="text-[color:var(--gt-700)]/80">Software Engineer</p>
						<div className="flex justify-between mt-2 text-sm text-[color:var(--gt-700)]/80">
							<div className="space-y-1">
								<div>Department: Engineering</div>
								<div>Employee ID: EMP12345</div>
							</div>
							<div className="text-right space-y-1">
								<div>Manager: Jane Smith</div>
								<div>Hire Date: January 15, 2023 (1 year, 11 months)</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* General Information Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<FileText className="w-5 h-5 text-gray-600" />
							General Information
						</CardTitle>
						<Button
							variant="ghost"
							size="sm"
							className="text-[color:var(--gt-700)] hover:text-[color:var(--gt-800)]">
							<Edit className="w-4 h-4 mr-1" />
							Edit
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Personal Information */}
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4">
							Personal Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Employee ID
								</label>
								<p className="text-gray-900">{personalInfo.employeeId}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									ID Number
								</label>
								<div className="flex items-center gap-2">
									<p className="text-gray-900">{personalInfo.idNumber}</p>
									<a
										href="#"
										className="text-[color:var(--gt-700)] text-sm hover:text-[color:var(--gt-800)]">
										ID.png
									</a>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">Phone</label>
								<p className="text-gray-900">{personalInfo.phone}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">Email</label>
								<p className="text-gray-900">{personalInfo.email}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Birthday
								</label>
								<p className="text-gray-900">{personalInfo.birthday}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">Gender</label>
								<p className="text-gray-900">{personalInfo.gender}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Marital Status
								</label>
								<p className="text-gray-900">{personalInfo.maritalStatus}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Nationality
								</label>
								<p className="text-gray-900">{personalInfo.nationality}</p>
							</div>
						</div>
					</div>

					{/* Address Information */}
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
							<MapPin className="w-5 h-5" />
							Address Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">Address</label>
								<p className="text-gray-900">{addressInfo.address}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">Country</label>
								<p className="text-gray-900">{addressInfo.country}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">City</label>
								<p className="text-gray-900">{addressInfo.city}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Hometown
								</label>
								<p className="text-gray-900">{addressInfo.hometown}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Postal Code
								</label>
								<p className="text-gray-900">{addressInfo.postalCode}</p>
							</div>
						</div>
					</div>

					{/* Education */}
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
							<GraduationCap className="w-5 h-5" />
							Education
						</h3>
						<div className="space-y-4">
							{education.map((edu) => (
								<div key={edu.id} className="border rounded-lg p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="font-medium text-gray-900">
												{edu.year} {edu.degree}
											</p>
											<p className="text-gray-600">{edu.school}</p>
										</div>
										<a
											href="#"
											className="text-[color:var(--gt-700)] text-sm hover:text-[color:var(--gt-800)]">
											{edu.certificate}
										</a>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Bank Details */}
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
							<CreditCard className="w-5 h-5" />
							Bank Details
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Bank Account
								</label>
								<p className="text-gray-900">{bankDetails.accountNumber}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Account Name
								</label>
								<p className="text-gray-900">{bankDetails.accountName}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Bank Name
								</label>
								<p className="text-gray-900">{bankDetails.bankName}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Insurance Code
								</label>
								<p className="text-gray-900">{bankDetails.insuranceCode}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Tax Code
								</label>
								<p className="text-gray-900">{bankDetails.taxCode}</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Job Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<Briefcase className="w-5 h-5 text-gray-600" />
							Job
						</CardTitle>
						<Button
							variant="ghost"
							size="sm"
							className="text-[color:var(--gt-700)] hover:text-[color:var(--gt-800)]">
							<Edit className="w-4 h-4 mr-1" />
							Edit
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4">
							Employment Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Job Title
								</label>
								<p className="text-gray-900">{jobInfo.jobTitle}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Department
								</label>
								<p className="text-gray-900">{jobInfo.department}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Employment Type
								</label>
								<div className="flex items-center gap-2">
									<p className="text-gray-900">{jobInfo.employmentType}</p>
									<a href="#" className="text-purple-600 text-sm">
										{jobInfo.contractFile}
									</a>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Start Date
								</label>
								<p className="text-gray-900">{jobInfo.startDate}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Contract End Date
								</label>
								<p className="text-gray-900">{jobInfo.contractEndDate}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Line Manager
								</label>
								<div className="flex items-center gap-2">
									<p className="text-gray-900">{jobInfo.lineManager}</p>
									<User className="w-4 h-4 text-gray-400" />
								</div>
							</div>
						</div>
						<div className="mt-6 flex justify-end">
							<Button className="theme-btn" onClick={onJobDescriptionModalOpen}>
								See Job Details
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Time Off Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<Plane className="w-5 h-5 text-gray-600" />
							Time Off
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Leave Balances */}
					<div>
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-medium text-gray-900">Leave Balances</h3>
							<div className="flex items-center gap-2">
								<button className="p-1 hover:bg-gray-100 rounded">
									<ChevronLeft className="w-4 h-4 text-gray-400" />
								</button>
								<button className="p-1 hover:bg-gray-100 rounded">
									<ChevronRightIcon className="w-4 h-4 text-gray-400" />
								</button>
							</div>
						</div>
						<div className="flex gap-4 overflow-x-auto pb-2">
							{leaveBalances.map((balance, index) => (
								<div
									key={index}
									className="flex-shrink-0 bg-gray-50 rounded-lg p-4 min-w-[120px]">
									<div className="flex items-center justify-between mb-2">
										<balance.icon className="w-4 h-4 text-gray-600" />
										<Info className="w-3 h-3 text-gray-400" />
									</div>
									<p className="text-sm font-medium text-gray-900">
										{balance.days} days
									</p>
									<p className="text-xs text-gray-600">{balance.type}</p>
								</div>
							))}
						</div>
					</div>

					{/* Request Time Off */}
					<div>
						<h3 className="text-lg font-medium text-gray-900 mb-4">Request Time Off</h3>

						{/* Filters */}
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
							<div>
								<label className="text-sm font-medium text-gray-500 mb-1 block">
									Date From
								</label>
								<div className="relative">
									<input
										type="text"
										value="Dec 01 2024"
										className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
										readOnly
									/>
									<Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500 mb-1 block">
									Date To
								</label>
								<div className="relative">
									<input
										type="text"
										value="Dec 30 2024"
										className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
										readOnly
									/>
									<Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500 mb-1 block">
									Leave Type
								</label>
								<select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
									<option>All Leave Type</option>
								</select>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500 mb-1 block">
									Status
								</label>
								<select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
									<option>All Status</option>
								</select>
							</div>
						</div>
						<div className="flex justify-end mb-4">
							<button className="text-sm text-[color:var(--gt-700)] hover:text-[color:var(--gt-800)]">
								Clear filters
							</button>
						</div>

						{/* Time Off Requests Table */}
						<div className="border border-gray-200 rounded-lg overflow-hidden">
							<table className="w-full">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-4 py-3 text-left">
											<input type="checkbox" className="rounded" />
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											DATE FROM
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											DATE TO
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											DURATION
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											LEAVE TYPE
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											STATUS
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											ATTACHMENT
										</th>
										<th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
											ACTION
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200">
									{timeOffRequests.map((request) => (
										<tr key={request.id} className="hover:bg-gray-50">
											<td className="px-4 py-3">
												<input type="checkbox" className="rounded" />
											</td>
											<td className="px-4 py-3 text-sm text-gray-900">
												{request.dateFrom}
											</td>
											<td className="px-4 py-3 text-sm text-gray-900">
												{request.dateTo}
											</td>
											<td className="px-4 py-3 text-sm text-gray-900">
												{request.duration}
											</td>
											<td className="px-4 py-3 text-sm text-gray-900">
												{request.leaveType}
											</td>
											<td className="px-4 py-3">
												<span
													className={`px-2 py-1 rounded-full text-xs font-medium ${
														request.status === "approved"
															? "bg-green-100 text-green-800"
															: request.status === "pending"
																? "bg-yellow-100 text-yellow-800"
																: "bg-red-100 text-red-800"
													}`}>
													{request.status === "approved"
														? "Approved"
														: request.status === "pending"
															? "Pending"
															: "Rejected"}
												</span>
											</td>
											<td className="px-4 py-3">
												{request.hasAttachment && (
													<Paperclip className="w-4 h-4 text-gray-400" />
												)}
											</td>
											<td className="px-4 py-3">
												<button className="p-1 hover:bg-gray-100 rounded">
													<MoreVertical className="w-4 h-4 text-gray-400" />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* New Request Button */}
						<div className="mt-4">
							<Button className="theme-btn">
								<Plus className="w-4 h-4 mr-2" />
								New request
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Payroll Processing Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<Receipt className="w-5 h-5 text-gray-600" />
							Payroll Processing
						</CardTitle>
						<Button
							variant="ghost"
							size="sm"
							className="text-[color:var(--gt-700)] hover:text-[color:var(--gt-800)]">
							<Clock className="w-4 h-4 mr-1" />
							Payment history
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Compensation */}
					<div>
						<h3 className="text-lg font-semibold text-gray-900 mb-3">Compensation</h3>
						<div className="grid grid-cols-2 gap-8">
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Payroll Type</span>
									<span className="text-sm text-gray-900">
										{payrollData.compensation.payrollType}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Payroll Month</span>
									<span className="text-sm text-gray-900">
										{payrollData.compensation.payrollMonth}
									</span>
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">
										Total Basic Compensation
									</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.compensation.totalBasicCompensation}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Total Deminis</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.compensation.totalDeminis}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Attendance */}
					<div>
						<h3 className="text-lg font-semibold text-gray-900 mb-3">Attendance</h3>
						<div className="grid grid-cols-2 gap-8">
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Days Present</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.attendance.daysPresent}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Late (Minute)</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.attendance.lateMinutes}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Overtime (Minute)</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.attendance.overtimeMinutes}
									</span>
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">
										Schedule Adjustment (Minutes)
									</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.attendance.scheduleAdjustmentMinutes}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Absent (Minutes)</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.attendance.absentMinutes}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Government Deduction */}
					<div>
						<h3 className="text-lg font-semibold text-gray-900 mb-3">
							Government Deduction
						</h3>
						<div className="grid grid-cols-4 gap-4">
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total SSS</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.governmentDeduction.totalSSS}
								</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total Philhealth</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.governmentDeduction.totalPhilhealth}
								</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total Pag-Ibig</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.governmentDeduction.totalPagIbig}
								</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total Tax</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.governmentDeduction.totalTax}
								</span>
							</div>
						</div>
					</div>

					{/* Adjustments */}
					<div>
						<h3 className="text-lg font-semibold text-gray-900 mb-3">Adjustments</h3>
						<div className="grid grid-cols-2 gap-4">
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total Adj (+)</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.adjustments.totalAdjPlus}
								</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600">Total Adj (-)</span>
								<span className="text-sm text-gray-900 font-semibold">
									{payrollData.adjustments.totalAdjMinus}
								</span>
							</div>
						</div>
					</div>

					{/* Total - Highlighted Section */}
					<div
						className="rounded-lg p-4"
						style={{
							backgroundColor: "var(--gt-50)",
							border: "1px solid var(--gt-100)",
						}}>
						<h3 className="text-lg font-semibold text-gray-900 mb-3">Total</h3>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">
										Total Additional Earning
									</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.totalAdditionalEarning}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Gross Income</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.grossIncome}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Total Deductions</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.totalDeductions}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Withholding Tax</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.withholdingTax}
									</span>
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">
										Total Taxable Income
									</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.totalTaxableIncome}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Total Non-Taxable</span>
									<span className="text-sm text-gray-900 font-semibold">
										{payrollData.total.totalNonTaxable}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-gray-600">Net Pay</span>
									<span className="text-sm" style={{ color: "var(--gt-700)" }}>
										{payrollData.total.netPay}
									</span>
								</div>
							</div>
						</div>
						<div className="mt-4 flex justify-end">
							<Button className="theme-btn rounded-lg" onClick={onPayslipModalOpen}>
								<Eye className="w-4 h-4 mr-2" />
								View
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
