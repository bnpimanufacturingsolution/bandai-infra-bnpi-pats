import { Navigate } from "react-router-dom";

export default function JobsRedirectPage() {
	return <Navigate to="/hr/recruitment?jobAction=list" replace />;
}
