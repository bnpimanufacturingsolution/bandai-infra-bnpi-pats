import { Plus } from "lucide-react";
import CalendarCard from "./calendar-card";
import CalendarHeader from "./calendar-header";
import { useCalendars } from "~/lib/hooks/use-calendar";
import { useMemo } from "react";
import { useNavigate } from "react-router";

interface CalendarListViewProps {
	onCreateClick: () => void;
}

export default function CalendarListView({ onCreateClick }: CalendarListViewProps) {
	const navigate = useNavigate();
	const {
		data: calendarsData,
		isLoading,
		error,
	} = useCalendars({
		limit: 100,
		fields: "items,id,name,description,year,type,country,region,isActive",
	});

	const calendarsByYear = useMemo(() => {
		const calendars = calendarsData?.data?.calendars || calendarsData?.calendars || [];

		console.log("Processing calendars:", calendars);

		if (!calendars || calendars.length === 0) return {};

		return calendars.reduce(
			(acc, calendar) => {
				if (!acc[calendar.year]) {
					acc[calendar.year] = [];
				}
				acc[calendar.year].push(calendar);
				return acc;
			},
			{} as Record<number, any[]>,
		);
	}, [calendarsData]);

	const years = Object.keys(calendarsByYear)
		.map(Number)
		.sort((a, b) => a - b);

	console.log("Years:", years);
	console.log("Calendars by year:", calendarsByYear);

	if (isLoading) {
		return (
			<div className="h-full pt-8 pb-12 px-4 sm:px-6 lg:px-8">
				<CalendarHeader
					title="Calendar Management"
					subtitle="Manage multiple company, department, and regional calendars"
					action={{
						label: "Create Calendar",
						icon: Plus,
						onClick: onCreateClick,
					}}
				/>
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground">Loading calendars...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="h-full pt-8 pb-12 px-4 sm:px-6 lg:px-8">
				<CalendarHeader
					title="Calendar Management"
					subtitle="Manage multiple company, department, and regional calendars"
					action={{
						label: "Create Calendar",
						icon: Plus,
						onClick: onCreateClick,
					}}
				/>
				<div className="flex items-center justify-center py-12">
					<p className="text-red-500">Error loading calendars: {error.message}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full pt-8 pb-12 px-4 sm:px-6 lg:px-8">
			<CalendarHeader
				title="Calendar Management"
				subtitle="Manage multiple company, department, and regional calendars"
				action={{
					label: "Create Calendar",
					icon: Plus,
					onClick: onCreateClick,
				}}
			/>

			{years.length === 0 ? (
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground">
						No calendars found. Create your first calendar to get started.
					</p>
				</div>
			) : (
				years.map((year) => (
					<div key={year} className="mb-10">
						<div className="mb-6 pb-3 border-b border-border">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3 justify-center">
									<h2 className="text-xl font-bold text-foreground">{year}</h2>
									<span>•</span>
									<p className="text-sm text-muted-foreground ">
										{calendarsByYear[year].length} calendar
										{calendarsByYear[year].length !== 1 ? "s" : ""} available
									</p>
								</div>
								<div className="flex items-center gap-2">
									<div className="h-1 w-16 bg-red-500 rounded-full"></div>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4  gap-6">
							{calendarsByYear[year].map((calendar) => (
								<CalendarCard
									key={calendar.id}
									calendar={{
										id: calendar.id,
										year: calendar.year,
										type: calendar.type as
											| "Company"
											| "Department"
											| "Regional",
										country: calendar.country || "N/A",
										region: calendar.region || "N/A",
										status: calendar.isActive
											? "Active"
											: ("Draft" as "Active" | "Scheduled" | "Draft"),
										events: [
											{
												month: new Date().toLocaleString("default", {
													month: "long",
												}),
												count: calendar.items?.length || 0,
												dots: [],
											},
										],
									}}
									onClick={() =>
										navigate(`/admin/configuration/calendars/${calendar.id}`)
									}
								/>
							))}
						</div>
					</div>
				))
			)}
		</div>
	);
}
