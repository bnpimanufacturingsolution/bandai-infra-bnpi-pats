import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateItemSidebar } from "~/components/molecules/calendars/create-item-calendar";
import { CalendarView } from "~/components/molecules/calendars/calendar-view";
import { useNavigate, useParams } from "react-router";
import { useCalendar, useCalendarWithRelations } from "~/lib/hooks/use-calendar";
import { Loader2 } from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";

export default function Home() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { id } = useParams<{ id: string }>();
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	// Fetch calendar data with items
	const { data: calendarData, isLoading, isError, error } = useCalendarWithRelations(id ?? "");
	console.log("Calendar ID:", id);

	// Loading state
	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-screen">
				<Loader2 className="w-8 h-8 animate-spin text-primary" />
			</div>
		);
	}

	// Error state
	if (isError) {
		return (
			<div className="max-w-7xl mx-auto">
				<div className="mb-4 flex items-center gap-5">
					<Button
						className="rounded-full hover:cursor-pointer"
						onClick={() => navigate(-1)}>
						<ChevronLeft />
					</Button>
				</div>
				<div className="text-center py-12">
					<p className="text-destructive">Error loading calendar: {error?.message}</p>
				</div>
			</div>
		);
	}

	// No data state
	if (!calendarData) {
		return (
			<div className="max-w-7xl mx-auto">
				<div className="mb-4 flex items-center gap-5">
					<Button
						className="rounded-full hover:cursor-pointer"
						onClick={() => navigate(-1)}>
						<ChevronLeft />
					</Button>
				</div>
				<div className="text-center py-12">
					<p className="text-muted-foreground">Calendar not found</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
					<div className="flex items-center gap-3 sm:gap-5">
						<Button
							className="rounded-full hover:cursor-pointer h-9 w-9 sm:h-10 sm:w-10"
							size="icon"
							onClick={() => navigate(-1)}>
							<ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
						</Button>
						<h1 className="text-lg sm:text-xl font-bold text-foreground truncate max-w-[200px] sm:max-w-none">
							{calendarData.name}
						</h1>
					</div>
					<Button
						onClick={() => setIsSidebarOpen(true)}
						size="sm"
						className="gap-2 rounded-full w-full sm:w-auto">
						<Plus className="w-4 h-4 sm:w-5 sm:h-5" />
						<span className="hidden xs:inline">Create Item</span>
						<span className="xs:hidden">New</span>
					</Button>
				</div>

				<CalendarView
					items={
						calendarData.items?.map((item) => ({
							...item,
							startDate:
								item.startDate instanceof Date
									? item.startDate.toISOString()
									: item.startDate,
							endDate:
								item.endDate instanceof Date
									? item.endDate.toISOString()
									: item.endDate,
							createdAt:
								item.createdAt instanceof Date
									? item.createdAt.toISOString()
									: item.createdAt,
							updatedAt:
								item.updatedAt instanceof Date
									? item.updatedAt.toISOString()
									: item.updatedAt,
							metadata: item.metadata ?? undefined,
							description: item.description ?? undefined,
							location: item.location ?? undefined,
							meetingUrl: item.meetingUrl ?? undefined,
						})) || []
					}
					year={calendarData.year}
				/>
			</div>

			<CreateItemSidebar
				isOpen={isSidebarOpen}
				onClose={() => setIsSidebarOpen(false)}
				year={calendarData.year}
				calendarId={calendarData.id}
				organizationId={calendarData.organizationId}
			/>
		</>
	);
}
