import type { CalendarItem } from "@/types/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";

interface DayEventsModalProps {
	isOpen: boolean;
	onClose: () => void;
	events: CalendarItem[];
	date: string;
	onEventClick: (event: CalendarItem) => void;
	getEventColor: (type: CalendarItem["type"]) => string;
}

export function DayEventsModal({
	isOpen,
	onClose,
	events,
	date,
	onEventClick,
	getEventColor,
}: DayEventsModalProps) {
	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const formatTime = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Calendar className="w-5 h-5" />
						{formatDate(date)}
					</DialogTitle>
				</DialogHeader>
				<div className="max-h-[400px] overflow-y-auto pr-4">
					<div className="space-y-2">
						{events.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-8">
								No events for this day
							</p>
						) : (
							events.map((event) => (
								<button
									key={event.id}
									onClick={() => {
										onEventClick(event);
										onClose();
									}}
									className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${getEventColor(
										event.type,
									)}`}>
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1">
											<h4 className="font-medium text-sm">{event.title}</h4>
											{event.description && (
												<p className="text-xs mt-1 opacity-80 line-clamp-2">
													{event.description}
												</p>
											)}
											<div className="flex items-center gap-1 mt-2 text-xs opacity-70">
												<Clock className="w-3 h-3" />
												<span>
													{formatTime(event.startDate)} -{" "}
													{formatTime(event.endDate)}
												</span>
											</div>
										</div>
										<div className="text-xs font-medium px-2 py-1 rounded bg-background/50">
											{event.type.replace("_", " ")}
										</div>
									</div>
								</button>
							))
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
