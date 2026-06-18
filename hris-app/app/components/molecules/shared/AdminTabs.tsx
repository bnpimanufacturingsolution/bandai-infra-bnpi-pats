import { ReactNode } from "react";

export interface TabItem {
	id: string;
	label: string;
	content: ReactNode;
	badge?: string | number;
}

export interface AdminTabsProps {
	tabs: TabItem[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	className?: string;
}

export function AdminTabs({ tabs, activeTab, onTabChange, className = "" }: AdminTabsProps) {
	return (
		<div className={`space-y-6 ${className}`}>
			{/* Tab Navigation */}
			<div className="flex bg-gray-100 p-1 rounded-lg">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors relative ${
							activeTab === tab.id
								? "bg-white text-orange-700 shadow-sm"
								: "text-gray-600 hover:text-gray-900"
						}`}>
						<div className="flex items-center justify-center gap-2">
							<span>{tab.label}</span>
							{tab.badge && (
								<span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
									{tab.badge}
								</span>
							)}
						</div>
					</button>
				))}
			</div>

			{/* Tab Content */}
			<div>{tabs.find((tab) => tab.id === activeTab)?.content}</div>
		</div>
	);
}
