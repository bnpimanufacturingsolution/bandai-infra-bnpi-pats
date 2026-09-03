import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Alert } from "~/components/atoms/Alert";
import { Lock, LogIn, ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "~/lib/hooks/useAuth";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import type { UserRole } from "~/types/common";

interface TimeLoggingGuardProps {
	children: React.ReactNode;
	requiredRole?: UserRole;
}

export default function TimeLoggingGuard({
	children,
	requiredRole = "hris-employee",
}: TimeLoggingGuardProps) {
	const { isAuthenticated, user, isLoading, logout } = useAuth();
	const [isAuthorized, setIsAuthorized] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (user && isAuthenticated) {
			// Check if user has the required role for time logging
			const timeLoggingRoles = [
				"hris-employee",
				"hris-timekeeper",
				"hris-admin",
				"admin",
				"super_admin",
			];
			setIsAuthorized(user.role ? timeLoggingRoles.includes(user.role) : false);
		} else {
			setIsAuthorized(false);
		}
	}, [user, isAuthenticated, requiredRole]);

	const handleLogin = () => {
		navigate("/auth/login");
	};

	const handleBackToMain = () => {
		navigate("/");
	};

	const handleLogout = async () => {
		await logout();
		navigate("/auth/login");
	};

	// Show loading while checking authentication
	if (isLoading || (isAuthenticated && !user)) {
		return (
			<LoadingScreen message="Loading" subtitle="Checking time logging access" />
		);
	}

	// Redirect to login if not authenticated
	if (!isAuthenticated) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
				<div className="w-full max-w-md">
					<Card className="border-slate-200 dark:border-slate-800">
						<CardContent className="p-6 text-center">
							<div className="mb-6">
								<div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
									<Lock className="h-8 w-8 text-blue-600" />
								</div>
								<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
									Authentication Required
								</h1>
								<p className="text-slate-600 dark:text-slate-400">
									Please log in to access the time logging system.
								</p>
							</div>

							<Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
								You need to be logged in with the correct role to access the time
								logging system.
							</Alert>

							<div className="space-y-3">
								<Button onClick={handleLogin} className="w-full">
									<LogIn className="h-4 w-4 mr-2" />
									Login to HR System
								</Button>

								<Button
									onClick={handleBackToMain}
									variant="outline"
									className="w-full">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Back to Main App
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// Check authorization for time logging
	if (!isAuthorized) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
				<div className="w-full max-w-md">
					<Card className="border-slate-200 dark:border-slate-800">
						<CardContent className="p-6 text-center">
							<div className="mb-6">
								<div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
									<Lock className="h-8 w-8 text-red-600" />
								</div>
								<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
									Access Denied
								</h1>
								<p className="text-slate-600 dark:text-slate-400">
									You don&apos;t have permission to access the time logging
									system.
								</p>
							</div>

							<Alert variant="destructive" className="mb-6">
								Your role &quot;{user?.role}&quot; does not have permission to
								access this page. Required roles: Employee (hris-employee), Time
								Keeper (hris-timekeeper), HR Admin (hris-admin), Admin, or Super
								Admin.
							</Alert>

							<div className="space-y-3">
								<Button onClick={handleLogin} className="w-full">
									<LogIn className="h-4 w-4 mr-2" />
									Switch Account
								</Button>

								<Button
									onClick={handleBackToMain}
									variant="outline"
									className="w-full">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Back to Main App
								</Button>
							</div>

							{user && (
								<div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
									<p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
										Currently logged in as:
									</p>
									<div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg mb-3">
										<p className="font-medium text-slate-900 dark:text-slate-50">
											{user.email}
										</p>
										<p className="text-xs text-slate-500">Role: {user.role}</p>
									</div>
									<Button
										onClick={handleLogout}
										variant="outline"
										size="sm"
										className="w-full">
										Logout
									</Button>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// User is authenticated and authorized, render the protected content
	return (
		<div className="relative h-screen">
			{/* Logout icon positioned on the right side */}
			<div className="absolute top-4 right-4 z-50">
				<Button
					onClick={handleLogout}
					variant="outline"
					size="sm"
					className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-lg hover:bg-white dark:hover:bg-slate-800">
					<LogOut className="h-4 w-4" />
				</Button>
			</div>

			{children}
		</div>
	);
}
