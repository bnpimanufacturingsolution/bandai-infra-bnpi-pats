import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MobileSiteLayout from "~/layouts/mobile-site-layout";

export default function SiteLeaves() {
	const [selectedMonth, setSelectedMonth] = useState("April");

	const requestedLeaves = [
		{ type: "Vacation Leave", date: "4/11/2023", time: "10:00:05 AM" },
		{ type: "PTO", date: "4/11/2023", time: "10:00:05 AM" },
		{ type: "Sick Leave", date: "4/11/2023", time: "10:00:05 AM" },
	];

	const previousLeaves = [
		{ type: "Vacation Leave", date: "4/11/2023", time: "10:00:05 AM" },
		{ type: "PTO", date: "4/11/2023", time: "10:00:05 AM" },
		{ type: "Sick Leave", date: "4/11/2023", time: "10:00:05 AM" },
	];

	return (
		<MobileSiteLayout>
			<div className="min-h-screen bg-white">
				{/* Status Bar */}
				<div className="bg-white px-6 py-3 flex items-center justify-between">
					<span className="text-sm font-medium">9:41</span>
					<div className="flex items-center gap-1">
						<svg width="17" height="12" viewBox="0 0 17 12" fill="none">
							<path
								fillRule="evenodd"
								clipRule="evenodd"
								d="M16 0H14V12H16V0ZM11 3H13V12H11V3ZM8 6H10V12H8V6Z"
								fill="black"
							/>
						</svg>
						<svg width="15" height="11" viewBox="0 0 15 11" fill="none">
							<path
								fillRule="evenodd"
								clipRule="evenodd"
								d="M0 0L0 11L15 5.5L0 0Z"
								fill="black"
							/>
						</svg>
						<svg width="25" height="12" viewBox="0 0 25 12" fill="none">
							<rect x="0.5" y="0.5" width="21" height="11" rx="2" stroke="black" />
							<rect x="22" y="3" width="2" height="6" fill="black" />
						</svg>
					</div>
				</div>

				{/* Main Content */}
				<div className="px-6 py-6 space-y-6">
					{/* Requested Leaves Section */}
					<div>
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-base font-bold text-gray-900">Requested Leaves</h2>
							<div className="flex items-center gap-2">
								<button className="p-1 hover:bg-gray-100 rounded">
									<ChevronLeft className="w-5 h-5 text-gray-600" />
								</button>
								<div className="px-4 py-1 border border-gray-300 rounded-md">
									<span className="text-sm font-medium text-gray-700">
										{selectedMonth}
									</span>
								</div>
								<button className="p-1 hover:bg-gray-100 rounded">
									<ChevronRight className="w-5 h-5 text-gray-600" />
								</button>
							</div>
						</div>

						<div className="space-y-3">
							{requestedLeaves.map((leave, index) => (
								<div key={index} className="bg-white border-b border-gray-100 pb-3">
									<p className="text-sm font-semibold text-gray-900 mb-1">
										{leave.type}
									</p>
									<p className="text-xs text-gray-500">
										{leave.date} {leave.time}
									</p>
								</div>
							))}
						</div>
					</div>

					{/* Divider */}
					<div className="border-t border-gray-200"></div>

					{/* Previous Leaves Section */}
					<div>
						<h2 className="text-base font-bold text-gray-900 mb-4">Previous Leaves</h2>
						<div className="space-y-3">
							{previousLeaves.map((leave, index) => (
								<div key={index} className="bg-white border-b border-gray-100 pb-3">
									<p className="text-sm font-semibold text-gray-900 mb-1">
										{leave.type}
									</p>
									<p className="text-xs text-gray-500">
										{leave.date} {leave.time}
									</p>
								</div>
							))}
						</div>
					</div>

					{/* Request Leave Button */}
					<div className="pt-6">
						<button className="w-full bg-purple-700 text-white py-3 rounded-lg font-medium hover:bg-purple-800 transition-colors">
							Request Leave
						</button>
					</div>
				</div>
			</div>
		</MobileSiteLayout>
	);
}
