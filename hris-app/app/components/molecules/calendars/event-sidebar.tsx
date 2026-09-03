"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Plus, Clock, MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/atoms";

interface CalendarEvent {
	id: string;
	date: number;
	month: number;
	year: number;
	title: string;
	time: string;
	type: "HOLIDAY" | "MEETING" | "DEADLINE" | "EVENT" | "COMPANY_EVENT" | "REMINDER" | "OTHER";
	color: string;
	description: string | null | undefined;
	isAllDay: boolean;
}

interface EventSidebarProps {
	selectedDate: number;
	events: CalendarEvent[];
}

const typeLabels: Record<CalendarEvent["type"], string> = {
	HOLIDAY: "Holiday",
	MEETING: "Meeting",
	DEADLINE: "Deadline",
	EVENT: "Event",
	COMPANY_EVENT: "Company Event",
	REMINDER: "Reminder",
	OTHER: "Other",
};

const typeBadgeColors: Record<CalendarEvent["type"], string> = {
	HOLIDAY: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
	MEETING: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
	DEADLINE: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
	EVENT: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
	COMPANY_EVENT: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
	REMINDER: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
	OTHER: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
};

export default function EventSidebar({ selectedDate, events }: EventSidebarProps) {
	const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-6">
			<Card className="p-6 rounded-2xl backdrop-blur-lg border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 shadow-lg dark:shadow-2xl">
				<div className="text-center">
					<p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
						Selected Date
					</p>
					<div className="text-5xl font-bold text-yellow-400 mb-2">{selectedDate}</div>
					<p className="text-sm text-muted-foreground">March 2025</p>
				</div>
			</Card>

			<Card className="p-6 rounded-2xl backdrop-blur-lg border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 shadow-lg dark:shadow-2xl flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-foreground">Events</h3>
					<Badge
						variant="secondary"
						className="bg-yellow-400/10 text-yellow-600 dark:text-yellow-400 border-0">
						{events.length}
					</Badge>
				</div>

				{events.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-sm text-muted-foreground mb-4">No events scheduled</p>
						<Button
							size="sm"
							className="w-full gap-2 bg-yellow-400 hover:bg-yellow-400/90 text-slate-900">
							<Plus className="w-4 h-4" />
							Add Event
						</Button>
					</div>
				) : (
					<div className="space-y-3 max-h-96 overflow-y-auto">
						{events.map((event) => (
							<div
								key={event.id}
								onMouseEnter={() => setHoveredEventId(event.id)}
								onMouseLeave={() => setHoveredEventId(null)}
								className="p-3 rounded-lg bg-muted/30 dark:bg-slate-800/50 hover:bg-muted/50 dark:hover:bg-slate-800 transition-all group">
								<div className="flex items-start justify-between gap-3 mb-2">
									<div className="flex-1">
										<p className="font-medium text-sm text-foreground mb-1">
											{event.title}
										</p>
										<Badge
											variant="outline"
											className={`${typeBadgeColors[event.type]} border text-xs`}>
											{typeLabels[event.type]}
										</Badge>
									</div>
									{hoveredEventId === event.id && (
										<Button
											size="sm"
											variant="ghost"
											className="opacity-0 group-hover:opacity-100 transition-opacity">
											<Trash2 className="w-4 h-4 text-destructive" />
										</Button>
									)}
								</div>
								<div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
									<Clock className="w-3 h-3" />
									<span>{event.time}</span>
								</div>
							</div>
						))}
					</div>
				)}

				<Button size="sm" variant="outline" className="w-full gap-2 mt-2 bg-transparent">
					<Plus className="w-4 h-4" />
					Add Event
				</Button>
			</Card>

			<Card className="p-6 rounded-2xl backdrop-blur-lg border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 shadow-lg dark:shadow-2xl space-y-3">
				<h3 className="font-semibold text-foreground text-sm">Quick Actions</h3>
				<div className="space-y-2">
					<Button
						variant="outline"
						size="sm"
						className="w-full justify-start text-xs bg-transparent">
						<MapPin className="w-4 h-4 mr-2" />
						Add Location
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="w-full justify-start text-xs bg-transparent">
						<Trash2 className="w-4 h-4 mr-2" />
						Add Attendees
					</Button>
				</div>
			</Card>
		</div>
	);
}
