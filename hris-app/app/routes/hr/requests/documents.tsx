import { Navigate, useLocation } from "react-router-dom";

export default function HRDocumentsRedirect() {
	const location = useLocation();
	return <Navigate to={`/hr/requests/tickets${location.search}`} replace />;
}
