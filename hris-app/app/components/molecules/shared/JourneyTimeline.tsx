import { CheckCircle2, Clock } from "lucide-react";
import { type SectionStatus } from "~/routes/hr/add-employee";

interface Section {
	id: string;
	title: string;
	description: string;
	icon: any;
}

interface JourneyTimelineProps {
	sections: Section[];
	activeSection: string;
	sectionStatus: Record<string, SectionStatus>;
	onSectionClick: (sectionId: string) => void;
	completedCount: number;
	totalCount: number;
}

export function JourneyTimeline({
	sections,
	activeSection,
	sectionStatus,
	onSectionClick,
	completedCount,
	totalCount,
}: JourneyTimelineProps) {
	const getStepIcon = (sectionId: string, status: SectionStatus) => {
		if (status === "completed") {
			return <CheckCircle2 className="h-5 w-5 text-green-600" />;
		}
		if (activeSection === sectionId) {
			return <Clock className="h-5 w-5 text-orange-600" />;
		}
		return <div className="h-5 w-5 rounded-full border-2 border-gray-300 bg-white"></div>;
	};

	const getStepStyle = (sectionId: string, status: SectionStatus) => {
		const baseStyle = "flex items-center gap-3 p-4 rounded-lg transition-all duration-200";

		if (status === "completed") {
			return `${baseStyle} bg-green-50 border border-green-200 cursor-pointer hover:bg-green-100`;
		}
		if (activeSection === sectionId) {
			return `${baseStyle} bg-orange-50 border border-orange-200 shadow-sm cursor-pointer hover:bg-orange-100`;
		}
		// Allow all steps to be clickable - no restrictions
		return `${baseStyle} bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 hover:border-orange-300`;
	};

	const getTitleStyle = (sectionId: string, status: SectionStatus) => {
		if (status === "completed") {
			return "font-medium text-green-900";
		}
		if (activeSection === sectionId) {
			return "font-medium text-orange-900";
		}
		return "font-medium text-gray-700";
	};

	const getDescriptionStyle = (sectionId: string, status: SectionStatus) => {
		if (status === "completed") {
			return "text-sm text-green-700";
		}
		if (activeSection === sectionId) {
			return "text-sm text-orange-700";
		}
		return "text-sm text-gray-500";
	};

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold text-gray-900 mb-2">Your Journey</h2>
				<div className="space-y-3">
					{sections.map((section, index) => {
						const status = sectionStatus[section.id];
						// Allow clicking on all steps - no restrictions
						const isClickable = true;

						return (
							<div
								key={section.id}
								className={getStepStyle(section.id, status)}
								onClick={() => isClickable && onSectionClick(section.id)}>
								<div className="flex-shrink-0">
									{getStepIcon(section.id, status)}
								</div>
								<div className="flex-1">
									<h3 className={getTitleStyle(section.id, status)}>
										{section.title}
									</h3>
									<p className={getDescriptionStyle(section.id, status)}>
										{section.description}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="pt-6 border-t border-gray-200">
				<div className="flex items-center justify-between mb-2">
					<span className="text-sm font-medium text-gray-700">Progress</span>
					<span className="text-sm text-gray-500">
						{completedCount}/{totalCount}
					</span>
				</div>
				<div className="w-full bg-gray-200 rounded-full h-2">
					<div
						className="bg-orange-600 h-2 rounded-full transition-all duration-300"
						style={{ width: `${(completedCount / totalCount) * 100}%` }}></div>
				</div>
			</div>
		</div>
	);
}
