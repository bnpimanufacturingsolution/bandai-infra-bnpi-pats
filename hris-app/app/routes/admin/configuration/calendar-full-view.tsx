import { useParams } from "react-router";
import FullCalendarView from "~/components/molecules/calendars/calendar-full-view";
import { useCalendarWithRelations } from "~/lib/hooks/use-calendar";
import { useNavigate } from "react-router";

export default function CalendarDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();

	// Fetch calendar with items when a calendar is selected
	const { data: calendarData, isLoading: isLoadingCalendar } = useCalendarWithRelations(id ?? "");

	const handleBack = () => {
		navigate("/admin/configuration/calendars");
	};

	return (
		<FullCalendarView
			calendarId={id ?? ""}
			calendarData={calendarData}
			isLoading={isLoadingCalendar}
			onBack={handleBack}
		/>
	);
}
