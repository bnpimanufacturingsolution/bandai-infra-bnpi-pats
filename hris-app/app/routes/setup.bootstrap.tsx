import { Navigate } from "react-router";

export default function SetupBootstrapRoute() {
	return <Navigate to="/setup?step=welcome" replace />;
}
