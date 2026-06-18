import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Badge } from "~/components/atoms";

interface Calendar {
	id: string;
	year: number;
	type: "Company" | "Department" | "Regional";
	country: string;
	region: string;
	status: "Active" | "Scheduled" | "Draft";
	events: Array<{
		month: string;
		count: number;
		dots: number[];
	}>;
}

interface CalendarCardProps {
	calendar: Calendar;
	onClick: () => void;
}

const statusColors = {
	Active: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
	Scheduled: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
	Draft: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

const typeColors = {
	Company: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
	Department: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
	Regional: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

export default function CalendarCard({ calendar, onClick }: CalendarCardProps) {
	const miniCalendarDays = Array.from({ length: 35 }, (_, i) => i + 1);
	const eventDots = calendar.events[0]?.dots || [];

	return (
		<div onClick={onClick} className="group cursor-pointer">
			<Card className="p-5 h-full flex flex-col rounded-xl border border-border hover:border-red-500/50 bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
				{/* Header with Year and Type */}
				<div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
					<h3 className="text-xl font-bold text-foreground">{calendar.year}</h3>
					<Badge
						variant="outline"
						className={`${typeColors[calendar.type]} border font-medium`}>
						{calendar.type}
					</Badge>
				</div>

				{/* Mini Calendar Preview */}
				<div className="mb-4 p-3 bg-muted/50 rounded-lg flex-1">
					<div className="text-center mb-2">
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
							Calendar Preview
						</p>
					</div>
					<div className="grid grid-cols-7 gap-1">
						{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
							<div
								key={i}
								className="text-center text-[10px] font-semibold text-muted-foreground">
								{day}
							</div>
						))}
						{miniCalendarDays.map((day) => (
							<div
								key={day}
								className={`w-full aspect-square flex items-center justify-center text-[10px] rounded
                  ${
						eventDots.includes(day)
							? "bg-red-500 text-white font-bold"
							: day > 28
								? ""
								: "text-muted-foreground hover:bg-muted transition-colors"
					} `}>
								{day > 28 ? "" : day}
							</div>
						))}
					</div>
					<div className="mt-3 flex items-center justify-center gap-4 text-xs">
						<div className="flex items-center gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
							<span className="text-muted-foreground">
								{calendar.events[0]?.count || 0} Events
							</span>
						</div>
					</div>
				</div>

				{/* View Button */}
				<button className="hover:cursor-pointer w-full mt-auto py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 group">
					<span className="text-sm">View Calendar</span>
					<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
				</button>
			</Card>
		</div>
	);
}
