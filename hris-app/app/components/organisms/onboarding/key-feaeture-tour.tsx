"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ArrowRight,
	Calendar,
	DollarSign,
	FileText,
	Settings,
	MessageSquare,
	ChevronLeft,
	Sparkles,
	HandCoins,
} from "lucide-react";

interface KeyFeaturesTourProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export default function KeyFeaturesTour({ onNext, onBack, onSkip }: KeyFeaturesTourProps) {
	const [selectedFeature, setSelectedFeature] = useState(0);

	const features = [
		{
			icon: Calendar,
			title: "Schedule & Time Off",
			description:
				"View your calendar, request time off, and see your time off balance. Managing your schedule has never been easier.",
			tips: [
				"Check your vacation days remaining",
				"Request time off in advance",
				"View team calendars",
				"Get approval notifications",
			],
			color: "text-orange-500",
			bgColor: "bg-orange-50",
			borderColor: "border-orange-200",
		},
		{
			icon: HandCoins,
			title: "Pay Stubs & Tax Documents",
			description:
				"Access all your pay stubs, tax documents, and compensation information. Everything is securely stored in one place.",
			tips: [
				"Download pay stubs as PDF",
				"View W-2 forms and tax documents",
				"Check your compensation history",
				"Manage direct deposit settings",
			],
			color: "text-emerald-500",
			bgColor: "bg-emerald-50",
			borderColor: "border-emerald-200",
		},
		{
			icon: FileText,
			title: "Policies & Handbook",
			description:
				"Find all company policies, employee handbook, and guidelines. Stay informed about company rules and procedures.",
			tips: [
				"Search for specific policies",
				"Read company handbook",
				"Acknowledge receipt of documents",
				"Get clarifications from HR",
			],
			color: "text-blue-500",
			bgColor: "bg-blue-50",
			borderColor: "border-blue-200",
		},
		{
			icon: MessageSquare,
			title: "Expense & Help Tickets",
			description:
				"Submit expenses for reimbursement and create help tickets for HR support. Get issues resolved quickly.",
			tips: [
				"Submit expense reports",
				"Track reimbursement status",
				"Create help tickets",
				"Chat with HR team",
			],
			color: "text-purple-500",
			bgColor: "bg-purple-50",
			borderColor: "border-purple-200",
		},
		{
			icon: Settings,
			title: "Personal Information",
			description:
				"Update your profile, contact details, and preferences. Keep your information current and accurate.",
			tips: [
				"Update contact information",
				"Change your password",
				"Manage notification preferences",
				"Update emergency contacts",
			],
			color: "text-rose-500",
			bgColor: "bg-rose-50",
			borderColor: "border-rose-200",
		},
	];

	const CurrentIcon = features[selectedFeature].icon;

	return (
		<div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
			{/* Header */}
			<div className="mb-6 text-center md:text-left">
				<h2 className="text-2xl md:text-3xl font-extrabold mb-2">
					<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
						Explore Key Features
					</span>
				</h2>
				<p className="text-sm text-gray-500">
					Get familiar with the essential tools available to you
				</p>
			</div>

			<div className="grid md:grid-cols-12 gap-5 lg:gap-6 mb-8">
				{/* Feature List */}
				<div className="md:col-span-5 space-y-2">
					{features.map((feature, idx) => {
						const Icon = feature.icon;
						const isSelected = idx === selectedFeature;
						return (
							<button
								key={idx}
								onClick={() => setSelectedFeature(idx)}
								className={`w-full text-left p-3 rounded-xl border transition-all duration-300 flex items-center gap-3 group ${
									isSelected
										? "bg-white border-orange-200 shadow-sm translate-x-1"
										: "bg-transparent border-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-900"
								}`}>
								<div
									className={`p-1.5 rounded-lg transition-colors ${isSelected ? "bg-orange-100" : "bg-gray-100 group-hover:bg-white"}`}>
									<Icon
										className={`w-4 h-4 flex-shrink-0 ${isSelected ? "text-orange-600" : "text-gray-500"}`}
									/>
								</div>
								<div className="flex-1">
									<p
										className={`font-bold text-xs ${isSelected ? "text-gray-900" : "text-gray-600"}`}>
										{feature.title}
									</p>
								</div>
								{isSelected && (
									<ArrowRight className="w-3.5 h-3.5 text-orange-500" />
								)}
							</button>
						);
					})}
				</div>

				{/* Feature Details */}
				<div className="md:col-span-7">
					<div
						className={`p-6 rounded-2xl border shadow-lg min-h-[360px] flex flex-col relative overflow-hidden transition-all duration-500 bg-white border-gray-100`}>
						{/* Dynamic background effect */}
						<div
							className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/3 pointer-events-none ${features[selectedFeature].bgColor.replace("bg-", "bg-")}`}
						/>

						{/* Icon */}
						<div
							className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 shadow-sm ${features[selectedFeature].bgColor} ${features[selectedFeature].color}`}>
							<CurrentIcon className="w-6 h-6" />
						</div>

						{/* Title & Description */}
						<h3 className="text-xl font-bold text-gray-900 mb-2">
							{features[selectedFeature].title}
						</h3>
						<p className="text-gray-600 mb-6 leading-relaxed text-sm">
							{features[selectedFeature].description}
						</p>

						{/* Tips */}
						<div className="flex-1 bg-gray-50/80 rounded-xl p-4 border border-gray-100">
							<p className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-xs">
								<Sparkles className="w-3.5 h-3.5 text-orange-500" />
								Quick Tips
							</p>
							<ul className="space-y-2">
								{features[selectedFeature].tips.map((tip, idx) => (
									<li
										key={idx}
										className="flex items-start gap-2 text-xs text-gray-600">
										<span
											className={`inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 mt-0.5 text-[10px] font-bold ${features[selectedFeature].bgColor} ${features[selectedFeature].color}`}>
											{idx + 1}
										</span>
										{tip}
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="max-w-xl mx-auto flex gap-3 flex-col md:flex-row items-center mt-8">
				<Button
					onClick={onNext}
					className="w-full md:flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all rounded-full h-10 text-sm font-bold">
					Continue <ArrowRight className="w-4 h-4 ml-2" />
				</Button>

				<Button
					onClick={onSkip}
					variant="outline"
					className="w-full md:w-auto border-2 border-orange-100 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 rounded-full h-10 font-semibold px-6 text-sm">
					Skip
				</Button>

				<Button
					onClick={onBack}
					variant="ghost"
					className="md:hidden flex items-center justify-center gap-2 text-gray-500 text-sm">
					<ChevronLeft className="w-3.5 h-3.5" /> Back
				</Button>
			</div>
		</div>
	);
}
