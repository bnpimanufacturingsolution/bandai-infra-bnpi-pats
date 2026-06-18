import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";

export default function LeaveCalendarRedirect() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	useEffect(() => {
		// Preserve all existing query params and add type=leave
		const params = new URLSearchParams(searchParams);
		params.set("type", "leave");

		// Redirect to unified calendar
		navigate(`/calendar?${params.toString()}`, { replace: true });
	}, [searchParams, navigate]);

	// Return null while redirecting
	return null;
}
