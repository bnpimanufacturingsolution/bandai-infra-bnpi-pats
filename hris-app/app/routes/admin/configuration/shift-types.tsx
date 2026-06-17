import { Navigate } from "react-router";

export default function ShiftTypesRedirectPage() {
	return <Navigate to="/admin/configuration/schedule-templates?shiftTypeAction=list" replace />;
}
