import { Outlet, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";

const ConfigurationLayout = () => {
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		if (location.pathname === "/hr-manager/configuration") {
			navigate("/hr-manager/configuration/jobs", { replace: true });
		}
	}, [location.pathname, navigate]);

	return (
		<div className="w-full">
			<Outlet />
		</div>
	);
};

export default ConfigurationLayout;
