import { Navigate, useLocation } from "react-router";

interface HRSettingsLegacyRedirectProps {
	to: string;
}

export function HRSettingsLegacyRedirect({ to }: HRSettingsLegacyRedirectProps) {
	const location = useLocation();

	return <Navigate to={`${to}${location.search}`} replace />;
}

export default HRSettingsLegacyRedirect;
