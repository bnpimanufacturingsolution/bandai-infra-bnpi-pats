import { Check } from "lucide-react";

interface ReviewItem {
	label: string;
	value: string;
	highlight?: boolean;
}

interface CalendarReviewProps {
	reviewItems: ReviewItem[];
}

export function CalendarReview({ reviewItems }: CalendarReviewProps) {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-sm font-medium text-foreground mb-4">
					Review Calendar Details
				</h3>
				<div className="border border-border rounded-md divide-y divide-border">
					{reviewItems.map((item, index) => (
						<div key={index} className="flex justify-between items-center p-4">
							<span className="text-sm text-muted-foreground">{item.label}</span>
							<span
								className={`font-medium ${
									item.highlight ? "text-green-600" : "text-foreground"
								}`}>
								{item.value}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-md p-4">
				<div className="flex items-center gap-2">
					<Check className="w-4 h-4 text-green-600 dark:text-green-400" />
					<p className="text-sm text-green-700 dark:text-green-400 font-medium">
						Ready to create calendar
					</p>
				</div>
			</div>
		</div>
	);
}
