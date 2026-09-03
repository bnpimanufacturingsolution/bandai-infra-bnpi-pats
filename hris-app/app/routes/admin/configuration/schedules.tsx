import { Navigate, useLocation } from "react-router";

export default function LegacySchedulesRedirectPage() {
	const location = useLocation();

	return (
		<Navigate to={`/admin/configuration/schedule-templates${location.search || ""}`} replace />
	);
}
