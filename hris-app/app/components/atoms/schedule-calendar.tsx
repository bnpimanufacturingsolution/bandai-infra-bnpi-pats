import * as React from "react";
import { Calendar } from "~/components/ui/calendar";

export type CalendarProps = React.ComponentProps<typeof Calendar>;

function ScheduleCalendar({
	className,
	showOutsideDays = true,
	...props
}: CalendarProps) {
	return (
		<Calendar
			showOutsideDays={showOutsideDays}
			captionLayout="dropdown"
			navLayout="after"
			reverseYears
			className={className}
			{...props}
		/>
	);
}
ScheduleCalendar.displayName = "ScheduleCalendar";

export { ScheduleCalendar };
