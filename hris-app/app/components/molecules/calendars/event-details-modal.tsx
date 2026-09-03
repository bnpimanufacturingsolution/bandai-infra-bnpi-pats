import type { CalendarItem } from "@/types/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Calendar, Clock, MapPin, Video, Users, Bell, Tag } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "~/components/atoms";

interface EventDetailsModalProps {
	event: CalendarItem | null;
	onClose: () => void;
	getEventColor: (type: CalendarItem["type"]) => string;
}

export function EventDetailsModal({ event, onClose, getEventColor }: EventDetailsModalProps) {
	if (!event) return null;

	const formatDateTime = (date: string) => {
		return format(new Date(date), "MMMM dd, yyyy • h:mm a");
	};

	return (
		<Dialog open={!!event} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div className="flex-1">
							<DialogTitle className="text-2xl mb-2">{event.title}</DialogTitle>
							<Badge variant="outline" className={getEventColor(event.type)}>
								{event.type}
							</Badge>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					{event.description && (
						<div>
							<p className="text-muted-foreground">{event.description}</p>
						</div>
					)}

					<div className="space-y-3">
						<div className="flex items-start gap-3">
							<Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
							<div className="flex-1">
								<div className="text-sm font-medium">Date & Time</div>
								<div className="text-sm text-muted-foreground">
									{formatDateTime(event.startDate)}
									{event.endDate && (
										<>
											{" → "}
											{formatDateTime(event.endDate)}
										</>
									)}
								</div>
								{event.isAllDay && (
									<Badge variant="secondary" className="mt-1">
										All Day
									</Badge>
								)}
							</div>
						</div>

						{event.location && (
							<div className="flex items-start gap-3">
								<MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium">Location</div>
									<div className="text-sm text-muted-foreground">
										{event.location}
									</div>
								</div>
							</div>
						)}

						{event.isVirtual && event.meetingUrl && (
							<div className="flex items-start gap-3">
								<Video className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium">Virtual Meeting</div>
									<a
										href={event.meetingUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
										Join Meeting
									</a>
								</div>
							</div>
						)}

						{(event.assignedUserIds?.length ?? 0) > 0 && (
							<div className="flex items-start gap-3">
								<Users className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium">Attendees</div>
									<div className="text-sm text-muted-foreground">
										{event.assignedUserIds?.length} attendee(s)
									</div>
								</div>
							</div>
						)}

						{event.recurrence && (
							<div className="flex items-start gap-3">
								<Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium">Recurrence</div>
									<div className="text-sm text-muted-foreground">
										{event.recurrence.frequency} • Every{" "}
										{event.recurrence.interval}{" "}
										{event.recurrence.frequency.toLowerCase()}
									</div>
								</div>
							</div>
						)}

						{event.reminders && event.reminders.length > 0 && (
							<div className="flex items-start gap-3">
								<Bell className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium">Reminders</div>
									<div className="space-y-1">
										{event.reminders.map((reminder, index) => (
											<div
												key={index}
												className="text-sm text-muted-foreground">
												{reminder.type} • {reminder.minutesBefore} minutes
												before
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{event.tags.length > 0 && (
							<div className="flex items-start gap-3">
								<Tag className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<div className="text-sm font-medium mb-2">Tags</div>
									<div className="flex flex-wrap gap-2">
										{event.tags.map((tag) => (
											<Badge key={tag} variant="secondary">
												{tag}
											</Badge>
										))}
									</div>
								</div>
							</div>
						)}
					</div>

					<div className="pt-4 border-t border-border">
						<div className="text-xs text-muted-foreground">
							Status: <span className="font-medium">{event.status}</span> • Timezone:{" "}
							{event.timezone}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
