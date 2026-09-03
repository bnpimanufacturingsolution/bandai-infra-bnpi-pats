import type { Employee } from "~/services/employees.service";
import { Banknote, TrendingUp, Wallet, Clock, MapPin, Briefcase } from "lucide-react";

interface CompensationTabProps {
	employee: Employee;
}

export function CompensationTab({ employee }: CompensationTabProps) {
	const calculateMonthlyRate = () => {
		const basicSalary = employee.basicSalary || 0;
		switch (employee.payFrequency) {
			case "DAILY":
				return basicSalary * 22; // Typical working days
			case "WEEKLY":
				return basicSalary * 4.33; // Average weeks per month
			case "BIWEEKLY":
				return basicSalary * 2.17; // Biweekly to monthly
			case "SEMI_MONTHLY":
				return basicSalary * 2; // Paid twice per month
			case "MONTHLY":
				return basicSalary;
			case "QUARTERLY":
				return basicSalary / 3;
			case "ANNUALLY":
				return basicSalary / 12;
			default:
				return basicSalary;
		}
	};

	const calculateAnnualSalary = () => {
		const basicSalary = employee.basicSalary || 0;
		switch (employee.payFrequency) {
			case "DAILY":
				return basicSalary * 250; // Annual working days
			case "WEEKLY":
				return basicSalary * 52;
			case "BIWEEKLY":
				return basicSalary * 26;
			case "SEMI_MONTHLY":
				return basicSalary * 24; // Paid twice per month, 24 times per year
			case "MONTHLY":
				return basicSalary * 12;
			case "QUARTERLY":
				return basicSalary * 4;
			case "ANNUALLY":
				return basicSalary;
			default:
				return basicSalary;
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: employee.currency || "PHP",
		}).format(amount);
	};

	const payFrequencyLabel =
		{
			DAILY: "Daily",
			WEEKLY: "Weekly",
			BIWEEKLY: "Bi-weekly",
			SEMI_MONTHLY: "Semi-monthly",
			MONTHLY: "Monthly",
			QUARTERLY: "Quarterly",
			ANNUALLY: "Annually",
		}[employee.payFrequency || "MONTHLY"] || "N/A";

	const monthlyRate = calculateMonthlyRate();
	const annualSalary = calculateAnnualSalary();

	return (
		<div className="space-y-8">
			{/* Salary Overview Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Banknote className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Salary Overview</h3>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{/* Basic Salary Card */}
					<div className="border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
						<div className="flex items-center justify-between mb-3">
							<span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Basic ({payFrequencyLabel})
							</span>
							<Wallet className="w-4 h-4 text-orange-500" />
						</div>
						<p className="text-xl font-semibold text-gray-900">
							{formatCurrency(employee.basicSalary || 0)}
						</p>
					</div>

					{/* Monthly Rate Card */}
					<div className="border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
						<div className="flex items-center justify-between mb-3">
							<span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Monthly Rate
							</span>
							<TrendingUp className="w-4 h-4 text-orange-500" />
						</div>
						<p className="text-xl font-semibold text-gray-900">
							{formatCurrency(monthlyRate)}
						</p>
					</div>

					{/* Annual Salary Card */}
					<div className="border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
						<div className="flex items-center justify-between mb-3">
							<span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Annual Salary
							</span>
							<Banknote className="w-4 h-4 text-orange-500" />
						</div>
						<p className="text-xl font-semibold text-gray-900">
							{formatCurrency(annualSalary)}
						</p>
					</div>
				</div>
			</section>

			{/* Compensation Details Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Briefcase className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Compensation Details</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Currency */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<div className="flex items-center gap-3">
								<Banknote className="w-4 h-4 text-gray-400" />
								<span className="text-sm font-medium text-gray-700">Currency</span>
							</div>
							<span className="text-sm text-gray-600">
								{employee.currency || "PHP"}
							</span>
						</div>

						{/* Pay Frequency */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<div className="flex items-center gap-3">
								<Clock className="w-4 h-4 text-gray-400" />
								<span className="text-sm font-medium text-gray-700">
									Pay Frequency
								</span>
							</div>
							<span className="text-sm text-gray-600">{payFrequencyLabel}</span>
						</div>

						{/* Employment Type */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<div className="flex items-center gap-3">
								<Briefcase className="w-4 h-4 text-gray-400" />
								<span className="text-sm font-medium text-gray-700">
									Employment Type
								</span>
							</div>
							<span className="text-sm text-gray-600">
								{employee.employmentType || "N/A"}
							</span>
						</div>

						{/* Work Location */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<div className="flex items-center gap-3">
								<MapPin className="w-4 h-4 text-gray-400" />
								<span className="text-sm font-medium text-gray-700">
									Work Location
								</span>
							</div>
							<span className="text-sm text-gray-600">
								{employee.workLocation || "N/A"}
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Salary Breakdown Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<TrendingUp className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Salary Breakdown</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Daily Rate */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<span className="text-sm text-gray-600">
								Daily Rate (250 days/year)
							</span>
							<span className="text-sm text-gray-600">
								{formatCurrency(annualSalary / 250)}
							</span>
						</div>

						{/* Semi-Monthly */}
						<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
							<span className="text-sm text-gray-600">
								Semi-Monthly (50% of Monthly)
							</span>
							<span className="text-sm text-gray-600">
								{formatCurrency(monthlyRate / 2)}
							</span>
						</div>

						{/* Monthly Rate - Highlighted */}
						<div className="flex items-center justify-between px-4 py-3 bg-orange-50">
							<span className="text-sm font-medium text-gray-700">Monthly Rate</span>
							<span className="text-base font-semibold text-orange-600">
								{formatCurrency(monthlyRate)}
							</span>
						</div>

						{/* Annual Salary - Highlighted */}
						<div className="flex items-center justify-between px-4 py-3 bg-orange-50">
							<span className="text-sm font-medium text-gray-700">Annual Salary</span>
							<span className="text-base font-semibold text-orange-600">
								{formatCurrency(annualSalary)}
							</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
