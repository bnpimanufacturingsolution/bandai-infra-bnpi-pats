import { Navigate, useLocation } from "react-router-dom";

export default function HRPersonnelActionRedirect() {
	const location = useLocation();
	return <Navigate to={`/hr/requests/tickets${location.search}`} replace />;
}
