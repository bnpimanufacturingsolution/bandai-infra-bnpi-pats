import { FileText, Heart, Newspaper, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";

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

export function CompanyNewsCard() {
	return (
		<Card id="dashboard-company-news">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Newspaper className="w-5 h-5 text-orange-500" />
					Company News
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
					{companyNews.map((news) => (
						<div
							key={news.id}
							className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
							<div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100 flex-shrink-0">
								<news.icon className="w-5 h-5 text-orange-500" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium text-gray-900 truncate">
									{news.title}
								</p>
								<p className="text-xs text-gray-500 mt-0.5">
									{news.date} • {news.author}
								</p>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
