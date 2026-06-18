import React from "react";
import { useAuth } from "~/lib/hooks/use-auth";

export const AuthDebug: React.FC = () => {
	const { user, isAuthenticated, isLoading } = useAuth();

	if (process.env.NODE_ENV !== "development") {
		return null;
	}

	return (
		<div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm z-50">
			<h3 className="font-bold mb-2">Auth Debug</h3>
			<div>Authenticated: {isAuthenticated ? "Yes" : "No"}</div>
			<div>Loading: {isLoading ? "Yes" : "No"}</div>
			<div>User Role: {user?.role || "None"}</div>
			<div>User ID: {user?.id || "None"}</div>
			<div>User Email: {user?.email || "None"}</div>
			<div>Token: {user?.token ? "Present" : "None"}</div>
			<div>API Endpoint: /auth/me</div>
		</div>
	);
};
